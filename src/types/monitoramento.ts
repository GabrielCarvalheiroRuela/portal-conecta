/** Espelha os DTOs de monitoramento da API Monint (antigo monitoramento-front). */

/** Item do GET /pendentes?status=2 — pedidos que falharam na integração. */
export interface PedidoComErro {
  codigoPedido: string
  cliente?: string | null
  erro?: string | null
  plataforma?: string | null
  rotina?: string | null
  status: number
  /** PEN_SEQPRC: começa em 0 e sobe 1 a cada vez que o pedido é reenviado ao Monint. */
  sequencialProcessamento?: number
}

/** Item do GET /pedidos?cliente= — todos os pedidos de um lojista, em qualquer status. */
export interface PedidoDoCliente {
  /** PEN_IDPED_: identifica a linha. O codigoPedido se repete entre lojistas. */
  id: string
  codigoPedido: string
  cliente: string
  /** Mensagem do último processamento. Nos finalizados costuma vir "FINALIZADO". */
  erro?: string | null
  plataforma?: string | null
  status: number
  ultimaAlteracao?: string | null
  sequencialProcessamento?: number
  idIntegracao?: string | null
  rotina?: string | null
}

/** Resposta do GET /produtos: uma página mais o total de todos os registros que atendem aos filtros. */
export interface PaginaProdutos {
  itens: ProdutoComErro[]
  /** Começa em 1. */
  pagina: number
  tamanho: number
  /** Contagem no banco, inclusive dos registros que não vieram nesta página. */
  totalItens: number
  /** 0 quando não há registros. */
  totalPaginas: number
}

/** Resposta do GET /produtos/filtros: as opções dos filtros, só do que tem produto com erro. */
export interface FiltrosProdutos {
  clientes: string[]
  plataformas: string[]
}

/** Item do GET /produtos — produtos que falharam na integração. */
export interface ProdutoComErro {
  /** Único por registro. O codigoProduto se repete entre clientes, então não serve de chave. */
  id: string
  /** A API já devolveu produto com codigoProduto, cliente e plataforma nulos (PROERR sem esses dados). */
  codigoProduto?: string | null
  dataErro: string
  cliente?: string | null
  plataforma?: string | null
  status: number
  /** É o nome que a API usa. Pode vir nulo. */
  mensagemErro?: string | null
  /** Cópia de mensagemErro, preenchida na tela para o filtro tratar pedido e produto igual. */
  erro?: string | null
  rotina?: string | null
  /** PRO_TENTAT: começa em 1 na primeira falha e sobe 1 a cada nova. */
  tentativa?: number
}
