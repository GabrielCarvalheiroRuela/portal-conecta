/* Efeitos soltos dos segredos: chuva de símbolos, lâmpada queimando e a logo que foge do mouse. */

const limitar = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

/** Símbolos caindo do topo da tela. Não bloqueia cliques. */
export function chuva(simbolos: string[], quantidade: number) {
  const camada = document.createElement('div')
  camada.setAttribute('aria-hidden', 'true')
  Object.assign(camada.style, { position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '85', overflow: 'hidden' })
  document.body.appendChild(camada)

  let maisLongo = 0
  for (let i = 0; i < quantidade; i++) {
    const s = document.createElement('span')
    s.textContent = simbolos[i % simbolos.length]
    const duracao = 2200 + Math.random() * 1800
    const atraso = Math.random() * 900
    maisLongo = Math.max(maisLongo, duracao + atraso)
    Object.assign(s.style, {
      position: 'absolute',
      left: `${Math.random() * 100}vw`,
      top: '-60px',
      fontSize: `${18 + Math.random() * 22}px`,
    })
    camada.appendChild(s)
    s.animate(
      [
        { transform: 'translate(0, 0) rotate(0deg)' },
        {
          transform: `translate(${(Math.random() - 0.5) * 140}px, ${innerHeight + 120}px) rotate(${(Math.random() - 0.5) * 720}deg)`,
        },
      ],
      { duration: duracao, delay: atraso, easing: 'cubic-bezier(.4,0,.8,.6)', fill: 'both' },
    )
  }
  setTimeout(() => camada.remove(), maisLongo + 100)
}

/** A tela apaga e pisca duas vezes, como lâmpada queimando. Menos de 3 piscadas por segundo. */
export function lampada() {
  const veu = document.createElement('div')
  veu.setAttribute('aria-hidden', 'true')
  Object.assign(veu.style, { position: 'fixed', inset: '0', background: '#000', pointerEvents: 'none', zIndex: '95', opacity: '0' })
  document.body.appendChild(veu)
  const animacao = veu.animate(
    [
      { opacity: 0 },
      { opacity: 0.85, offset: 0.2 },
      { opacity: 0.15, offset: 0.35 },
      { opacity: 0.9, offset: 0.55 },
      { opacity: 0.9, offset: 0.8 },
      { opacity: 0 },
    ],
    { duration: 1400, easing: 'ease-in-out' },
  )
  animacao.onfinish = () => veu.remove()
}

/** Passar o mouse 3 vezes rápido na logo ([data-segredo="logo"]) faz ela fugir do cursor por 6s. */
export function armarLogoFujona(aoVoltar: () => void): () => void {
  let entradas: number[] = []
  let fugindo = false

  function fugir(el: HTMLElement) {
    fugindo = true
    let x = 0
    let y = 0
    el.style.position = 'relative'
    el.style.zIndex = '60'
    el.style.transition = 'transform .18s ease-out'

    const mover = (nx: number, ny: number) => {
      x = nx
      y = ny
      el.style.transform = `translate(${x}px, ${y}px) rotate(${(Math.random() - 0.5) * 30}deg)`
    }

    const aoMover = (e: MouseEvent) => {
      const r = el.getBoundingClientRect()
      const cx = r.left + r.width / 2
      const cy = r.top + r.height / 2
      const dx = cx - e.clientX
      const dy = cy - e.clientY
      const d = Math.hypot(dx, dy) || 1
      if (d > 130) return
      // Posição sem o deslocamento, para limitar a fuga à área visível.
      const baseEsq = r.left - x
      const baseTopo = r.top - y
      const minX = 8 - baseEsq
      const maxX = innerWidth - 8 - r.width - baseEsq
      const minY = 8 - baseTopo
      const maxY = innerHeight - 8 - r.height - baseTopo
      const forca = (130 - d) * 1.6
      const nx = limitar(x + (dx / d) * forca, minX, maxX)
      const ny = limitar(y + (dy / d) * forca, minY, maxY)
      const encurralada = Math.abs(nx - x) + Math.abs(ny - y) < 4 && d < 70
      if (encurralada) {
        mover(minX + Math.random() * (maxX - minX), minY + Math.random() * (maxY - minY))
      } else {
        mover(nx, ny)
      }
    }

    window.addEventListener('mousemove', aoMover)
    setTimeout(() => {
      window.removeEventListener('mousemove', aoMover)
      el.style.transition = 'transform .6s cubic-bezier(.2,.9,.2,1)'
      el.style.transform = ''
      setTimeout(() => {
        el.style.transition = ''
        el.style.position = ''
        el.style.zIndex = ''
        fugindo = false
        aoVoltar()
      }, 650)
    }, 6000)
  }

  const aoPassar = (e: MouseEvent) => {
    if (fugindo || !(e.target instanceof Element)) return
    const logo = e.target.closest<HTMLElement>('[data-segredo="logo"]')
    if (!logo || (e.relatedTarget instanceof Node && logo.contains(e.relatedTarget))) return
    const agora = Date.now()
    entradas = entradas.filter((t) => agora - t < 2000)
    entradas.push(agora)
    if (entradas.length >= 3) {
      entradas = []
      fugir(logo)
    }
  }

  document.addEventListener('mouseover', aoPassar)
  return () => document.removeEventListener('mouseover', aoPassar)
}
