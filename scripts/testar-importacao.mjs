// Testes da importação de workflows (sem navegador e sem n8n): `npm run test:importacao`.
//
// Parte 1 e 2 testam a lógica do portal (src/importacao/*): leitor de ZIP, árvore de origem, limpeza do workflow,
// ligação entre workflows, plano e executor. A parte 3 roda o código REAL dos nodes do workflow Portal_WF_Importar (JSON exportado do n8n, em PORTAL_WF_IMPORTAR_JSON)
// contra uma API do n8n simulada com o esquema estrito da API pública, e liga o executor do portal a ela.
//
// Precisa do Node 20+ (Blob, File e DecompressionStream globais). Usa o esbuild que já vem com o Vite.
import { createRequire } from 'node:module'
import { readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { deflateRawSync } from 'node:zlib'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const esbuild = require('esbuild')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

const pasta = mkdtempSync(join(tmpdir(), 'teste-importacao-'))
const saida = join(pasta, 'importacao.cjs')
esbuild.buildSync({
  stdin: {
    contents: ['zipLeitor', 'origem', 'workflow', 'plano', 'executor'].map((m) => `export * from './src/importacao/${m}'`).join(';'),
    resolveDir: raiz,
    loader: 'ts',
  },
  bundle: true, platform: 'node', format: 'cjs', outfile: saida, logLevel: 'error',
})
const M = require(saida)
rmSync(pasta, { recursive: true, force: true })

let ok = 0
let falhas = 0
const confere = (cond, msg) => { if (cond) ok++; else { falhas++; console.error('  FALHOU: ' + msg) } }
const secao = (t) => console.log('\n== ' + t)

// ---------------------------------------------------------------- ZIP de teste
const crc32 = (buf) => { let c, r = ~0; for (let n = 0; n < buf.length; n++) { c = (r ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1; r = (r >>> 8) ^ c } return ~r >>> 0 }
function montarZip(entradas) {
  const locais = []; const centrais = []; let desloc = 0
  for (const e of entradas) {
    const nome = Buffer.from(e.nome, 'utf8'); const dados = Buffer.from(e.conteudo)
    const metodo = e.metodo ?? 8
    const comp = metodo === 8 ? deflateRawSync(dados) : dados
    const L = Buffer.alloc(30); L.writeUInt32LE(0x04034b50, 0); L.writeUInt16LE(20, 4); L.writeUInt16LE(0x800, 6); L.writeUInt16LE(metodo, 8)
    L.writeUInt32LE(crc32(dados), 14); L.writeUInt32LE(comp.length, 18); L.writeUInt32LE(dados.length, 22); L.writeUInt16LE(nome.length, 26)
    const C = Buffer.alloc(46); C.writeUInt32LE(0x02014b50, 0); C.writeUInt16LE(20, 4); C.writeUInt16LE(20, 6); C.writeUInt16LE(0x800, 8); C.writeUInt16LE(metodo, 10)
    C.writeUInt32LE(crc32(dados), 16); C.writeUInt32LE(comp.length, 20); C.writeUInt32LE(dados.length, 24); C.writeUInt16LE(nome.length, 28); C.writeUInt32LE(desloc, 42)
    locais.push(L, nome, comp); centrais.push(C, nome); desloc += 30 + nome.length + comp.length
  }
  const cen = Buffer.concat(centrais)
  const F = Buffer.alloc(22); F.writeUInt32LE(0x06054b50, 0); F.writeUInt16LE(entradas.length, 8); F.writeUInt16LE(entradas.length, 10); F.writeUInt32LE(cen.length, 12); F.writeUInt32LE(desloc, 16)
  return Buffer.concat([...locais, cen, F])
}
const comoBlob = (buf) => new Blob([buf])

const wf = (nome, extra = {}) => ({
  name: nome, id: 'idOrigem_' + nome, active: true, tags: [{ id: 't', name: 'x' }], versionId: 'v', meta: {}, pinData: {},
  nodes: [{ id: 'n1', name: 'Start', type: 'n8n-nodes-base.manualTrigger', typeVersion: 1, position: [0, 0], parameters: {}, extraInvalido: 1 }],
  connections: {}, settings: { executionOrder: 'v1', saveDataSuccessExecution: 'DEFAULT', binaryMode: 'separate', foo: 1 }, ...extra,
})

// Esquema estrito da API pública do n8n (POST /workflows): propriedade fora da lista faz a criação falhar.
const TOPO = new Set(['name', 'nodes', 'connections', 'settings', 'description', 'pinData', 'staticData', 'nodeGroups', 'projectId', 'parentFolderId', 'shared'])
const NODE = new Set(['id', 'name', 'webhookId', 'disabled', 'notesInFlow', 'notes', 'type', 'typeVersion', 'executeOnce', 'alwaysOutputData', 'retryOnFail', 'maxTries', 'waitBetweenTries', 'continueOnFail', 'onError', 'position', 'parameters', 'credentials', 'customTelemetryTags', 'extendsCredential'])
const SETTINGS = new Set(['saveExecutionProgress', 'saveManualExecutions', 'saveDataErrorExecution', 'saveDataSuccessExecution', 'executionTimeout', 'errorWorkflow', 'timezone', 'executionOrder', 'binaryMode', 'callerPolicy', 'callerIds', 'timeSavedMode', 'timeSavedPerExecution', 'redactionPolicy', 'availableInMCP', 'customTelemetryTags', 'credentialResolverId'])
function problemasDoEsquema(c) {
  const e = []
  Object.keys(c).forEach((k) => { if (!TOPO.has(k)) e.push('topo: ' + k) })
  ;['name', 'nodes', 'connections', 'settings'].forEach((k) => { if (!(k in c)) e.push('falta ' + k) })
  Object.keys(c.settings || {}).forEach((k) => { if (!SETTINGS.has(k)) e.push('settings: ' + k) })
  ;(c.nodes || []).forEach((n) => Object.keys(n).forEach((k) => { if (!NODE.has(k)) e.push('node: ' + k) }))
  const s = c.settings || {}
  if ('saveDataSuccessExecution' in s && !['all', 'none'].includes(s.saveDataSuccessExecution)) e.push('saveDataSuccessExecution invalido')
  return e
}

const texto = (u8) => new TextDecoder().decode(u8)

async function parte1() {
  secao('Leitor de ZIP e origem')
  const zip = montarZip([
    { nome: 'Mercos/Paulinho Motos/Pedido_Captura.json', conteudo: JSON.stringify(wf('Pedido_Captura')) },
    { nome: 'Mercos/Paulinho Motos/Pedido_Processa.json', conteudo: JSON.stringify(wf('Pedido_Processa')), metodo: 0 },
    { nome: 'Climba/Casa das Furadeiras/Tråy_Ação.json', conteudo: JSON.stringify(wf('Tray Ação')) },
    { nome: 'Solto.json', conteudo: JSON.stringify(wf('Solto')) },
    { nome: 'LEIA.txt', conteudo: 'oi' },
  ])
  const entradas = await M.listarZip(comoBlob(zip))
  confere(entradas.length === 5, 'entradas do ZIP: ' + entradas.length)
  confere(entradas.some((e) => e.caminho === 'Climba/Casa das Furadeiras/Tråy_Ação.json'), 'nome com acento em UTF-8')
  confere(JSON.parse(texto(await entradas.find((e) => e.caminho.endsWith('Pedido_Captura.json')).ler())).name === 'Pedido_Captura', 'conteudo deflate')
  confere(JSON.parse(texto(await entradas.find((e) => e.caminho.endsWith('Pedido_Processa.json')).ler())).name === 'Pedido_Processa', 'conteudo sem compressao')
  let erro = ''
  try { await M.listarZip(comoBlob(Buffer.from('isto nao e um zip'))) } catch (e) { erro = e.message }
  confere(/parece um arquivo ZIP/.test(erro), 'arquivo que nao e ZIP: ' + erro)

  const origem = await M.lerOrigem([new File([zip], 'exp_parte1de2.zip'), new File([JSON.stringify(wf('Outro'))], 'Outro.json')])
  confere(origem.workflows.length === 5, 'workflows na origem: ' + origem.workflows.length)
  confere(origem.ignorados.some((i) => i.caminho === 'LEIA.txt'), 'txt ignorado')
  const mercos = origem.raiz.pastas.find((p) => p.nome === 'Mercos')
  confere(mercos && mercos.pastas[0].nome === 'Paulinho Motos' && mercos.pastas[0].itens.length === 2, 'hierarquia Mercos/Paulinho Motos')
  const dup = await M.lerOrigem([new File([zip], 'a.zip'), new File([zip], 'b.zip')])
  confere(dup.workflows.length === 4 && dup.ignorados.filter((i) => /repetido/.test(i.motivo)).length === 4, 'mesmo caminho em dois ZIPs vira ignorado')
  confere(M.normalizarCaminho('../x.json') === null && M.normalizarCaminho('a/../b.json') === null, 'caminho com .. recusado')
  confere(JSON.stringify(M.normalizarCaminho('.\\A\\\\B/c.json')) === JSON.stringify(['A', 'B', 'c.json']), 'barras invertidas e vazios')
  const ruim = await M.lerOrigem([new File(['{"a":1}'], 'nao_workflow.json'), new File(['{ quebrado'], 'quebrado.json')])
  confere(ruim.workflows.length === 0 && ruim.ignorados.length === 2, 'json que nao e workflow / json quebrado')

  secao('limparParaCriar (esquema estrito da API do n8n)')
  const original = wf('Teste', { settings: { executionOrder: 'v1', saveDataSuccessExecution: 'DEFAULT', saveExecutionProgress: true, binaryMode: 'separate', foo: 1, errorWorkflow: '' } })
  const copia = JSON.stringify(original)
  const limpo = M.limparParaCriar(original, 'Nome Final')
  confere(problemasDoEsquema(limpo).length === 0, 'corpo limpo passa no esquema: ' + problemasDoEsquema(limpo).join('; '))
  confere(limpo.name === 'Nome Final' && JSON.stringify(original) === copia, 'nome aplicado e original intacto')
  confere(limpo.settings.executionOrder === 'v1' && limpo.settings.saveExecutionProgress === true && !('saveDataSuccessExecution' in limpo.settings) && !('foo' in limpo.settings) && !('errorWorkflow' in limpo.settings), 'settings: mantem o valido, descarta DEFAULT/desconhecido/vazio')
  confere(!('extraInvalido' in limpo.nodes[0]), 'node sem propriedade desconhecida')
  confere(problemasDoEsquema(original).length > 0, 'sanity: o original NAO passaria no esquema')

  secao('Referencias entre workflows')
  const chamador = {
    name: 'A', connections: {}, settings: { errorWorkflow: 'idB', callerIds: 'idB, idX' },
    nodes: [
      { type: 'n8n-nodes-base.executeWorkflow', name: 'e1', parameters: { workflowId: { __rl: true, value: 'idB', mode: 'list', cachedResultName: 'B' } } },
      { type: 'n8n-nodes-base.executeWorkflow', name: 'e2', parameters: { workflowId: 'idC' } },
      { type: 'n8n-nodes-base.executeWorkflow', name: 'e3', parameters: { workflowId: '={{ $json.id }}' } },
      { type: 'n8n-nodes-base.executeWorkflow', name: 'e4', parameters: { source: 'parameter', workflowId: 'idB' } },
      { type: '@n8n/n8n-nodes-langchain.toolWorkflow', name: 't1', parameters: { workflowId: { __rl: true, value: 'idC', mode: 'id' } } },
      { type: 'n8n-nodes-base.httpRequest', name: 'h', parameters: { workflowId: 'idB' } },
    ],
  }
  const an = M.analisarReferencias(chamador)
  confere(JSON.stringify([...an.ids].sort()) === JSON.stringify(['idB', 'idC', 'idX']) && an.dinamicas === 1, 'analise: ' + JSON.stringify(an))
  const rem = M.remapearReferencias(chamador, new Map([['idB', 'NOVO_B'], ['idC', 'NOVO_C']]))
  confere(rem.trocas === 5, 'trocas (e1, e2, t1, errorWorkflow, 1 callerId): ' + rem.trocas)
  confere(rem.workflow.nodes[0].parameters.workflowId.value === 'NOVO_B' && rem.workflow.nodes[1].parameters.workflowId === 'NOVO_C' && rem.workflow.nodes[4].parameters.workflowId.value === 'NOVO_C', 'ids dos nodes trocados')
  confere(rem.workflow.nodes[2].parameters.workflowId === '={{ $json.id }}' && rem.workflow.nodes[3].parameters.workflowId === 'idB' && rem.workflow.nodes[5].parameters.workflowId === 'idB', 'expressao, source!=database e outros nodes intactos')
  confere(rem.workflow.settings.errorWorkflow === 'NOVO_B' && rem.workflow.settings.callerIds === 'NOVO_B,idX', 'errorWorkflow e callerIds')
  confere(chamador.nodes[0].parameters.workflowId.value === 'idB', 'original intacto')
}

async function parte2() {
  const zip = montarZip([
    { nome: 'Mercos/Paulinho Motos/Pedido_Captura.json', conteudo: JSON.stringify(wf('Pedido_Captura', { id: 'A1', nodes: [{ id: 'x', name: 'Chama', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1, position: [0, 0], parameters: { workflowId: { __rl: true, value: 'A2', mode: 'id' } } }] })) },
    { nome: 'Mercos/Paulinho Motos/Pedido_Processa.json', conteudo: JSON.stringify(wf('Pedido_Processa', { id: 'A2' })) },
    { nome: 'Mercos/Ferpam/Estoque.json', conteudo: JSON.stringify(wf('Estoque', { id: 'A3' })) },
    { nome: 'Climba/Casa das Furadeiras/Preco.json', conteudo: JSON.stringify(wf('Preco', { id: 'A4' })) },
    { nome: 'Solto.json', conteudo: JSON.stringify(wf('Solto', { id: 'A5' })) },
  ])
  const origem = await M.lerOrigem([new File([zip], 'exp.zip')])
  const todos = origem.workflows
  const vazio = { pastas: [], porPasta: new Map(), ids: new Set() }
  const base = { destinoId: null, subpasta: '', caminhoCompleto: true, conflito: 'pular', remapearReferencias: true }
  const sel = (...nomes) => todos.filter((w) => nomes.includes(w.nome))

  secao('Plano: hierarquia mantida')
  let p = M.montarPlano({ selecionados: todos, todos, opcoes: base, destino: vazio })
  confere(p.resumo.criar === 5 && p.resumo.pular === 0, 'cria tudo no destino vazio')
  confere(JSON.stringify(p.pastas.map((x) => x.chave)) === JSON.stringify(['Climba', 'Mercos', 'Climba/Casa das Furadeiras', 'Mercos/Ferpam', 'Mercos/Paulinho Motos']), 'pastas novas por nivel: ' + JSON.stringify(p.pastas.map((x) => x.chave)))
  const filha = p.pastas.find((x) => x.chave === 'Mercos/Paulinho Motos')
  confere(filha.nivel === 1 && filha.paiChave === 'Mercos' && filha.paiExistenteId === null, 'filha aponta para a mae nova')
  const topo = p.pastas.find((x) => x.chave === 'Mercos')
  confere(topo.nivel === 0 && topo.paiChave === null && topo.paiExistenteId === null, 'pasta de topo cai na raiz')
  confere(p.itens.find((i) => i.nome === 'Solto').pastaChave === null, 'workflow solto vai para a raiz do destino')

  secao('Plano: destino existente, subpasta e corte do caminho')
  const pastasDest = [{ id: 'D1', nome: 'Dev', pai: null }, { id: 'D2', nome: 'mercos', pai: 'D1' }, { id: 'D3', nome: 'Outra', pai: null }, { id: 'D5', nome: 'Paulinho Motos', pai: 'D2' }]
  const destExist = { pastas: pastasDest, porPasta: new Map([['D5', new Map([['pedido_captura', 'W9']])], [null, new Map([['solto', 'W8']])]]), ids: new Set(['W9', 'W8']) }
  p = M.montarPlano({ selecionados: todos, todos, opcoes: { ...base, destinoId: 'D1' }, destino: destExist })
  confere(p.pastasExistentes === 2 && !p.pastas.some((x) => x.chave === 'Mercos'), 'reaproveita "mercos" e "Paulinho Motos" (sem diferenciar maiusculas)')
  const ferpam = p.pastas.find((x) => x.chave === 'Mercos/Ferpam')
  confere(ferpam && ferpam.paiChave === null && ferpam.paiExistenteId === 'D2' && ferpam.nivel === 0, 'pasta nova dentro de pasta existente: pai = ID existente')
  const captura = p.itens.find((i) => i.nome === 'Pedido_Captura')
  confere(captura.acao === 'pular' && captura.idExistente === 'W9', 'conflito pula e guarda o ID do existente')
  confere(p.itens.find((i) => i.nome === 'Solto').acao === 'criar', 'o "Solto" nao conflita dentro de D1')
  p = M.montarPlano({ selecionados: todos, todos, opcoes: { ...base, destinoId: null }, destino: destExist })
  confere(p.itens.find((i) => i.nome === 'Solto').acao === 'pular', 'na raiz o "Solto" conflita')
  p = M.montarPlano({ selecionados: todos, todos, opcoes: { ...base, destinoId: 'D1', conflito: 'renomear' }, destino: destExist })
  confere(p.itens.find((i) => i.nome === 'Pedido_Captura').nomeFinal === 'Pedido_Captura (importado)', 'renomear: sufixo')
  p = M.montarPlano({ selecionados: todos, todos, opcoes: { ...base, subpasta: 'Importado 13/10' }, destino: vazio })
  confere(p.pastas[0].chave === 'Importado 13-10', 'subpasta extra (barra no nome vira "-"): ' + p.pastas[0].chave)
  p = M.montarPlano({ selecionados: sel('Pedido_Captura', 'Pedido_Processa'), todos, opcoes: { ...base, caminhoCompleto: false }, destino: vazio })
  confere(p.pastas.length === 0 && p.itens.every((i) => i.caminho.length === 0), 'sem caminho completo: o prefixo comum sai')
  p = M.montarPlano({ selecionados: sel('Pedido_Captura', 'Estoque'), todos, opcoes: { ...base, caminhoCompleto: false }, destino: vazio })
  confere(JSON.stringify(p.pastas.map((x) => x.chave)) === JSON.stringify(['Ferpam', 'Paulinho Motos']), 'prefixo comum "Mercos" sai')

  secao('Plano: avisos')
  p = M.montarPlano({ selecionados: sel('Pedido_Captura'), todos, opcoes: base, destino: vazio })
  confere(p.avisos.some((a) => a.tipo === 'chamada-fora-da-selecao' && a.exemplos[0].includes('Pedido_Processa')), 'chamada a workflow fora da selecao')
  p = M.montarPlano({ selecionados: sel('Pedido_Captura', 'Pedido_Processa'), todos, opcoes: base, destino: vazio })
  confere(!p.avisos.some((a) => a.tipo.startsWith('chamada')), 'selecionando os dois nao ha aviso')
  const comCred = wf('ComCred', { id: 'Z', nodes: [{ id: 'c', name: 'H', type: 'n8n-nodes-base.httpRequest', position: [0, 0], parameters: {}, credentials: { n8nApi: { id: '1', name: 'prod' } } }] })
  const o2 = await M.lerOrigem([new File([JSON.stringify(comCred)], 'ComCred.json')])
  p = M.montarPlano({ selecionados: o2.workflows, todos: o2.workflows, opcoes: base, destino: vazio })
  confere(p.avisos.some((a) => a.tipo === 'credenciais' && a.exemplos[0] === 'prod' && /1 node\./.test(a.texto)), 'aviso de credenciais')

  secao('Lotes')
  confere(JSON.stringify(M.dividirEmLotes([1, 2, 3, 4, 5, 6, 7], () => 10, 3, 1000)) === '[[1,2,3],[4,5,6],[7]]', 'por quantidade')
  confere(JSON.stringify(M.dividirEmLotes([1, 2, 3, 4], () => 400, 5, 1000)) === '[[1,2],[3,4]]', 'por bytes')
  confere(JSON.stringify(M.dividirEmLotes([1], () => 5000, 5, 1000)) === '[[1]]', 'item maior que o limite vai sozinho')

  secao('Executor com servidor simulado')
  const criarServidor = ({ falharPasta, falharWorkflow } = {}) => {
    const s = { pastas: [], wfs: [], chamadas: [], seq: 0 }
    const id = (x) => x + String(++s.seq).padStart(3, '0')
    s.cliente = {
      criarPastas: async (inst, itens) => { s.chamadas.push(['pastas', itens.length]); return itens.map((i) => {
        if (falharPasta === i.chave) return { chave: i.chave, erro: 'Forbidden' }
        if (i.paiId !== null && !s.pastas.some((x) => x.id === i.paiId) && !String(i.paiId).startsWith('D')) return { chave: i.chave, erro: 'pai inexistente: ' + i.paiId }
        const nova = { id: id('F'), nome: i.nome, paiId: i.paiId }; s.pastas.push(nova); return { chave: i.chave, id: nova.id }
      }) },
      criarWorkflows: async (inst, itens) => { s.chamadas.push(['workflows', itens.length]); return itens.map((i) => {
        const e = problemasDoEsquema(i.workflow); if (e.length) return { chave: i.chave, erro: '400 ' + e.join(',') }
        if (falharWorkflow && i.workflow.name === falharWorkflow) return { chave: i.chave, erro: 'boom' }
        const novo = { id: id('W'), pastaId: i.pastaId, workflow: i.workflow }; s.wfs.push(novo); return { chave: i.chave, id: novo.id }
      }) },
      atualizarWorkflows: async (inst, itens) => { s.chamadas.push(['atualizar', itens.length]); return itens.map((i) => { const w = s.wfs.find((x) => x.id === i.id); if (!w) return { chave: i.chave, erro: '404' }; w.workflow = i.workflow; return { chave: i.chave, id: i.id } }) },
    }
    return s
  }
  const destSimples = { pastas: [{ id: 'D1', nome: 'Dev', pai: null }], porPasta: new Map(), ids: new Set() }
  const opcoes = { ...base, destinoId: 'D1' }
  const plano = M.montarPlano({ selecionados: todos, todos, opcoes, destino: destSimples })
  let srv = criarServidor()
  const fases = []
  let r = await M.executarImportacao({ instancia: 'x', plano, selecionados: todos, opcoes, cliente: srv.cliente, aoProgresso: (g) => fases.push(g.fase) })
  confere(r.criados.length === 5 && r.falhas.length === 0 && r.pastasCriadas === plano.pastas.length, 'cria os 5 workflows e as pastas')
  const fPaulinho = srv.pastas.find((x) => x.nome === 'Paulinho Motos'); const fMercos = srv.pastas.find((x) => x.nome === 'Mercos')
  confere(fPaulinho.paiId === fMercos.id && fMercos.paiId === 'D1', 'a filha foi criada dentro da mae nova, e a de topo dentro do destino')
  const wCaptura = srv.wfs.find((x) => x.workflow.name === 'Pedido_Captura'); const wProcessa = srv.wfs.find((x) => x.workflow.name === 'Pedido_Processa')
  confere(wCaptura.pastaId === fPaulinho.id, 'workflow na pasta certa')
  confere(wCaptura.workflow.nodes[0].parameters.workflowId.value === wProcessa.id, 'referencia reescrita para o ID NOVO')
  confere(r.referenciasAtualizadas === 1 && r.referenciasComFalha.length === 0, 'uma atualizacao de referencia')
  confere(['pastas', 'workflows', 'referencias', 'fim'].every((f) => fases.includes(f)) && fases[fases.length - 1] === 'fim', 'etapas anunciadas')
  confere(srv.chamadas.filter((c) => c[0] === 'pastas').length === 2, 'pastas em 2 niveis = 2 pedidos')

  srv = criarServidor({ falharPasta: 'Mercos' })
  r = await M.executarImportacao({ instancia: 'x', plano, selecionados: todos, opcoes, cliente: srv.cliente, aoProgresso: () => {} })
  confere(r.pastasComFalha.some((f) => f.chave === 'Mercos') && r.pastasComFalha.some((f) => f.chave === 'Mercos/Ferpam'), 'falha na pasta mae derruba as filhas')
  confere(r.criados.length === 2 && r.falhas.length === 3, 'so entram os que nao dependem dela')

  srv = criarServidor({ falharWorkflow: 'Estoque' })
  r = await M.executarImportacao({ instancia: 'x', plano, selecionados: todos, opcoes, cliente: srv.cliente, aoProgresso: () => {} })
  confere(r.criados.length === 4 && r.falhas.length === 1 && r.falhas[0].erro === 'boom', 'um workflow que falha nao impede os outros')

  const zip12 = montarZip(Array.from({ length: 12 }, (_, i) => ({ nome: `Lote/W${String(i).padStart(2, '0')}.json`, conteudo: JSON.stringify(wf('W' + i, { id: 'L' + i })) })))
  const origem12 = await M.lerOrigem([new File([zip12], 'doze.zip')])
  const plano12 = M.montarPlano({ selecionados: origem12.workflows, todos: origem12.workflows, opcoes, destino: destSimples })
  srv = criarServidor()
  const ctl = new AbortController()
  r = await M.executarImportacao({ instancia: 'x', plano: plano12, selecionados: origem12.workflows, opcoes, cliente: srv.cliente, aoProgresso: (g) => { if (g.fase === 'workflows') ctl.abort() }, sinal: ctl.signal })
  confere(r.cancelado && r.criados.length === 5 && srv.chamadas.filter((c) => c[0] === 'workflows').length === 1, 'cancelar para entre os lotes (12 workflows, parou depois de 5)')
  srv = criarServidor()
  r = await M.executarImportacao({ instancia: 'x', plano: plano12, selecionados: origem12.workflows, opcoes, cliente: srv.cliente, aoProgresso: () => {} })
  confere(r.criados.length === 12 && JSON.stringify(srv.chamadas.filter((c) => c[0] === 'workflows').map((c) => c[1])) === '[5,5,2]', '12 workflows em lotes de 5, 5 e 2')

  const dest3 = { pastas: [{ id: 'D1', nome: 'Dev', pai: null }, { id: 'D2', nome: 'Mercos', pai: 'D1' }, { id: 'D4', nome: 'Paulinho Motos', pai: 'D2' }], porPasta: new Map([['D4', new Map([['pedido_processa', 'EXISTENTE_77']])]]), ids: new Set(['EXISTENTE_77']) }
  const plano3 = M.montarPlano({ selecionados: sel('Pedido_Captura', 'Pedido_Processa'), todos, opcoes, destino: dest3 })
  confere(plano3.itens.find((i) => i.nome === 'Pedido_Processa').acao === 'pular' && plano3.pastas.length === 0, 'reaproveita as pastas e pula o existente')
  srv = criarServidor()
  await M.executarImportacao({ instancia: 'x', plano: plano3, selecionados: todos, opcoes, cliente: srv.cliente, aoProgresso: () => {} })
  confere(srv.wfs.length === 1 && srv.wfs[0].workflow.nodes[0].parameters.workflowId.value === 'EXISTENTE_77', 'a chamada aponta para o workflow que ja existia')
  srv = criarServidor()
  r = await M.executarImportacao({ instancia: 'x', plano, selecionados: todos, opcoes: { ...opcoes, remapearReferencias: false }, cliente: srv.cliente, aoProgresso: () => {} })
  confere(r.referenciasAtualizadas === 0 && !srv.chamadas.some((c) => c[0] === 'atualizar'), 'sem remapear nao ha etapa de referencias')
}

// ---------------------------------------------------------------- parte 3: o workflow do n8n
async function parte3() {
  const arquivoN8n = process.env.PORTAL_WF_IMPORTAR_JSON
  if (!arquivoN8n) {
    secao('Workflow do n8n: pulado (defina PORTAL_WF_IMPORTAR_JSON com o caminho do JSON exportado do n8n)')
    return
  }
  const wfN8n = JSON.parse(readFileSync(arquivoN8n, 'utf8'))
  const codigoDe = (nome) => {
    const n = wfN8n.nodes.find((x) => x.name === nome)
    if (!n) throw new Error('node nao encontrado em Portal_WF_Importar.json: ' + nome)
    return n.parameters.jsCode
  }
  const C = {
    ler: codigoDe('Ler Credencial'), checar: codigoDe('Checar Permissao'), validar: codigoDe('Validar Pedido'),
    prepPastas: codigoDe('Preparar Pastas'), prepWorkflows: codigoDe('Preparar Workflows'), prepAtualizar: codigoDe('Preparar Atualizacoes'),
    montaPastas: codigoDe('Montar Resposta (pastas)'), montaWorkflows: codigoDe('Montar Resposta (workflows)'), montaAtualizar: codigoDe('Montar Resposta (atualizar)'),
    prepPublicar: codigoDe('Preparar Publicacoes'), montaPublicar: codigoDe('Montar Resposta (publicar)'),
  }
  const temPlaceholder = /projetoId: 'TROCAR/.test(C.checar) // o JSON de teste ainda tem instancia sem projeto preenchido?
  const jwt = (sub) => 'x.' + Buffer.from(JSON.stringify({ sub })).toString('base64url') + '.y'

  secao('Workflow do n8n: estrutura')
  const nomes = wfN8n.nodes.map((n) => n.name)
  confere(new Set(nomes).size === nomes.length, 'nomes de node unicos')
  let ligacoesOk = true
  for (const [orig, c] of Object.entries(wfN8n.connections)) { if (!nomes.includes(orig)) ligacoesOk = false; for (const s of c.main) for (const d of s) if (!nomes.includes(d.node)) ligacoesOk = false }
  confere(ligacoesOk, 'todas as ligacoes apontam para nodes que existem')
  const webhook = wfN8n.nodes.find((n) => n.type.endsWith('.webhook'))
  confere(webhook.parameters.path === 'portal-wf-importar' && webhook.parameters.httpMethod === 'POST', 'webhook POST em portal-wf-importar')
  confere(wfN8n.active === false && !('id' in wfN8n), 'entregue inativo e sem ID (importa como workflow novo)')
  const nodesHttp = wfN8n.nodes.filter((n) => n.type.endsWith('.httpRequest') && n.credentials)
  confere(nodesHttp.every((n) => Object.keys(n.credentials).join() === 'n8nApi'), 'os nodes HTTP so usam credencial do tipo n8nApi')
  confere(nodesHttp.length === 12 && ['Criar Pasta', 'Criar Workflow', 'Atualizar Workflow', 'Publicar Workflow'].every((p) => ['automaker_prod', 'automaker_1', 'automakerdev_geral'].every((i) => nodesHttp.some((n) => n.name === `${p} (${i})`))), '4 nodes de escrita (criar pasta, criar, atualizar, publicar) para cada uma das 3 instancias')
  const publicar = nodesHttp.filter((n) => n.name.startsWith('Publicar Workflow'))
  confere(publicar.every((n) => n.parameters.method === 'POST' && /\/activate$/.test(n.parameters.url)), 'publicar chama POST /workflows/{id}/activate')
  const seletores = wfN8n.nodes.filter((n) => n.name.startsWith('Qual Instancia?'))
  confere(seletores.length === 4 && seletores.every((n) => wfN8n.connections[n.name].main.length === 4 && wfN8n.connections[n.name].main[3][0].node === 'Responder 403'), 'cada seletor de instancia tem 3 saidas e a "outra" vai para 403')

  // API do n8n simulada
  const criarApi = () => {
    const api = { pastas: [{ id: 'PAI1', name: 'Dev', parentFolderId: null }], wfs: [], chamadas: [], publicados: [], seq: 0 }
    const id = (x) => x + String(++api.seq).padStart(3, '0')
    api.http = (metodo, url, corpo) => {
      api.chamadas.push(metodo + ' ' + url)
      let m
      if (metodo === 'POST' && (m = url.match(/\/api\/v1\/projects\/([^/]+)\/folders$/))) {
        if (m[1] !== 'PROJ_OK') return { statusCode: 404, body: { message: 'project not found' } }
        if (corpo.parentFolderId && !api.pastas.some((p) => p.id === corpo.parentFolderId)) return { statusCode: 400, body: { message: 'parent folder not found' } }
        const p = { id: id('F'), name: corpo.name, parentFolderId: corpo.parentFolderId || null }; api.pastas.push(p); return { statusCode: 200, body: p }
      }
      if (metodo === 'POST' && /\/api\/v1\/workflows$/.test(url)) {
        const e = problemasDoEsquema(corpo); if (e.length) return { statusCode: 400, body: { message: 'request.body ' + e.join(', ') } }
        if (corpo.name.includes('REDE')) return { error: { message: 'ECONNRESET' } }
        const w = { id: id('W'), ...corpo }; api.wfs.push(w); return { statusCode: 200, body: { id: w.id, name: w.name } }
      }
      if (metodo === 'POST' && (m = url.match(/\/api\/v1\/workflows\/([^/]+)\/activate$/))) {
        const w = api.wfs.find((x) => x.id === m[1]); if (!w) return { statusCode: 404, body: { message: 'not found' } }
        if (w.name.includes('SUBINATIVO')) return { statusCode: 400, body: { message: 'Workflow has issues: sub-workflow not published' } }
        w.active = true; api.publicados.push(w.id); return { statusCode: 200, body: { id: w.id, active: true } }
      }
      if (metodo === 'PUT' && (m = url.match(/\/api\/v1\/workflows\/([^/?]+)$/))) {
        const w = api.wfs.find((x) => x.id === m[1]); if (!w) return { statusCode: 404, body: { message: 'not found' } }
        const e = problemasDoEsquema(corpo); if (e.length) return { statusCode: 400, body: { message: e.join(', ') } }
        Object.assign(w, corpo); return { statusCode: 200, body: { id: w.id } }
      }
      return { statusCode: 404, body: { message: 'rota desconhecida' } }
    }
    return api
  }

  async function n8n(api, corpo, { perfil = 'ADMIN', email = 'gabriel@citel.com.br', config = {} } = {}) {
    const saidas = {}
    const $ = (nome) => ({ first: () => saidas[nome][0], all: () => saidas[nome], item: saidas[nome][0] })
    const rodar = async (nome, codigo, entrada) => { saidas[nome] = await new AsyncFunction('$', '$input', 'Buffer', codigo)($, { first: () => entrada[0], all: () => entrada }, Buffer); return saidas[nome] }
    saidas['Receber Pedido'] = [{ json: { headers: { authorization: 'Bearer ' + jwt(email) }, body: corpo } }]
    await rodar('Ler Credencial', C.ler, saidas['Receber Pedido'])
    saidas['Validar Token no Monint'] = [{ json: { statusCode: perfil === null ? 401 : 200, body: { perfil, email } } }]
    if (perfil === null) return { status: 401 }
    let checar = C.checar
    if (config.emailsPermitidos) checar = checar.replace('const EMAILS_PERMITIDOS = [];', 'const EMAILS_PERMITIDOS = ' + JSON.stringify(config.emailsPermitidos) + ';')
    // o ID de verdade fica so no arquivo; `semProjetos` mantem como esta, para ver o que acontece com os ainda por preencher
    if (!config.semProjetos) checar = checar.replace(/projetoId: '[^']+'/g, "projetoId: 'PROJ_OK'")
    await rodar('Checar Permissao', checar, saidas['Ler Credencial'])
    if (!saidas['Checar Permissao'][0].json.permitido) return { status: 403 }
    await rodar('Validar Pedido', C.validar, saidas['Checar Permissao'])
    const v = saidas['Validar Pedido'][0].json
    if (!v.ok) return { status: v.status, corpo: { error: v.erro } }
    if (v.acao === 'instancias') return { status: 200, corpo: { instancias: saidas['Checar Permissao'][0].json.instancias } }
    const [prep, codPrep, montar, codMontar, chamar] = {
      'criar-pastas': ['Preparar Pastas', C.prepPastas, 'Montar Resposta (pastas)', C.montaPastas, (j) => api.http('POST', j.baseUrl + '/api/v1/projects/' + j.projetoId + '/folders', j.corpo)],
      'criar-workflows': ['Preparar Workflows', C.prepWorkflows, 'Montar Resposta (workflows)', C.montaWorkflows, (j) => api.http('POST', j.baseUrl + '/api/v1/workflows', j.corpo)],
      'atualizar-workflows': ['Preparar Atualizacoes', C.prepAtualizar, 'Montar Resposta (atualizar)', C.montaAtualizar, (j) => api.http('PUT', j.baseUrl + '/api/v1/workflows/' + j.id, j.corpo)],
      'publicar-workflows': ['Preparar Publicacoes', C.prepPublicar, 'Montar Resposta (publicar)', C.montaPublicar, (j) => api.http('POST', j.baseUrl + '/api/v1/workflows/' + j.id + '/activate', {})],
    }[v.acao]
    await rodar(prep, codPrep, saidas['Checar Permissao'])
    const respostas = saidas[prep].map((it) => ({ json: chamar(it.json) }))
    await rodar(montar, codMontar, respostas)
    const r = saidas[montar][0].json
    return { status: 200, corpo: JSON.parse(r.corpo), log: r.logQtd !== undefined ? { qtd: r.logQtd, nomes: r.logNomes } : null, preparado: saidas[prep] }
  }

  const base = { instancia: 'automakerdev_geral' }
  const wfOk = { name: 'W', nodes: [], connections: {}, settings: {} }

  secao('Workflow do n8n: autenticacao e acesso')
  let api = criarApi()
  let r = await n8n(api, { acao: 'instancias' })
  const idsLista = r.corpo.instancias.map((i) => i.id)
  confere(r.status === 200 && idsLista.join() === 'automaker_prod,automaker_1,automakerdev_geral' && r.corpo.instancias.every((i) => !('baseUrl' in i) && !('projetoId' in i)), 'lista as 3 instancias liberadas sem expor a URL nem o projeto')
  r = await n8n(api, { acao: 'instancias' }, { config: { semProjetos: true } })
  if (temPlaceholder) confere(r.status === 200 && r.corpo.instancias.length === 1 && r.corpo.instancias[0].id === 'automakerdev_geral', 'instancia com projetoId ainda por preencher (TROCAR_...) fica escondida')
  const semProj = criarApi()
  r = await n8n(semProj, { acao: 'criar-pastas', instancia: 'automaker_prod', itens: [{ chave: 'a', nome: 'x' }] }, { config: { semProjetos: true } })
  if (temPlaceholder) confere(r.status === 403 && semProj.chamadas.length === 0, 'instancia sem projetoId nao recebe importacao (403, nenhuma chamada)')
  confere((await n8n(api, { acao: 'instancias' }, { perfil: null })).status === 401, 'token invalido: 401')
  confere((await n8n(api, { acao: 'instancias' }, { perfil: 'USUARIO' })).status === 403, 'usuario comum: 403')
  confere((await n8n(api, { acao: 'instancias' }, { perfil: 'DEV' })).status === 403, 'perfil DEV exporta mas nao importa: 403')
  confere((await n8n(api, { acao: 'criar-workflows', ...base, itens: [{ chave: 'a', pastaId: null, workflow: wfOk }] }, { perfil: 'DEV' })).status === 403 && api.chamadas.length === 0, 'DEV nao escreve em instancia nenhuma (nenhuma chamada a API)')
  confere((await n8n(api, { acao: 'instancias' }, { perfil: 'admin' })).status === 200, 'perfil em minusculas vale')
  confere((await n8n(api, { acao: 'instancias' }, { config: { emailsPermitidos: ['outro@citel.com.br'] } })).status === 403, 'lista de e-mails: quem nao esta nela leva 403')
  confere((await n8n(api, { acao: 'instancias' }, { config: { emailsPermitidos: ['gabriel@citel.com.br'] } })).status === 200, 'lista de e-mails: quem esta nela passa')

  secao('Workflow do n8n: validacao (nada chega a API quando invalido)')
  const invalido = async (corpo, status, trecho, rotulo) => {
    const a = criarApi(); const x = await n8n(a, corpo)
    confere(x.status === status && new RegExp(trecho).test(x.corpo ? x.corpo.error : ''), `${rotulo}: esperava ${status} /${trecho}/, veio ${x.status} ${JSON.stringify(x.corpo)}`)
    confere(a.chamadas.length === 0, `${rotulo}: nenhuma chamada a API`)
  }
  await invalido({ acao: 'apagar-tudo', ...base, itens: [] }, 400, 'Ação inválida', 'acao desconhecida')
  await invalido({ acao: 'criar-pastas', instancia: 'outra_instancia', itens: [{ chave: 'a', nome: 'x' }] }, 403, 'não está liberada', 'instancia fora da lista')
  await invalido({ acao: 'criar-pastas', instancia: '', itens: [{ chave: 'a', nome: 'x' }] }, 403, 'não está liberada', 'sem instancia')
  await invalido({ acao: 'criar-pastas', ...base, itens: [] }, 400, '1 a 25', 'sem itens')
  await invalido({ acao: 'criar-pastas', ...base, itens: Array.from({ length: 26 }, (_, i) => ({ chave: 'k' + i, nome: 'p' })) }, 400, '1 a 25', 'itens demais')
  await invalido({ acao: 'criar-pastas', ...base, itens: [{ chave: 'a', nome: '' }] }, 400, 'nome de pasta', 'pasta sem nome')
  await invalido({ acao: 'criar-pastas', ...base, itens: [{ chave: 'a', nome: 'x'.repeat(129) }] }, 400, 'nome de pasta', 'nome de pasta longo')
  await invalido({ acao: 'criar-pastas', ...base, itens: [{ chave: 'a', nome: 'x', paiId: '../etc/passwd' }] }, 400, 'pasta-mãe', 'pai com caracteres estranhos')
  await invalido({ acao: 'criar-workflows', ...base, itens: [{ chave: 'a', pastaId: 'F1', workflow: { ...wfOk, projectId: 'OUTRO' } }] }, 400, 'propriedade não permitida: projectId', 'tentativa de escolher o projeto')
  await invalido({ acao: 'criar-workflows', ...base, itens: [{ chave: 'a', pastaId: 'F1', workflow: { ...wfOk, parentFolderId: 'X' } }] }, 400, 'propriedade não permitida: parentFolderId', 'tentativa de escolher a pasta dentro do workflow')
  await invalido({ acao: 'criar-workflows', ...base, itens: [{ chave: 'a', pastaId: 'F1', workflow: { ...wfOk, active: true } }] }, 400, 'propriedade não permitida: active', 'workflow ativo')
  await invalido({ acao: 'criar-workflows', ...base, itens: [{ chave: 'a', pastaId: 'F 1;drop', workflow: wfOk }] }, 400, 'pasta inválida', 'pastaId malformado')
  await invalido({ acao: 'criar-workflows', ...base, itens: [{ chave: 'a', workflow: { ...wfOk, name: '' } }] }, 400, 'nome do workflow', 'workflow sem nome')
  await invalido({ acao: 'criar-workflows', ...base, itens: [{ chave: 'a', workflow: { name: 'W', nodes: 'x', connections: {}, settings: {} } }] }, 400, 'lista de nodes', 'nodes nao e lista')
  await invalido({ acao: 'criar-workflows', ...base, itens: [{ chave: 'a', workflow: { name: 'W', nodes: [], connections: {} } }] }, 400, 'connections e settings', 'sem settings')
  await invalido({ acao: 'criar-workflows', ...base, itens: [{ chave: 'a', workflow: { ...wfOk, pinData: { x: 'a'.repeat(8_100_000) } } }] }, 400, 'grande demais', 'workflow acima de 8 MB')
  await invalido({ acao: 'atualizar-workflows', ...base, itens: [{ chave: 'a', id: '../../x', workflow: wfOk }] }, 400, 'ID do workflow', 'id de atualizacao malformado')
  await invalido({ acao: 'criar-pastas', ...base, itens: 'nao e lista' }, 400, '1 a 25', 'itens nao e lista')
  await invalido({ acao: 'publicar-workflows', ...base, itens: [{ chave: 'a', id: '../../x' }] }, 400, 'ID do workflow', 'id de publicacao malformado')
  await invalido({ acao: 'publicar-workflows', ...base, itens: [] }, 400, '1 a 25', 'publicar sem itens')
  await invalido({ acao: 'publicar-workflows', instancia: 'outra_instancia', itens: [{ chave: 'a', id: 'W1' }] }, 403, 'não está liberada', 'publicar em instancia fora da lista')

  secao('Workflow do n8n: preparo e respostas')
  api = criarApi()
  r = await n8n(api, { acao: 'criar-workflows', ...base, itens: [{ chave: 'a', pastaId: 'PAI1', workflow: wfOk }, { chave: 'b', pastaId: null, workflow: wfOk }] })
  confere(r.preparado[0].json.corpo.projectId === 'PROJ_OK' && r.preparado[0].json.corpo.parentFolderId === 'PAI1', 'projectId vem da configuracao e parentFolderId da pasta')
  confere(!('parentFolderId' in r.preparado[1].json.corpo), 'sem pasta: sem parentFolderId')
  confere(r.log && r.log.qtd === 2 && r.log.nomes === 'W | W', 'registro de auditoria')
  api = criarApi()
  r = await n8n(api, { acao: 'criar-workflows', ...base, itens: [
    { chave: 'ok', pastaId: 'PAI1', workflow: { ...wfOk, name: 'Bom' } },
    { chave: 'api', pastaId: 'PAI1', workflow: { ...wfOk, name: 'Ruim', settings: { lixo: 1 } } },
    { chave: 'rede', pastaId: 'PAI1', workflow: { ...wfOk, name: 'REDE cai' } },
  ] })
  const porChave = Object.fromEntries(r.corpo.resultados.map((x) => [x.chave, x]))
  confere(porChave.ok.id && !porChave.ok.erro, 'item bom devolve o id')
  confere(/^HTTP 400 - request\.body/.test(porChave.api.erro), 'erro da API vem com o motivo: ' + porChave.api.erro)
  confere(porChave.rede.erro === 'ECONNRESET', 'falha de rede vira erro do item')
  confere(r.log.qtd === 1 && r.log.nomes === 'Bom', 'a auditoria registra so o que foi criado')

  secao('Workflow do n8n: publicar')
  api = criarApi()
  const w1 = { id: 'WPUB1', name: 'Publicavel' }; const w2 = { id: 'WPUB2', name: 'SUBINATIVO precisa de outro' }
  api.wfs.push(w1, w2)
  r = await n8n(api, { acao: 'publicar-workflows', ...base, itens: [{ chave: 'a', id: 'WPUB1', nome: 'Publicavel' }, { chave: 'b', id: 'WPUB2' }, { chave: 'c', id: 'NAOEXISTE' }] })
  const pub = Object.fromEntries(r.corpo.resultados.map((x) => [x.chave, x]))
  confere(r.status === 200 && pub.a.id === 'WPUB1' && w1.active === true, 'publica o workflow que existe')
  confere(/^HTTP 400 - Workflow has issues/.test(pub.b.erro) && !w2.active, 'erro da API ao publicar volta como erro do item: ' + pub.b.erro)
  confere(/^HTTP 404/.test(pub.c.erro), 'workflow inexistente: erro 404 do item')
  confere(JSON.stringify(api.publicados) === '["WPUB1"]' && api.chamadas.every((c) => c.startsWith('POST') && c.endsWith('/activate')), 'so chamou /activate, uma vez por item, na ordem enviada')
  confere(r.log && r.log.qtd === 1 && r.log.nomes === 'Publicavel (falharam: 2)', 'publicar fica registrado (quantos deram certo, nomes e quantos falharam): ' + JSON.stringify(r.log))
  await invalido({ acao: 'publicar-workflows', ...base, itens: [{ chave: 'a', id: 'W1', nome: 'x'.repeat(129) }] }, 400, 'nome inválido', 'nome longo na publicacao')

  secao('Workflow do n8n: registro de substituicoes')
  api = criarApi()
  api.wfs.push({ id: 'WSUB1', name: 'Antigo 1' }, { id: 'WSUB2', name: 'Antigo 2' })
  r = await n8n(api, { acao: 'atualizar-workflows', ...base, itens: [
    { chave: 'a', id: 'WSUB1', motivo: 'substituicao', workflow: { ...wfOk, name: 'Novo 1' } },
    { chave: 'b', id: 'WSUB2', motivo: 'substituicao', workflow: { ...wfOk, name: 'Novo 2' } },
    { chave: 'c', id: 'NAOEXISTE', motivo: 'substituicao', workflow: { ...wfOk, name: 'Falha' } },
  ] })
  confere(r.status === 200 && r.log && r.log.qtd === 2 && r.log.nomes === 'Novo 1 | Novo 2', 'substituicao registra so o que deu certo: ' + JSON.stringify(r.log))
  r = await n8n(api, { acao: 'atualizar-workflows', ...base, itens: [{ chave: 'a', id: 'WSUB1', motivo: 'referencias', workflow: { ...wfOk, name: 'Novo 1' } }, { chave: 'b', id: 'WSUB2', workflow: { ...wfOk, name: 'Novo 2' } }] })
  confere(r.status === 200 && r.log && r.log.qtd === 0, 'religar chamadas (motivo "referencias" ou sem motivo) nao conta como substituicao')
  await invalido({ acao: 'atualizar-workflows', ...base, itens: [{ chave: 'a', id: 'WSUB1', motivo: 'apagar', workflow: wfOk }] }, 400, 'motivo inválido', 'motivo desconhecido')
  const houve = wfN8n.nodes.find((n) => n.name === 'Houve Substituicao?')
  confere(houve && wfN8n.connections['Houve Substituicao?'].main[0][0].node === 'Registrar Substituicao' && wfN8n.connections['Houve Substituicao?'].main[1][0].node === 'Responder Atualizacoes', 'so passa pelo registro quando houve substituicao')
  confere(wfN8n.connections['Registrar Publicacao'].main[0][0].node === 'Responder Publicacoes' && wfN8n.nodes.find((n) => n.name === 'Responder Publicacoes').parameters.responseBody.includes("Montar Resposta (publicar)"), 'publicar registra e responde com o corpo montado antes do registro')

  secao('Integracao: o executor do portal contra o n8n simulado')
  const chama = [{ id: 'n', name: 'C', type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1, position: [0, 0], parameters: { workflowId: { __rl: true, value: 'OR_B', mode: 'id' } } }]
  const zip = montarZip([
    { nome: 'Mercos/Paulinho/A.json', conteudo: JSON.stringify(wf('A', { id: 'OR_A', nodes: chama })) },
    { nome: 'Mercos/Paulinho/B.json', conteudo: JSON.stringify(wf('B', { id: 'OR_B' })) },
    { nome: 'Mercos/Ferpam/C.json', conteudo: JSON.stringify(wf('C', { id: 'OR_C' })) },
    { nome: 'Solto.json', conteudo: JSON.stringify(wf('Solto', { id: 'OR_S' })) },
  ])
  const origem = await M.lerOrigem([new File([zip], 'x.zip')])
  const opcoes = { destinoId: 'PAI1', subpasta: '', caminhoCompleto: true, conflito: 'pular', remapearReferencias: true }
  const plano = M.montarPlano({ selecionados: origem.workflows, todos: origem.workflows, opcoes, destino: { pastas: [{ id: 'PAI1', nome: 'Dev', pai: null }], porPasta: new Map(), ids: new Set() } })
  api = criarApi()
  const via = async (acao, instancia, itens) => { const x = await n8n(api, { acao, instancia, itens }); if (x.status !== 200) throw new Error(`HTTP ${x.status}: ${x.corpo && x.corpo.error}`); return x.corpo.resultados }
  const cliente = { criarPastas: (i, it) => via('criar-pastas', i, it), criarWorkflows: (i, it) => via('criar-workflows', i, it), atualizarWorkflows: (i, it) => via('atualizar-workflows', i, it) }
  const res = await M.executarImportacao({ instancia: 'automakerdev_geral', plano, selecionados: origem.workflows, opcoes, cliente, aoProgresso: () => {} })
  confere(res.criados.length === 4 && res.falhas.length === 0 && res.pastasCriadas === 3, 'cria 4 workflows e 3 pastas')
  const pPaulinho = api.pastas.find((p) => p.name === 'Paulinho'); const pMercos = api.pastas.find((p) => p.name === 'Mercos')
  confere(pMercos.parentFolderId === 'PAI1' && pPaulinho.parentFolderId === pMercos.id, 'hierarquia de pastas criada no n8n simulado')
  const wA = api.wfs.find((w) => w.name === 'A'); const wB = api.wfs.find((w) => w.name === 'B')
  confere(wA.parentFolderId === pPaulinho.id && wA.projectId === 'PROJ_OK', 'workflow A na pasta certa e no projeto da configuracao')
  confere(wA.nodes[0].parameters.workflowId.value === wB.id, 'chamada de A reescrita para o ID NOVO de B (via PUT)')
  confere(api.chamadas.filter((c) => c.startsWith('PUT')).length === 1 && res.referenciasAtualizadas === 1, 'so um workflow precisou de atualizacao')
  confere(!('active' in wA) && !('tags' in wA) && !String(wA.id).startsWith('OR_'), 'nada de active/tags/ID de origem foi para o n8n')
}

async function parte4() {
  const chama = (idAlvo, nomeAlvo, extra = {}) => ({ id: 'n' + idAlvo, name: 'Chama ' + idAlvo, type: 'n8n-nodes-base.executeWorkflow', typeVersion: 1, position: [0, 0], parameters: { workflowId: { __rl: true, value: idAlvo, mode: 'list', cachedResultName: nomeAlvo } }, ...extra })
  const http = (idCred) => ({ id: 'h', name: 'H', type: 'n8n-nodes-base.httpRequest', typeVersion: 4, position: [0, 0], parameters: {}, credentials: { n8nApi: { id: idCred, name: idCred } } })
  const opcoesBase = { destinoId: null, subpasta: '', caminhoCompleto: true, conflito: 'substituir', remapearReferencias: true }
  const pastasDest = [{ id: 'P1', nome: 'Climba', pai: null }, { id: 'P2', nome: 'Subs', pai: 'P1' }, { id: 'P3', nome: 'Outro', pai: null }, { id: 'P4', nome: 'Subs2', pai: 'P1' }]
  const destino = (lista, porPasta) => ({ pastas: pastasDest, porPasta: new Map(Object.entries(porPasta)), ids: new Set(lista.map((l) => l.id)), lista })
  const zip = montarZip([{ nome: 'Climba/Produto_Item.json', conteudo: JSON.stringify(wf('Produto_Item', { id: 'OR_PI', nodes: [chama('OR_REQ', 'SUB_Request'), http('ORIG_CRED')] })) }])
  const origem = await M.lerOrigem([new File([zip], 'c.zip')])
  const todos = origem.workflows
  const PI = { id: 'W_PI', nome: 'Produto_Item', pasta: 'P1' }
  const plano = (lista, opcoes = {}) => M.montarPlano({ selecionados: todos, todos, opcoes: { ...opcoesBase, ...opcoes }, destino: destino(lista, { P1: new Map([['produto_item', 'W_PI']]) }) })

  secao('Chamadas de fora da selecao: achar o alvo pelo nome no destino')
  let p = plano([PI, { id: 'W_REQ1', nome: 'SUB_Request', pasta: 'P2' }])
  confere(p.itens[0].acao === 'substituir' && p.itens[0].idExistente === 'W_PI', 'o Produto_Item existente sera substituido')
  confere(p.referencias.length === 1 && p.referencias[0].como === 'unica' && p.referencias[0].destinoId === 'W_REQ1' && p.referencias[0].nome === 'SUB_Request', 'um unico candidato com o nome do node: resolvido')
  confere(!p.avisos.some((a) => a.tipo.startsWith('chamada')), 'chamada resolvida nao gera aviso')
  p = plano([PI, { id: 'W_REQ1', nome: 'SUB_Request', pasta: 'P2' }, { id: 'W_REQ3', nome: 'sub_request', pasta: 'P3' }])
  confere(p.referencias[0].como === 'proxima' && p.referencias[0].destinoId === 'W_REQ1' && p.referencias[0].candidatos.length === 2, 'dois candidatos: vence a pasta mais proxima de quem chama')
  p = plano([PI, { id: 'W_REQ1', nome: 'SUB_Request', pasta: 'P2' }, { id: 'W_REQ2', nome: 'SUB_Request', pasta: 'P1' }])
  confere(p.referencias[0].como === 'mesma-pasta' && p.referencias[0].destinoId === 'W_REQ2', 'candidato na mesma pasta de quem chama vence')
  p = plano([PI, { id: 'W_REQ1', nome: 'SUB_Request', pasta: 'P2' }, { id: 'W_REQ4', nome: 'SUB_Request', pasta: 'P4' }])
  confere(p.referencias[0].como === 'ambigua' && p.referencias[0].destinoId === null && p.avisos.some((a) => a.tipo === 'chamada-ambigua'), 'empate de distancia: ambigua, com aviso')
  p = plano([PI, { id: 'W_REQ1', nome: 'SUB_Request', pasta: 'P2' }, { id: 'W_REQ4', nome: 'SUB_Request', pasta: 'P4' }], { escolhas: { OR_REQ: 'W_REQ4' } })
  confere(p.referencias[0].como === 'escolhida' && p.referencias[0].destinoId === 'W_REQ4' && !p.avisos.some((a) => a.tipo === 'chamada-ambigua'), 'a escolha da pessoa resolve o empate')
  p = plano([PI, { id: 'W_REQ1', nome: 'SUB_Request', pasta: 'P2' }, { id: 'W_REQ4', nome: 'SUB_Request', pasta: 'P4' }], { escolhas: { OR_REQ: '' } })
  confere(p.referencias[0].como === 'deixada' && p.referencias[0].destinoId === null && !p.avisos.some((a) => a.tipo.startsWith('chamada')), '"deixar como esta" nao gera aviso')
  p = plano([PI])
  confere(p.referencias[0].como === 'nao-encontrada' && p.avisos.some((a) => a.tipo === 'chamada-sem-destino' && a.exemplos[0].includes('SUB_Request')), 'sem candidato: aviso com o nome do node')
  p = plano([PI, { id: 'W_REQ1', nome: 'SUB_Request', pasta: 'P2' }], { remapearReferencias: false })
  confere(p.referencias.length === 0, 'sem ligar os workflows nao procura alvos')
  p = plano([PI, { id: 'OR_REQ', nome: 'Qualquer', pasta: 'P3' }])
  confere(p.referencias.length === 0, 'o ID de origem ja existe no destino (mesma instancia): nada a resolver')

  secao('Aviso: o ID do arquivo ja existe em OUTRA pasta do destino (copia por engano)')
  // Produto_Item do arquivo tem o ID OR_PI; no destino esse ID existe, mas dentro de "Outro" e nao de "Climba"
  const emOutra = [{ id: 'OR_PI', nome: 'Produto_Item', pasta: 'P3' }]
  const planoEmOutra = M.montarPlano({ selecionados: todos, todos, opcoes: opcoesBase, destino: destino(emOutra, {}) })
  const avisoId = planoEmOutra.avisos.find((a) => a.tipo === 'id-em-outra-pasta')
  confere(planoEmOutra.itens[0].acao === 'criar' && avisoId && avisoId.exemplos[0].includes('Outro') && /1 workflow/.test(avisoId.texto), 'copia de ID que existe em outra pasta: avisa e mostra onde ele esta: ' + (avisoId && avisoId.exemplos[0]))
  const planoMesma = M.montarPlano({ selecionados: todos, todos, opcoes: opcoesBase, destino: destino([{ id: 'OR_PI', nome: 'Produto_Item', pasta: 'P1' }], { P1: new Map([['produto_item', 'OR_PI']]) }) })
  confere(planoMesma.itens[0].acao === 'substituir' && !planoMesma.avisos.some((a) => a.tipo === 'id-em-outra-pasta'), 'mesma pasta e mesmo nome: substitui, sem aviso')
  confere(!plano([PI]).avisos.some((a) => a.tipo === 'id-em-outra-pasta'), 'ID que nao existe no destino: sem aviso')

  // servidor simulado com workflows que ja existem
  const existente = (extra = {}) => ({ id: 'W_PI', name: 'Produto_Item', active: true, nodes: [{ ...http('DEST_CRED') }, { id: 'so-dest', name: 'S', type: 'n8n-nodes-base.set', typeVersion: 1, position: [0, 0], parameters: {} }], connections: {}, settings: {}, ...extra })
  const criarSrv = ({ existentes = [existente()], falharLeitura = false, falharPublicar = null } = {}) => {
    const s = { wfs: new Map(existentes.map((x) => [x.id, JSON.parse(JSON.stringify(x))])), publicados: [], leituras: 0, motivos: [], nomesPublicacao: [] }
    s.cliente = {
      criarPastas: async () => [],
      criarWorkflows: async () => [],
      atualizarWorkflows: async (i, itens) => itens.map((x) => { s.motivos.push(x.motivo); const w = s.wfs.get(x.id); if (!w) return { chave: x.chave, erro: '404' }; Object.assign(w, JSON.parse(JSON.stringify(x.workflow))); return { chave: x.chave, id: x.id } }),
      lerExistentes: async (i, ids) => { s.leituras++; if (falharLeitura) throw new Error('sem acesso'); return new Map(ids.filter((id) => s.wfs.has(id)).map((id) => [id, JSON.parse(JSON.stringify(s.wfs.get(id)))])) },
      publicarWorkflows: async (i, itens) => itens.map((x) => { s.nomesPublicacao.push(x.nome); if (falharPublicar === x.id) return { chave: x.chave, erro: 'HTTP 400 - sub-workflow not published' }; s.publicados.push(x.id); return { chave: x.chave, id: x.id } }),
    }
    return s
  }
  const rodar = (s, lista, opcoes = {}, idsExistentes) => {
    const o = { ...opcoesBase, ...opcoes }
    const pl = M.montarPlano({ selecionados: todos, todos, opcoes: o, destino: destino(lista, { P1: new Map([['produto_item', 'W_PI']]) }) })
    return M.executarImportacao({ instancia: 'x', plano: pl, selecionados: todos, opcoes: o, cliente: s.cliente, aoProgresso: () => {}, idsExistentes })
  }
  const REQ = { id: 'W_REQ1', nome: 'SUB_Request', pasta: 'P2' }

  secao('Substituicao: credenciais do destino, chamadas e republicacao')
  let s = criarSrv({ existentes: [existente(), { id: 'W_REQ1', name: 'SUB_Request', active: true, nodes: [], connections: {}, settings: {} }] })
  let r = await rodar(s, [PI, REQ], {}, new Set(['W_PI', 'W_REQ1']))
  const gravado = s.wfs.get('W_PI')
  confere(r.substituidos.length === 1 && r.falhas.length === 0 && r.criados.length === 0, 'substituiu 1 workflow, sem criar copia')
  confere(gravado.nodes.find((n) => n.name === 'H').credentials.n8nApi.id === 'DEST_CRED' && r.credenciaisMantidas === 1, 'a credencial do DESTINO foi mantida (nao a da origem)')
  confere(gravado.nodes.find((n) => n.name === 'Chama OR_REQ').parameters.workflowId.value === 'W_REQ1', 'a chamada fixa foi trocada pelo ID do mesmo workflow no destino (achado pelo nome)')
  confere(r.referenciasAtualizadas === 1 && r.referenciasComFalha.length === 0, 'a chamada foi religada na fase 3')
  confere(JSON.stringify(s.motivos) === '["substituicao","referencias"]', 'o executor marca a substituicao e o religar das chamadas com motivos diferentes: ' + JSON.stringify(s.motivos))
  confere(s.nomesPublicacao.join() === 'Produto_Item', 'a publicacao leva o nome do workflow (para o registro)')
  confere(r.chamadasQuebradas.length === 0, 'conferencia: nenhuma chamada quebrada')
  confere(JSON.stringify(s.publicados) === '["W_PI"]' && r.publicados.length === 1, 'o que estava publicado foi publicado de novo')
  confere(todos[0].json.nodes.find((n) => n.name === 'H').credentials.n8nApi.id === 'ORIG_CRED', 'o JSON da origem em memoria nao foi alterado pela heranca de credenciais')

  s = criarSrv({ existentes: [existente()] })
  r = await rodar(s, [PI], {}, new Set(['W_PI']))
  confere(r.chamadasQuebradas.length === 1 && r.chamadasQuebradas[0].id === 'OR_REQ' && r.chamadasQuebradas[0].chamado === 'SUB_Request' && r.chamadasQuebradas[0].nome === 'Produto_Item', 'conferencia: chamada sem alvo no destino aparece como quebrada (com o nome)')
  s = criarSrv({ existentes: [existente()] })
  r = await rodar(s, [PI], {})
  confere(r.chamadasQuebradas.length === 0, 'sem a lista de IDs do destino a conferencia nao roda (evita falso alarme)')

  s = criarSrv({ existentes: [existente({ active: false }), { id: 'W_REQ1', name: 'SUB_Request', active: true, nodes: [], connections: {}, settings: {} }] })
  r = await rodar(s, [PI, REQ])
  confere(s.publicados.length === 0 && r.publicados.length === 0, 'workflow que estava inativo nao e publicado')
  s = criarSrv({ existentes: [existente(), { id: 'W_REQ1', name: 'SUB_Request', active: true, nodes: [], connections: {}, settings: {} }] })
  r = await rodar(s, [PI, REQ], { republicar: false })
  confere(s.publicados.length === 0, 'republicar desligado: nada e publicado')

  s = criarSrv({ existentes: [existente(), { id: 'W_REQ1', name: 'SUB_Request', active: true, nodes: [], connections: {}, settings: {} }], falharPublicar: 'W_PI' })
  r = await rodar(s, [PI, REQ])
  confere(r.publicacaoComFalha.length === 1 && r.publicacaoComFalha[0].erro.includes('sub-workflow') && r.publicados.length === 0, 'falha ao publicar vai para o resultado com o motivo')

  s = criarSrv({ existentes: [existente()], falharLeitura: true })
  r = await rodar(s, [PI, REQ])
  confere(r.avisos.length === 1 && /não consegui ler/i.test(r.avisos[0]) && r.substituidos.length === 1, 'falha ao ler os existentes: avisa e substitui mesmo assim')
  confere(s.wfs.get('W_PI').nodes.find((n) => n.name === 'H').credentials.n8nApi.id === 'ORIG_CRED' && s.publicados.length === 0, 'sem leitura: credencial da origem e nada publicado de novo')

  secao('Substituicao: ordem de publicacao (quem e chamado antes de quem chama)')
  const ordenar = async (selecao) => {
    const zip2 = montarZip([
      { nome: 'T/A.json', conteudo: JSON.stringify(wf('A', { id: 'OR_A', nodes: [chama('OR_B', 'B')] })) },
      { nome: 'T/B.json', conteudo: JSON.stringify(wf('B', { id: 'OR_B', nodes: [chama('OR_C', 'C')] })) },
      { nome: 'T/C.json', conteudo: JSON.stringify(wf('C', { id: 'OR_C' })) },
    ])
    const o2 = await M.lerOrigem([new File([zip2], 't.zip')])
    const sel = o2.workflows.filter((w) => selecao.includes(w.nome))
    const lista = [{ id: 'W_A', nome: 'A', pasta: 'P1' }, { id: 'W_B', nome: 'B', pasta: 'P1' }, { id: 'W_C', nome: 'C', pasta: 'P1' }]
    const dest = { pastas: pastasDest, porPasta: new Map([['P1', new Map([['a', 'W_A'], ['b', 'W_B'], ['c', 'W_C']])]]), ids: new Set(lista.map((l) => l.id)), lista }
    const srv2 = criarSrv({ existentes: lista.map((l) => ({ id: l.id, name: l.nome, active: true, nodes: [], connections: {}, settings: {} })) })
    const op = { ...opcoesBase, destinoId: null, caminhoCompleto: false, subpasta: '' }
    const pl = M.montarPlano({ selecionados: sel, todos: o2.workflows, opcoes: { ...op, destinoId: 'P1' }, destino: dest })
    const res = await M.executarImportacao({ instancia: 'x', plano: pl, selecionados: sel, opcoes: { ...op, destinoId: 'P1' }, cliente: srv2.cliente, aoProgresso: () => {}, idsExistentes: dest.ids })
    return { srv2, res }
  }
  let o = await ordenar(['A', 'B', 'C'])
  confere(o.res.substituidos.length === 3 && JSON.stringify(o.srv2.publicados) === '["W_C","W_B","W_A"]', 'cadeia A>B>C: publica C, depois B, depois A: ' + JSON.stringify(o.srv2.publicados))
  confere(o.res.chamadasQuebradas.length === 0, 'cadeia inteira substituida: nenhuma chamada quebrada')
  const ligado = o.srv2.wfs.get('W_A').nodes.find((n) => n.name === 'Chama OR_B').parameters.workflowId.value
  confere(ligado === 'W_B', 'A chama o B do destino (ID mantido): ' + ligado)
  o = await ordenar(['A', 'B'])
  const aChamaC = o.srv2.wfs.get('W_B').nodes.find((n) => n.name === 'Chama OR_C').parameters.workflowId.value
  confere(aChamaC === 'W_C' && JSON.stringify(o.srv2.publicados) === '["W_B","W_A"]', 'substituicao PARCIAL (so A e B): o B passa a chamar o C que ja existe no destino (achado pelo nome), que era o defeito do cenario 5')
}

try {
  await parte1()
  await parte2()
  await parte3()
  await parte4()
} catch (e) {
  console.error('ERRO NO TESTE:', e)
  process.exit(1)
}
console.log(`\nTOTAL: ${ok} conferencias ok, ${falhas} falha(s)`)
process.exit(falhas ? 1 : 0)
