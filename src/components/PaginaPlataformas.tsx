import { useState } from 'react'
import type { Perfil } from '../services/api'
import { FormPlataforma } from './FormPlataforma'
import { ListaPlataformas } from './ListaPlataformas'
import { PaginaFuncionalidades } from './funcionalidades/PaginaFuncionalidades'

type Modo = 'cadastro' | 'funcionalidades'

interface Props {
  perfil: Perfil
  /** Incrementado quando uma plataforma é criada, para as outras abas recarregarem o seletor. */
  versaoPlataformas: number
  aoCriarPlataforma: () => void
}

/**
 * A aba Plataformas, por perfil:
 *  - USR: só a tabela das plataformas cadastradas.
 *  - DEV: a tabela, o formulário que cadastra plataformas e a matriz de funcionalidades, podendo marcar a situação de
 *    cada uma (a engrenagem), mas sem criar, editar ou excluir funcionalidades.
 *  - ADM: tudo, inclusive os botões que criam, editam e excluem funcionalidades.
 * Esconder o que o perfil não pode é só conforto: a API confere o perfil a cada chamada.
 */
export function PaginaPlataformas({ perfil, versaoPlataformas, aoCriarPlataforma }: Props) {
  const [modo, setModo] = useState<Modo>('cadastro')

  if (perfil === 'USR') {
    return (
      <div className="max-w-3xl">
        <ListaPlataformas versao={versaoPlataformas} />
      </div>
    )
  }

  const modos: { id: Modo; rotulo: string }[] = [
    { id: 'cadastro', rotulo: 'Cadastro' },
    { id: 'funcionalidades', rotulo: 'Funcionalidades' },
  ]

  return (
    <div className="space-y-4">
      <div
        className="inline-flex items-center gap-0.5 rounded-lg bg-slate-100/80 p-0.5"
        role="tablist"
        aria-label="Cadastro de plataformas ou funcionalidades"
      >
        {modos.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={modo === m.id}
            onClick={() => setModo(m.id)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              modo === m.id ? 'bg-surface text-slate-900 shadow-soft' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {m.rotulo}
          </button>
        ))}
      </div>

      {modo === 'cadastro' ? (
        <div className="grid max-w-6xl items-start gap-6 animate-fade-in lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <FormPlataforma aoCriar={aoCriarPlataforma} />
          <ListaPlataformas versao={versaoPlataformas} />
        </div>
      ) : (
        <div className="animate-fade-in">
          <PaginaFuncionalidades />
        </div>
      )}
    </div>
  )
}
