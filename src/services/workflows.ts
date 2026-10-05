import { apiBaixar, apiGet } from './api'

/**
 * Exportação de workflows do n8n. Quem fala com as instâncias é o webhook `portal-wf` do n8n
 * (workflow Portal_WF_Exportar): ele repete a checagem de acesso e usa a credencial de cada
 * instância, que nunca chega ao navegador. A tela só escolhe a instância por apelido.
 *
 * Os nomes seguem o padrão Cliente_Base_Etapa (ex.: LAB_Mercos_Pedido_Captura): o cliente é a
 * parte antes do primeiro "_" e a base é a segunda parte.
 */

const BASE_WF = '/wf'

export interface InstanciaN8n {
  id: string
  nome: string
}

export interface OpcaoFiltro {
  nome: string
  total: number
}

export interface Filtros {
  cliente: string
  base: string
  /** Trecho que o nome do workflow precisa conter. */
  busca: string
}

/** Um workflow da instância. O ID é o que identifica: o n8n aceita nomes repetidos. */
export interface ItemWorkflow {
  id: string
  nome: string
}

export interface Previa {
  total: number
  /** Workflows que casam com os filtros (até LIMITE_LISTA). */
  workflows: ItemWorkflow[]
}

/** O webhook devolve no máximo isto por consulta e aceita no máximo isto por exportação. */
export const LIMITE_LISTA = 300

export const SEM_FILTROS: Filtros = { cliente: '', base: '', busca: '' }

export function temFiltro(filtros: Filtros): boolean {
  return Boolean(filtros.cliente || filtros.base || filtros.busca.trim())
}

function consulta(acao: string, instancia: string, filtros?: Filtros): string {
  const params = new URLSearchParams({ acao, instancia })
  if (filtros) {
    if (filtros.cliente) {
      params.set('cliente', filtros.cliente)
    }
    if (filtros.base) {
      params.set('base', filtros.base)
    }
    if (filtros.busca.trim()) {
      params.set('busca', filtros.busca.trim())
    }
  }
  return `?${params.toString()}`
}

export async function listarInstancias(): Promise<InstanciaN8n[]> {
  const resposta = await apiGet<{ instancias: InstanciaN8n[] }>('?acao=instancias', BASE_WF)
  return resposta.instancias
}

/** Opções dos dois filtros: os clientes e as bases que existem na instância. */
export async function listarOpcoes(instancia: string): Promise<{ clientes: OpcaoFiltro[]; bases: OpcaoFiltro[] }> {
  const resposta = await apiGet<{ clientes: OpcaoFiltro[]; bases: OpcaoFiltro[] }>(
    consulta('clientes', instancia),
    BASE_WF,
  )
  return { clientes: resposta.clientes, bases: resposta.bases ?? [] }
}

/** Quais workflows os filtros pegam, sem baixar nada. */
export function previa(instancia: string, filtros: Filtros): Promise<Previa> {
  return apiGet<Previa>(consulta('previa', instancia, filtros), BASE_WF)
}

/** Baixa o ZIP com um .json por workflow escolhido. A seleção vai por ID, não por filtro. */
export function baixarZip(instancia: string, ids: string[]) {
  const params = new URLSearchParams({ acao: 'exportar', instancia, ids: ids.join(',') })
  return apiBaixar(`?${params.toString()}`, BASE_WF)
}
