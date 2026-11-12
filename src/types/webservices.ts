/**
 * Disponibilidade do webservice do ERP de cada integração ativa.
 *
 * O n8n (workflow Monitoramento_Webservices) faz, a cada minuto e por conta própria, um GET em
 * {urlWebservice}/V2/config de cada integração ativa e guarda o resultado. A tela só lê o que ficou guardado
 * (GET /webservices-status), a cada minuto enquanto o Monitoramento está aberto e no botão Atualizar.
 */

/**
 * "fora": conexão recusada, DNS ou HTTP 5xx na hora, ou timeout em 5 checagens seguidas (webservice lento estoura o
 * tempo sem estar fora do ar). Qualquer outra resposta (até 401/403) é "online".
 */
export type SituacaoWebservice = 'online' | 'fora'

/** Um webservice do retrato, como o n8n devolve. */
export interface ItemWebservice {
  /** codigoIntegracao|codigoCliente: identifica a linha (o nome do cliente se repete). */
  chave: string
  codigoIntegracao: string
  codigoCliente: number
  cliente: string
  plataforma: string
  urlWebservice?: string | null
  situacao: SituacaoWebservice
  /** Status HTTP da resposta; nulo quando o webservice nem respondeu. */
  http?: number | null
  /** Motivo, só quando está fora do ar. */
  erro?: string | null
  /** Desde quando está fora (ISO 8601), contado da primeira checagem que falhou em sequência. */
  foraDesde?: string | null
}

/** Resposta do GET /webservices-status. */
export interface RetratoWebservices {
  /** Quando o n8n terminou a última checagem (ISO 8601); nulo se ele ainda não checou nenhuma vez. */
  geradoEm: string | null
  itens: ItemWebservice[]
}

/** Depois disso sem checagem nova, o fluxo do n8n provavelmente parou (ele checa a cada minuto). */
export const LIMITE_RETRATO_VELHO_MS = 180_000

export function retratoEstaVelho(retrato: RetratoWebservices | null, agora = Date.now()): boolean {
  if (!retrato?.geradoEm) {
    return false
  }
  return agora - new Date(retrato.geradoEm).getTime() > LIMITE_RETRATO_VELHO_MS
}

/** Os fora do ar vêm primeiro, o que caiu há mais tempo no topo; depois os online, por cliente. */
export function ordenarWebservices(itens: ItemWebservice[]): ItemWebservice[] {
  return [...itens].sort(
    (a, b) =>
      Number(b.situacao === 'fora') - Number(a.situacao === 'fora') ||
      (a.foraDesde ?? '').localeCompare(b.foraDesde ?? '') ||
      a.cliente.localeCompare(b.cliente, 'pt-BR') ||
      a.codigoIntegracao.localeCompare(b.codigoIntegracao),
  )
}

/** "há 12 min", "há 3 h 05 min", "há 2 d 4 h". */
export function tempoDesde(iso: string, agora = Date.now()): string {
  const minutos = Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60_000))
  if (minutos < 1) {
    return 'agora há pouco'
  }
  if (minutos < 60) {
    return `há ${minutos} min`
  }
  const horas = Math.floor(minutos / 60)
  if (horas < 24) {
    return `há ${horas} h ${String(minutos % 60).padStart(2, '0')} min`
  }
  return `há ${Math.floor(horas / 24)} d ${horas % 24} h`
}
