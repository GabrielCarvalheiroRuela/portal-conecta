import { useEffect, useMemo, useState } from 'react'
import type { PastaN8n } from '../services/workflows'
import { IconeCasa, IconePasta, IconeSetaDireita } from './ui/Icones'

interface Props {
  pastas: PastaN8n[]
  /** Pasta escolhida; nulo é a raiz do projeto. */
  valor: string | null
  desabilitado: boolean
  aoEscolher: (id: string | null) => void
}

interface No {
  pasta: PastaN8n
  filhas: No[]
}

const porNome = (a: { nome: string }, b: { nome: string }) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base', numeric: true })

/** O caminho de pastas até a escolhida (para o texto "Dev / Mercos"). */
export function caminhoDaPastaDestino(pastas: PastaN8n[], id: string | null): string[] {
  const porId = new Map(pastas.map((p) => [p.id, p]))
  const nomes: string[] = []
  let atual = id ? porId.get(id) : undefined
  for (let i = 0; atual && i < 30; i++) {
    nomes.unshift(atual.nome)
    atual = atual.pai ? porId.get(atual.pai) : undefined
  }
  return nomes
}

/** Todas as pastas da instância (inclusive as vazias), para escolher onde a importação vai ficar. */
export function SeletorDestino({ pastas, valor, desabilitado, aoEscolher }: Props) {
  const raizes = useMemo(() => {
    const nos = new Map<string, No>(pastas.map((p) => [p.id, { pasta: p, filhas: [] }]))
    const topo: No[] = []
    for (const p of pastas) {
      const no = nos.get(p.id)!
      const pai = p.pai ? nos.get(p.pai) : undefined
      ;(pai ? pai.filhas : topo).push(no)
    }
    const ordenar = (lista: No[]) => {
      lista.sort((a, b) => porNome(a.pasta, b.pasta))
      lista.forEach((n) => ordenar(n.filhas))
    }
    ordenar(topo)
    return topo
  }, [pastas])

  const [abertos, setAbertos] = useState<Set<string>>(new Set())

  // Escolher uma pasta funda mantém o caminho até ela aberto.
  useEffect(() => {
    if (!valor) {
      return
    }
    const porId = new Map(pastas.map((p) => [p.id, p]))
    setAbertos((atual) => {
      const novo = new Set(atual)
      let pai = porId.get(valor)?.pai
      for (let i = 0; pai && i < 30; i++) {
        novo.add(pai)
        pai = porId.get(pai)?.pai ?? null
      }
      return novo
    })
  }, [valor, pastas])

  function alternar(id: string) {
    setAbertos((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) {
        novo.delete(id)
      } else {
        novo.add(id)
      }
      return novo
    })
  }

  function renderNo(no: No, nivel: number) {
    const aberto = abertos.has(no.pasta.id)
    const escolhido = valor === no.pasta.id
    return (
      <li key={no.pasta.id} role="treeitem" aria-selected={escolhido} aria-expanded={no.filhas.length ? aberto : undefined}>
        <div
          className={`flex items-center gap-1 rounded-md py-1 pr-2 ${escolhido ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}
          style={{ paddingLeft: 4 + nivel * 16 }}
        >
          {no.filhas.length > 0 ? (
            <button
              type="button"
              onClick={() => alternar(no.pasta.id)}
              aria-label={aberto ? `Recolher ${no.pasta.nome}` : `Expandir ${no.pasta.nome}`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-800"
            >
              <span className={`h-3.5 w-3.5 transition-transform duration-150 ${aberto ? 'rotate-90' : ''}`}>
                <IconeSetaDireita />
              </span>
            </button>
          ) : (
            <span className="h-5 w-5 shrink-0" aria-hidden="true" />
          )}
          <button
            type="button"
            disabled={desabilitado}
            onClick={() => aoEscolher(no.pasta.id)}
            className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[13px] disabled:cursor-not-allowed"
            title={no.pasta.nome}
          >
            <span className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true">
              <IconePasta />
            </span>
            <span className="truncate">{no.pasta.nome}</span>
          </button>
        </div>
        {aberto && no.filhas.length > 0 && <ul role="group">{no.filhas.map((f) => renderNo(f, nivel + 1))}</ul>}
      </li>
    )
  }

  return (
    <ul role="tree" aria-label="Pasta de destino" className="max-h-56 overflow-y-auto rounded-lg border border-slate-200/80 p-1">
      <li role="treeitem" aria-selected={valor === null}>
        <button
          type="button"
          disabled={desabilitado}
          onClick={() => aoEscolher(null)}
          className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] disabled:cursor-not-allowed ${
            valor === null ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <span className="h-4 w-4 shrink-0" aria-hidden="true">
            <IconeCasa />
          </span>
          <span className="font-medium">Raiz do projeto (fora de qualquer pasta)</span>
        </button>
      </li>
      {raizes.map((n) => renderNo(n, 0))}
    </ul>
  )
}
