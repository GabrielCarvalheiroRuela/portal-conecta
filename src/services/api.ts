import type { ErroApi } from '../types/integracao'

/**
 * Cliente da API Monint.
 *
 * A autenticação é sempre pelo Google: o ID Token devolvido pelo Google Sign-In é trocado, no
 * POST /Autenticar/google, pelo JWT do Monint. Nenhuma senha passa por aqui.
 *
 * O JWT fica em sessionStorage — sobrevive a um F5 e morre junto com a aba. Quando ele expira (a
 * API emite com 2h), a sessão cai e a tela volta ao login; clicar no botão do Google resolve sem
 * digitar nada, porque a sessão da pessoa no Google continua ativa.
 *
 * O POST /Autenticar por usuário e senha continua existindo na API para o n8n, mas esta tela não
 * o usa.
 */

const BASE = '/api'
const CHAVE_TOKEN = 'conecta.token'

/** Margem para não usar um token que expira no meio do voo. */
const FOLGA_EXPIRACAO_MS = 60_000

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export class SessaoExpiradaError extends ApiError {
  constructor() {
    super(401, 'Sua sessão expirou. Entre novamente.')
    this.name = 'SessaoExpiradaError'
  }
}

let token: string | null = sessionStorage.getItem(CHAVE_TOKEN)
let aoExpirar: (() => void) | null = null

/** O App registra aqui para voltar à tela de login quando a sessão cair. */
export function registrarExpiracao(callback: (() => void) | null) {
  aoExpirar = callback
}

/** Lê um claim do payload sem validar a assinatura — quem valida é o servidor. */
function claim<T>(nome: string): T | null {
  if (!token) {
    return null
  }
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload))[nome] ?? null
  } catch {
    return null
  }
}

function tokenAindaVale(): boolean {
  const exp = claim<number>('exp')
  return exp !== null && Date.now() < exp * 1000 - FOLGA_EXPIRACAO_MS
}

export function temSessao(): boolean {
  return tokenAindaVale()
}

/** Quem está logado, lido do subject do próprio token (o e-mail do Workspace). */
export function usuarioDaSessao(): string | null {
  return claim<string>('sub')
}

/**
 * Se o usuário interno é admin, lido do claim "perfil" do token (ADMIN ou USUARIO).
 *
 * Serve só para a tela decidir o que exibir: a API confere o perfil no banco a cada chamada e
 * responde 403 a quem não pode, então esconder a aba não protege nada sozinho. O token reflete o
 * perfil do momento do login; quem foi promovido precisa entrar de novo para ver as abas. Token sem
 * o claim (lojista ou emitido antes dele existir) conta como não-admin.
 *
 * No `npm run dev`, VITE_PERFIL_DEV=ADMIN força o resultado para dar para mexer nas telas.
 */
export function ehAdmin(): boolean {
  const forcadoNoDev = import.meta.env.DEV ? import.meta.env.VITE_PERFIL_DEV : undefined
  const perfil = forcadoNoDev || claim<string>('perfil')
  return perfil?.trim().toUpperCase() === 'ADMIN'
}

export function sair() {
  token = null
  sessionStorage.removeItem(CHAVE_TOKEN)
}

async function mensagemDeErro(resposta: Response): Promise<string> {
  try {
    const corpo = (await resposta.json()) as Partial<ErroApi>
    if (corpo?.error) {
      return corpo.error
    }
  } catch {
    // Resposta sem corpo JSON — cai na mensagem genérica abaixo.
  }
  return `A API respondeu ${resposta.status}.`
}

/** Troca o ID Token do Google pelo JWT do Monint. */
export async function entrarComGoogle(idToken: string): Promise<void> {
  const resposta = await fetch(`${BASE}/Autenticar/google`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  })

  if (!resposta.ok) {
    throw new ApiError(resposta.status, await mensagemDeErro(resposta))
  }

  const corpo = (await resposta.json()) as { token: string }
  token = corpo.token
  sessionStorage.setItem(CHAVE_TOKEN, corpo.token)
}

/**
 * Só para desenvolvimento: entra pelo POST /Autenticar com o usuário do .env, para testar a tela
 * quando o login Google não está disponível. Fora do `npm run dev` a função nem existe no bundle.
 */
export async function entrarComSenhaDev(): Promise<void> {
  if (!import.meta.env.DEV) {
    throw new Error('Login por senha só existe em desenvolvimento.')
  }

  const resposta = await fetch(`${BASE}/Autenticar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userName: import.meta.env.VITE_MONINT_USER,
      senha: import.meta.env.VITE_MONINT_PASS,
    }),
  })

  if (!resposta.ok) {
    throw new ApiError(resposta.status, await mensagemDeErro(resposta))
  }

  const corpo = (await resposta.json()) as { token: string }
  token = corpo.token
  sessionStorage.setItem(CHAVE_TOKEN, corpo.token)
}

function derrubarSessao(): never {
  sair()
  aoExpirar?.()
  throw new SessaoExpiradaError()
}

/** Faz a chamada autenticada e devolve a resposta já validada (2xx); erros viram ApiError. */
async function enviar(caminho: string, init: RequestInit, base: string): Promise<Response> {
  if (!tokenAindaVale()) {
    derrubarSessao()
  }

  const resposta = await fetch(`${base}${caminho}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${token}`,
    },
  })

  // Sem credencial guardada não há como renovar sozinho: o servidor pode ter reiniciado com outro
  // segredo, ou o relógio local estar adiantado. Em qualquer caso, é relogar.
  if (resposta.status === 401) {
    derrubarSessao()
  }

  if (!resposta.ok) {
    throw new ApiError(resposta.status, await mensagemDeErro(resposta))
  }

  return resposta
}

async function requisitar<T>(caminho: string, init: RequestInit, base = BASE): Promise<T> {
  const resposta = await enviar(caminho, init, base)

  if (resposta.status === 204) {
    return undefined as T
  }

  return (await resposta.json()) as T
}

/** `base` troca o prefixo do proxy (padrão `/api`, a API do Monint); o JWT segue no mesmo header. */
export function apiGet<T>(caminho: string, base?: string): Promise<T> {
  return requisitar<T>(caminho, { method: 'GET' }, base)
}

/** Baixa um arquivo (ex.: ZIP). O nome vem do Content-Disposition, quando o servidor informa. */
export async function apiBaixar(caminho: string, base?: string): Promise<{ blob: Blob; nomeArquivo: string | null }> {
  const resposta = await enviar(caminho, { method: 'GET' }, base ?? BASE)
  const disposicao = resposta.headers.get('Content-Disposition') ?? ''
  const nome = /filename="?([^";]+)"?/i.exec(disposicao)?.[1] ?? null
  return { blob: await resposta.blob(), nomeArquivo: nome }
}

export function apiPost<T>(caminho: string, corpo: unknown): Promise<T> {
  return requisitar<T>(caminho, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  })
}
