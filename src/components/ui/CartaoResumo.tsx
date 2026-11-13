import type { ReactNode } from 'react'

/** Card de número grande das telas de resumo (Monitoramento, relatório das integrações). */
export function CartaoResumo({
  rotulo,
  valor,
  icone,
  legenda,
  destaque = false,
  tom = 'erro',
  aoClicar,
  selecionado = false,
}: {
  rotulo: string
  /** Número, ou texto quando não há leitura (ex.: "—"). */
  valor: number | string
  icone: ReactNode
  legenda?: string
  destaque?: boolean
  /** Cor do destaque: vermelho para falha, amarelo para atenção, verde para "está tudo certo". */
  tom?: 'erro' | 'atencao' | 'sucesso'
  /** Com ele, o card vira um botão (ex.: filtrar a lista pelo que o card conta). */
  aoClicar?: () => void
  /** Marca o card como o filtro em uso. */
  selecionado?: boolean
}) {
  const cores = {
    erro: { faixa: 'bg-red-500', icone: 'bg-red-50 text-red-600 ring-red-600/10', texto: 'text-red-600', ponto: 'bg-red-500' },
    atencao: {
      faixa: 'bg-amber-500',
      icone: 'bg-amber-50 text-amber-600 ring-amber-600/10',
      texto: 'text-amber-600',
      ponto: 'bg-amber-500',
    },
    sucesso: {
      faixa: 'bg-emerald-500',
      icone: 'bg-emerald-50 text-emerald-600 ring-emerald-600/10',
      texto: 'text-emerald-600',
      ponto: 'bg-emerald-500',
    },
  }[tom]
  const classe = `group relative overflow-hidden rounded-xl border border-slate-200/80 bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover ${
    aoClicar ? 'block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25' : ''
  } ${selecionado ? 'ring-2 ring-brand-500/60' : ''}`
  const conteudo = (
    <>
      {destaque && <span className={`absolute inset-x-0 top-0 h-[3px] ${cores.faixa}`} />}
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-500">{rotulo}</p>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset transition-transform duration-200 group-hover:scale-110 ${
            destaque ? cores.icone : 'bg-brand-50 text-brand-600 ring-brand-600/10'
          }`}
        >
          <span className="h-[18px] w-[18px]">{icone}</span>
        </span>
      </div>
      <p className="mt-2 text-[34px] font-semibold leading-none tracking-tight text-slate-900 tabular-nums">
        {typeof valor === 'number' ? valor.toLocaleString('pt-BR') : valor}
      </p>
      {legenda && (
        <p
          className={`mt-3 flex items-center gap-1.5 text-xs font-medium ${
            destaque ? cores.texto : 'text-slate-500'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${destaque ? cores.ponto : 'bg-slate-300'}`}
          />
          {legenda}
        </p>
      )}
    </>
  )
  return aoClicar ? (
    <button type="button" onClick={aoClicar} aria-pressed={selecionado} className={classe}>
      {conteudo}
    </button>
  ) : (
    <div className={classe}>{conteudo}</div>
  )
}
