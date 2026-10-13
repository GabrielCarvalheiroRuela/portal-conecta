import type { PastaN8n } from '../services/workflows'
import type { WorkflowOrigem } from './origem'
import { analisarReferencias } from './workflow'

/**
 * O plano da importação: antes de escrever qualquer coisa na instância, calcula quais pastas já existem e quais
 * serão criadas, em qual pasta cada workflow cai e quais conflitam com algo que já está lá. A tela mostra o
 * plano para a pessoa conferir, e o executor só segue ele.
 */

export type PoliticaConflito = 'pular' | 'renomear'

export interface OpcoesImportacao {
  /** Pasta da instância que recebe tudo; nulo é a raiz do projeto. */
  destinoId: string | null
  /** Pasta extra, criada dentro do destino, para guardar toda a importação (vazio = nenhuma). */
  subpasta: string
  /** Verdadeiro mantém o caminho de pastas desde a raiz da origem; falso tira as pastas que todos têm em comum. */
  caminhoCompleto: boolean
  /** Workflow que já existe no mesmo lugar (mesma pasta e mesmo nome): pular ou criar com outro nome. */
  conflito: PoliticaConflito
  /** Trocar nas chamadas entre workflows o ID de origem pelo ID novo. */
  remapearReferencias: boolean
}

/** O que já existe na instância de destino, como o portal já conhece (explorador de pastas e prévia). */
export interface ExistentesNoDestino {
  pastas: PastaN8n[]
  /** Por pasta (nulo = fora de pasta): nome do workflow em minúsculas -> ID. */
  porPasta: Map<string | null, Map<string, string>>
  /** IDs de todos os workflows que existem na instância. */
  ids: Set<string>
}

/** Uma pasta que o plano vai criar. As que já existem não entram aqui. */
export interface PastaPlano {
  /** Caminho relativo ao destino ("Mercos/Paulinho"), que também identifica a pasta no plano. */
  chave: string
  nome: string
  /** Pasta-mãe, quando ela também é nova. */
  paiChave: string | null
  /** Pasta-mãe, quando ela já existe (nulo e sem `paiChave`: raiz do projeto). */
  paiExistenteId: string | null
  /** 0 para as que ficam direto em pasta existente; 1 para as filhas de uma pasta nova etc. */
  nivel: number
}

export interface ItemPlano {
  chave: string
  nome: string
  nomeFinal: string
  /** Pasta nova em que o workflow cai, ou nulo se a pasta já existe (ou é a raiz). */
  pastaChave: string | null
  /** Pasta existente em que o workflow cai (nulo = raiz do projeto, quando `pastaChave` também é nulo). */
  pastaExistenteId: string | null
  /** Pastas até o workflow, relativas ao destino, para a pessoa ler. */
  caminho: string[]
  acao: 'criar' | 'pular'
  motivo?: string
  /** ID do workflow que já existe no lugar (conflito pulado): serve de alvo das chamadas de outros workflows. */
  idExistente?: string
  bytes: number
}

export interface AvisoPlano {
  tipo: 'chamada-fora-da-selecao' | 'chamada-sem-destino' | 'chamada-dinamica' | 'credenciais' | 'nome-repetido'
  texto: string
  /** Exemplos curtos para a pessoa investigar. */
  exemplos: string[]
}

export interface Plano {
  itens: ItemPlano[]
  pastas: PastaPlano[]
  pastasExistentes: number
  avisos: AvisoPlano[]
  resumo: { criar: number; pular: number; bytes: number }
}

/** Nome de pasta aceito pelo n8n: não vazio, sem "/" nem caracteres de controle, até 128 caracteres. */
export function nomePastaSeguro(nome: string): string {
  const limpo = nome.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[\\/]+/g, '-').trim().slice(0, 128).trim()
  return limpo || 'sem nome'
}

const minusculo = (s: string) => s.trim().toLowerCase()

function prefixoComum(caminhos: string[][]): number {
  if (caminhos.length === 0) {
    return 0
  }
  let n = 0
  const primeiro = caminhos[0]
  while (n < primeiro.length && caminhos.every((c) => c.length > n && c[n] === primeiro[n])) {
    n += 1
  }
  return n
}

const EXEMPLOS_MAX = 6

export function montarPlano(args: {
  selecionados: WorkflowOrigem[]
  /** Todos os workflows da origem, para saber quais chamadas apontam para algo que ficou de fora da seleção. */
  todos: WorkflowOrigem[]
  opcoes: OpcoesImportacao
  destino: ExistentesNoDestino
  /** Só situa cada workflow (criar ou já existe): pula a análise de chamadas e credenciais, que é a parte cara. */
  somenteSituacao?: boolean
}): Plano {
  const { selecionados, todos, opcoes, destino } = args

  // 1) caminho de cada workflow, relativo ao destino
  const corte = opcoes.caminhoCompleto ? 0 : prefixoComum(selecionados.map((s) => s.pasta))
  const extra = opcoes.subpasta.trim() ? [nomePastaSeguro(opcoes.subpasta)] : []
  const caminhoDe = (s: WorkflowOrigem) => [...extra, ...s.pasta.slice(corte).map(nomePastaSeguro)]

  // 2) pastas: reaproveita as que já existem (mesmo nome, sem diferenciar maiúsculas) e planeja as novas
  const filhosDe = new Map<string | null, PastaN8n[]>()
  for (const p of destino.pastas) {
    const lista = filhosDe.get(p.pai) ?? []
    lista.push(p)
    filhosDe.set(p.pai, lista)
  }
  type Resolvida = { existenteId: string | null; nova: boolean; chave: string | null; nivel: number }
  const resolvidas = new Map<string, Resolvida>()
  const pastas: PastaPlano[] = []
  let existentes = 0

  const resolver = (caminho: string[]): Resolvida => {
    if (caminho.length === 0) {
      return { existenteId: opcoes.destinoId, nova: false, chave: null, nivel: -1 }
    }
    const chave = caminho.join('/')
    const guardada = resolvidas.get(chave)
    if (guardada) {
      return guardada
    }
    const pai = resolver(caminho.slice(0, -1))
    const nome = caminho[caminho.length - 1]
    let resultado: Resolvida
    const achada = pai.nova
      ? undefined
      : (filhosDe.get(pai.existenteId) ?? []).find((p) => minusculo(p.nome) === minusculo(nome))
    if (achada) {
      existentes += 1
      resultado = { existenteId: achada.id, nova: false, chave: null, nivel: -1 }
    } else {
      const nivel = pai.nova ? pai.nivel + 1 : 0
      pastas.push({
        chave,
        nome,
        paiChave: pai.nova ? pai.chave : null,
        paiExistenteId: pai.nova ? null : pai.existenteId,
        nivel,
      })
      resultado = { existenteId: null, nova: true, chave, nivel }
    }
    resolvidas.set(chave, resultado)
    return resultado
  }

  // 3) cada workflow: pasta final, conflitos e nome
  const itens: ItemPlano[] = []
  const usados = new Map<string, Set<string>>() // pasta -> nomes (minúsculos) já ocupados pelo plano
  const ordem = [...selecionados].sort(
    (a, b) => a.pasta.join('/').localeCompare(b.pasta.join('/'), 'pt-BR') || a.arquivo.localeCompare(b.arquivo, 'pt-BR'),
  )

  for (const s of ordem) {
    const caminho = caminhoDe(s)
    const pasta = resolver(caminho)
    const chavePasta = pasta.nova ? `nova:${pasta.chave}` : `existente:${pasta.existenteId ?? ''}`
    const ocupados = usados.get(chavePasta) ?? new Set<string>()
    usados.set(chavePasta, ocupados)
    const existentesNaPasta = pasta.nova ? undefined : destino.porPasta.get(pasta.existenteId)

    const item: ItemPlano = {
      chave: s.chave,
      nome: s.nome,
      nomeFinal: s.nome,
      pastaChave: pasta.nova ? pasta.chave : null,
      pastaExistenteId: pasta.nova ? null : pasta.existenteId,
      caminho,
      acao: 'criar',
      bytes: s.bytes,
    }

    const idExistente = existentesNaPasta?.get(minusculo(s.nome))
    const repetidoNoPlano = ocupados.has(minusculo(s.nome))
    if (idExistente || repetidoNoPlano) {
      if (opcoes.conflito === 'pular') {
        item.acao = 'pular'
        item.motivo = idExistente ? 'já existe um workflow com este nome na pasta' : 'outro arquivo com o mesmo nome vai para esta pasta'
        item.idExistente = idExistente
      } else {
        let n = 1
        let candidato = `${s.nome} (importado)`
        while (ocupados.has(minusculo(candidato)) || existentesNaPasta?.has(minusculo(candidato))) {
          n += 1
          candidato = `${s.nome} (importado ${n})`
        }
        item.nomeFinal = candidato
        item.motivo = 'já existia um com este nome; entra com o nome alterado'
      }
    }
    if (item.acao === 'criar') {
      ocupados.add(minusculo(item.nomeFinal))
    }
    itens.push(item)
  }

  if (args.somenteSituacao) {
    const novos = itens.filter((i) => i.acao === 'criar')
    return {
      itens,
      pastas,
      pastasExistentes: existentes,
      avisos: [],
      resumo: { criar: novos.length, pular: itens.length - novos.length, bytes: novos.reduce((soma, i) => soma + i.bytes, 0) },
    }
  }

  // 4) avisos sobre chamadas entre workflows e credenciais
  const avisos: AvisoPlano[] = []
  const aImportar = new Set(itens.filter((i) => i.acao === 'criar').map((i) => i.chave))
  const importados = selecionados.filter((s) => aImportar.has(s.chave))
  const porIdOrigem = new Map(todos.filter((t) => t.idOrigem).map((t) => [t.idOrigem as string, t]))
  const idsNaSelecao = new Set(selecionados.filter((s) => s.idOrigem).map((s) => s.idOrigem as string))
  const idsPulados = new Set(
    itens.filter((i) => i.acao === 'pular' && i.idExistente).map((i) => porIdOrigemPorChave(todos, i.chave)).filter((x): x is string => !!x),
  )

  const foraDaSelecao: string[] = []
  const semDestino: string[] = []
  let dinamicas = 0
  const dinamicasExemplos: string[] = []
  const credenciais = new Set<string>()
  let nodesComCredencial = 0

  for (const s of importados) {
    const refs = analisarReferencias(s.json)
    dinamicas += refs.dinamicas
    if (refs.dinamicas && dinamicasExemplos.length < EXEMPLOS_MAX) {
      dinamicasExemplos.push(s.nome)
    }
    if (opcoes.remapearReferencias) {
      for (const id of refs.ids) {
        if (idsNaSelecao.has(id) || idsPulados.has(id)) {
          continue
        }
        const naOrigem = porIdOrigem.get(id)
        if (naOrigem) {
          foraDaSelecao.push(`${s.nome} → ${naOrigem.nome}`)
        } else if (!destino.ids.has(id)) {
          semDestino.push(`${s.nome} → ${id}`)
        }
      }
    }
    for (const node of Array.isArray(s.json.nodes) ? s.json.nodes : []) {
      const cred = (node as { credentials?: Record<string, { name?: string }> }).credentials
      if (cred && typeof cred === 'object') {
        nodesComCredencial += 1
        Object.values(cred).forEach((c) => c?.name && credenciais.add(c.name))
      }
    }
  }

  if (foraDaSelecao.length) {
    avisos.push({
      tipo: 'chamada-fora-da-selecao',
      texto: `${foraDaSelecao.length} chamada(s) apontam para workflows do arquivo que não estão na seleção. Eles não existirão no destino: selecione também esses sub-workflows.`,
      exemplos: [...new Set(foraDaSelecao)].slice(0, EXEMPLOS_MAX),
    })
  }
  if (semDestino.length) {
    avisos.push({
      tipo: 'chamada-sem-destino',
      texto: `${semDestino.length} chamada(s) apontam para um ID que não está no arquivo nem na instância de destino. Vão ficar quebradas até alguém escolher o workflow certo.`,
      exemplos: [...new Set(semDestino)].slice(0, EXEMPLOS_MAX),
    })
  }
  if (dinamicas) {
    avisos.push({
      tipo: 'chamada-dinamica',
      texto: `${dinamicas} chamada(s) escolhem o workflow por expressão (={{ }}). O portal não consegue trocar o ID nelas; confira depois da importação.`,
      exemplos: dinamicasExemplos,
    })
  }
  if (nodesComCredencial) {
    avisos.push({
      tipo: 'credenciais',
      texto: `Há credenciais em ${nodesComCredencial} node${nodesComCredencial === 1 ? '' : 's'}. Elas continuam apontando para os IDs da instância de origem: é preciso escolher a credencial certa ${nodesComCredencial === 1 ? 'nesse node' : 'nesses nodes'} antes de ativar os workflows.`,
      exemplos: [...credenciais].slice(0, EXEMPLOS_MAX),
    })
  }

  const criar = itens.filter((i) => i.acao === 'criar')
  return {
    itens,
    pastas: pastas.sort((a, b) => a.nivel - b.nivel || a.chave.localeCompare(b.chave, 'pt-BR')),
    pastasExistentes: existentes,
    avisos,
    resumo: {
      criar: criar.length,
      pular: itens.length - criar.length,
      bytes: criar.reduce((soma, i) => soma + i.bytes, 0),
    },
  }
}

function porIdOrigemPorChave(todos: WorkflowOrigem[], chave: string): string | null {
  return todos.find((t) => t.chave === chave)?.idOrigem ?? null
}

/** Divide em pedidos pequenos: o n8n e o nginx têm teto de corpo, e uma falha atinge só um lote. */
export function dividirEmLotes<T>(itens: T[], tamanho: (item: T) => number, maxItens = 5, maxBytes = 600_000): T[][] {
  const lotes: T[][] = []
  let atual: T[] = []
  let bytes = 0
  for (const item of itens) {
    const t = tamanho(item)
    if (atual.length > 0 && (atual.length >= maxItens || bytes + t > maxBytes)) {
      lotes.push(atual)
      atual = []
      bytes = 0
    }
    atual.push(item)
    bytes += t
  }
  if (atual.length > 0) {
    lotes.push(atual)
  }
  return lotes
}
