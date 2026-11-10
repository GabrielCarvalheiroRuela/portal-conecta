import type { CoberturaPlataforma } from '../../types/funcionalidades'
import { formatarPercentual } from './Etiquetas'

const COMO_CALCULA = 'Cobertura = (implementadas + 0,5 × parciais) ÷ (total − não se aplicam). O parcial vale meia funcionalidade.'

/**
 * A cobertura da plataforma escolhida de relance: o percentual, uma barra que mostra a composição (quanto está
 * implementado, parcial, faltando e não se aplica) e os dois totais que não são de status (quantas funcionalidades existem
 * e quantas foram testadas). A contagem por status fica nas abas da lista, que também filtram.
 */
export function ResumoPlataforma({ plataforma: p }: { plataforma: CoberturaPlataforma }) {
  const partes = [
    { qtd: p.implementadas, cor: 'bg-emerald-500', rotulo: 'implementadas' },
    { qtd: p.parciais, cor: 'bg-amber-400', rotulo: 'parciais' },
    { qtd: p.naoImplementadas, cor: 'bg-red-300', rotulo: 'faltam' },
    { qtd: p.naoSeAplica, cor: 'bg-slate-300', rotulo: 'não se aplicam' },
  ]
  const descricao = partes.map((x) => `${x.qtd} ${x.rotulo}`).join(', ')

  return (
    <section
      aria-label={`Cobertura de ${p.plataformaNome}`}
      className="flex flex-wrap items-center gap-x-8 gap-y-4 rounded-xl border border-slate-200/80 bg-surface px-5 py-4 shadow-card"
    >
      <div title={COMO_CALCULA} className="cursor-help">
        <p className="text-3xl font-semibold tabular-nums leading-none tracking-tight text-slate-900">{formatarPercentual(p.percentual)}</p>
        <p className="mt-1.5 text-[12px] font-medium uppercase tracking-[0.06em] text-slate-500">de cobertura</p>
      </div>

      <div className="min-w-[14rem] flex-1">
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[12px] text-slate-500">
          <span>Como estão as {p.total} funcionalidades</span>
          <span className="hidden gap-3 sm:flex">
            {partes
              .filter((x) => x.qtd > 0)
              .map((x) => (
                <span key={x.rotulo} className="inline-flex items-center gap-1.5">
                  <span className={`h-2 w-2 rounded-full ${x.cor}`} />
                  {x.rotulo}
                </span>
              ))}
          </span>
        </div>
        <div role="img" aria-label={descricao} className="flex h-2.5 overflow-hidden rounded-full bg-slate-100">
          {p.total > 0 &&
            partes
              .filter((x) => x.qtd > 0)
              .map((x) => (
                <div
                  key={x.rotulo}
                  title={`${x.qtd} ${x.rotulo}`}
                  className={`${x.cor} transition-[width] duration-300`}
                  style={{ width: `${(x.qtd / p.total) * 100}%` }}
                />
              ))}
        </div>
      </div>

      <dl className="flex gap-6 text-[13px]">
        <Numero rotulo={p.total === 1 ? 'funcionalidade' : 'funcionalidades'} valor={p.total} />
        <Numero rotulo="testadas" valor={p.testadas} sufixo={`de ${p.implementadas + p.parciais}`} />
      </dl>
    </section>
  )
}

function Numero({ rotulo, valor, sufixo }: { rotulo: string; valor: number; sufixo?: string }) {
  return (
    <div>
      <dd className="text-lg font-semibold tabular-nums leading-tight text-slate-900">
        {valor}
        {sufixo && <span className="ml-1 text-[13px] font-normal text-slate-500">{sufixo}</span>}
      </dd>
      <dt className="text-slate-500">{rotulo}</dt>
    </div>
  )
}
