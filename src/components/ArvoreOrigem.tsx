import { useEffect, useMemo, useRef, useState } from 'react'
import { itensDoNoOrigem, type NoOrigem, type WorkflowOrigem } from '../importacao/origem'
import type { ItemPlano } from '../importacao/plano'
import { IconeArquivo, IconePasta, IconeSetaDireita } from './ui/Icones'

interface Props {
  raiz: NoOrigem
  selecionados: ReadonlySet<string>
  /** Situação de cada workflow selecionado no plano (já existe, será renomeado...). */
  situacao: ReadonlyMap<string, ItemPlano>
  /** Filtro de texto: só aparece o que tem o trecho no nome do arquivo, do workflow ou das pastas. */
  busca: string
  desabilitado: boolean
  aoAlterar: (itens: WorkflowOrigem[], marcar: boolean) => void
}

/** Até quantas pastas a árvore já abre inteira; acima disso abre só o primeiro nível. */
const ABRE_TUDO_ATE = 40

const minusculo = (s: string) => s.toLowerCase()

/** Caixa de seleção com o terceiro estado (parte dos itens marcados). */
function Caixa({ estado, rotulo, desabilitado, aoClicar }: { estado: 'nenhum' | 'parte' | 'todos'; rotulo: string; desabilitado: boolean; aoClicar: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = estado === 'parte'
    }
  }, [estado])
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={rotulo}
      checked={estado === 'todos'}
      disabled={desabilitado}
      onChange={aoClicar}
      className="h-4 w-4 shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
    />
  )
}

/**
 * A origem como árvore de pastas, como estava no arquivo. Marcar uma pasta marca tudo o que há dentro dela
 * (e desmarcar tira tudo); o estado parcial aparece quando só parte está marcada.
 */
export function ArvoreOrigem({ raiz, selecionados, situacao, busca, desabilitado, aoAlterar }: Props) {
  const totalPastas = useMemo(() => {
    const contar = (no: NoOrigem): number => no.pastas.reduce((soma, p) => soma + 1 + contar(p), 0)
    return contar(raiz)
  }, [raiz])

  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  useEffect(() => {
    const abrir = new Set<string>()
    const percorrer = (no: NoOrigem, nivel: number) => {
      for (const p of no.pastas) {
        if (totalPastas <= ABRE_TUDO_ATE || nivel === 0) {
          abrir.add(p.chave)
        }
        percorrer(p, nivel + 1)
      }
    }
    percorrer(raiz, 0)
    setAbertos(abrir)
  }, [raiz, totalPastas])

  const termo = minusculo(busca.trim())
  const casa = (w: WorkflowOrigem) =>
    !termo || minusculo(w.arquivo).includes(termo) || minusculo(w.nome).includes(termo) || minusculo(w.pasta.join('/')).includes(termo)
  const visiveisDe = (no: NoOrigem) => itensDoNoOrigem(no).filter(casa)

  function alternarAberto(chave: string) {
    setAbertos((atual) => {
      const novo = new Set(atual)
      if (novo.has(chave)) {
        novo.delete(chave)
      } else {
        novo.add(chave)
      }
      return novo
    })
  }

  const estadoDe = (itens: WorkflowOrigem[]): 'nenhum' | 'parte' | 'todos' => {
    const marcados = itens.filter((i) => selecionados.has(i.chave)).length
    return marcados === 0 ? 'nenhum' : marcados === itens.length ? 'todos' : 'parte'
  }

  function renderItem(item: WorkflowOrigem, nivel: number) {
    const marcado = selecionados.has(item.chave)
    const plano = situacao.get(item.chave)
    return (
      <li key={item.chave} className="flex items-center gap-2 py-1 pr-3 hover:bg-slate-50/80" style={{ paddingLeft: 12 + nivel * 18 + 20 }}>
        <Caixa
          estado={marcado ? 'todos' : 'nenhum'}
          rotulo={`Importar ${item.nome}`}
          desabilitado={desabilitado}
          aoClicar={() => aoAlterar([item], !marcado)}
        />
        <span className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true">
          <IconeArquivo />
        </span>
        <span className="min-w-0 flex-1 truncate" title={item.arquivo === `${item.nome}.json` ? item.nome : `${item.nome} (${item.arquivo})`}>
          {item.nome}
        </span>
        {plano?.acao === 'pular' && (
          <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[11px] font-medium text-amber-700" title={plano.motivo}>
            vai ser pulado
          </span>
        )}
        {plano?.acao === 'criar' && plano.nomeFinal !== plano.nome && (
          <span className="shrink-0 rounded bg-sky-500/15 px-1.5 py-0.5 text-[11px] font-medium text-sky-700" title={plano.motivo}>
            novo nome
          </span>
        )}
        <span className="shrink-0 text-[11px] text-slate-400">
          {item.nodes} node{item.nodes === 1 ? '' : 's'}
        </span>
      </li>
    )
  }

  function renderPasta(no: NoOrigem, nivel: number) {
    const itens = visiveisDe(no)
    if (itens.length === 0) {
      return null
    }
    const aberto = abertos.has(no.chave) || termo !== ''
    const estado = estadoDe(itens)
    const marcados = itens.filter((i) => selecionados.has(i.chave)).length
    return (
      <li key={no.chave}>
        <div className="flex items-center gap-2 py-1 pr-3 hover:bg-slate-50/80" style={{ paddingLeft: 12 + nivel * 18 }}>
          <button
            type="button"
            onClick={() => alternarAberto(no.chave)}
            aria-label={aberto ? `Recolher ${no.nome}` : `Expandir ${no.nome}`}
            aria-expanded={aberto}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-800"
          >
            <span className={`h-3.5 w-3.5 transition-transform duration-150 ${aberto ? 'rotate-90' : ''}`}>
              <IconeSetaDireita />
            </span>
          </button>
          <Caixa
            estado={estado}
            rotulo={`Importar a pasta ${no.nome} (${itens.length} workflows)`}
            desabilitado={desabilitado}
            aoClicar={() => aoAlterar(itens, estado !== 'todos')}
          />
          <span className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true">
            <IconePasta />
          </span>
          <button type="button" onClick={() => alternarAberto(no.chave)} className="min-w-0 flex-1 truncate text-left font-medium text-slate-700" title={no.chave}>
            {no.nome}
          </button>
          <span className="shrink-0 text-[11px] text-slate-400">
            {marcados > 0 ? `${marcados}/` : ''}
            {itens.length} workflow{itens.length === 1 ? '' : 's'}
          </span>
        </div>
        {aberto && (
          <ul role="group">
            {no.pastas.map((p) => renderPasta(p, nivel + 1))}
            {no.itens.filter(casa).map((i) => renderItem(i, nivel + 1))}
          </ul>
        )}
      </li>
    )
  }

  const soltos = raiz.itens.filter(casa)
  if (visiveisDe(raiz).length === 0) {
    return <p className="px-4 py-10 text-center text-sm text-slate-400">{termo ? 'Nada com esse texto.' : 'Nenhum workflow encontrado.'}</p>
  }
  return (
    <ul role="tree" className="min-h-0 flex-1 overflow-y-auto text-sm text-slate-600">
      {raiz.pastas.map((p) => renderPasta(p, 0))}
      {soltos.map((i) => renderItem(i, -1))}
    </ul>
  )
}
