import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ApiError, apiGet } from '../services/api'
import type { IntegracaoResumo } from '../types/integracao'
import { Alerta } from './ui/Alerta'
import { CartaoResumo } from './ui/CartaoResumo'
import { IconeCheckCirculo, IconeLink, IconeMenos, IconeRaio, IconeSetaDireita } from './ui/Icones'
import { EtiquetaPlataforma } from './ui/Tabela'

/** Espaço entre os itens da faixa (gap-2). */
const ESPACO_FAIXA = 8

const percentual = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0)

function calcular(integracoes: IntegracaoResumo[]) {
  const porSituacao = { S: 0, N: 0, D: 0 }
  const todasPlataformas = new Set<string>()
  const ativasPorPlataforma = new Map<string, number>()
  const lojistas = new Set<number>()

  for (const i of integracoes) {
    porSituacao[i.situacao] += 1
    const plataforma = i.plataforma ?? ''
    todasPlataformas.add(plataforma)
    if (i.situacao === 'S') {
      ativasPorPlataforma.set(plataforma, (ativasPorPlataforma.get(plataforma) ?? 0) + 1)
    }
    lojistas.add(i.codigoCliente)
  }

  return {
    porSituacao,
    total: integracoes.length,
    totalPlataformas: todasPlataformas.size,
    plataformas: [...ativasPorPlataforma.entries()]
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR')),
    lojistas: lojistas.size,
  }
}

type PlataformaAtiva = { nome: string; quantidade: number }

const CLASSE_CHIP = 'inline-flex items-center gap-2 rounded-lg px-2 py-1 transition-colors duration-150'

function ConteudoChip({ p }: { p: PlataformaAtiva }) {
  return (
    <>
      <EtiquetaPlataforma nome={p.nome} />
      <strong className="text-sm font-semibold tabular-nums text-slate-900">{p.quantidade}</strong>
    </>
  )
}

function ChipPlataforma({
  p,
  selecionado,
  aoClicar,
  cheio = false,
}: {
  p: PlataformaAtiva
  selecionado: boolean
  aoClicar: () => void
  /** Ocupa a linha toda (dentro do popover), com a quantidade à direita. */
  cheio?: boolean
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={selecionado}
      title={`${p.quantidade} ${p.quantidade === 1 ? 'ativa' : 'ativas'} · clique para filtrar a lista`}
      className={`${CLASSE_CHIP} focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 ${
        cheio ? 'w-full justify-between' : ''
      } ${selecionado ? 'bg-brand-50 ring-2 ring-brand-500/60' : 'hover:bg-slate-100'}`}
    >
      <ConteudoChip p={p} />
    </button>
  )
}

const CLASSE_MAIS = 'inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[13px] font-medium'

/**
 * Faixa de uma linha com as integrações ativas por plataforma. Mostra quantas couberem na largura da tela; as que
 * não couberem vão para o "+N", que abre um popover sem empurrar a lista. Clicar numa plataforma filtra a lista por
 * ela (só as ativas, como o número).
 *
 * Para saber quantas cabem, uma cópia invisível de todos os chips (e do "+N") é medida a cada mudança de largura.
 */
function FaixaPlataformas({
  plataformas,
  selecionada,
  aoFiltrar,
}: {
  plataformas: PlataformaAtiva[]
  selecionada: string | null
  aoFiltrar: (nome: string) => void
}) {
  const [aberto, setAberto] = useState(false)
  const [cabem, setCabem] = useState(plataformas.length)
  const faixa = useRef<HTMLDivElement>(null)
  const rotulo = useRef<HTMLSpanElement>(null)
  const medidas = useRef<HTMLDivElement>(null)
  const caixa = useRef<HTMLDivElement>(null)
  const visiveis = plataformas.slice(0, cabem)
  const demais = plataformas.slice(cabem)

  useLayoutEffect(() => {
    const calcular = () => {
      if (!faixa.current || !rotulo.current || !medidas.current) {
        return
      }
      const itens = Array.from(medidas.current.children) as HTMLElement[]
      const larguraMais = itens[itens.length - 1].offsetWidth
      const larguras = itens.slice(0, -1).map((el) => el.offsetWidth)
      // Largura útil: a faixa menos o padding horizontal (px-4) e o rótulo com a sua margem (mr-1).
      const livre = faixa.current.clientWidth - 32 - rotulo.current.offsetWidth - 4
      const total = larguras.reduce((soma, w) => soma + ESPACO_FAIXA + w, 0)
      let n = larguras.length
      if (total > livre) {
        // Não cabem todas: sobra espaço para o "+N" depois dos chips que ficarem.
        n = 0
        let usado = ESPACO_FAIXA + larguraMais
        while (n < larguras.length && usado + ESPACO_FAIXA + larguras[n] <= livre) {
          usado += ESPACO_FAIXA + larguras[n]
          n += 1
        }
      }
      setCabem(n)
    }
    calcular()
    const observador = new ResizeObserver(calcular)
    if (faixa.current) observador.observe(faixa.current)
    if (medidas.current) observador.observe(medidas.current)
    return () => observador.disconnect()
  }, [plataformas])

  useEffect(() => {
    if (!aberto) {
      return
    }
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) {
        setAberto(false)
      }
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false)
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', fora)
      document.removeEventListener('keydown', esc)
    }
  }, [aberto])

  // Sem o que esconder, o popover não existe mais (a tela ficou larga): fecha.
  useEffect(() => {
    if (demais.length === 0) {
      setAberto(false)
    }
  }, [demais.length])

  return (
    <div
      ref={faixa}
      className="relative flex items-center gap-2 rounded-xl border border-slate-200/80 bg-surface px-4 py-2.5 shadow-card"
    >
      <span ref={rotulo} className="mr-1 shrink-0 whitespace-nowrap text-[13px] font-medium text-slate-500">
        Ativas por plataforma
      </span>
      {plataformas.length === 0 && <span className="text-[13px] text-slate-400">Nenhuma integração ativa.</span>}
      {visiveis.map((p) => (
        <ChipPlataforma key={p.nome} p={p} selecionado={selecionada === p.nome} aoClicar={() => aoFiltrar(p.nome)} />
      ))}
      {demais.length > 0 && (
        <div ref={caixa} className="relative">
          <button
            type="button"
            onClick={() => setAberto((a) => !a)}
            aria-expanded={aberto}
            aria-haspopup="true"
            className={`${CLASSE_MAIS} transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 ${
              aberto || demais.some((p) => p.nome === selecionada)
                ? 'bg-brand-50 text-brand-700'
                : 'text-brand-700 hover:bg-slate-100'
            }`}
          >
            +{demais.length}
            <span className={`h-3.5 w-3.5 transition-transform duration-200 ${aberto ? '-rotate-90' : 'rotate-90'}`}>
              <IconeSetaDireita />
            </span>
          </button>
          {aberto && (
            <div className="absolute right-0 top-full z-30 mt-2 max-h-72 w-60 animate-fade-in overflow-y-auto rounded-xl border border-slate-200/80 bg-surface p-1.5 shadow-card-hover">
              {demais.map((p) => (
                <ChipPlataforma
                  key={p.nome}
                  p={p}
                  cheio
                  selecionado={selecionada === p.nome}
                  aoClicar={() => {
                    aoFiltrar(p.nome)
                    setAberto(false)
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cópia invisível para medir; o último item é o "+N" com o maior número possível de dígitos. */}
      <div
        ref={medidas}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 flex h-0 w-max gap-2 overflow-hidden whitespace-nowrap"
      >
        {plataformas.map((p) => (
          <span key={p.nome} className={CLASSE_CHIP}>
            <ConteudoChip p={p} />
          </span>
        ))}
        <span className={CLASSE_MAIS}>
          +{plataformas.length}
          <span className="h-3.5 w-3.5" />
        </span>
      </div>
    </div>
  )
}

/**
 * Relatório das integrações cadastradas: quantas há em cada situação, as ativas por plataforma. Conta sempre
 * todas as integrações (não segue os filtros da lista abaixo) e recarrega quando `versao` muda.
 */
export function RelatorioIntegracoes({
  versao = 0,
  situacao,
  aoFiltrarSituacao,
  plataforma,
  aoFiltrarPlataforma,
}: {
  versao?: number
  /** Situação filtrada na lista ('' = todas); o card dela aparece marcado. */
  situacao: string
  /** Clique num card: filtra a lista por aquela situação ('' mostra todas). Clicar de novo no card marcado limpa. */
  aoFiltrarSituacao: (situacao: string) => void
  /** Plataforma filtrada na lista ('' = todas). */
  plataforma: string
  /** Clique numa plataforma da faixa: filtra a lista por ela (ativas). Clicar de novo limpa. */
  aoFiltrarPlataforma: (nome: string) => void
}) {
  const [integracoes, setIntegracoes] = useState<IntegracaoResumo[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let ativo = true
    apiGet<IntegracaoResumo[]>('/integracoes')
      .then((lista) => {
        if (ativo) {
          setIntegracoes(lista)
          setErro(null)
        }
      })
      .catch((e: unknown) => {
        if (ativo) {
          setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar o relatório.')
        }
      })
    return () => {
      ativo = false
    }
  }, [versao])

  const dados = useMemo(() => (integracoes ? calcular(integracoes) : null), [integracoes])

  if (erro && !dados) {
    return (
      <Alerta tom="erro" titulo="Não foi possível carregar o relatório">
        {erro}
      </Alerta>
    )
  }
  if (!dados) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-busy="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="h-[136px] animate-pulse rounded-xl border border-slate-200/80 bg-slate-100/60" />
        ))}
      </div>
    )
  }

  const { porSituacao, plataformas, total: todas } = dados
  return (
    <div className="mb-6 space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CartaoResumo
          rotulo="Total de integrações"
          valor={todas}
          legenda={`${dados.totalPlataformas} ${dados.totalPlataformas === 1 ? 'plataforma' : 'plataformas'} · ${dados.lojistas} ${dados.lojistas === 1 ? 'lojista' : 'lojistas'}`}
          icone={<IconeLink />}
          aoClicar={() => aoFiltrarSituacao('')}
        />
        <CartaoResumo
          rotulo="Ativas"
          valor={porSituacao.S}
          destaque={porSituacao.S > 0}
          tom="sucesso"
          legenda={`${percentual(porSituacao.S, todas)}% do total`}
          icone={<IconeCheckCirculo />}
          selecionado={situacao === 'S'}
          aoClicar={() => aoFiltrarSituacao(situacao === 'S' ? '' : 'S')}
        />
        <CartaoResumo
          rotulo="Em desenvolvimento"
          valor={porSituacao.D}
          destaque={porSituacao.D > 0}
          tom="atencao"
          legenda={`${percentual(porSituacao.D, todas)}% do total`}
          icone={<IconeRaio />}
          selecionado={situacao === 'D'}
          aoClicar={() => aoFiltrarSituacao(situacao === 'D' ? '' : 'D')}
        />
        <CartaoResumo
          rotulo="Inativas"
          valor={porSituacao.N}
          legenda={`${percentual(porSituacao.N, todas)}% do total`}
          icone={<IconeMenos />}
          selecionado={situacao === 'N'}
          aoClicar={() => aoFiltrarSituacao(situacao === 'N' ? '' : 'N')}
        />
      </div>

      <FaixaPlataformas
        plataformas={plataformas}
        selecionada={situacao === 'S' && plataforma ? plataforma : null}
        aoFiltrar={aoFiltrarPlataforma}
      />
    </div>
  )
}
