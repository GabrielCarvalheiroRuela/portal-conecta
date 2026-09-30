import { useCallback, useEffect, useRef, useState } from 'react'
import { EVENTO_TEMA } from '../components/ui/AlternarTema'
import { CacaAoBug } from './CacaAoBug'
import { armarLogoFujona, chuva, lampada } from './efeitos'
import { desligarGravidade, gravidadeAtiva, ligarGravidade } from './gravidade'
import { Snake } from './Snake'

/*
 * Easter eggs do portal. Tudo aqui é visual: nada chama a API nem altera dado.
 *
 *   "gravidade" digitado fora de campos ...... a tela desaba (Esc arruma)
 *   mouse 3x rápido na logo do menu .......... a logo foge do cursor
 *   5 cliques no ✓ de "Nenhum ... com erro" .. chuva de café
 *   tema alternado 10x em poucos segundos .... a lâmpada queima
 *   3 cliques do meio no título Monitoramento  caça ao bug
 *   Ctrl + Shift + S fora de campos .......... snake sobre a tabela
 */

type Jogo = 'bugs' | 'snake' | null

/** Ninguém dispara segredo enquanto digita num campo. */
function digitando(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false
  return alvo.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName)
}

/** Guarda os instantes recentes e diz quando a janela juntou N eventos. */
function contador(janelaMs: number, alvo: number) {
  let marcas: number[] = []
  return () => {
    const agora = Date.now()
    marcas = marcas.filter((t) => agora - t < janelaMs)
    marcas.push(agora)
    if (marcas.length >= alvo) {
      marcas = []
      return true
    }
    return false
  }
}

export function Segredos() {
  const [aviso, setAviso] = useState<{ id: number; texto: string } | null>(null)
  const [jogo, setJogo] = useState<Jogo>(null)
  const jogoRef = useRef<Jogo>(null)
  jogoRef.current = jogo

  const avisar = useCallback((texto: string) => {
    const id = Date.now()
    setAviso({ id, texto })
    setTimeout(() => setAviso((a) => (a?.id === id ? null : a)), 3800)
  }, [])

  useEffect(() => {
    let digitado = ''
    const cafe = contador(3000, 5)
    const bug = contador(2000, 3)
    const tema = contador(6000, 10)

    const aoTeclar = (e: KeyboardEvent) => {
      if (jogoRef.current) return
      if (e.key === 'Escape' && gravidadeAtiva()) {
        desligarGravidade()
        return
      }
      if (digitando(e.target)) return
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyS') {
        e.preventDefault()
        desligarGravidade()
        setJogo('snake')
        return
      }
      if (e.ctrlKey || e.metaKey || e.altKey || e.key.length !== 1) return
      digitado = (digitado + e.key.toLowerCase()).slice(-12)
      if (digitado.endsWith('gravidade') && ligarGravidade()) {
        digitado = ''
        avisar('Ops. Aperte Esc para arrumar a bagunça.')
      }
    }

    const aoClicar = (e: MouseEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('[data-segredo="cafe"]')) return
      if (cafe()) {
        chuva(['☕'], 28)
        avisar('Tudo em dia. Vai tomar um café ☕')
      }
    }

    // O clique do meio no Windows liga a rolagem automática; no título ela fica desligada.
    const aoApertar = (e: MouseEvent) => {
      if (e.button === 1 && e.target instanceof Element && e.target.closest('[data-segredo="titulo"]')) e.preventDefault()
    }
    const aoCliqueDoMeio = (e: MouseEvent) => {
      if (e.button !== 1 || !(e.target instanceof Element) || !e.target.closest('[data-segredo="titulo"]')) return
      e.preventDefault()
      if (!jogoRef.current && bug()) {
        desligarGravidade()
        setJogo('bugs')
      }
    }

    const aoTrocarTema = () => {
      if (tema()) {
        lampada()
        setTimeout(() => avisar('Decide aí! 😅'), 700)
      }
    }

    window.addEventListener('keydown', aoTeclar)
    document.addEventListener('click', aoClicar)
    document.addEventListener('mousedown', aoApertar)
    document.addEventListener('auxclick', aoCliqueDoMeio)
    window.addEventListener(EVENTO_TEMA, aoTrocarTema)
    return () => {
      window.removeEventListener('keydown', aoTeclar)
      document.removeEventListener('click', aoClicar)
      document.removeEventListener('mousedown', aoApertar)
      document.removeEventListener('auxclick', aoCliqueDoMeio)
      window.removeEventListener(EVENTO_TEMA, aoTrocarTema)
      desligarGravidade()
    }
  }, [avisar])

  useEffect(() => armarLogoFujona(() => avisar('Ufa. A logo voltou… por enquanto.')), [avisar])

  const fechar = useCallback(() => setJogo(null), [])

  return (
    <>
      {jogo === 'bugs' && <CacaAoBug aoFechar={fechar} />}
      {jogo === 'snake' && <Snake aoFechar={fechar} />}
      {aviso && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[90] flex justify-center px-4">
          <div
            key={aviso.id}
            role="status"
            className="escuro-fixo rounded-full bg-ink-900 px-5 py-2.5 text-sm font-medium text-white shadow-card-hover ring-1 ring-white/10 animate-fade-in"
          >
            {aviso.texto}
          </div>
        </div>
      )}
    </>
  )
}
