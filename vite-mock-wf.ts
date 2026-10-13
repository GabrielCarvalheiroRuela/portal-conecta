import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

/**
 * Simula, só no `npm run dev`, o backend de workflows (webhooks portal-acesso e portal-wf do n8n),
 * para mexer na aba Workflows sem depender do n8n, de token válido nem de login pelo Google.
 *
 * Liga com VITE_MOCK_WF=1 no .env. Desligado (o padrão) o Vite continua mandando /acesso e /wf para o
 * n8n de VITE_N8N_TARGET. Nada disto entra no build de produção: o plugin só atua em `serve`.
 *
 * A busca repete o que o node "Preparar Dados" do Portal_WF_Exportar faz: o filtro casa o nome
 * (Primeiro_Segundo_Etapa) ou a tag e, com uma plataforma escolhida e ?comuns=1, junta os
 * sub-workflows que os encontrados chamam.
 */

interface Wf {
  id: string
  name: string
  tags?: string[]
  chama?: string[]
  /** ID da pasta do n8n em que o workflow está (ausente = fora de pasta). */
  pasta?: string
}

interface Pasta {
  id: string
  nome: string
  pai: string | null
}

const CATEGORIA_PLATAFORMA = {
  padrao: 'Categoria_Plataforma_Etapa',
  primeiro: 'Categoria do workflow',
  todosPrimeiro: 'Todas as categorias',
  ajudaPrimeiro: 'Primeira parte do nome (ex.: MASTER, LAB).',
  segundo: 'Plataforma',
  todosSegundo: 'Todas as plataformas',
  ajudaSegundo: 'Segunda parte do nome (ex.: Tray, Mercos).',
}

const CLIENTE_BASE = {
  padrao: 'Cliente_Base_Etapa',
  primeiro: 'Cliente',
  todosPrimeiro: 'Todos os clientes',
  ajudaPrimeiro: 'Primeira parte do nome (ex.: Servtec, Cofam).',
  segundo: 'Base',
  todosSegundo: 'Todas as bases',
  ajudaSegundo: 'Segunda parte do nome (ex.: Tray, Mercos).',
}

const INSTANCIAS = [
  { id: 'automaker_prod', nome: 'Produção (simulado)', rotulos: CATEGORIA_PLATAFORMA },
  { id: 'automaker_1', nome: 'Automaker 1 (simulado)', rotulos: CLIENTE_BASE },
  { id: 'automakerdev_cr', nome: 'AutomakerDev CR (simulado)', rotulos: CLIENTE_BASE },
  { id: 'automakerdev_geral', nome: 'Automaker Dev Geral (simulado)', rotulos: CLIENTE_BASE },
]

/** Instâncias que aceitam importação no simulador (no n8n de verdade é a lista do Portal_WF_Importar). */
const IMPORTA_EM = ['automakerdev_geral']

const WORKFLOWS: Record<string, Wf[]> = {
  automaker_prod: [
    { id: 'p01', pasta: 'T2', name: 'MASTER_Tray_Pedido_Captura', tags: ['master', 'tray', 'captura'], chama: ['SUB_Contexto', 'p13'] },
    { id: 'p02', pasta: 'T2', name: 'MASTER_Tray_Pedido_Processa', tags: ['master', 'tray'], chama: ['SUB_Contexto'] },
    { id: 'p03', pasta: 'T1', name: 'MASTER_Tray_Produto_Item', tags: ['master', 'tray'] },
    { id: 'p04', pasta: 'M1', name: 'MASTER_Mercos_Pedido_Captura', tags: ['master', 'mercos'], chama: ['SUB_Contexto'] },
    { id: 'p05', pasta: 'M1', name: 'MASTER_Mercos_Clientes_Captura', tags: ['master', 'mercos'] },
    { id: 'p06', pasta: 'S1', name: 'MASTER_Shopify_Pedido_Captura', tags: ['master', 'shopify'] },
    { id: 'p07', pasta: 'C1', name: 'MASTER_Cilia_Orcamento', tags: ['master', 'cilia'] },
    { id: 'p08', pasta: 'R2', name: 'TOOLS_Admin_Limpar_Execucoes', tags: ['tools'] },
    { id: 'p09', pasta: 'R2', name: 'TOOLS_Admin_Reprocessar_Pedido', tags: ['tools'] },
    { id: 'p10', pasta: 'R3', name: 'LEGADO_Tray_Estoque_Antigo', tags: ['legado', 'tray'], chama: ['SUB_Que_Foi_Apagado'] },
    { id: 'p11', pasta: 'R4', name: 'Portal_Acesso' },
    { id: 'p12', pasta: 'R4', name: 'Portal_WF_Exportar' },
    { id: 'p13', pasta: 'R1', name: 'SUB_Retry', chama: ['SUB_Log'] },
    { id: 'p14', pasta: 'R1', name: 'SUB_Contexto', chama: ['SUB_Log'] },
    { id: 'p15', pasta: 'R1', name: 'SUB_Log' },
  ],
  automaker_1: [
    { id: 'a01', pasta: 'A4', name: 'Servtec_Tray_NFe', tags: ['Tray NFe 4.0'] },
    { id: 'a02', pasta: 'A2', name: 'Cofam_Tray_Estoque', tags: ['Tray Estoque 3.0', 'Tray Estoque 4.0'] },
    { id: 'a03', pasta: 'A2', name: 'Cofam_Tray_Credenciais', tags: ['Tray Credenciais 3.0'] },
    { id: 'a04', pasta: 'A4', name: 'AutopecAutoPecas_Tray_Pedido_Captura', tags: ['Tray Captura 4.0'] },
    { id: 'a05', pasta: 'A4', name: 'Ferraminas_Tray_Estoque', tags: ['Tray Preco 3.0', 'Tray Estoque 4.0'] },
    { id: 'a06', pasta: 'A3', name: 'LAB_Mercos_Pedido_Captura', tags: ['mercos'] },
    { id: 'a07', pasta: 'A3', name: 'LAB_Mercos_Titulos', tags: ['mercos'] },
    { id: 'a08', name: 'Paraiso_Shopify_PedidoProcessa' },
  ],
  automakerdev_geral: [
    { id: 'g01', pasta: 'G4', name: 'Paulinho_Mercos_Pedido_Captura' },
    { id: 'g02', name: 'Solto_Existente' },
  ],
  automakerdev_cr: [
    { id: 'd01', name: 'LAB_Mercos_Cliente_Subida' },
    { id: 'd02', name: 'LAB_Mercos_Pedido_Captura', chama: ['LAB_Mercos_Credenciais'] },
    { id: 'd03', name: 'LAB_Mercos_Credenciais' },
    { id: 'd04', name: 'Paraiso_Shopify_PedidoProcessa' },
  ],
}

const PASTAS: Record<string, Pasta[]> = {
  automaker_prod: [
    { id: 'R1', nome: 'multi-tenant', pai: null },
    { id: 'T1', nome: 'Tray', pai: 'R1' },
    { id: 'T2', nome: 'Pedidos', pai: 'T1' },
    { id: 'M1', nome: 'Mercos', pai: 'R1' },
    { id: 'S1', nome: 'Shopify', pai: 'R1' },
    { id: 'C1', nome: 'Cilia', pai: 'R1' },
    { id: 'R2', nome: 'tools', pai: null },
    { id: 'R3', nome: 'legado', pai: null },
    { id: 'R4', nome: '🌌 Portal Integrações', pai: null },
  ],
  automaker_1: [
    { id: 'A1', nome: 'Migrado MT', pai: null },
    { id: 'A2', nome: '(MIGRADO MT) TMS Cores', pai: 'A1' },
    { id: 'A3', nome: 'Mercos', pai: 'A1' },
    { id: 'A4', nome: 'Tray', pai: null },
  ],
  automakerdev_geral: [
    { id: 'G1', nome: 'SCHUTZ', pai: null },
    { id: 'G2', nome: 'CLIMBA', pai: 'G1' },
    { id: 'G3', nome: 'Mercos', pai: 'G1' },
    { id: 'G4', nome: 'Paulinho Motos', pai: 'G3' },
    { id: 'G5', nome: 'Gabriel Carvalheiro', pai: null },
  ],
  automakerdev_cr: [],
}

const minus = (s: unknown) => String(s ?? '').trim().toLowerCase()
const partes = (nome: string) => nome.split('_').map((s) => s.trim())

function agrupar(lista: Wf[], indice: 0 | 1) {
  const grupos = new Map<string, { nome: string; total: number }>()
  for (const w of lista) {
    const p = partes(w.name)
    const nome = indice === 0 ? p[0] : (p[1] ?? '')
    if (!nome) continue
    const g = grupos.get(nome.toLowerCase()) ?? { nome, total: 0 }
    g.total += 1
    grupos.set(nome.toLowerCase(), g)
  }
  return [...grupos.values()].sort((a, b) => a.nome.localeCompare(b.nome))
}

function previa(lista: Wf[], q: URLSearchParams) {
  const cliente = q.get('cliente') ?? ''
  const base = q.get('base') ?? ''
  const busca = q.get('busca') ?? ''
  const casa = (w: Wf) => {
    const p = partes(w.name)
    const tags = (w.tags ?? []).map(minus)
    return (
      (!cliente || minus(p[0]) === minus(cliente) || tags.includes(minus(cliente))) &&
      (!base || minus(p[1]) === minus(base) || tags.includes(minus(base))) &&
      (!busca || minus(w.name).includes(minus(busca)))
    )
  }
  const achados = lista.filter(casa)

  const comuns = new Set<string>()
  if ((cliente || base || busca) && /^(1|true|sim)$/i.test(q.get('comuns') ?? '')) {
    const resolver = (ref: string) => lista.filter((w) => w.id === ref || minus(w.name) === minus(ref))
    const jaTem = new Set(achados.map((w) => w.id))
    const fila = [...achados]
    for (let i = 0; i < fila.length; i++) {
      for (const ref of fila[i].chama ?? []) {
        for (const r of resolver(ref)) {
          if (!jaTem.has(r.id)) {
            jaTem.add(r.id)
            comuns.add(r.id)
            fila.push(r)
          }
        }
      }
    }
  }

  // Quem cada workflow chama (por id ou por nome), para a tela montar a árvore workflow > sub-workflow.
  const filhosDe = (w: Wf) => [
    ...new Set(
      (w.chama ?? []).flatMap((ref) =>
        lista.filter((x) => x.id === ref || minus(x.name) === minus(ref)).map((x) => x.id),
      ),
    ),
  ]

  // Chamadas que não dá para seguir: para um workflow inexistente ou por expressão (={{ }}).
  const naoResolvidos = new Set<string>()
  const dinamicos = new Set<string>()
  for (const w of lista) {
    for (const ref of w.chama ?? []) {
      if (ref.startsWith('=')) {
        dinamicos.add(`${w.name} / ${ref}`)
      } else if (!lista.some((x) => x.id === ref || minus(x.name) === minus(ref))) {
        naoResolvidos.add(`${w.name} -> ${ref}`)
      }
    }
  }

  const todos = [...achados, ...lista.filter((w) => comuns.has(w.id))].sort((a, b) => a.name.localeCompare(b.name))
  return {
    total: todos.length,
    comuns: comuns.size,
    workflows: todos
      .slice(0, 5000)
      .map((w) => ({ id: w.id, nome: w.name, comum: comuns.has(w.id), filhos: filhosDe(w) })),
    avisos: {
      dinamicos: dinamicos.size,
      naoResolvidos: naoResolvidos.size,
      exemplos: [...naoResolvidos, ...dinamicos].slice(0, 12),
    },
  }
}

/** ZIP vazio válido (só o registro de fim de diretório): serve para testar o download da tela. */
const ZIP_VAZIO = Buffer.from([0x50, 0x4b, 0x05, 0x06, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])

function json(res: ServerResponse, status: number, corpo: unknown) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(corpo))
}

function tratar(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? '/', 'http://localhost')

  if (url.pathname === '/acesso') {
    json(res, 200, { email: 'dev@simulado', recursos: ['workflows', 'workflows-importar'] })
    return true
  }
  if (url.pathname !== '/wf') {
    return false
  }

  const q = url.searchParams
  const acao = minus(q.get('acao'))
  if (acao === 'instancias') {
    json(res, 200, { instancias: INSTANCIAS })
    return true
  }

  const lista = WORKFLOWS[minus(q.get('instancia'))]
  if (!lista) {
    json(res, 404, { error: 'Instância não encontrada' })
    return true
  }
  if (acao === 'pastas') {
    const instancia = minus(q.get('instancia'))
    const mapa: Record<string, string> = {}
    for (const w of lista) {
      if (w.pasta) mapa[w.id] = w.pasta
    }
    // O n8n de verdade leva alguns segundos (exporta um pacote): o atraso deixa ver o estado "carregando".
    setTimeout(() => json(res, 200, { instancia, pastas: PASTAS[instancia] ?? [], workflows: mapa }), 1200)
    return true
  }
  if (acao === 'clientes') {
    json(res, 200, { instancia: q.get('instancia'), clientes: agrupar(lista, 0), bases: agrupar(lista, 1) })
  } else if (acao === 'previa') {
    json(res, 200, previa(lista, q))
  } else if (acao === 'exportar') {
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/zip')
    res.setHeader('Content-Disposition', `attachment; filename="workflows_${q.get('instancia')}_simulado.zip"`)
    res.end(ZIP_VAZIO)
  } else {
    json(res, 400, { error: 'Ação inválida' })
  }
  return true
}

// ---------------------------------------------------------------------------------------------
// Importação (webhook portal-wf-importar). Repete as regras estritas da API pública do n8n: propriedade
// desconhecida no corpo, em settings ou num node faz a criação falhar, como no n8n de verdade.
// Um nome com "FALHAR" é recusado, para dar para ver a tela tratando erro.
// ---------------------------------------------------------------------------------------------
const TOPO = new Set(['name', 'nodes', 'connections', 'settings', 'description', 'pinData', 'staticData', 'nodeGroups', 'projectId', 'parentFolderId', 'shared'])
const NODE = new Set(['id', 'name', 'webhookId', 'disabled', 'notesInFlow', 'notes', 'type', 'typeVersion', 'executeOnce', 'alwaysOutputData', 'retryOnFail', 'maxTries', 'waitBetweenTries', 'continueOnFail', 'onError', 'position', 'parameters', 'credentials', 'customTelemetryTags', 'extendsCredential'])
const SETTINGS = new Set(['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder', 'binaryMode', 'callerPolicy', 'callerIds', 'timeSavedMode', 'timeSavedPerExecution', 'redactionPolicy', 'availableInMCP', 'customTelemetryTags', 'credentialResolverId'])

function validarWorkflow(w: Record<string, unknown>): string | null {
  for (const k of Object.keys(w)) if (!TOPO.has(k)) return `request.body is not allowed to have the additional property "${k}"`
  for (const k of ['name', 'nodes', 'connections', 'settings']) if (!(k in w)) return `request.body requires property "${k}"`
  for (const k of Object.keys((w.settings as object) ?? {})) if (!SETTINGS.has(k)) return `request.body.settings is not allowed to have the additional property "${k}"`
  for (const n of (w.nodes as Record<string, unknown>[]) ?? []) {
    for (const k of Object.keys(n)) if (!NODE.has(k)) return `request.body.nodes[] is not allowed to have the additional property "${k}"`
  }
  return null
}

let sequencia = 0
const novoId = (prefixo: string) => `${prefixo}${String(++sequencia).padStart(4, '0')}`

function lerCorpo(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = []
    req.on('data', (p: Buffer) => partes.push(p))
    req.on('end', () => resolve(Buffer.concat(partes).toString('utf8')))
    req.on('error', reject)
  })
}

interface ItemImportacao {
  chave: string
  nome?: string
  paiId?: string | null
  pastaId?: string | null
  id?: string
  workflow?: Record<string, unknown>
}

async function tratarImportar(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  if (url.pathname !== '/wf-importar') {
    return false
  }
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Use POST' })
    return true
  }
  let corpo: { acao?: string; instancia?: string; itens?: ItemImportacao[] }
  try {
    corpo = JSON.parse(await lerCorpo(req))
  } catch {
    json(res, 400, { error: 'JSON inválido' })
    return true
  }
  const acao = minus(corpo.acao)
  if (acao === 'instancias') {
    json(res, 200, { instancias: INSTANCIAS.filter((i) => IMPORTA_EM.includes(i.id)).map((i) => ({ id: i.id, nome: i.nome })) })
    return true
  }
  const instancia = minus(corpo.instancia)
  if (!IMPORTA_EM.includes(instancia)) {
    json(res, 403, { error: 'A importação não está liberada para esta instância.' })
    return true
  }
  const itens = Array.isArray(corpo.itens) ? corpo.itens : []
  if (itens.length === 0 || itens.length > 25) {
    json(res, 400, { error: 'Envie de 1 a 25 itens por pedido.' })
    return true
  }
  const pastas = PASTAS[instancia]
  const workflows = WORKFLOWS[instancia]
  await new Promise((r) => setTimeout(r, 350)) // dá para ver o andamento na tela

  if (acao === 'criar-pastas') {
    const resultados = itens.map((i) => {
      if (!i.nome || i.nome.length > 128) return { chave: i.chave, erro: 'Nome de pasta inválido (1 a 128 caracteres).' }
      if (i.nome.includes('FALHAR')) return { chave: i.chave, erro: 'Simulado: o n8n recusou esta pasta.' }
      if (i.paiId && !pastas.some((p) => p.id === i.paiId)) return { chave: i.chave, erro: `Pasta-mãe "${i.paiId}" não existe.` }
      const nova = { id: novoId('MF'), nome: i.nome, pai: i.paiId ?? null }
      pastas.push(nova)
      return { chave: i.chave, id: nova.id }
    })
    json(res, 200, { resultados })
  } else if (acao === 'criar-workflows') {
    const resultados = itens.map((i) => {
      const w = i.workflow ?? {}
      const problema = validarWorkflow(w)
      if (problema) return { chave: i.chave, erro: `400 - ${problema}` }
      if (String(w.name).includes('FALHAR')) return { chave: i.chave, erro: 'Simulado: o n8n recusou este workflow.' }
      if (i.pastaId && !pastas.some((p) => p.id === i.pastaId)) return { chave: i.chave, erro: `Pasta "${i.pastaId}" não existe.` }
      const novo: Wf = { id: novoId('MW'), name: String(w.name), pasta: i.pastaId ?? undefined }
      workflows.push(novo)
      return { chave: i.chave, id: novo.id }
    })
    json(res, 200, { resultados })
  } else if (acao === 'atualizar-workflows') {
    const resultados = itens.map((i) => {
      const alvo = workflows.find((w) => w.id === i.id)
      if (!alvo) return { chave: i.chave, erro: '404 - workflow não encontrado' }
      const problema = validarWorkflow(i.workflow ?? {})
      return problema ? { chave: i.chave, erro: `400 - ${problema}` } : { chave: i.chave, id: alvo.id }
    })
    json(res, 200, { resultados })
  } else {
    json(res, 400, { error: 'Ação inválida' })
  }
  return true
}

export function mockWorkflows(ligado: boolean): Plugin {
  return {
    name: 'mock-workflows',
    apply: 'serve',
    configureServer(server) {
      if (!ligado) {
        return
      }
      // Sem devolver função: roda antes do proxy do Vite, então /wf e /acesso não saem da máquina.
      server.middlewares.use((req, res, next) => {
        if (tratar(req, res)) {
          return
        }
        tratarImportar(req, res).then((tratada) => {
          if (!tratada) {
            next()
          }
        })
      })
    },
  }
}
