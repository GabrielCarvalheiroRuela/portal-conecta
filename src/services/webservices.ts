import { apiGet } from './api'
import { criarColeta } from './coleta'
import type { RetratoWebservices } from '../types/webservices'

/**
 * Situação dos webservices. A chamada vai ao webhook `webservices-status` do n8n (workflow
 * Monitoramento_Webservices), que só devolve a última checagem guardada: quem bate nos webservices é um gatilho do
 * próprio workflow, a cada minuto, haja ou não alguém com o portal aberto. Por isso a leitura é leve e responde na
 * hora. A tela lê a cada minuto e no botão Atualizar, e, enquanto não há checagem para mostrar (workflow recém
 * publicado, por exemplo), tenta de novo a cada 10 segundos.
 */

const BASE_WEBSERVICES = '/webservices-status'

export const INTERVALO_WEBSERVICES_MS = 60_000
const INTERVALO_SEM_CHECAGEM_MS = 10_000

async function carregarWebservices(): Promise<RetratoWebservices> {
  const resposta = await apiGet<Partial<RetratoWebservices>>('', BASE_WEBSERVICES)
  return {
    geradoEm: resposta?.geradoEm ?? null,
    itens: Array.isArray(resposta?.itens) ? resposta.itens : [],
  }
}

export const coletaWebservices = criarColeta('webservices', (retrato) => (retrato?.geradoEm ? INTERVALO_WEBSERVICES_MS : INTERVALO_SEM_CHECAGEM_MS), carregarWebservices)
