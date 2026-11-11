import { useState, type ReactNode } from 'react'
import type { IntegracaoCriada } from '../types/integracao'
import { Botao } from './ui/Botao'
import { IconeCheck, IconeChave, IconeCopiar, IconeMais } from './ui/Icones'
import { EtiquetaPlataforma, EtiquetaSituacao } from './ui/Tabela'

interface Props {
  integracao: IntegracaoCriada
  aoCadastrarOutra: () => void
}

export function PainelSucesso({ integracao, aoCadastrarOutra }: Props) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(integracao.webhookToken)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2000)
    } catch {
      // clipboard bloqueado (contexto não seguro): o token continua selecionável na tela.
      setCopiado(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-card animate-fade-in">
      <div className="flex items-start gap-4 border-b border-slate-100 px-6 py-6">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 ring-8 ring-emerald-50/60">
          <span className="h-5 w-5">
            <IconeCheck />
          </span>
        </span>
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-900">Integração cadastrada</h3>
          <p className="mt-1 text-sm text-slate-500">
            Vinculada a <span className="font-medium text-slate-800">{integracao.nomeCliente}</span> (#
            {integracao.codigoCliente}).
          </p>
        </div>
      </div>

      <div className="space-y-6 px-6 py-6">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-slate-200/70 ring-1 ring-slate-200/70 md:grid-cols-4">
          <Dado rotulo="Código da integração">
            <span className="font-mono text-[13px] font-medium text-slate-900">{integracao.codigoIntegracao}</span>
          </Dado>
          <Dado rotulo="Plataforma">
            <EtiquetaPlataforma nome={integracao.plataforma} />
          </Dado>
          <Dado rotulo="Slug">
            <span className="font-mono text-[13px] text-slate-900">{integracao.slug}</span>
          </Dado>
          <Dado rotulo="Situação">
            <EtiquetaSituacao situacao={integracao.ativo ? 'S' : 'N'} />
          </Dado>
        </dl>

        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-5">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 h-[18px] w-[18px] shrink-0 text-amber-600">
              <IconeChave />
            </span>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-amber-900">Token do webhook — copie agora</h4>
              <p className="mt-1 text-sm leading-relaxed text-amber-800">
                Esta é a única vez que ele aparece. Nenhum outro endpoint devolve este valor; perdido,
                só recadastrando a integração. É o que o n8n envia no header{' '}
                <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-xs text-amber-900">x-ct-token</code>.
              </p>

              <div className="escuro-fixo mt-4 flex items-stretch gap-2 rounded-lg bg-ink-900 p-1.5 pl-4 shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]">
                <code className="flex min-w-0 flex-1 items-center break-all py-1.5 font-mono text-xs text-brand-200">
                  {integracao.webhookToken}
                </code>
                <button
                  type="button"
                  onClick={copiar}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-all duration-150 active:scale-95 ${
                    copiado ? 'bg-emerald-500 text-white' : 'bg-white/10 text-white hover:bg-white/20'
                  }`}
                >
                  <span className="h-3.5 w-3.5">{copiado ? <IconeCheck /> : <IconeCopiar />}</span>
                  {copiado ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-end border-t border-slate-100 bg-slate-50/60 px-6 py-4">
        <Botao type="button" variante="secundario" onClick={aoCadastrarOutra}>
          <span className="h-4 w-4">
            <IconeMais />
          </span>
          Cadastrar outra integração
        </Botao>
      </div>
    </div>
  )
}

function Dado({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="bg-surface px-4 py-3.5">
      <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">{rotulo}</dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  )
}
