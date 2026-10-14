import { useEffect, useRef } from 'react'
import { IconeCheck, IconeMenos } from './Icones'

/**
 * Caixa de seleção com o terceiro estado (parte dos itens marcados). Desmarcada é azul escura; marcada, azul clara
 * com o sinal de certo; parcial, azul clara com um traço. A caixa nativa fica por baixo, invisível, para o teclado e
 * os leitores de tela continuarem funcionando. Use `rotulo` (aria-label) ou `id` com um <label htmlFor>.
 */
export function CaixaSelecao({
  estado,
  rotulo,
  id,
  desabilitado,
  aoClicar,
}: {
  estado: 'nenhum' | 'parte' | 'todos'
  rotulo?: string
  id?: string
  desabilitado: boolean
  aoClicar: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = estado === 'parte'
    }
  }, [estado])
  const cor =
    estado === 'nenhum'
      ? 'border-[#2b5a8c] bg-[#0f2f55] group-hover:border-[#4b86c2]'
      : 'border-[#7dd3fc] bg-[#7dd3fc] text-[#082f49]'
  return (
    <span className={`group relative inline-flex h-4 w-4 shrink-0 ${desabilitado ? 'opacity-50' : ''}`}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        aria-label={rotulo}
        checked={estado === 'todos'}
        disabled={desabilitado}
        onChange={aoClicar}
        className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer appearance-none rounded border-0 opacity-0 disabled:cursor-not-allowed"
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none flex h-4 w-4 items-center justify-center rounded border transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-1 ${cor}`}
      >
        {estado !== 'nenhum' && <span className="h-3 w-3">{estado === 'todos' ? <IconeCheck /> : <IconeMenos />}</span>}
      </span>
    </span>
  )
}
