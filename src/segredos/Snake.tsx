import { useCallback, useEffect, useRef, useState } from 'react'
import { CORES_DAS_MARCAS } from '../components/ui/Tabela'

const CELULA = 24
const CHAVE_RECORDE = 'conecta.snake.recorde'

interface Ponto {
  x: number
  y: number
}

interface Tabuleiro {
  esq: number
  topo: number
  cols: number
  linhas: number
}

type Estado = 'pronto' | 'jogando' | 'fim'

const DIRECOES: Record<string, Ponto> = {
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  w: { x: 0, y: -1 },
  s: { x: 0, y: 1 },
  a: { x: -1, y: 0 },
  d: { x: 1, y: 0 },
}

/** O tabuleiro fica em cima da tabela visível; sem tabela (ou pequena demais), no meio da tela. */
function medirTabuleiro(): Tabuleiro {
  const vw = innerWidth
  const vh = innerHeight
  let area: { l: number; t: number; w: number; h: number } | null = null
  for (const tabela of Array.from(document.querySelectorAll('table'))) {
    const r = tabela.getBoundingClientRect()
    const l = Math.max(r.left, 16)
    const t = Math.max(r.top, 72)
    const w = Math.min(r.right, vw - 16) - l
    const h = Math.min(r.bottom, vh - 16) - t
    if (w >= 360 && h >= 240) {
      area = { l, t, w, h }
      break
    }
  }
  if (!area) {
    const w = Math.min(600, vw - 32)
    const h = Math.min(408, vh - 140)
    area = { l: (vw - w) / 2, t: Math.max(72, (vh - h) / 2), w, h }
  }
  const cols = Math.floor(area.w / CELULA)
  const linhas = Math.floor(area.h / CELULA)
  return {
    esq: area.l + (area.w - cols * CELULA) / 2,
    topo: area.t + (area.h - linhas * CELULA) / 2,
    cols,
    linhas,
  }
}

function lerRecorde(): number {
  try {
    return Number(localStorage.getItem(CHAVE_RECORDE)) || 0
  } catch {
    return 0
  }
}

function sortearComida(tab: Tabuleiro, cobra: Ponto[]) {
  const livres: Ponto[] = []
  for (let x = 0; x < tab.cols; x++)
    for (let y = 0; y < tab.linhas; y++) if (!cobra.some((p) => p.x === x && p.y === y)) livres.push({ x, y })
  const ponto = livres[Math.floor(Math.random() * livres.length)] ?? { x: 0, y: 0 }
  const marca = CORES_DAS_MARCAS[Math.floor(Math.random() * CORES_DAS_MARCAS.length)]
  return { ponto, marca }
}

function cobraInicial(tab: Tabuleiro): Ponto[] {
  const y = Math.floor(tab.linhas / 2)
  const x = Math.floor(tab.cols / 3)
  return [
    { x, y },
    { x: x - 1, y },
    { x: x - 2, y },
  ]
}

export function Snake({ aoFechar }: { aoFechar: () => void }) {
  const [tab] = useState(medirTabuleiro)
  const [cobra, setCobra] = useState<Ponto[]>(() => cobraInicial(tab))
  const [comida, setComida] = useState(() => sortearComida(tab, cobraInicial(tab)))
  const [estado, setEstado] = useState<Estado>('pronto')
  const [pontos, setPontos] = useState(0)
  const [recorde, setRecorde] = useState(lerRecorde)
  const [ultimaComida, setUltimaComida] = useState<string | null>(null)
  const [novoRecorde, setNovoRecorde] = useState(false)
  const direcao = useRef<Ponto>({ x: 1, y: 0 })
  const proxima = useRef<Ponto>({ x: 1, y: 0 })

  const reiniciar = useCallback(() => {
    const nova = cobraInicial(tab)
    direcao.current = { x: 1, y: 0 }
    proxima.current = { x: 1, y: 0 }
    setCobra(nova)
    setComida(sortearComida(tab, nova))
    setPontos(0)
    setUltimaComida(null)
    setNovoRecorde(false)
    setEstado('pronto')
  }, [tab])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      const tecla = e.key.length === 1 ? e.key.toLowerCase() : e.key
      if (tecla === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        aoFechar()
        return
      }
      if (tecla === 'Enter' && estado === 'fim') {
        e.preventDefault()
        reiniciar()
        return
      }
      const d = DIRECOES[tecla]
      if (!d) return
      e.preventDefault()
      e.stopPropagation()
      // Não deixa dar meia-volta em cima do próprio corpo.
      if (d.x === -direcao.current.x && d.y === -direcao.current.y) return
      proxima.current = d
      if (estado === 'pronto') setEstado('jogando')
    }
    window.addEventListener('keydown', aoTeclar, true)
    return () => window.removeEventListener('keydown', aoTeclar, true)
  }, [aoFechar, estado, reiniciar])

  useEffect(() => {
    if (estado !== 'jogando') return
    const intervalo = Math.max(65, 140 - pontos * 5)
    const id = setTimeout(() => {
      direcao.current = proxima.current
      const cabeca = cobra[0]
      const nova = { x: cabeca.x + direcao.current.x, y: cabeca.y + direcao.current.y }
      const comeu = nova.x === comida.ponto.x && nova.y === comida.ponto.y
      const corpo = comeu ? cobra : cobra.slice(0, -1)
      const bateu =
        nova.x < 0 ||
        nova.y < 0 ||
        nova.x >= tab.cols ||
        nova.y >= tab.linhas ||
        corpo.some((p) => p.x === nova.x && p.y === nova.y)
      if (bateu) {
        setEstado('fim')
        setNovoRecorde(pontos > recorde)
        if (pontos > recorde) {
          setRecorde(pontos)
          try {
            localStorage.setItem(CHAVE_RECORDE, String(pontos))
          } catch {
            // sem armazenamento: o recorde vale só nesta sessão
          }
        }
        return
      }
      const proximaCobra = [nova, ...corpo]
      setCobra(proximaCobra)
      if (comeu) {
        setPontos((p) => p + 1)
        setUltimaComida(comida.marca.nome)
        setComida(sortearComida(tab, proximaCobra))
      }
    }, intervalo)
    return () => clearTimeout(id)
  }, [cobra, comida, estado, pontos, recorde, tab])

  const largura = tab.cols * CELULA
  const altura = tab.linhas * CELULA

  return (
    <div className="fixed inset-0 z-[80] select-none bg-ink-950/40">
      <div
        className="escuro-fixo absolute flex items-center gap-3 rounded-full bg-ink-900/95 px-4 py-1.5 text-xs font-medium text-white shadow-card-hover ring-1 ring-white/10"
        style={{ left: tab.esq, top: tab.topo - 44 }}
      >
        <span className="font-semibold tracking-wide">SNAKE</span>
        <span className="text-slate-500">·</span>
        <span className="tabular-nums">selos: {pontos}</span>
        <span className="text-slate-500">·</span>
        <span className="tabular-nums text-slate-400">recorde: {Math.max(recorde, pontos)}</span>
        {ultimaComida && (
          <>
            <span className="text-slate-500">·</span>
            <span className="uppercase text-brand-300">nhac, {ultimaComida}!</span>
          </>
        )}
      </div>

      <div
        className="absolute overflow-hidden rounded-lg bg-surface/80 shadow-card-hover ring-2 ring-brand-500/60 backdrop-blur-[1px]"
        style={{
          left: tab.esq,
          top: tab.topo,
          width: largura,
          height: altura,
          backgroundImage:
            'linear-gradient(to right, rgb(var(--slate-200) / 0.7) 1px, transparent 1px), linear-gradient(to bottom, rgb(var(--slate-200) / 0.7) 1px, transparent 1px)',
          backgroundSize: `${CELULA}px ${CELULA}px`,
        }}
      >
        <span
          className="absolute rounded-full ring-2 ring-surface"
          title={comida.marca.nome}
          style={{
            left: comida.ponto.x * CELULA + 4,
            top: comida.ponto.y * CELULA + 4,
            width: CELULA - 8,
            height: CELULA - 8,
            backgroundColor: comida.marca.cor,
            boxShadow: `0 0 0 4px ${comida.marca.cor}33`,
          }}
        />

        {cobra.map((p, i) => (
          <span
            key={i}
            className={`absolute rounded-md ${i === 0 ? 'bg-brand-600' : 'bg-brand-500'}`}
            style={{
              left: p.x * CELULA + 2,
              top: p.y * CELULA + 2,
              width: CELULA - 4,
              height: CELULA - 4,
              opacity: i === 0 ? 1 : Math.max(0.45, 1 - i * 0.03),
            }}
          >
            {i === 0 && (
              <>
                <span className="absolute left-[5px] top-[5px] h-[5px] w-[5px] rounded-full bg-white" />
                <span className="absolute right-[5px] top-[5px] h-[5px] w-[5px] rounded-full bg-white" />
              </>
            )}
          </span>
        ))}

        {estado !== 'jogando' && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/60">
            <div className="text-center animate-fade-in">
              {estado === 'pronto' ? (
                <>
                  <p className="text-lg font-semibold tracking-tight text-slate-900">Coma os selos das plataformas</p>
                  <p className="mt-1 text-sm text-slate-500">Setas ou W A S D para começar · Esc sai</p>
                </>
              ) : (
                <>
                  <p className="text-2xl font-semibold tracking-tight text-slate-900">Game over</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {pontos} {pontos === 1 ? 'selo' : 'selos'}
                    {novoRecorde ? ' · novo recorde! 🏆' : ''}
                  </p>
                  <p className="mt-3 text-xs text-slate-400">Enter joga de novo · Esc sai</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
