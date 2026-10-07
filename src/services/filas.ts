import { apiGet } from './api'
import type { ClienteFilas, RetratoFilas } from '../types/filas'

/**
 * Filas de processamento. A chamada vai ao webhook `filas-integracao` do n8n (workflow
 * Monitoramento_Filas_MultiTenant), que coleta na hora a fila de cada cliente ativo e devolve a lista.
 * Cada coleta consulta os webservices dos clientes, então é pesada: só acontece a cada 5 minutos ou
 * quando a pessoa pede (botão Sincronizar).
 *
 * O último retrato fica neste módulo, fora do componente: trocar de tela e voltar não perde o que
 * foi coletado nem dispara outra coleta antes da hora.
 */

const BASE_FILAS = '/filas-integracao'

export const INTERVALO_FILAS_MS = 300_000

/** O n8n devolve uma lista de objetos { "NOME DO CLIENTE": { Plataforma, Estoque, ... } }. */
async function carregarFilas(): Promise<RetratoFilas> {
  const resposta = await apiGet<Record<string, ClienteFilas>[]>('', BASE_FILAS)
  const clientes: Record<string, ClienteFilas> = {}
  for (const item of Array.isArray(resposta) ? resposta : []) {
    Object.assign(clientes, item)
  }
  // O n8n não informa a hora da coleta; vale a hora em que a resposta chegou.
  return { geradoEm: new Date().toISOString(), clientes }
}

export interface EstadoFilas {
  /** Última coleta bem-sucedida. Uma falha não apaga: fica o último retrato bom. */
  retrato: RetratoFilas | null
  /** A última tentativa falhou. */
  falha: boolean
  sincronizando: boolean
}

let estado: EstadoFilas = { retrato: null, falha: false, sincronizando: false }
/** Conta também tentativas que falharam, para uma falha não virar uma chamada a cada render. */
let ultimaTentativa = 0
let emAndamento: Promise<void> | null = null
const ouvintes = new Set<() => void>()

function atualizar(parcial: Partial<EstadoFilas>) {
  estado = { ...estado, ...parcial }
  ouvintes.forEach((avisar) => avisar())
}

/** Para o useSyncExternalStore. */
export function assinarFilas(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

export function lerEstadoFilas(): EstadoFilas {
  return estado
}

/** Coleta agora. Se já há uma coleta em andamento, reaproveita a mesma em vez de abrir outra. */
export function sincronizarFilas(): Promise<void> {
  if (emAndamento) {
    return emAndamento
  }
  ultimaTentativa = Date.now()
  atualizar({ sincronizando: true })
  emAndamento = carregarFilas()
    .then((retrato) => atualizar({ retrato, falha: false }))
    .catch((e: unknown) => {
      console.error('[MONITORAMENTO] Erro ao carregar filas', e)
      atualizar({ falha: true })
    })
    .finally(() => {
      emAndamento = null
      atualizar({ sincronizando: false })
    })
  return emAndamento
}

/**
 * Mantém a coleta a cada 5 minutos enquanto a tela de monitoramento está aberta. Ao abrir, só coleta
 * se a última tentativa for mais velha que o intervalo (ou se nunca houve); senão espera o que falta.
 * Uma coleta manual reinicia a contagem. Devolve a função que para o agendamento.
 */
export function iniciarSincronizacaoAutomatica(): () => void {
  let parado = false
  let timer: ReturnType<typeof setTimeout>

  function agendar() {
    const falta = Math.max(0, ultimaTentativa + INTERVALO_FILAS_MS - Date.now())
    timer = setTimeout(async () => {
      if (parado) return
      // Alguém sincronizou manualmente no meio da espera: a contagem recomeçou.
      if (Date.now() - ultimaTentativa >= INTERVALO_FILAS_MS) {
        await sincronizarFilas()
      }
      if (!parado) agendar()
    }, falta)
  }

  agendar()
  return () => {
    parado = true
    clearTimeout(timer)
  }
}
