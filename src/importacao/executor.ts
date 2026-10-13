import type { ClienteImportacao, PastaParaCriar, ResultadoItem, WorkflowParaAtualizar, WorkflowParaEnviar } from './cliente'
import type { WorkflowOrigem } from './origem'
import { dividirEmLotes, type OpcoesImportacao, type Plano } from './plano'
import { limparParaCriar, remapearReferencias } from './workflow'

/**
 * Executa o plano na instância, em três etapas e sempre em pedidos pequenos:
 *   1. pastas, nível a nível (uma pasta só pode ser criada depois da mãe);
 *   2. workflows, em lotes, já dentro das pastas;
 *   3. referências: como o n8n dá IDs novos, os workflows que chamam outros são reescritos com os IDs novos.
 *
 * Nada é sobrescrito: o plano só tem o que é novo. Se algo falhar, o que já foi criado fica, e rodar de novo com
 * "pular os que já existem" continua de onde parou.
 */

export type FaseImportacao = 'pastas' | 'workflows' | 'referencias' | 'fim'

export interface ProgressoImportacao {
  fase: FaseImportacao
  feitos: number
  total: number
  texto: string
}

export interface ResultadoImportacao {
  criados: { chave: string; nome: string; id: string }[]
  pulados: { chave: string; nome: string; motivo: string }[]
  falhas: { chave: string; nome: string; erro: string }[]
  pastasCriadas: number
  pastasComFalha: { chave: string; erro: string }[]
  referenciasAtualizadas: number
  referenciasComFalha: { chave: string; nome: string; erro: string }[]
  cancelado: boolean
}

const PASTAS_POR_PEDIDO = 20
const WORKFLOWS_POR_PEDIDO = 5
const BYTES_POR_PEDIDO = 600_000

export interface ArgumentosExecucao {
  instancia: string
  plano: Plano
  selecionados: WorkflowOrigem[]
  opcoes: OpcoesImportacao
  cliente: ClienteImportacao
  aoProgresso: (progresso: ProgressoImportacao) => void
  sinal?: AbortSignal
}

const mensagem = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro))

/** Resultados na ordem dos itens enviados; o que o servidor não devolveu vira falha em vez de sumir. */
function casar(itens: { chave: string }[], resultados: ResultadoItem[]): ResultadoItem[] {
  const porChave = new Map(resultados.map((r) => [r.chave, r]))
  return itens.map((i) => porChave.get(i.chave) ?? { chave: i.chave, erro: 'o servidor não respondeu sobre este item' })
}

export async function executarImportacao(args: ArgumentosExecucao): Promise<ResultadoImportacao> {
  const { instancia, plano, selecionados, opcoes, cliente, aoProgresso, sinal } = args
  const porChave = new Map(selecionados.map((s) => [s.chave, s]))
  const resultado: ResultadoImportacao = {
    criados: [],
    pulados: plano.itens
      .filter((i) => i.acao === 'pular')
      .map((i) => ({ chave: i.chave, nome: i.nome, motivo: i.motivo ?? 'já existe' })),
    falhas: [],
    pastasCriadas: 0,
    pastasComFalha: [],
    referenciasAtualizadas: 0,
    referenciasComFalha: [],
    cancelado: false,
  }

  const cancelado = () => {
    if (sinal?.aborted) {
      resultado.cancelado = true
    }
    return resultado.cancelado
  }

  // 1) pastas, nível a nível
  const idPasta = new Map<string, string>()
  const pastaFalhou = new Map<string, string>()
  const niveis = [...new Set(plano.pastas.map((p) => p.nivel))].sort((a, b) => a - b)
  let pastasFeitas = 0

  for (const nivel of niveis) {
    const daVez = plano.pastas.filter((p) => p.nivel === nivel)
    const paraEnviar: PastaParaCriar[] = []
    for (const pasta of daVez) {
      if (pasta.paiChave && pastaFalhou.has(pasta.paiChave)) {
        pastaFalhou.set(pasta.chave, `a pasta "${pasta.paiChave}" não foi criada`)
        continue
      }
      paraEnviar.push({
        chave: pasta.chave,
        nome: pasta.nome,
        paiId: pasta.paiChave ? (idPasta.get(pasta.paiChave) ?? null) : pasta.paiExistenteId,
      })
    }
    for (const lote of dividirEmLotes(paraEnviar, () => 1, PASTAS_POR_PEDIDO)) {
      if (cancelado()) {
        break
      }
      let respostas: ResultadoItem[]
      try {
        respostas = casar(lote, await cliente.criarPastas(instancia, lote))
      } catch (erro) {
        respostas = lote.map((l) => ({ chave: l.chave, erro: mensagem(erro) }))
      }
      for (const r of respostas) {
        if (r.id) {
          idPasta.set(r.chave, r.id)
          resultado.pastasCriadas += 1
        } else {
          pastaFalhou.set(r.chave, r.erro ?? 'erro desconhecido')
        }
      }
      pastasFeitas += lote.length
      aoProgresso({ fase: 'pastas', feitos: pastasFeitas, total: plano.pastas.length, texto: `Criando pastas (${pastasFeitas}/${plano.pastas.length})` })
    }
    if (resultado.cancelado) {
      break
    }
  }
  for (const [chave, erro] of pastaFalhou) {
    resultado.pastasComFalha.push({ chave, erro })
  }

  // 2) workflows
  const criar = plano.itens.filter((i) => i.acao === 'criar')
  const novoId = new Map<string, string>() // chave do arquivo -> ID novo
  const paraEnviar: (WorkflowParaEnviar & { nomeFinal: string })[] = []

  for (const item of criar) {
    const origem = porChave.get(item.chave)
    if (!origem) {
      continue
    }
    if (item.pastaChave && pastaFalhou.has(item.pastaChave)) {
      resultado.falhas.push({ chave: item.chave, nome: item.nome, erro: `a pasta de destino não foi criada: ${pastaFalhou.get(item.pastaChave)}` })
      continue
    }
    paraEnviar.push({
      chave: item.chave,
      nomeFinal: item.nomeFinal,
      pastaId: item.pastaChave ? (idPasta.get(item.pastaChave) ?? null) : item.pastaExistenteId,
      workflow: limparParaCriar(origem.json, item.nomeFinal),
    })
  }

  let enviados = 0
  if (!resultado.cancelado) {
    const lotes = dividirEmLotes(paraEnviar, (i) => JSON.stringify(i.workflow).length, WORKFLOWS_POR_PEDIDO, BYTES_POR_PEDIDO)
    for (const lote of lotes) {
      if (cancelado()) {
        break
      }
      const envio: WorkflowParaEnviar[] = lote.map(({ chave, pastaId, workflow }) => ({ chave, pastaId, workflow }))
      let respostas: ResultadoItem[]
      try {
        respostas = casar(envio, await cliente.criarWorkflows(instancia, envio))
      } catch (erro) {
        respostas = envio.map((e) => ({ chave: e.chave, erro: mensagem(erro) }))
      }
      for (const r of respostas) {
        const origem = porChave.get(r.chave)
        const nome = lote.find((l) => l.chave === r.chave)?.nomeFinal ?? origem?.nome ?? r.chave
        if (r.id) {
          resultado.criados.push({ chave: r.chave, nome, id: r.id })
          novoId.set(r.chave, r.id)
        } else {
          resultado.falhas.push({ chave: r.chave, nome, erro: r.erro ?? 'erro desconhecido' })
        }
      }
      enviados += lote.length
      aoProgresso({ fase: 'workflows', feitos: enviados, total: paraEnviar.length, texto: `Criando workflows (${enviados}/${paraEnviar.length})` })
    }
  }

  // 3) referências entre workflows
  if (opcoes.remapearReferencias && !resultado.cancelado && novoId.size > 0) {
    const mapa = new Map<string, string>()
    for (const [chave, id] of novoId) {
      const idOrigem = porChave.get(chave)?.idOrigem
      if (idOrigem) {
        mapa.set(idOrigem, id)
      }
    }
    // O workflow pulado por já existir no destino também serve de alvo: aponta para o que está lá.
    for (const item of plano.itens) {
      const idOrigem = porChave.get(item.chave)?.idOrigem
      if (item.acao === 'pular' && item.idExistente && idOrigem) {
        mapa.set(idOrigem, item.idExistente)
      }
    }

    const paraAtualizar: (WorkflowParaAtualizar & { nome: string })[] = []
    for (const criado of resultado.criados) {
      const origem = porChave.get(criado.chave)
      if (!origem) {
        continue
      }
      const remapeado = remapearReferencias(origem.json, mapa)
      if (remapeado.trocas > 0) {
        paraAtualizar.push({ chave: criado.chave, id: criado.id, nome: criado.nome, workflow: limparParaCriar(remapeado.workflow, criado.nome) })
      }
    }

    let atualizados = 0
    const lotes = dividirEmLotes(paraAtualizar, (i) => JSON.stringify(i.workflow).length, WORKFLOWS_POR_PEDIDO, BYTES_POR_PEDIDO)
    for (const lote of lotes) {
      if (cancelado()) {
        break
      }
      const envio: WorkflowParaAtualizar[] = lote.map(({ chave, id, workflow }) => ({ chave, id, workflow }))
      let respostas: ResultadoItem[]
      try {
        respostas = casar(envio, await cliente.atualizarWorkflows(instancia, envio))
      } catch (erro) {
        respostas = envio.map((e) => ({ chave: e.chave, erro: mensagem(erro) }))
      }
      for (const r of respostas) {
        if (r.erro || !r.id) {
          resultado.referenciasComFalha.push({ chave: r.chave, nome: lote.find((l) => l.chave === r.chave)?.nome ?? r.chave, erro: r.erro ?? 'erro desconhecido' })
        } else {
          resultado.referenciasAtualizadas += 1
        }
      }
      atualizados += lote.length
      aoProgresso({ fase: 'referencias', feitos: atualizados, total: paraAtualizar.length, texto: `Ligando os workflows entre si (${atualizados}/${paraAtualizar.length})` })
    }
  }

  aoProgresso({ fase: 'fim', feitos: 1, total: 1, texto: resultado.cancelado ? 'Cancelado' : 'Concluído' })
  return resultado
}
