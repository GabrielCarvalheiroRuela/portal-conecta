import { useState } from 'react'
import type { ProgressoImportacao, ResultadoImportacao } from '../importacao/executor'
import type { Plano } from '../importacao/plano'
import { Alerta } from './ui/Alerta'
import { Botao } from './ui/Botao'
import { Modal } from './ui/Modal'

interface Props {
  plano: Plano
  instanciaNome: string
  /** Onde a importação vai ficar, em texto ("Dev / Mercos"); vazio é a raiz do projeto. */
  destinoTexto: string
  /** Falta escolher algo (origem, instância...) ou o destino ainda está carregando. */
  bloqueio: string | null
  executando: boolean
  progresso: ProgressoImportacao | null
  resultado: ResultadoImportacao | null
  aoImportar: () => void
  aoCancelar: () => void
  aoRecomecar: () => void
  aoBaixarRelatorio: () => void
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
const tamanho = (bytes: number) => (bytes < 1048576 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1048576).toFixed(1)} MB`)

function Lista({ itens, vazio, max = 8 }: { itens: string[]; vazio?: string; max?: number }) {
  if (itens.length === 0) {
    return vazio ? <p className="text-[13px] text-slate-400">{vazio}</p> : null
  }
  return (
    <ul className="space-y-0.5 text-[13px] text-slate-600">
      {itens.slice(0, max).map((i) => (
        <li key={i} className="break-words">
          {i}
        </li>
      ))}
      {itens.length > max && <li className="text-slate-400">…e mais {itens.length - max}</li>}
    </ul>
  )
}

export function ResumoImportacao({
  plano,
  instanciaNome,
  destinoTexto,
  bloqueio,
  executando,
  progresso,
  resultado,
  aoImportar,
  aoCancelar,
  aoRecomecar,
  aoBaixarRelatorio,
}: Props) {
  const [confirmando, setConfirmando] = useState(false)
  const destino = destinoTexto || 'a raiz do projeto'

  // ---- andamento
  if (executando) {
    const pct = progresso && progresso.total > 0 ? Math.round((progresso.feitos / progresso.total) * 100) : 0
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-slate-800">{progresso?.texto ?? 'Preparando…'}</p>
        <div className="h-2 overflow-hidden rounded-full bg-slate-200/70" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-brand-500 transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-[13px] text-slate-500">Não feche esta aba até terminar. O que já foi criado fica na instância, mesmo se você cancelar.</p>
        <Botao type="button" variante="secundario" onClick={aoCancelar}>
          Cancelar
        </Botao>
      </div>
    )
  }

  // ---- resultado
  if (resultado) {
    const problemas = resultado.falhas.length + resultado.pastasComFalha.length + resultado.referenciasComFalha.length
    return (
      <div className="space-y-3">
        <Alerta tom={problemas > 0 || resultado.cancelado ? 'aviso' : 'sucesso'} titulo={resultado.cancelado ? 'Importação cancelada' : problemas > 0 ? 'Importação concluída com problemas' : 'Importação concluída'}>
          {plural(resultado.criados.length, 'workflow criado', 'workflows criados')} e {plural(resultado.pastasCriadas, 'pasta criada', 'pastas criadas')} em {instanciaNome}.
          {resultado.pulados.length > 0 && ` ${plural(resultado.pulados.length, 'foi pulado', 'foram pulados')} por já existirem.`}
          {resultado.referenciasAtualizadas > 0 && ` ${plural(resultado.referenciasAtualizadas, 'workflow teve', 'workflows tiveram')} as chamadas a outros workflows ligadas aos IDs novos.`}
        </Alerta>
        <p className="text-[13px] text-slate-500">Os workflows entram <strong>inativos</strong>. Abra cada um, escolha as credenciais certas e só então ative.</p>

        {resultado.falhas.length > 0 && (
          <div>
            <p className="text-[13px] font-semibold text-red-600">{plural(resultado.falhas.length, 'workflow não foi criado', 'workflows não foram criados')}</p>
            <Lista itens={resultado.falhas.map((f) => `${f.nome}: ${f.erro}`)} max={10} />
          </div>
        )}
        {resultado.pastasComFalha.length > 0 && (
          <div>
            <p className="text-[13px] font-semibold text-red-600">{plural(resultado.pastasComFalha.length, 'pasta não foi criada', 'pastas não foram criadas')}</p>
            <Lista itens={resultado.pastasComFalha.map((f) => `${f.chave}: ${f.erro}`)} max={10} />
          </div>
        )}
        {resultado.referenciasComFalha.length > 0 && (
          <div>
            <p className="text-[13px] font-semibold text-amber-700">{plural(resultado.referenciasComFalha.length, 'workflow criado, mas sem as chamadas ligadas', 'workflows criados, mas sem as chamadas ligadas')}</p>
            <Lista itens={resultado.referenciasComFalha.map((f) => `${f.nome}: ${f.erro}`)} max={10} />
          </div>
        )}
        {problemas > 0 && (
          <p className="text-[13px] text-slate-500">Para tentar de novo só o que faltou, importe a mesma seleção com “pular os que já existem”: o que já foi criado não se repete.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Botao type="button" onClick={aoRecomecar}>
            Nova importação
          </Botao>
          <Botao type="button" variante="secundario" onClick={aoBaixarRelatorio}>
            Baixar relatório
          </Botao>
        </div>
      </div>
    )
  }

  // ---- plano
  const { criar, pular, bytes } = plano.resumo
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-800">
          {criar === 0 ? 'Nada a criar.' : `${plural(criar, 'workflow será criado', 'workflows serão criados')} e ${plural(plano.pastas.length, 'pasta nova', 'pastas novas')}.`}
        </p>
        <p className="text-[13px] text-slate-500">
          {pular > 0 && `${plural(pular, 'será pulado', 'serão pulados')} por já existirem · `}
          {plano.pastasExistentes > 0 && `${plural(plano.pastasExistentes, 'pasta já existe e será reaproveitada', 'pastas já existem e serão reaproveitadas')} · `}
          {criar > 0 && tamanho(bytes)}
        </p>
      </div>

      {plano.pastas.length > 0 && (
        <details className="text-[13px] text-slate-600">
          <summary className="cursor-pointer select-none font-medium text-slate-700 hover:text-slate-900">Pastas que serão criadas</summary>
          <div className="mt-1.5">
            <Lista itens={plano.pastas.map((p) => p.chave)} max={20} />
          </div>
        </details>
      )}

      {plano.avisos.map((a) => (
        <details key={a.tipo} className="text-[13px]">
          <summary className="cursor-pointer select-none text-amber-700 hover:text-amber-800">{a.texto}</summary>
          <div className="mt-1.5">
            <Lista itens={a.exemplos} />
          </div>
        </details>
      ))}

      {bloqueio && <p className="text-[13px] text-slate-500">{bloqueio}</p>}
      <p className="text-[13px] text-slate-500">
        Vai para <strong className="font-semibold text-slate-700">{instanciaNome || 'a instância escolhida'}</strong>, em{' '}
        <strong className="font-semibold text-slate-700">{destinoTexto || 'raiz do projeto'}</strong>.
      </p>
      <Botao type="button" disabled={Boolean(bloqueio) || criar === 0} onClick={() => setConfirmando(true)}>
        {criar === 0 ? 'Importar' : `Importar ${plural(criar, 'workflow', 'workflows')}`}
      </Botao>

      {confirmando && (
        <Modal idTitulo="titulo-confirmar-importacao" aoFechar={() => setConfirmando(false)} larguraMax="max-w-lg">
          <div className="space-y-4 p-6">
            <h3 id="titulo-confirmar-importacao" className="text-lg font-semibold text-slate-900">
              Importar para {instanciaNome}?
            </h3>
            <p className="text-sm text-slate-600">
              Vão ser criados <strong>{plural(criar, 'workflow', 'workflows')}</strong> e <strong>{plural(plano.pastas.length, 'pasta', 'pastas')}</strong> em{' '}
              <strong>{instanciaNome}</strong>, dentro de <strong>{destino}</strong>.
            </p>
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-slate-600">
              <li>Nada que já existe é alterado ou apagado.</li>
              <li>Os workflows entram inativos e as credenciais precisam ser escolhidas depois.</li>
              <li>A importação fica registrada com o seu e-mail.</li>
            </ul>
            <div className="flex justify-end gap-2">
              <Botao type="button" variante="secundario" onClick={() => setConfirmando(false)}>
                Voltar
              </Botao>
              <Botao
                type="button"
                onClick={() => {
                  setConfirmando(false)
                  aoImportar()
                }}
              >
                Importar agora
              </Botao>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
