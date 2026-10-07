/**
 * Monitoramento de filas de processamento da integração.
 *
 * O n8n (workflow Monitoramento_Filas_MultiTenant) coleta o tamanho de cada fila
 * de cada cliente ativo e a tela repete a chamada a cada 5 minutos (GET /filas).
 */

export const FILAS = [
  'Estoque',
  'Preco',
  'Produto',
  'NFe',
  'Clientes',
  'Limites',
  'Atividades',
  'ContasReceber',
  'TabalaPreco',
] as const

export type NomeFila = (typeof FILAS)[number]

/** Rótulo de tela de cada fila. As chaves vêm do n8n e mantêm a grafia dele ("TabalaPreco"). */
export const ROTULO_FILA: Record<NomeFila, string> = {
  Estoque: 'Estoque',
  Preco: 'Preço',
  Produto: 'Produto',
  NFe: 'Nota fiscal',
  Clientes: 'Clientes',
  Limites: 'Limites',
  Atividades: 'Atividades',
  ContasReceber: 'Contas receber',
  TabalaPreco: 'Tab de preço',
}

/**
 * Acima deste valor a fila fica "em atenção" (estritamente maior: 300 ainda é normal, 301 não).
 * Cada fila tem o seu, de acordo com o volume que costuma entrar para processar.
 */
export const LIMITE_ATENCAO: Record<NomeFila, number> = {
  Estoque: 300,
  Preco: 300,
  Produto: 300,
  NFe: 10,
  Clientes: 50,
  Limites: 50,
  Atividades: 50,
  ContasReceber: 50,
  TabalaPreco: 20,
}

/**
 * Valor de uma fila como o n8n devolve: o total de itens, "-" quando a consulta estourou o tempo
 * ou "erro: ..." quando falhou. Fila que não se aplica à plataforma (NFe no Shopify) não aparece.
 */
export type ValorFila = number | string | null | undefined

/** Um cliente do retrato: a plataforma e o tamanho de cada fila. */
export interface ClienteFilas {
  Plataforma: string
  [fila: string]: ValorFila
}

/** Resposta do GET /filas. */
export interface RetratoFilas {
  /** Quando o n8n terminou a última coleta (ISO 8601). */
  geradoEm: string
  clientes: Record<string, ClienteFilas>
}

export type SituacaoFila = 'ok' | 'atencao' | 'sem-dado'

/** Classifica o valor de uma fila contra o limite dela. */
export function situacaoDaFila(fila: NomeFila, valor: ValorFila): SituacaoFila {
  if (typeof valor !== 'number') {
    return 'sem-dado'
  }
  return valor > LIMITE_ATENCAO[fila] ? 'atencao' : 'ok'
}

/** Um cliente do retrato já classificado. */
export interface LinhaFilas {
  cliente: string
  plataforma: string
  dados: ClienteFilas
  /** Filas deste cliente acima do limite. */
  filasEmAtencao: NomeFila[]
}

/** Classifica todos os clientes; os que têm fila em atenção vêm primeiro, os piores no topo. */
export function classificarClientes(retrato: RetratoFilas | null): LinhaFilas[] {
  if (!retrato) {
    return []
  }
  return Object.entries(retrato.clientes)
    .map(([cliente, dados]) => ({
      cliente,
      plataforma: dados.Plataforma,
      dados,
      filasEmAtencao: FILAS.filter((fila) => situacaoDaFila(fila, dados[fila]) === 'atencao'),
    }))
    .sort(
      (a, b) =>
        b.filasEmAtencao.length - a.filasEmAtencao.length || a.cliente.localeCompare(b.cliente, 'pt-BR'),
    )
}
