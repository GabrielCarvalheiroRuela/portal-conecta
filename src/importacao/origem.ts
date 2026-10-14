import { analisarReferencias, type Json } from './workflow'
import { LIMITE_BYTES_ARQUIVO, listarZip } from './zipLeitor'

/**
 * A origem da importação: os workflows que a pessoa escolheu abrir (um ou mais ZIPs, arquivos .json soltos ou
 * uma pasta do computador), organizados na árvore de pastas do próprio arquivo.
 */

export interface WorkflowOrigem {
  /** Identifica o arquivo: o caminho completo dentro da origem ("Mercos/Paulinho/Pedido.json"). */
  chave: string
  /** Pastas até o arquivo, na ordem. Vazio quando o arquivo está solto na raiz. */
  pasta: string[]
  arquivo: string
  /** Nome do workflow (o `name` do JSON; na falta, o do arquivo). */
  nome: string
  json: Json
  bytes: number
  nodes: number
  /** ID que o workflow tinha na instância de onde foi exportado; as chamadas entre workflows apontam para ele. */
  idOrigem: string | null
  /** De onde veio: o nome do ZIP ou "pasta". */
  veioDe: string
}

export interface Ignorado {
  caminho: string
  motivo: string
}

export interface NoOrigem {
  /** Caminho da pasta ("Mercos/Paulinho"); vazio na raiz. */
  chave: string
  nome: string
  pastas: NoOrigem[]
  itens: WorkflowOrigem[]
}

export interface Origem {
  raiz: NoOrigem
  workflows: WorkflowOrigem[]
  ignorados: Ignorado[]
}

const ordenar = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base', numeric: true })

/** Parte um caminho em pastas e arquivo. Recusa "..", e descarta "", "." e lixo de sistema (__MACOSX, .DS_Store). */
export function normalizarCaminho(bruto: string): string[] | null {
  const partes = bruto.replace(/\\/g, '/').split('/')
  const saida: string[] = []
  for (const parte of partes) {
    const p = parte.trim()
    if (p === '' || p === '.') {
      continue
    }
    if (p === '..') {
      return null
    }
    saida.push(p)
  }
  if (saida.length === 0 || saida[0] === '__MACOSX' || saida[saida.length - 1] === '.DS_Store') {
    return null
  }
  return saida
}

export function validarWorkflow(json: unknown): string | null {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return 'o JSON não é um workflow'
  }
  const wf = json as Json
  if (!Array.isArray(wf.nodes)) {
    return 'não tem a lista "nodes" (não parece um workflow do n8n)'
  }
  if (typeof wf.connections !== 'object' || wf.connections === null || Array.isArray(wf.connections)) {
    return 'não tem "connections" (não parece um workflow do n8n)'
  }
  return null
}

export interface ArquivoBruto {
  /** Caminho dentro da origem (de um ZIP ou o webkitRelativePath de uma pasta). */
  caminho: string
  veioDe: string
  bytes: number
  ler: () => Promise<Uint8Array>
}

/** Monta a árvore a partir dos arquivos já lidos. Sem acesso ao navegador: dá para testar à parte. */
export async function montarOrigem(arquivos: ArquivoBruto[]): Promise<Origem> {
  const raiz: NoOrigem = { chave: '', nome: '', pastas: [], itens: [] }
  const nos = new Map<string, NoOrigem>([['', raiz]])
  const workflows: WorkflowOrigem[] = []
  const ignorados: Ignorado[] = []
  const vistos = new Set<string>()

  const noDe = (pasta: string[]): NoOrigem => {
    let atual = raiz
    for (let i = 0; i < pasta.length; i++) {
      const chave = pasta.slice(0, i + 1).join('/')
      let no = nos.get(chave)
      if (!no) {
        no = { chave, nome: pasta[i], pastas: [], itens: [] }
        nos.set(chave, no)
        atual.pastas.push(no)
      }
      atual = no
    }
    return atual
  }

  for (const arquivo of arquivos) {
    const partes = normalizarCaminho(arquivo.caminho)
    if (!partes) {
      ignorados.push({ caminho: arquivo.caminho, motivo: 'caminho inválido' })
      continue
    }
    const nomeArquivo = partes[partes.length - 1]
    const caminho = partes.join('/')
    if (!/\.json$/i.test(nomeArquivo)) {
      ignorados.push({ caminho, motivo: /\.n8np$/i.test(nomeArquivo) ? 'pacote .n8np ainda não é suportado' : 'não é um .json' })
      continue
    }
    if (vistos.has(caminho)) {
      ignorados.push({ caminho, motivo: 'repetido (já veio de outro arquivo com o mesmo caminho)' })
      continue
    }
    if (arquivo.bytes > LIMITE_BYTES_ARQUIVO) {
      ignorados.push({ caminho, motivo: `grande demais (${(arquivo.bytes / 1048576).toFixed(1)} MB)` })
      continue
    }

    let json: unknown
    try {
      json = JSON.parse(new TextDecoder('utf-8').decode(await arquivo.ler()).replace(/^﻿/, ''))
    } catch (erro) {
      ignorados.push({ caminho, motivo: erro instanceof SyntaxError ? 'JSON inválido' : (erro as Error).message })
      continue
    }
    const problema = validarWorkflow(json)
    if (problema) {
      ignorados.push({ caminho, motivo: problema })
      continue
    }

    const wf = json as Json
    const pasta = partes.slice(0, -1)
    const nome = typeof wf.name === 'string' && wf.name.trim() ? wf.name.trim() : nomeArquivo.replace(/\.json$/i, '')
    const item: WorkflowOrigem = {
      chave: caminho,
      pasta,
      arquivo: nomeArquivo,
      nome,
      json: wf,
      bytes: arquivo.bytes,
      nodes: (wf.nodes as unknown[]).length,
      idOrigem: typeof wf.id === 'string' && wf.id.trim() ? wf.id.trim() : null,
      veioDe: arquivo.veioDe,
    }
    vistos.add(caminho)
    workflows.push(item)
    noDe(pasta).itens.push(item)
  }

  const ordenarNo = (no: NoOrigem) => {
    no.pastas.sort((a, b) => ordenar(a.nome, b.nome))
    no.itens.sort((a, b) => ordenar(a.arquivo, b.arquivo))
    no.pastas.forEach(ordenarNo)
  }
  ordenarNo(raiz)
  return { raiz, workflows, ignorados }
}

/** Abre o que a pessoa escolheu: ZIPs (um ou vários, como as partes de uma exportação), .json soltos ou uma pasta. */
export async function lerOrigem(arquivos: File[]): Promise<Origem> {
  const brutos: ArquivoBruto[] = []
  const ignoradosZip: Ignorado[] = []

  for (const arquivo of arquivos) {
    if (/\.zip$/i.test(arquivo.name)) {
      try {
        for (const entrada of await listarZip(arquivo)) {
          brutos.push({ caminho: entrada.caminho, veioDe: arquivo.name, bytes: entrada.tamanho, ler: entrada.ler })
        }
      } catch (erro) {
        ignoradosZip.push({ caminho: arquivo.name, motivo: (erro as Error).message })
      }
      continue
    }
    // Pasta escolhida: webkitRelativePath traz "pasta/sub/arquivo.json"; arquivo solto, só o nome.
    const relativo = (arquivo as File & { webkitRelativePath?: string }).webkitRelativePath
    brutos.push({
      caminho: relativo || arquivo.name,
      veioDe: relativo ? 'pasta' : 'arquivo',
      bytes: arquivo.size,
      ler: async () => new Uint8Array(await arquivo.arrayBuffer()),
    })
  }

  const origem = await montarOrigem(brutos)
  origem.ignorados.push(...ignoradosZip)
  return origem
}

/** Todos os workflows de uma pasta e das que estão dentro dela. */
export function itensDoNoOrigem(no: NoOrigem): WorkflowOrigem[] {
  return [...no.pastas.flatMap(itensDoNoOrigem), ...no.itens]
}

/** Quantas chamadas a outros workflows (por ID fixo ou por expressão) o conjunto tem. */
export function contarReferencias(itens: WorkflowOrigem[]): { fixas: number; dinamicas: number } {
  let fixas = 0
  let dinamicas = 0
  for (const item of itens) {
    const r = analisarReferencias(item.json)
    fixas += r.ids.length
    dinamicas += r.dinamicas
  }
  return { fixas, dinamicas }
}
