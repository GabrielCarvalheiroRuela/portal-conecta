/*
 * Gravidade: os blocos da tela despencam e quicam. Dá para arrastar e arremessar.
 * Só mexe em style.transform; Esc devolve tudo ao lugar. Cliques ficam bloqueados enquanto dura,
 * para ninguém acionar um botão sem querer.
 */

const SELETORES = ['main header', 'main .rounded-xl', 'main h1', 'aside nav > button', 'aside img', 'aside p']

const G = 2400
const QUIQUE = 0.38
const ATRITO = 0.82

interface Corpo {
  el: HTMLElement
  esq: number
  dir: number
  base: number
  largo: boolean
  x: number
  y: number
  vx: number
  vy: number
  a: number
  va: number
  preso: boolean
}

let corpos: Corpo[] = []
let quadro = 0
let desmontar: (() => void) | null = null

const limitar = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

export function gravidadeAtiva(): boolean {
  return corpos.length > 0
}

export function ligarGravidade(): boolean {
  if (gravidadeAtiva()) return false
  const vw = innerWidth
  const vh = innerHeight

  const visiveis = Array.from(
    new Set(SELETORES.flatMap((s) => Array.from(document.querySelectorAll<HTMLElement>(s)))),
  ).filter((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw
  })
  // Só os blocos de fora: se um card cai, o que está dentro dele cai junto.
  const blocos = visiveis.filter((el) => !visiveis.some((outro) => outro !== el && outro.contains(el)))
  if (blocos.length === 0) return false

  corpos = blocos.map((el) => {
    const r = el.getBoundingClientRect()
    el.style.willChange = 'transform'
    el.style.transition = 'none'
    // A animação de entrada (fill: both) prende o transform; sem isso o bloco não cai.
    el.style.animation = 'none'
    return {
      el,
      esq: r.left,
      dir: r.right,
      // Blocos mais altos que a tela "afundam" no chão em vez de pularem para cima.
      base: r.top + Math.min(r.height, vh * 0.45),
      largo: r.width > 400,
      x: 0,
      y: 0,
      vx: (Math.random() - 0.5) * 320,
      vy: -Math.random() * 260,
      a: 0,
      va: (Math.random() - 0.5) * 180,
      preso: false,
    }
  })

  const overflowAntes = document.body.style.overflow
  const selecaoAntes = document.body.style.userSelect
  document.body.style.overflow = 'hidden'
  document.body.style.userSelect = 'none'

  let arrastado: Corpo | null = null
  let ultimo = { x: 0, y: 0, t: 0 }

  const corpoDe = (alvo: EventTarget | null) =>
    alvo instanceof Node ? (corpos.find((c) => c.el.contains(alvo)) ?? null) : null

  const aoPressionar = (e: PointerEvent) => {
    const c = corpoDe(e.target)
    if (!c) return
    e.preventDefault()
    e.stopPropagation()
    arrastado = c
    c.preso = true
    c.vx = 0
    c.vy = 0
    ultimo = { x: e.clientX, y: e.clientY, t: performance.now() }
  }
  const aoMover = (e: PointerEvent) => {
    if (!arrastado) return
    const agora = performance.now()
    const dx = e.clientX - ultimo.x
    const dy = e.clientY - ultimo.y
    const dt = Math.max(8, agora - ultimo.t) / 1000
    arrastado.x += dx
    arrastado.y += dy
    arrastado.vx = limitar(dx / dt, -2600, 2600)
    arrastado.vy = limitar(dy / dt, -2600, 2600)
    arrastado.va = arrastado.vx * 0.08
    ultimo = { x: e.clientX, y: e.clientY, t: agora }
  }
  const aoSoltar = () => {
    if (arrastado) arrastado.preso = false
    arrastado = null
  }
  const bloquear = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
  }

  document.addEventListener('pointerdown', aoPressionar, true)
  window.addEventListener('pointermove', aoMover)
  window.addEventListener('pointerup', aoSoltar)
  window.addEventListener('pointercancel', aoSoltar)
  document.addEventListener('click', bloquear, true)

  let anterior = performance.now()
  const passo = (agora: number) => {
    const dt = Math.min(0.032, (agora - anterior) / 1000)
    anterior = agora
    for (const c of corpos) {
      if (!c.preso) {
        c.vy += G * dt
        c.x += c.vx * dt
        c.y += c.vy * dt
        c.a += c.va * dt
        const chao = vh - c.base
        if (c.y > chao) {
          c.y = chao
          c.vy = Math.abs(c.vy) > 140 ? -c.vy * QUIQUE : 0
          c.vx *= ATRITO
          c.va *= 0.7
        }
        if (c.x < -c.esq) {
          c.x = -c.esq
          c.vx = Math.abs(c.vx) * 0.5
        }
        if (c.x > vw - c.dir) {
          c.x = vw - c.dir
          c.vx = -Math.abs(c.vx) * 0.5
        }
      }
      // Blocos largos giram pouco, para o conteúdo continuar reconhecível.
      const giroMax = c.largo ? 10 : 35
      c.a = limitar(c.a, -giroMax, giroMax)
      c.el.style.transform = `translate(${c.x}px, ${c.y}px) rotate(${c.a}deg)`
    }
    quadro = requestAnimationFrame(passo)
  }
  quadro = requestAnimationFrame(passo)

  desmontar = () => {
    document.removeEventListener('pointerdown', aoPressionar, true)
    window.removeEventListener('pointermove', aoMover)
    window.removeEventListener('pointerup', aoSoltar)
    window.removeEventListener('pointercancel', aoSoltar)
    document.removeEventListener('click', bloquear, true)
    document.body.style.overflow = overflowAntes
    document.body.style.userSelect = selecaoAntes
  }
  return true
}

export function desligarGravidade() {
  if (!gravidadeAtiva()) return
  cancelAnimationFrame(quadro)
  desmontar?.()
  desmontar = null
  const caidos = corpos
  corpos = []
  for (const c of caidos) {
    c.el.style.transition = 'transform .7s cubic-bezier(.2,.9,.2,1)'
    c.el.style.transform = ''
  }
  setTimeout(() => {
    for (const c of caidos) {
      c.el.style.transition = ''
      c.el.style.willChange = ''
      c.el.style.animation = ''
    }
  }, 750)
}
