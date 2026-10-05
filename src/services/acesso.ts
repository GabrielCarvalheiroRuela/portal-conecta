import { apiGet } from './api'

/**
 * Controle de acesso por recurso.
 *
 * O n8n (workflow Portal_Acesso) confere o JWT do Monint e devolve os recursos que o e-mail da
 * sessão pode usar, a partir da tabela `portal_acessos`. Esconder a aba é só conforto da tela: quem
 * barra de verdade é o servidor — o próprio n8n nos endpoints dele e o nginx nas rotas da API que
 * ganharem `auth_request`.
 */

/** Recursos que dependem de permissão. Os demais (monitoramento, integrações...) são livres. */
export type Recurso = 'workflows'

const BASE_ACESSO = '/acesso'

/**
 * Só no `npm run dev`: VITE_RECURSOS_DEV=workflows mostra a aba mesmo sem estar na tabela, para dar
 * para mexer na tela. Não libera nada de verdade — os dados continuam sendo checados no n8n — e
 * no build de produção esta lista é sempre vazia.
 */
const LIBERADOS_NO_DEV: string[] = import.meta.env.DEV
  ? (import.meta.env.VITE_RECURSOS_DEV ?? '')
      .split(',')
      .map((recurso) => recurso.trim())
      .filter(Boolean)
  : []

export async function carregarRecursos(): Promise<string[]> {
  let doServidor: string[] = []
  try {
    const resposta = await apiGet<{ recursos?: string[] }>('', BASE_ACESSO)
    doServidor = resposta.recursos ?? []
  } catch {
    // Sem resposta do n8n ninguém ganha acesso extra: as abas restritas só não aparecem.
  }
  return Array.from(new Set([...doServidor, ...LIBERADOS_NO_DEV]))
}
