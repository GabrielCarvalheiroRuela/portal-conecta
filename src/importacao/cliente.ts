import { apiPost } from '../services/api'
import type { WorkflowParaCriar } from './workflow'

/**
 * Chamadas ao webhook `portal-wf-importar` do n8n (workflow Portal_WF_Importar). Ele repete a checagem de
 * acesso (ADMIN), só aceita as instâncias liberadas para importação e usa uma credencial de escrita que nunca
 * chega ao navegador. Cada chamada é pequena (um punhado de pastas ou workflows): a tela as encadeia e mostra o
 * andamento, e uma falha atinge só aquele lote.
 */

const BASE_IMPORTAR = '/wf-importar'

export interface InstanciaImportacao {
  id: string
  nome: string
}

export interface PastaParaCriar {
  chave: string
  nome: string
  /** Pasta-mãe (ID no n8n); nulo cria na raiz do projeto. */
  paiId: string | null
}

export interface WorkflowParaEnviar {
  chave: string
  /** Pasta que recebe o workflow (ID no n8n); nulo é a raiz do projeto. */
  pastaId: string | null
  workflow: WorkflowParaCriar
}

export interface WorkflowParaAtualizar {
  chave: string
  id: string
  workflow: WorkflowParaCriar
}

/** Resultado de um item: `id` quando deu certo, `erro` quando não. */
export interface ResultadoItem {
  chave: string
  id?: string
  erro?: string
}

/** O que o executor precisa do servidor. Separado para dar para testar sem rede. */
export interface ClienteImportacao {
  criarPastas: (instancia: string, itens: PastaParaCriar[]) => Promise<ResultadoItem[]>
  criarWorkflows: (instancia: string, itens: WorkflowParaEnviar[]) => Promise<ResultadoItem[]>
  atualizarWorkflows: (instancia: string, itens: WorkflowParaAtualizar[]) => Promise<ResultadoItem[]>
}

export async function listarInstanciasImportacao(): Promise<InstanciaImportacao[]> {
  const resposta = await apiPost<{ instancias?: InstanciaImportacao[] }>('', { acao: 'instancias' }, BASE_IMPORTAR)
  return resposta.instancias ?? []
}

async function enviar(acao: string, instancia: string, itens: unknown[]): Promise<ResultadoItem[]> {
  const resposta = await apiPost<{ resultados?: ResultadoItem[] }>('', { acao, instancia, itens }, BASE_IMPORTAR)
  return resposta.resultados ?? []
}

export const clienteImportacao: ClienteImportacao = {
  criarPastas: (instancia, itens) => enviar('criar-pastas', instancia, itens),
  criarWorkflows: (instancia, itens) => enviar('criar-workflows', instancia, itens),
  atualizarWorkflows: (instancia, itens) => enviar('atualizar-workflows', instancia, itens),
}
