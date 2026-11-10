import { ApiError, SessaoExpiradaError, apiGet } from './api'

/**
 * Estado do servidor MCP de funcionalidades (o que a Claude usa para consultar a matriz), lido do /status dele.
 * O caminho /mcp-status é um proxy do nginx (e do Vite, em desenvolvimento): o navegador não fala com o MCP direto,
 * que não envia cabeçalhos de CORS, e o endereço dele não aparece na tela. Não leva o token do portal.
 */
export type EstadoMcp = 'verificando' | 'ativo' | 'sem-banco' | 'fora'

export async function consultarMcp(): Promise<Exclude<EstadoMcp, 'verificando'>> {
  try {
    const resposta = await fetch('/mcp-status', { cache: 'no-store', signal: AbortSignal.timeout(5000) })
    if (!resposta.ok) {
      return 'fora'
    }
    const corpo = (await resposta.json()) as { mcp?: boolean; banco?: boolean }
    if (corpo.mcp !== true) {
      return 'fora'
    }
    return corpo.banco === true ? 'ativo' : 'sem-banco'
  } catch {
    // Sem resposta, proxy 502 ou, no dev sem o MCP, o index.html do Vite (que não é JSON): tudo isso é "fora do ar".
    return 'fora'
  }
}

/** Como conectar o MCP ao Claude Code. O comando leva o token, por isso só DEV e ADM o recebem (o MCP barra os demais). */
export interface ConexaoMcp {
  nome: string
  url: string
  comando: string
}

/** O MCP não respondeu (ou não conseguiu conferir o perfil na API). `detalhe` é o que ele disse, quando disse algo. */
export class McpForaDoArError extends Error {
  constructor(readonly detalhe?: string) {
    super(detalhe ?? 'O servidor MCP não respondeu.')
    this.name = 'McpForaDoArError'
  }
}

/**
 * Pede a URL e o token ao próprio MCP (GET /conexao, pelo proxy /mcp-conexao), mandando o JWT de quem está logado: ele
 * confere o perfil na API e só entrega a DEV e ADM. Os dois valores moram no MCP, não no portal nem na API.
 * 401/403 sobem como ApiError (sem permissão); qualquer outra falha é "fora do ar": rede, 5xx do proxy ou resposta que
 * não é JSON (o dev server devolve o index.html quando o MCP não está rodando).
 */
export async function buscarConexaoMcp(): Promise<ConexaoMcp> {
  let corpo: { nome?: string; url?: string; token?: string }
  try {
    corpo = await apiGet<{ nome?: string; url?: string; token?: string }>('', '/mcp-conexao')
  } catch (e) {
    if (e instanceof SessaoExpiradaError || (e instanceof ApiError && e.status < 500)) {
      throw e
    }
    throw new McpForaDoArError(e instanceof ApiError && e.status === 503 ? e.message : undefined)
  }

  const { nome, url, token } = corpo
  if (!nome || !url || !token) {
    throw new McpForaDoArError('O MCP respondeu, mas sem a URL ou o token.')
  }
  // O comando vai entre aspas simples, no terminal: espaço, aspas ou barra invertida o quebrariam.
  if (/[\s'"\\]/.test(url + token)) {
    throw new Error('A URL ou o token do MCP tem espaço, aspas ou barra invertida; confira as variáveis do servidor.')
  }
  return { nome, url, comando: `claude mcp add --transport http --scope user ${nome} ${url} --header 'Authorization: Bearer ${token}'` }
}
