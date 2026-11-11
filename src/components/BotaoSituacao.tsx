import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ROTULO_SITUACAO, type SituacaoIntegracao } from '../types/integracao'
import { IconeCheck } from './ui/Icones'
import { TOM_SITUACAO } from './ui/Tabela'

interface Props {
  /** A situação escolhida no popup (pode ainda não estar gravada). */
  situacao: SituacaoIntegracao
  /** As situações que este perfil pode escolher, na ordem em que aparecem no menu. */
  opcoes: SituacaoIntegracao[]
  /** Sem escolha possível (o perfil não pode mexer na situação atual): o botão só exibe. */
  travado?: boolean
  /** Durante o envio. */
  desabilitado?: boolean
  /** A situação escolhida difere da gravada: o botão ganha um ponto de "alterado". */
  alterada?: boolean
  aoEscolher: (nova: SituacaoIntegracao) => void
}

const DESCRICAO: Record<SituacaoIntegracao, string> = {
  S: 'Responde ao n8n',
  N: 'Pausada, não responde ao n8n',
  D: 'Em construção, não responde ao n8n',
}

/**
 * Botão de situação do cabeçalho do popup: o rótulo colorido (verde ATIVO, cinza INATIVO, amarelo EM DESENVOLVIMENTO)
 * que abre um menu para escolher a nova. Escolher só marca a mudança — quem grava é o "Salvar alterações" do popup.
 *
 * Teclado: Enter/Espaço/seta abre; setas movem; Enter escolhe; Esc fecha o menu sem fechar o popup.
 */
export function BotaoSituacao({ situacao, opcoes, travado = false, desabilitado = false, alterada = false, aoEscolher }: Props) {
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)
  const botao = useRef<HTMLButtonElement>(null)
  const itens = useRef<(HTMLButtonElement | null)[]>([])

  const tom = TOM_SITUACAO[situacao]
  const bloqueado = travado || desabilitado

  // Fecha ao clicar fora.
  useEffect(() => {
    if (!aberto) {
      return
    }
    function aoClicarFora(evento: MouseEvent) {
      if (raiz.current && !raiz.current.contains(evento.target as Node)) {
        setAberto(false)
      }
    }
    document.addEventListener('mousedown', aoClicarFora)
    return () => document.removeEventListener('mousedown', aoClicarFora)
  }, [aberto])

  // Ao abrir, o foco vai para a opção atual.
  useEffect(() => {
    if (aberto) {
      const indice = Math.max(opcoes.indexOf(situacao), 0)
      itens.current[indice]?.focus()
    }
    // Só ao abrir: escolher outra opção fecha o menu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto])

  function fechar(devolverFoco: boolean) {
    setAberto(false)
    if (devolverFoco) {
      botao.current?.focus()
    }
  }

  function escolher(nova: SituacaoIntegracao) {
    fechar(true)
    if (nova !== situacao) {
      aoEscolher(nova)
    }
  }

  function aoTeclarNoBotao(evento: KeyboardEvent) {
    if (!bloqueado && (evento.key === 'ArrowDown' || evento.key === 'ArrowUp')) {
      evento.preventDefault()
      setAberto(true)
    }
  }

  function aoTeclarNoMenu(evento: KeyboardEvent) {
    if (evento.key === 'Escape') {
      // O popup também fecha no Esc: aqui só o menu.
      evento.stopPropagation()
      fechar(true)
      return
    }
    if (evento.key === 'Tab') {
      setAberto(false)
      return
    }

    const atual = itens.current.findIndex((item) => item === document.activeElement)
    const total = opcoes.length
    if (evento.key === 'ArrowDown') {
      evento.preventDefault()
      itens.current[(atual + 1) % total]?.focus()
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault()
      itens.current[(atual - 1 + total) % total]?.focus()
    } else if (evento.key === 'Home') {
      evento.preventDefault()
      itens.current[0]?.focus()
    } else if (evento.key === 'End') {
      evento.preventDefault()
      itens.current[total - 1]?.focus()
    }
  }

  return (
    <div ref={raiz} className="relative">
      <button
        ref={botao}
        id="botaoSituacao"
        type="button"
        disabled={bloqueado}
        aria-haspopup={travado ? undefined : 'menu'}
        aria-expanded={travado ? undefined : aberto}
        aria-label={travado ? `Situação: ${ROTULO_SITUACAO[situacao]}` : `Situação: ${ROTULO_SITUACAO[situacao]}. Alterar`}
        title={travado ? undefined : 'Alterar a situação'}
        onClick={() => setAberto((a) => !a)}
        onKeyDown={aoTeclarNoBotao}
        className={`relative inline-flex h-8 items-center gap-2 rounded-full pl-3 text-xs font-semibold ring-1 ring-inset transition-all duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30 ${
          tom.chip
        } ${travado ? 'cursor-default pr-3' : `cursor-pointer pr-2 active:scale-[0.97] ${tom.hover}`} ${
          desabilitado ? 'cursor-wait opacity-60' : ''
        }`}
      >
        <span className={`h-2 w-2 rounded-full ${tom.ponto}`} aria-hidden="true" />
        <span className="whitespace-nowrap tracking-wide">{ROTULO_SITUACAO[situacao]}</span>
        {!travado && (
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
            className={`h-4 w-4 opacity-70 transition-transform duration-150 ${aberto ? 'rotate-180' : ''}`}
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        )}
        {alterada && (
          <span
            className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-brand-500 ring-2 ring-surface"
            title="Alteração ainda não salva"
          />
        )}
      </button>

      {aberto && (
        <div
          role="menu"
          aria-label="Situação da integração"
          onKeyDown={aoTeclarNoMenu}
          className="absolute right-0 top-full z-20 mt-2 w-72 origin-top-right overflow-hidden rounded-xl border border-slate-200/80 bg-surface p-1.5 shadow-card-hover animate-fade-in"
        >
          <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
            Situação da integração
          </p>
          {opcoes.map((codigo, indice) => {
            const selecionada = codigo === situacao
            const tomOpcao = TOM_SITUACAO[codigo]
            return (
              <button
                key={codigo}
                ref={(el) => {
                  itens.current[indice] = el
                }}
                type="button"
                role="menuitemradio"
                aria-checked={selecionada}
                onClick={() => escolher(codigo)}
                className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors duration-100 hover:bg-slate-100 focus-visible:bg-slate-100 focus-visible:outline-none ${
                  selecionada ? 'bg-slate-50' : ''
                }`}
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${tomOpcao.ponto}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-slate-900">{ROTULO_SITUACAO[codigo]}</span>
                  <span className="block text-xs text-slate-500">{DESCRICAO[codigo]}</span>
                </span>
                {selecionada && (
                  <span className="h-4 w-4 shrink-0 text-brand-600">
                    <IconeCheck />
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
