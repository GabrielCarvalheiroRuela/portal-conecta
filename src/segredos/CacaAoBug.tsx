import { useCallback, useEffect, useRef, useState } from 'react'

const TOTAL = 10
const DURACAO_S = 15

interface Bug {
  id: number
  x: number
  y: number
  vx: number
  vy: number
  vivo: boolean
}

interface Resultado {
  mortos: number
  tempo: number
}

function novosBugs(): Bug[] {
  return Array.from({ length: TOTAL }, (_, id) => {
    const angulo = Math.random() * Math.PI * 2
    const velocidade = 150 + Math.random() * 130
    return {
      id,
      x: 60 + Math.random() * (innerWidth - 120),
      y: 100 + Math.random() * (innerHeight - 180),
      vx: Math.cos(angulo) * velocidade,
      vy: Math.sin(angulo) * velocidade,
      vivo: true,
    }
  })
}

function nivel({ mortos, tempo }: Resultado): { titulo: string; frase: string } {
  if (mortos === TOTAL && tempo < 7) return { titulo: 'Lenda', frase: 'Nenhum bug sobrevive ao seu olhar.' }
  if (mortos === TOTAL) return { titulo: 'Sênior', frase: 'Zerou a fila. Merece um café.' }
  if (mortos >= 7) return { titulo: 'Pleno', frase: 'Quase lá. Alguns fugiram pra produção.' }
  if (mortos >= 4) return { titulo: 'Júnior', frase: 'Bom começo. Os bugs agradecem a folga.' }
  return { titulo: 'Estágio', frase: 'Os bugs venceram desta vez. Abre um requisito.' }
}

export function CacaAoBug({ aoFechar }: { aoFechar: () => void }) {
  const [bugs, setBugs] = useState<Bug[]>(novosBugs)
  const [restante, setRestante] = useState(DURACAO_S)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [erros, setErros] = useState(0)
  const [rodada, setRodada] = useState(0)
  const bugsRef = useRef(bugs)
  bugsRef.current = bugs
  const inicio = useRef(performance.now())

  const terminar = useCallback(() => {
    const mortos = bugsRef.current.filter((b) => !b.vivo).length
    setResultado({ mortos, tempo: (performance.now() - inicio.current) / 1000 })
  }, [])

  useEffect(() => {
    if (resultado) return
    let quadro = 0
    let anterior = performance.now()
    const passo = (agora: number) => {
      const dt = Math.min(0.05, (agora - anterior) / 1000)
      anterior = agora
      setBugs((atual) =>
        atual.map((b) => {
          if (!b.vivo) return b
          let { x, y, vx, vy } = b
          // De vez em quando o bug muda de ideia.
          if (Math.random() < dt * 1.4) {
            const angulo = Math.atan2(vy, vx) + (Math.random() - 0.5) * 2.2
            const velocidade = Math.hypot(vx, vy)
            vx = Math.cos(angulo) * velocidade
            vy = Math.sin(angulo) * velocidade
          }
          x += vx * dt
          y += vy * dt
          if (x < 24 || x > innerWidth - 24) {
            vx = -vx
            x = Math.max(24, Math.min(innerWidth - 24, x))
          }
          if (y < 80 || y > innerHeight - 24) {
            vy = -vy
            y = Math.max(80, Math.min(innerHeight - 24, y))
          }
          return { ...b, x, y, vx, vy }
        }),
      )
      const passou = (agora - inicio.current) / 1000
      setRestante(Math.max(0, DURACAO_S - passou))
      if (passou >= DURACAO_S) {
        terminar()
        return
      }
      quadro = requestAnimationFrame(passo)
    }
    quadro = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(quadro)
  }, [resultado, rodada, terminar])

  useEffect(() => {
    if (!resultado && bugs.every((b) => !b.vivo)) terminar()
  }, [bugs, resultado, terminar])

  const reiniciar = useCallback(() => {
    inicio.current = performance.now()
    setBugs(novosBugs())
    setErros(0)
    setRestante(DURACAO_S)
    setResultado(null)
    setRodada((r) => r + 1)
  }, [])

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        aoFechar()
      } else if (e.key === 'Enter' && resultado) {
        e.preventDefault()
        reiniciar()
      }
    }
    window.addEventListener('keydown', aoTeclar, true)
    return () => window.removeEventListener('keydown', aoTeclar, true)
  }, [aoFechar, reiniciar, resultado])

  function esmagar(id: number) {
    setBugs((atual) => atual.map((b) => (b.id === id ? { ...b, vivo: false } : b)))
  }

  const vivos = bugs.filter((b) => b.vivo).length
  const n = resultado ? nivel(resultado) : null

  return (
    <div
      className="fixed inset-0 z-[80] cursor-crosshair select-none bg-ink-950/10"
      onClick={() => !resultado && setErros((e) => e + 1)}
    >
      <div className="escuro-fixo pointer-events-none absolute left-1/2 top-5 flex -translate-x-1/2 items-center gap-4 rounded-full bg-ink-900/95 px-5 py-2 text-sm font-medium text-white shadow-card-hover ring-1 ring-white/10">
        <span>🐞 Caça ao bug</span>
        <span className="text-slate-400">·</span>
        <span className="tabular-nums">{vivos} restantes</span>
        <span className="text-slate-400">·</span>
        <span className={`tabular-nums ${restante < 5 ? 'text-red-400' : ''}`}>{restante.toFixed(1)}s</span>
        <span className="text-slate-500">Esc sai</span>
      </div>

      {bugs.map((b) =>
        b.vivo ? (
          <button
            key={`${rodada}-${b.id}`}
            type="button"
            aria-label="Bug"
            onClick={(e) => {
              e.stopPropagation()
              esmagar(b.id)
            }}
            className="absolute text-[34px] leading-none transition-transform hover:scale-110"
            style={{ left: b.x, top: b.y, transform: `translate(-50%, -50%) scaleX(${b.vx < 0 ? -1 : 1})` }}
          >
            🐞
          </button>
        ) : (
          <span
            key={`${rodada}-${b.id}`}
            aria-hidden="true"
            className="pointer-events-none absolute animate-sumir text-[34px] leading-none"
            style={{ left: b.x, top: b.y, transform: 'translate(-50%, -50%)' }}
          >
            💥
          </span>
        ),
      )}

      {resultado && n && (
        <div className="absolute inset-0 flex items-center justify-center bg-ink-950/40 p-4" onClick={(e) => e.stopPropagation()}>
          <div className="w-full max-w-sm cursor-default rounded-2xl border border-slate-200/80 bg-surface p-7 text-center shadow-card-hover animate-fade-in">
            <p className="text-5xl">{resultado.mortos === TOTAL ? '🏆' : '🐞'}</p>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Seu nível</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">{n.titulo}</h2>
            <p className="mt-2 text-sm text-slate-500">{n.frase}</p>
            <dl className="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-slate-200/70 ring-1 ring-slate-200/70">
              {[
                ['Esmagados', `${resultado.mortos}/${TOTAL}`],
                ['Tempo', `${Math.min(resultado.tempo, DURACAO_S).toFixed(1)}s`],
                ['Errou', String(erros)],
              ].map(([rotulo, valor]) => (
                <div key={rotulo} className="bg-surface px-2 py-3">
                  <dt className="text-[11px] font-medium text-slate-500">{rotulo}</dt>
                  <dd className="mt-0.5 text-lg font-semibold tabular-nums text-slate-900">{valor}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                onClick={aoFechar}
                className="h-10 flex-1 rounded-lg border border-slate-200 bg-surface text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Voltar ao trabalho
              </button>
              <button
                type="button"
                onClick={reiniciar}
                className="h-10 flex-1 rounded-lg bg-ink-900 text-sm font-medium text-white hover:bg-ink-800 dark:bg-brand-500 dark:text-ink-950 dark:hover:bg-brand-400"
              >
                Jogar de novo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
