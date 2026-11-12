import { apiGet } from './api'
import { criarColeta, type EstadoColeta } from './coleta'
import type { ClienteFilas, RetratoFilas } from '../types/filas'

/**
 * Filas de processamento. A chamada vai ao webhook `filas-integracao` do n8n (workflow
 * Monitoramento_Filas_MultiTenant), que coleta na hora a fila de cada cliente ativo e devolve a lista.
 * Cada coleta consulta os webservices dos clientes, então é pesada: só acontece a cada 5 minutos ou
 * quando a pessoa pede (botão Sincronizar).
 */

const BASE_FILAS = '/filas-integracao'

export const INTERVALO_FILAS_MS = 300_000

/** O n8n devolve uma lista de objetos { "NOME DO CLIENTE": { Plataforma, Estoque, ... } }. */
async function carregarFilas(): Promise<RetratoFilas> {
  const resposta = await apiGet<Record<string, ClienteFilas>[]>('', BASE_FILAS)
  // Uma linha por item: o mesmo nome de cliente se repete (uma integração por código), então não dá
  // para indexar por nome sem perder todos menos o último.
  const clientes = (Array.isArray(resposta) ? resposta : []).flatMap((item) =>
    Object.entries(item).map(([cliente, dados]) => ({ cliente, dados })),
  )
  // O n8n não informa a hora da coleta; vale a hora em que a resposta chegou.
  return { geradoEm: new Date().toISOString(), clientes }
}

export type EstadoFilas = EstadoColeta<RetratoFilas>

const coleta = criarColeta('filas', INTERVALO_FILAS_MS, carregarFilas)

export const assinarFilas = coleta.assinar
export const lerEstadoFilas = coleta.ler
export const sincronizarFilas = coleta.sincronizar
export const iniciarSincronizacaoAutomatica = coleta.iniciarAutomatica
