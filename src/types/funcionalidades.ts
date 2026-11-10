/** Espelha os DTOs de /funcionalidades da API Monint (Req. Altera 474225). */

export type StatusFuncionalidade = 'IMPLEMENTADO' | 'PARCIAL' | 'NAO_IMPLEMENTADO' | 'NAO_SE_APLICA'
export type StatusTeste = 'NAO_TESTADO' | 'TESTADO' | 'COM_FALHA'
export type Prioridade = 'ALTA' | 'MEDIA' | 'BAIXA'

/**
 * Item do GET /funcionalidades: uma funcionalidade numa plataforma. Funcionalidade sem situação gravada vem
 * como NAO_IMPLEMENTADO, com os demais campos nulos.
 */
export interface SituacaoFuncionalidade {
  plataforma: string
  plataformaNome: string
  funcionalidadeId: number
  modulo: string
  nome: string
  descricao: string | null
  ordem: number
  status: StatusFuncionalidade
  teste: StatusTeste
  testadoEm: string | null
  testadoPor: string | null
  observacao: string | null
  configuracaoErp: string | null
  workflow: string | null
  responsavel: string | null
  prioridade: Prioridade | null
  /** yyyy-MM-dd */
  previsao: string | null
  requisitoAltera: string | null
  alteradoPor: string | null
  alteradoEm: string | null
}

interface Contagem {
  total: number
  implementadas: number
  parciais: number
  naoImplementadas: number
  naoSeAplica: number
  /** Implementadas ou parciais que já foram testadas. */
  testadas: number
  /** (implementadas + 0,5 x parciais) / (total - naoSeAplica), em %. Nulo quando nada se aplica. */
  percentual: number | null
}

export interface CoberturaModulo extends Contagem {
  modulo: string
}

/** Item do GET /funcionalidades/cobertura. */
export interface CoberturaPlataforma extends Contagem {
  plataforma: string
  plataformaNome: string
  modulos: CoberturaModulo[]
}

/** Resposta do POST e do PATCH /funcionalidades. */
export interface Funcionalidade {
  id: number
  modulo: string
  nome: string
  descricao: string | null
  ordem: number
  alteradoPor: string | null
  alteradoEm: string | null
}

/** Corpo do POST /funcionalidades. */
export interface DadosCriacaoFuncionalidade {
  modulo: string
  nome: string
  descricao?: string
  ordem?: number
}

/** Corpo do PATCH /funcionalidades/{id}: só o que mudou. Descrição vazia apaga a descrição. */
export interface DadosEdicaoFuncionalidade {
  modulo?: string
  nome?: string
  descricao?: string
  ordem?: number
}

/** Corpo do PUT /funcionalidades/{id}/plataformas/{plataforma}: a situação inteira. Campo nulo limpa o valor. */
export interface DadosSituacao {
  status: StatusFuncionalidade
  teste: StatusTeste
  observacao: string | null
  configuracaoErp: string | null
  workflow: string | null
  responsavel: string | null
  prioridade: Prioridade | null
  previsao: string | null
  requisitoAltera: string | null
}
