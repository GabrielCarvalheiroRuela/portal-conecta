import type { Prioridade, StatusFuncionalidade, StatusTeste } from '../../types/funcionalidades'

/** Rótulos e etiquetas da matriz de funcionalidades, para a lista, os cartões e os popups falarem igual. */

export const ROTULO_STATUS: Record<StatusFuncionalidade, string> = {
  IMPLEMENTADO: 'Implementado',
  PARCIAL: 'Parcial',
  NAO_IMPLEMENTADO: 'Não implementado',
  NAO_SE_APLICA: 'Não se aplica',
}

export const ROTULO_TESTE: Record<StatusTeste, string> = {
  NAO_TESTADO: 'Não testado',
  TESTADO: 'Testado',
  COM_FALHA: 'Com falha',
}

export const ROTULO_PRIORIDADE: Record<Prioridade, string> = {
  ALTA: 'Alta',
  MEDIA: 'Média',
  BAIXA: 'Baixa',
}

export const STATUS: StatusFuncionalidade[] = ['IMPLEMENTADO', 'PARCIAL', 'NAO_IMPLEMENTADO', 'NAO_SE_APLICA']
export const TESTES: StatusTeste[] = ['NAO_TESTADO', 'TESTADO', 'COM_FALHA']
export const PRIORIDADES: Prioridade[] = ['ALTA', 'MEDIA', 'BAIXA']

const ESTILO_STATUS: Record<StatusFuncionalidade, { caixa: string; ponto: string }> = {
  IMPLEMENTADO: { caixa: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', ponto: 'bg-emerald-500' },
  PARCIAL: { caixa: 'bg-amber-50 text-amber-800 ring-amber-600/25', ponto: 'bg-amber-500' },
  NAO_IMPLEMENTADO: { caixa: 'bg-red-50 text-red-700 ring-red-600/20', ponto: 'bg-red-500' },
  NAO_SE_APLICA: { caixa: 'bg-slate-100 text-slate-600 ring-slate-500/20', ponto: 'bg-slate-400' },
}

export function EtiquetaStatus({ status }: { status: StatusFuncionalidade }) {
  const estilo = ESTILO_STATUS[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${estilo.caixa}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${estilo.ponto}`} />
      {ROTULO_STATUS[status]}
    </span>
  )
}

const ESTILO_TESTE: Record<StatusTeste, string> = {
  TESTADO: 'text-emerald-700',
  COM_FALHA: 'text-red-700',
  NAO_TESTADO: 'text-slate-500',
}

/** Teste não faz sentido onde a funcionalidade não se aplica: a tela mostra um traço. */
export function EtiquetaTeste({ teste, status }: { teste: StatusTeste; status: StatusFuncionalidade }) {
  if (status === 'NAO_SE_APLICA') {
    return <span className="text-slate-400">—</span>
  }
  return <span className={`whitespace-nowrap text-[13px] font-medium ${ESTILO_TESTE[teste]}`}>{ROTULO_TESTE[teste]}</span>
}

const ESTILO_PRIORIDADE: Record<Prioridade, string> = {
  ALTA: 'bg-red-50 text-red-700 ring-red-600/20',
  MEDIA: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  BAIXA: 'bg-slate-100 text-slate-600 ring-slate-500/20',
}

export function EtiquetaPrioridade({ prioridade }: { prioridade: Prioridade }) {
  return (
    <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ring-1 ring-inset ${ESTILO_PRIORIDADE[prioridade]}`}>
      {ROTULO_PRIORIDADE[prioridade]}
    </span>
  )
}

/** 73.4 -> "73,4%"; nulo (nada se aplica) -> "-". */
export function formatarPercentual(valor: number | null): string {
  return valor === null ? '-' : `${valor.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

/** "2026-12-15" -> "15/12/2026". A data não passa por Date: o fuso do navegador não pode mudar o dia. */
export function formatarData(iso: string | null): string {
  if (!iso) {
    return ''
  }
  const [ano, mes, dia] = iso.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}
