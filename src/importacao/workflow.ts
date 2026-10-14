/**
 * O que a importação faz com o JSON de um workflow antes de mandá-lo ao n8n:
 *  - `limparParaCriar` deixa só o que a API pública do n8n aceita (ela recusa propriedade desconhecida);
 *  - `analisarReferencias` / `remapearReferencias` acham as chamadas a outros workflows e trocam os IDs
 *    de origem pelos IDs novos.
 */

export type Json = Record<string, unknown>

const ehObjeto = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Propriedades de um node que a API do n8n aceita na criação (as demais fazem a criação falhar). */
const PROPRIEDADES_NODE = new Set([
  'id', 'name', 'webhookId', 'disabled', 'notesInFlow', 'notes', 'type', 'typeVersion', 'executeOnce',
  'alwaysOutputData', 'retryOnFail', 'maxTries', 'waitBetweenTries', 'continueOnFail', 'onError', 'position',
  'parameters', 'credentials', 'customTelemetryTags', 'extendsCredential',
])

/** Valores que `settings` aceita; o que não bater (ex.: "DEFAULT") é descartado para valer o padrão do n8n. */
const REGRAS_SETTINGS: Record<string, (v: unknown) => boolean> = {
  saveExecutionProgress: (v) => typeof v === 'boolean',
  saveManualExecutions: (v) => typeof v === 'boolean',
  saveDataErrorExecution: (v) => v === 'all' || v === 'none',
  saveDataSuccessExecution: (v) => v === 'all' || v === 'none',
  executionTimeout: (v) => typeof v === 'number',
  errorWorkflow: (v) => typeof v === 'string' && v !== '',
  timezone: (v) => typeof v === 'string' && v !== '',
  executionOrder: (v) => typeof v === 'string',
  callerPolicy: (v) => ['any', 'none', 'workflowsFromAList', 'workflowsFromSameOwner'].includes(String(v)),
  callerIds: (v) => typeof v === 'string',
  timeSavedMode: (v) => v === 'fixed' || v === 'dynamic',
  timeSavedPerExecution: (v) => typeof v === 'number',
  redactionPolicy: (v) => ['none', 'non-manual', 'manual-only', 'all'].includes(String(v)),
  availableInMCP: (v) => typeof v === 'boolean',
}

export interface WorkflowParaCriar {
  name: string
  nodes: Json[]
  connections: Json
  settings: Json
  pinData?: Json
  staticData?: Json
  description?: string
}

/**
 * Corpo aceito pelo POST /workflows. O workflow nasce inativo, sem tags e sem ID (o n8n dá um novo): é o que
 * a API faz de qualquer jeito. Não altera o objeto recebido.
 */
export function limparParaCriar(origem: Json, nome: string): WorkflowParaCriar {
  const nodes = (Array.isArray(origem.nodes) ? origem.nodes : []).filter(ehObjeto).map((node) => {
    const limpo: Json = {}
    for (const [chave, valor] of Object.entries(node)) {
      if (PROPRIEDADES_NODE.has(chave)) {
        limpo[chave] = valor
      }
    }
    return limpo
  })

  const settings: Json = {}
  if (ehObjeto(origem.settings)) {
    for (const [chave, valor] of Object.entries(origem.settings)) {
      if (REGRAS_SETTINGS[chave]?.(valor)) {
        settings[chave] = valor
      }
    }
  }

  const corpo: WorkflowParaCriar = {
    name: nome,
    nodes,
    connections: ehObjeto(origem.connections) ? origem.connections : {},
    settings,
  }
  if (ehObjeto(origem.pinData) && Object.keys(origem.pinData).length > 0) {
    corpo.pinData = origem.pinData
  }
  if (ehObjeto(origem.staticData) && Object.keys(origem.staticData).length > 0) {
    corpo.staticData = origem.staticData
  }
  if (typeof origem.description === 'string' && origem.description) {
    corpo.description = origem.description
  }
  return corpo
}

// ---------------------------------------------------------------------------------------------
// Chamadas entre workflows
// ---------------------------------------------------------------------------------------------

/** Nodes que chamam outro workflow pelo ID (Execute Workflow e a ferramenta de workflow do agente de IA). */
const TIPOS_CHAMADA = /(executeWorkflow|toolWorkflow)$/i

export interface Referencias {
  /** IDs fixos de workflows chamados (por node de chamada, pelo errorWorkflow e pelos callerIds). */
  ids: string[]
  /** Chamadas por expressão (={{ }}): o destino só existe na execução e não dá para trocar. */
  dinamicas: number
}

/** Onde o ID está num node de chamada: texto direto ou o seletor ({ __rl, value }). */
function lerIdDoNode(parametros: Json): { id: string | null; dinamico: boolean } {
  const bruto = parametros.workflowId
  const valor = ehObjeto(bruto) ? bruto.value : bruto
  const texto = typeof valor === 'string' ? valor.trim() : ''
  if (!texto) {
    return { id: null, dinamico: false }
  }
  return texto.startsWith('=') ? { id: null, dinamico: true } : { id: texto, dinamico: false }
}

export function analisarReferencias(workflow: Json): Referencias {
  const ids = new Set<string>()
  let dinamicas = 0

  for (const node of Array.isArray(workflow.nodes) ? workflow.nodes : []) {
    if (!ehObjeto(node) || !TIPOS_CHAMADA.test(String(node.type ?? ''))) {
      continue
    }
    const parametros = ehObjeto(node.parameters) ? node.parameters : {}
    // "source" diferente de database (parâmetro, URL, arquivo local) não usa um ID do banco.
    if (typeof parametros.source === 'string' && parametros.source !== 'database') {
      continue
    }
    const { id, dinamico } = lerIdDoNode(parametros)
    if (id) {
      ids.add(id)
    }
    if (dinamico) {
      dinamicas += 1
    }
  }

  const configuracoes = ehObjeto(workflow.settings) ? workflow.settings : {}
  if (typeof configuracoes.errorWorkflow === 'string' && configuracoes.errorWorkflow) {
    ids.add(configuracoes.errorWorkflow)
  }
  if (typeof configuracoes.callerIds === 'string') {
    configuracoes.callerIds.split(',').map((s) => s.trim()).filter(Boolean).forEach((id) => ids.add(id))
  }
  return { ids: [...ids], dinamicas }
}

export interface ResultadoRemapeamento {
  workflow: Json
  /** Quantas referências foram trocadas. */
  trocas: number
}

/**
 * Troca nos nodes de chamada, no errorWorkflow e nos callerIds os IDs de origem pelos novos. IDs que não estão
 * no mapa ficam como estão. Devolve uma cópia; o original não muda.
 */
export function remapearReferencias(workflow: Json, mapa: ReadonlyMap<string, string>): ResultadoRemapeamento {
  const copia = JSON.parse(JSON.stringify(workflow)) as Json
  let trocas = 0

  for (const node of Array.isArray(copia.nodes) ? copia.nodes : []) {
    if (!ehObjeto(node) || !TIPOS_CHAMADA.test(String(node.type ?? ''))) {
      continue
    }
    const parametros = ehObjeto(node.parameters) ? node.parameters : null
    if (!parametros || (typeof parametros.source === 'string' && parametros.source !== 'database')) {
      continue
    }
    const bruto = parametros.workflowId
    const alvo = ehObjeto(bruto) ? bruto : null
    const atual = (alvo ? alvo.value : bruto) as unknown
    const novo = typeof atual === 'string' ? mapa.get(atual.trim()) : undefined
    if (!novo || novo === atual) {
      continue
    }
    if (alvo) {
      alvo.value = novo
      // O nome guardado no seletor pode ficar desatualizado; o n8n o refaz quando o node é aberto.
    } else {
      parametros.workflowId = novo
    }
    trocas += 1
  }

  if (ehObjeto(copia.settings)) {
    const configuracoes = copia.settings
    if (typeof configuracoes.errorWorkflow === 'string') {
      const novo = mapa.get(configuracoes.errorWorkflow.trim())
      if (novo) {
        configuracoes.errorWorkflow = novo
        trocas += 1
      }
    }
    if (typeof configuracoes.callerIds === 'string' && configuracoes.callerIds.trim()) {
      let mudou = 0
      configuracoes.callerIds = configuracoes.callerIds
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((id) => {
          const novo = mapa.get(id)
          if (novo) {
            mudou += 1
          }
          return novo ?? id
        })
        .join(',')
      trocas += mudou
    }
  }
  return { workflow: copia, trocas }
}
