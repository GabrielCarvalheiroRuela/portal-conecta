import type { CoberturaPlataforma, StatusFuncionalidade } from '../../types/funcionalidades'

interface Props {
  plataforma: CoberturaPlataforma
  /** Vazio = todas. */
  valor: StatusFuncionalidade | ''
  aoEscolher: (status: StatusFuncionalidade | '') => void
}

/**
 * Abas com a contagem por status da plataforma. Clicar numa filtra a lista; "Todas" tira o filtro. É o lugar único
 * dessas contagens: o resumo de cima mostra só a cobertura e os totais.
 */
export function AbasStatus({ plataforma: p, valor, aoEscolher }: Props) {
  const abas: { id: StatusFuncionalidade | ''; rotulo: string; qtd: number; ponto: string }[] = [
    { id: '', rotulo: 'Todas', qtd: p.total, ponto: 'bg-slate-400' },
    { id: 'IMPLEMENTADO', rotulo: 'Implementadas', qtd: p.implementadas, ponto: 'bg-emerald-500' },
    { id: 'PARCIAL', rotulo: 'Parciais', qtd: p.parciais, ponto: 'bg-amber-400' },
    { id: 'NAO_IMPLEMENTADO', rotulo: 'Faltam', qtd: p.naoImplementadas, ponto: 'bg-red-400' },
    { id: 'NAO_SE_APLICA', rotulo: 'Não se aplicam', qtd: p.naoSeAplica, ponto: 'bg-slate-300' },
  ]

  return (
    <div role="tablist" aria-label="Filtrar por status" className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {abas.map((a) => {
        const ativa = valor === a.id
        return (
          <button
            key={a.id || 'todas'}
            type="button"
            role="tab"
            aria-selected={ativa}
            onClick={() => aoEscolher(a.id)}
            className={`inline-flex shrink-0 items-center gap-2 border-b-2 px-3 pb-3 pt-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 ${
              ativa ? 'border-brand-500 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${a.ponto}`} />
            {a.rotulo}
            <span
              className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                ativa ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {a.qtd}
            </span>
          </button>
        )
      })}
    </div>
  )
}
