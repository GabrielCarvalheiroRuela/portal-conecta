import type { ClienteImportacao, PastaParaCriar, ResultadoItem, WorkflowParaAtualizar, WorkflowParaEnviar, WorkflowParaPublicar } from './cliente'
import type { WorkflowOrigem } from './origem'
import { dividirEmLotes, type OpcoesImportacao, type Plano } from './plano'
import { herdarCredenciais, idsDeChamadaFixos, limparParaCriar, listarChamadasDosNodes, remapearReferencias, type Json } from './workflow'

/**
 * Executa o plano na instância, em etapas e sempre em pedidos pequenos:
 *   1. pastas, nível a nível (uma pasta só pode ser criada depois da mãe);
 *   2. workflows, em lotes, já dentro das pastas: os novos são criados e, na política “Substituir”, os que já
 *      existem são sobrescritos mantendo o ID (com as credenciais que o destino já usava);
 *   3. referências: como o n8n dá IDs novos, os workflows que chamam outros são reescritos com os IDs novos, e as
 *      chamadas a workflows de fora da seleção apontam para o mesmo workflow achado no destino pelo nome;
 *   4. conferência das chamadas e republicação dos substituídos que já estavam publicados, de baixo para cima.
 *
 * Só sobrescreve quando a pessoa escolhe “Substituir”; o resto só cria.
 */

export type FaseImportacao = 'pastas' | 'workflows' | 'referencias' | 'publicacao' | 'fim'

export interface ProgressoImportacao {
  fase: FaseImportacao
  feitos: number
  total: number
  texto: string
}

export interface ResultadoImportacao {
  criados: { chave: string; nome: string; id: string }[]
  substituidos: {chave: string; nome: string; id: string}[]
  pulados: { chave: string; nome: string; motivo: string }[]
  falhas: { chave: string; nome: string; erro: string }[]
  pastasCriadas: number
  pastasComFalha: { chave: string; erro: string }[]
  referenciasAtualizadas: number
  referenciasComFalha: { chave: string; nome: string; erro: string }[]
  /** Chamadas a um ID que não existe no destino depois da importação (ficaram quebradas). */
  chamadasQuebradas: { chave: string; nome: string; id: string; chamado: string | null }[]
  /** Substituídos que já estavam publicados e foram publicados de novo. */
  publicados: { chave: string; nome: string; id: string }[]
  publicacaoComFalha: { chave: string; nome: string; erro: string }[]
  /** Quantas credenciais dos workflows substituídos voltaram a ser as que o destino já usava. */
  credenciaisMantidas: number
  /** Avisos do próprio processo (ex.: não consegui ler os workflows que seriam substituídos). */
  avisos: string[]
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
  /** IDs de todos os workflows que já existiam no destino: com eles dá para conferir se sobrou chamada quebrada. */
  idsExistentes?: ReadonlySet<string>
}

const mensagem = (erro: unknown) => (erro instanceof Error ? erro.message : String(erro))

/** Resultados na ordem dos itens enviados; o que o servidor não devolveu vira falha em vez de sumir. */
function casar(itens: { chave: string }[], resultados: ResultadoItem[]): ResultadoItem[] {
  const porChave = new Map(resultados.map((r) => [r.chave, r]))
  return itens.map((i) => porChave.get(i.chave) ?? { chave: i.chave, erro: 'o servidor não respondeu sobre este item' })
}

export async function executarImportacao(args: ArgumentosExecucao): Promise<ResultadoImportacao> {
  const { instancia, plano, selecionados, opcoes, cliente, aoProgresso, sinal, idsExistentes } = args
  const porChave = new Map(selecionados.map((s) => [s.chave, s]))
  const resultado: ResultadoImportacao = {
    criados: [],
    substituidos: [],
    pulados: plano.itens
      .filter((i) => i.acao === 'pular')
      .map((i) => ({ chave: i.chave, nome: i.nome, motivo: i.motivo ?? 'já existe' })),
    falhas: [],
    pastasCriadas: 0,
    pastasComFalha: [],
    referenciasAtualizadas: 0,
    referenciasComFalha: [],
    chamadasQuebradas: [],
    publicados: [],
    publicacaoComFalha: [],
    credenciaisMantidas: 0,
    avisos: [],
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
  const substituir = plano.itens.filter((i) => i.acao === 'substituir')
  const novoId = new Map<string, string>() // chave do arquivo -> ID novo
  const paraEnviar: (WorkflowParaEnviar & { nomeFinal: string })[] = []
  const paraSubstituir: (WorkflowParaAtualizar & { nome: string })[] = []
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

  // O que já existe no destino: dele vêm as credenciais a manter e a informação de estar publicado.
  const existentePorChave = new Map<string, Json>()
  if (substituir.length > 0 && cliente.lerExistentes && !cancelado()) {
    aoProgresso({ fase: 'workflows', feitos: 0, total: substituir.length, texto: 'Lendo os workflows que serão substituídos…' })
    try {
      const lidos = await cliente.lerExistentes(instancia, substituir.map((i) => i.idExistente as string))
      for (const item of substituir) {
        const atual = lidos.get(item.idExistente as string)
        if (atual) {
          existentePorChave.set(item.chave, atual)
        }
      }
      const faltou = substituir.length - existentePorChave.size
      if (faltou > 0) {
        resultado.avisos.push(
          `Não consegui ler ${faltou} dos workflows que seriam substituídos: neles as credenciais voltam às da origem e não dá para saber se estavam publicados.`,
        )
      }
    } catch (erro) {
      resultado.avisos.push(
        `Não consegui ler os workflows que seriam substituídos (${mensagem(erro)}): as credenciais deles voltam às da origem e nenhum foi publicado de novo.`,
      )
    }
  }
  /** O workflow que vai por cima do existente, já com as credenciais do destino. */
  const prepararSubstituto = (chave: string, json: Json, nome: string) => {
    const corpo = limparParaCriar(json, nome)
    const atual = existentePorChave.get(chave)
    return { corpo, mantidas: atual ? herdarCredenciais(corpo, atual) : 0 }
  }

  for (const item of substituir) {
    const origem = porChave.get(item.chave)
    if (!origem) {
      continue
    }
    const { corpo, mantidas } = prepararSubstituto(item.chave, origem.json, item.nomeFinal)
    resultado.credenciaisMantidas += mantidas
    paraSubstituir.push({ chave: item.chave, id: item.idExistente as string, nome: item.nomeFinal, workflow: corpo })
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
  let substituidos = 0
  if (!resultado.cancelado) {
    const lotesSub = dividirEmLotes(paraSubstituir, (i) => JSON.stringify(i.workflow).length, WORKFLOWS_POR_PEDIDO, BYTES_POR_PEDIDO)
    for (const lote of lotesSub) {
      if (cancelado()) {
        break
      }
      const envio: WorkflowParaAtualizar[] = lote.map(({ chave, id, workflow }) => ({ chave, id, workflow, motivo: 'substituicao' }))
      let respostas: ResultadoItem[]
      try {
        respostas = casar(envio, await cliente.atualizarWorkflows(instancia, envio))
      } catch (erro) {
        respostas = envio.map((e) => ({ chave: e.chave, erro: mensagem(erro) }))
      }
      for (const r of respostas) {
        const nome = lote.find((l) => l.chave === r.chave)?.nome ?? r.chave
        if (r.id) {
          resultado.substituidos.push({ chave: r.chave, nome, id: r.id })
          novoId.set(r.chave, r.id)
        } else {
          resultado.falhas.push({ chave: r.chave, nome, erro: r.erro ?? 'erro desconhecido' })
        }
      }
      substituidos += lote.length
      aoProgresso({ fase: 'workflows', feitos: substituidos, total: paraSubstituir.length, texto: `Substituindo workflows (${substituidos}/${paraSubstituir.length})` })
    }
  }

  // 3) referências entre workflows
  const finais = new Map<string, Json>() // chave -> JSON como ficou no destino (com as chamadas já trocadas)
  if (opcoes.remapearReferencias && !resultado.cancelado && novoId.size > 0) {
    const mapa = new Map<string, string>()
    for (const [chave, id] of novoId) {
      const idOrigem = porChave.get(chave)?.idOrigem
      if (idOrigem) {
        mapa.set(idOrigem, id)
      }
    }
    // O workflow pulado ou substituído no destino também serve de alvo: aponta para o que está lá.
    for (const item of plano.itens) {
      const idOrigem = porChave.get(item.chave)?.idOrigem
      if ((item.acao === 'pular' || item.acao === 'substituir') && item.idExistente && idOrigem) {
        mapa.set(idOrigem, item.idExistente)
      }
    }
    // Chamadas a workflows que não estão na seleção: o mesmo workflow, achado no destino pelo nome.
    for (const ref of plano.referencias ?? []) {
      if (ref.destinoId) {
        mapa.set(ref.idOrigem, ref.destinoId)
      }
    }

    const paraAtualizar: (WorkflowParaAtualizar & { nome: string })[] = []
    const remapeados = new Map<string, Json>()
    const ehSubstituido = new Set(resultado.substituidos.map((s) => s.chave))
    for (const criado of [...resultado.criados, ...resultado.substituidos]) {
      const origem = porChave.get(criado.chave)
      if (!origem) {
        continue
      }
      const remapeado = remapearReferencias(origem.json, mapa)
      if (remapeado.trocas > 0) {
        const corpo = ehSubstituido.has(criado.chave)
          ? prepararSubstituto(criado.chave, remapeado.workflow, criado.nome).corpo
          : limparParaCriar(remapeado.workflow, criado.nome)
        paraAtualizar.push({ chave: criado.chave, id: criado.id, nome: criado.nome, workflow: corpo })
        remapeados.set(criado.chave, remapeado.workflow)
      }
    }

    let atualizados = 0
    const lotes = dividirEmLotes(paraAtualizar, (i) => JSON.stringify(i.workflow).length, WORKFLOWS_POR_PEDIDO, BYTES_POR_PEDIDO)
    for (const lote of lotes) {
      if (cancelado()) {
        break
      }
      const envio: WorkflowParaAtualizar[] = lote.map(({ chave, id, workflow }) => ({ chave, id, workflow, motivo: 'referencias' }))
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
          const final = remapeados.get(r.chave)
          if (final) {
            finais.set(r.chave, final)
          }
        }
      }
      atualizados += lote.length
      aoProgresso({ fase: 'referencias', feitos: atualizados, total: paraAtualizar.length, texto: `Ligando os workflows entre si (${atualizados}/${paraAtualizar.length})` })
    }
  }

  // 4) conferência das chamadas e republicação
  const finalDe = (chave: string): Json | undefined => finais.get(chave) ?? porChave.get(chave)?.json
  const enviadosAgora = [...resultado.criados, ...resultado.substituidos]

  if (!resultado.cancelado && opcoes.remapearReferencias && idsExistentes) {
    const conhecidos = new Set<string>([...idsExistentes, ...novoId.values()])
    for (const item of enviadosAgora) {
      const json = finalDe(item.chave)
      if (!json) {
        continue
      }
      const chamados = listarChamadasDosNodes(json)
      for (const id of idsDeChamadaFixos(json)) {
        if (!conhecidos.has(id)) {
          resultado.chamadasQuebradas.push({ chave: item.chave, nome: item.nome, id, chamado: chamados.find((c) => c.id === id)?.nome ?? null })
        }
      }
    }
  }

  const eraPublicado = (chave: string) => {
    const atual = existentePorChave.get(chave)
    return atual !== undefined && (atual.active === true || (typeof atual.activeVersionId === 'string' && atual.activeVersionId !== ''))
  }
  const paraPublicar = resultado.substituidos.filter((s) => eraPublicado(s.chave))
  if (!resultado.cancelado && opcoes.republicar !== false && paraPublicar.length > 0) {
    if (!cliente.publicarWorkflows) {
      resultado.avisos.push('Esta conexão não publica workflows: publique de novo, no n8n, os substituídos que estavam publicados.')
    } else {
      // Quem é chamado vai antes de quem chama: o n8n só publica um workflow cujos sub-workflows já estão publicados.
      const porId = new Map(paraPublicar.map((p) => [p.id, p]))
      const visitados = new Set<string>()
      const ordem: typeof paraPublicar = []
      const visitar = (item: (typeof paraPublicar)[number]) => {
        if (visitados.has(item.id)) {
          return
        }
        visitados.add(item.id)
        const json = finalDe(item.chave)
        for (const id of json ? idsDeChamadaFixos(json) : []) {
          const alvo = porId.get(id)
          if (alvo) {
            visitar(alvo)
          }
        }
        ordem.push(item)
      }
      paraPublicar.forEach(visitar)

      let publicadosAteAgora = 0
      for (const lote of dividirEmLotes(ordem, () => 1, WORKFLOWS_POR_PEDIDO)) {
        if (cancelado()) {
          break
        }
        const envio: WorkflowParaPublicar[] = lote.map(({ chave, id, nome }) => ({ chave, id, nome }))
        let respostas: ResultadoItem[]
        try {
          respostas = casar(envio, await cliente.publicarWorkflows(instancia, envio))
        } catch (erro) {
          respostas = envio.map((e) => ({ chave: e.chave, erro: mensagem(erro) }))
        }
        for (const r of respostas) {
          const item = lote.find((l) => l.chave === r.chave)
          const nome = item?.nome ?? r.chave
          if (r.id && item) {
            resultado.publicados.push({ chave: item.chave, nome, id: item.id })
          } else {
            resultado.publicacaoComFalha.push({ chave: r.chave, nome, erro: r.erro ?? 'erro desconhecido' })
          }
        }
        publicadosAteAgora += lote.length
        aoProgresso({ fase: 'publicacao', feitos: publicadosAteAgora, total: ordem.length, texto: `Publicando de novo os substituídos (${publicadosAteAgora}/${ordem.length})` })
      }
    }
  }

  aoProgresso({ fase: 'fim', feitos: 1, total: 1, texto: resultado.cancelado ? 'Cancelado' : 'Concluído' })
  return resultado
}
