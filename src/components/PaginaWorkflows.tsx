import { useState } from 'react'
import { ExportarWorkflows } from './ExportarWorkflows'
import { ImportarWorkflows } from './ImportarWorkflows'

type Modo = 'exportar' | 'importar'

const MODOS: { id: Modo; rotulo: string }[] = [
  { id: 'exportar', rotulo: 'Exportar' },
  { id: 'importar', rotulo: 'Importar' },
]

/**
 * A aba Workflows: exportar (baixar ZIPs das instâncias) e, para quem tem o recurso, importar (levar workflows
 * de um ZIP, JSONs ou pasta para uma instância, mantendo as pastas). Quem não pode importar vê só a exportação.
 */
export function PaginaWorkflows({ podeImportar }: { podeImportar: boolean }) {
  const [modo, setModo] = useState<Modo>('exportar')

  if (!podeImportar) {
    return <ExportarWorkflows />
  }

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100/80 p-0.5" role="tablist" aria-label="Exportar ou importar workflows">
        {MODOS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={modo === m.id}
            onClick={() => setModo(m.id)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              modo === m.id ? 'bg-surface text-slate-900 shadow-soft' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {m.rotulo}
          </button>
        ))}
      </div>
      {modo === 'exportar' ? <ExportarWorkflows /> : <ImportarWorkflows />}
    </div>
  )
}
