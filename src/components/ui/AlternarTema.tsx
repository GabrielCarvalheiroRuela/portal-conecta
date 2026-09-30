import { useEffect, useState } from 'react'
import { IconeLua, IconeSol } from './Icones'

type Tema = 'claro' | 'escuro'

const CHAVE = 'conecta.tema'
export const EVENTO_TEMA = 'conecta:tema'

function temaAtual(): Tema {
  return document.documentElement.classList.contains('dark') ? 'escuro' : 'claro'
}

/** Guarda a escolha no navegador; sem escolha, segue o tema do sistema (ver script no index.html). */
function useTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>(temaAtual)

  useEffect(() => {
    // Enquanto a pessoa não escolheu, acompanha a troca de tema do sistema.
    const midia = matchMedia('(prefers-color-scheme: dark)')
    const aoMudar = () => {
      let escolhido: string | null = null
      try {
        escolhido = localStorage.getItem(CHAVE)
      } catch {
        // armazenamento bloqueado: segue o sistema
      }
      if (!escolhido) {
        document.documentElement.classList.toggle('dark', midia.matches)
        setTema(temaAtual())
      }
    }
    const sincronizar = () => setTema(temaAtual())
    midia.addEventListener('change', aoMudar)
    window.addEventListener(EVENTO_TEMA, sincronizar)
    return () => {
      midia.removeEventListener('change', aoMudar)
      window.removeEventListener(EVENTO_TEMA, sincronizar)
    }
  }, [])

  function alternar() {
    // Lê da página, não do estado: cliques muito rápidos chegam antes do React atualizar.
    const novo: Tema = temaAtual() === 'escuro' ? 'claro' : 'escuro'
    document.documentElement.classList.toggle('dark', novo === 'escuro')
    try {
      localStorage.setItem(CHAVE, novo)
    } catch {
      // armazenamento bloqueado: vale só até recarregar
    }
    setTema(novo)
    window.dispatchEvent(new Event(EVENTO_TEMA))
  }

  return [tema, alternar]
}

/** Botão sol/lua. "escuroFixo" é para fundos que já são escuros (menu lateral). */
export function AlternarTema({ comRotulo = false, escuroFixo = false }: { comRotulo?: boolean; escuroFixo?: boolean }) {
  const [tema, alternar] = useTema()
  const escuro = tema === 'escuro'
  const rotulo = escuro ? 'Modo claro' : 'Modo escuro'

  return (
    <button
      type="button"
      onClick={alternar}
      title={rotulo}
      aria-label={rotulo}
      className={`group inline-flex items-center gap-3 rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
        comRotulo ? 'w-full px-3 py-2' : 'p-2'
      } ${
        escuroFixo
          ? 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'
          : 'border border-slate-200 bg-surface text-slate-600 shadow-soft hover:bg-slate-50 hover:text-slate-900'
      }`}
    >
      <span className="relative block h-[18px] w-[18px]">
        <span
          className={`absolute inset-0 transition-all duration-300 ${escuro ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-50 opacity-0'}`}
        >
          <IconeSol />
        </span>
        <span
          className={`absolute inset-0 transition-all duration-300 ${escuro ? 'rotate-90 scale-50 opacity-0' : 'rotate-0 scale-100 opacity-100'}`}
        >
          <IconeLua />
        </span>
      </span>
      {comRotulo && rotulo}
    </button>
  )
}
