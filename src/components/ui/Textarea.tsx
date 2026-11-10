import type { TextareaHTMLAttributes } from 'react'
import { CLASSE_ROTULO, MensagemCampo, classeControle } from './Campo'

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  id: string
  label: string
  erro?: string
  ajuda?: string
  /** Fonte de código (padrão, para chaves e nomes de workflow). Falso para texto corrido, como descrições. */
  mono?: boolean
}

export function Textarea({ id, label, erro, ajuda, mono = true, ...props }: Props) {
  return (
    <div>
      <label htmlFor={id} className={CLASSE_ROTULO}>
        {label}
      </label>
      <textarea
        id={id}
        aria-invalid={erro ? true : undefined}
        aria-describedby={erro ? `${id}-erro` : ajuda ? `${id}-ajuda` : undefined}
        className={`${classeControle(erro)} ${mono ? 'font-mono text-xs' : 'text-sm'} leading-relaxed`}
        {...props}
      />
      <MensagemCampo id={id} erro={erro} ajuda={ajuda} />
    </div>
  )
}
