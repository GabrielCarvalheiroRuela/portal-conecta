import { apiPost } from '../services/api'
import { baixarZip, consultaZip, LIMITE_CONSULTA, LIMITE_ZIP } from '../services/workflows'
import type { Json, WorkflowParaCriar } from './workflow'
import { listarZip } from './zipLeitor'

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
  /** Para o registro de auditoria: só a substituição de um workflow que já existia é registrada, e não o religar de chamadas. */
  motivo?: 'substituicao' | 'referencias'
}

export interface WorkflowParaPublicar {
  chave: string
  id: string
  /** Só para o registro de auditoria. */
  nome?: string
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
  /**
   * O JSON atual de workflows que já existem na instância (ID -> workflow). Serve para manter as credenciais do
   * destino e saber quais estavam publicados. Opcional: sem ele a substituição só usa o que veio do arquivo.
   */
  lerExistentes?: (instancia: string, ids: string[]) => Promise<Map<string, Json>>
  /** Publica workflows já existentes, na ordem enviada (quem é chamado antes de quem chama). */
  publicarWorkflows?: (instancia: string, itens: WorkflowParaPublicar[]) => Promise<ResultadoItem[]>
}

export async function listarInstanciasImportacao(): Promise<InstanciaImportacao[]> {
  const resposta = await apiPost<{ instancias?: InstanciaImportacao[] }>('', { acao: 'instancias' }, BASE_IMPORTAR)
  return resposta.instancias ?? []
}

async function enviar(acao: string, instancia: string, itens: unknown[]): Promise<ResultadoItem[]> {
  const resposta = await apiPost<{ resultados?: ResultadoItem[] }>('', { acao, instancia, itens }, BASE_IMPORTAR)
  return resposta.resultados ?? []
}

/**
 * Lê os workflows pelo mesmo caminho da exportação (webhook `portal-wf`): baixa um ZIP com o JSON de cada um.
 * Os IDs vão em pedidos que respeitam o teto de URL e de quantidade do ZIP.
 */
async function lerExistentes(instancia: string, ids: string[]): Promise<Map<string, Json>> {
  const lotes: string[][] = []
  let atual: string[] = []
  for (const id of ids) {
    const proximo = [...atual, id]
    if (atual.length > 0 && (proximo.length > LIMITE_ZIP || consultaZip(instancia, proximo).length > LIMITE_CONSULTA)) {
      lotes.push(atual)
      atual = [id]
    } else {
      atual = proximo
    }
  }
  if (atual.length > 0) {
    lotes.push(atual)
  }

  const lidos = new Map<string, Json>()
  for (const lote of lotes) {
    const { blob } = await baixarZip(instancia, lote)
    for (const entrada of await listarZip(blob)) {
      if (!/\.json$/i.test(entrada.caminho)) {
        continue
      }
      try {
        const json = JSON.parse(new TextDecoder().decode(await entrada.ler())) as Json
        if (typeof json.id === 'string') {
          lidos.set(json.id, json)
        }
      } catch {
        // arquivo que não é JSON: ignora, o workflow só fica sem leitura
      }
    }
  }
  return lidos
}

export const clienteImportacao: ClienteImportacao = {
  criarPastas: (instancia, itens) => enviar('criar-pastas', instancia, itens),
  criarWorkflows: (instancia, itens) => enviar('criar-workflows', instancia, itens),
  atualizarWorkflows: (instancia, itens) => enviar('atualizar-workflows', instancia, itens),
  lerExistentes,
  publicarWorkflows: (instancia, itens) => enviar('publicar-workflows', instancia, itens),
}
