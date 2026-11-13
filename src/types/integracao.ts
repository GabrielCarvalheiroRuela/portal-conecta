/** Espelha os DTOs da API Monint. */

/** Sistema externo de uma plataforma cadastrada em CADPLA (ver PlataformaResumo). */
export type Plataforma = string

/**
 * Situação de uma integração (CADINT.INT_ATIVO_): S ativo, N inativo, D em desenvolvimento. O código só trafega
 * entre a tela e a API — quem lê a tela vê sempre o rótulo, nunca a sigla.
 */
export type SituacaoIntegracao = 'S' | 'N' | 'D'

export const ROTULO_SITUACAO: Record<SituacaoIntegracao, string> = {
  S: 'ATIVO',
  N: 'INATIVO',
  D: 'EM DESENVOLVIMENTO',
}

/** Ordem em que as situações aparecem nos seletores. */
export const SITUACOES: SituacaoIntegracao[] = ['S', 'N', 'D']

/** Item do GET /clientes. */
export interface ClienteResumo {
  codigoCliente: number
  nome: string
}

/** Corpo do POST /integracoes. */
export interface DadosCriacaoIntegracao {
  codigoIntegracao: string
  codigoCliente: number
  plataforma: Plataforma
  slug: string
  urlApi: string | null
  urlWebservice: string
  chavePrivada: string
}

/** Resposta 201. O webhookToken aparece só aqui, uma vez. */
export interface IntegracaoCriada {
  codigoIntegracao: string
  codigoCliente: number
  nomeCliente: string
  plataforma: string
  slug: string
  ativo: boolean
  webhookToken: string
  dataInclusao: string
}

/**
 * Item do GET /integracoes sem incluirCredenciais.
 * Não traz chavePrivada, apiToken, refreshToken nem webhookToken — de propósito.
 */
export interface IntegracaoResumo {
  codigoIntegracao: string
  codigoCliente: number
  nomeCliente: string
  plataforma: string
  slug: string
  ativo: boolean
  situacao: SituacaoIntegracao
  urlApi: string | null
  urlWebservice: string
  dataInclusao: string | null
  dataAlteracao: string | null
}

/** Corpo do POST /cadastro. */
export interface DadosCriacaoCliente {
  nome: string
  userName: string
  senha: string
}

/** Resposta 201 do POST /cadastro. */
export interface ClienteCriado {
  codigoCliente: number
  nome: string
  userName: string
}

/** Corpo de erro da API: LinkedHashMap com status e error. */
export interface ErroApi {
  status: number
  error: string
}

/** Item do GET /plataformas. */
export interface PlataformaResumo {
  descricao: string
  sistemaExterno: string
}

/** Corpo do POST /plataformas. */
export interface DadosCriacaoPlataforma {
  descricao: string
  sistemaExterno: string
}

/**
 * GET e PATCH /integracoes/{codigoIntegracao}/{codigoCliente} (somente ADMIN).
 * Traz a identidade da integração (só leitura) e os três campos editáveis, com a chave privada.
 * Não traz apiToken, refreshToken nem webhookToken.
 */
export interface IntegracaoEdicao {
  codigoIntegracao: string
  codigoCliente: number
  nomeCliente: string
  plataforma: string
  slug: string
  ativo: boolean
  situacao: SituacaoIntegracao
  urlWebservice: string
  urlApi: string | null
  chavePrivada: string
}

/** Corpo do PATCH /integracoes/{codigoIntegracao}/{codigoCliente}/situacao. */
export interface DadosSituacaoIntegracao {
  situacao: SituacaoIntegracao
}

/** Corpo do PATCH /integracoes/{codigoIntegracao}/{codigoCliente}/webservice (qualquer usuário interno). */
export interface DadosWebserviceIntegracao {
  urlWebservice: string
}

/** Corpo do PATCH: só o que mudou. Campo ausente preserva o valor atual. */
export interface DadosEdicaoIntegracao {
  urlWebservice?: string
  urlApi?: string
  chavePrivada?: string
}
