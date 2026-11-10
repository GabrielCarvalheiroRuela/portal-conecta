import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import type { CoberturaPlataforma } from '../../types/funcionalidades'
import { IconeLupa } from '../ui/Icones'
import { EtiquetaPlataforma } from '../ui/Tabela'
import { formatarPercentual } from './Etiquetas'

interface Props {
  plataformas: CoberturaPlataforma[]
  selecionada: string | null
  aoSelecionar: (plataforma: string) => void
}

/** Sem acento e em minúsculas, para "cil" achar "Cília". */
const simplificar = (texto: string) => texto.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

/**
 * Escolhe a plataforma que a lista mostra. É uma caixa com busca em vez de um cartão por plataforma: ocupa uma linha
 * com 5 ou com 50 plataformas. Setas navegam, Enter escolhe, Esc fecha.
 */
export function EscolherPlataforma({ plataformas, selecionada, aoSelecionar }: Props) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [ativo, setAtivo] = useState(0)
  const raiz = useRef<HTMLDivElement>(null)

  const atual = plataformas.find((p) => p.plataforma === selecionada)
  const filtradas = useMemo(() => {
    const termo = simplificar(busca.trim())
    return termo
      ? plataformas.filter((p) => simplificar(p.plataformaNome).includes(termo) || simplificar(p.plataforma).includes(termo))
      : plataformas
  }, [plataformas, busca])

  // Clicar fora fecha.
  useEffect(() => {
    if (!aberto) return
    function aoClicar(e: MouseEvent) {
      if (raiz.current && !raiz.current.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', aoClicar)
    return () => document.removeEventListener('mousedown', aoClicar)
  }, [aberto])

  function abrir() {
    setBusca('')
    setAtivo(Math.max(0, plataformas.findIndex((p) => p.plataforma === selecionada)))
    setAberto(true)
  }

  function escolher(id: string) {
    aoSelecionar(id)
    setAberto(false)
  }

  function aoTeclar(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.stopPropagation()
      setAberto(false)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      setAtivo((i) => Math.min(i + 1, filtradas.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setAtivo((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtradas[ativo]) escolher(filtradas[ativo].plataforma)
    }
  }

  return (
    <div ref={raiz} className="relative w-full sm:w-72" onKeyDown={aberto ? aoTeclar : undefined}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => (aberto ? setAberto(false) : abrir())}
        className="flex h-10 w-full items-center justify-between gap-3 rounded-lg border border-slate-200 bg-surface px-3 text-left shadow-soft transition duration-150 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25"
      >
        <span className="flex min-w-0 items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Plataforma</span>
          {atual ? <EtiquetaPlataforma nome={atual.plataformaNome} /> : <span className="text-sm text-slate-400">Escolher…</span>}
        </span>
        <span className="text-slate-400" aria-hidden="true">
          ▾
        </span>
      </button>

      {aberto && (
        <div className="absolute left-0 z-30 mt-1.5 w-full min-w-[18rem] overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-card-hover animate-fade-in">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
                <span className="h-4 w-4">
                  <IconeLupa />
                </span>
              </span>
              <input
                autoFocus
                type="text"
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value)
                  setAtivo(0)
                }}
                placeholder="Buscar plataforma…"
                aria-label="Buscar plataforma"
                className="block h-9 w-full rounded-lg border-slate-200 bg-surface pl-9 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
              />
            </div>
          </div>
          <ul role="listbox" aria-label="Plataformas" className="max-h-72 overflow-y-auto py-1">
            {filtradas.length === 0 ? (
              <li className="px-4 py-6 text-center text-[13px] text-slate-500">Nenhuma plataforma encontrada.</li>
            ) : (
              filtradas.map((p, i) => (
                <li
                  key={p.plataforma}
                  role="option"
                  aria-selected={p.plataforma === selecionada}
                  onMouseEnter={() => setAtivo(i)}
                  onClick={() => escolher(p.plataforma)}
                  className={`flex cursor-pointer items-center justify-between gap-3 px-3 py-2 ${i === ativo ? 'bg-slate-50' : ''} ${
                    p.plataforma === selecionada ? 'shadow-[inset_3px_0_0_0_theme(colors.brand.500)]' : ''
                  }`}
                >
                  <EtiquetaPlataforma nome={p.plataformaNome} />
                  <span className="text-[13px] font-medium tabular-nums text-slate-600">{formatarPercentual(p.percentual)}</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
