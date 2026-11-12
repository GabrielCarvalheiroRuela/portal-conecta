import { useState } from 'react'
import type { ProgressoImportacao, ResultadoImportacao } from '../importacao/executor'
import type { Plano, PoliticaConflito, ReferenciaPlano } from '../importacao/plano'
import { Alerta } from './ui/Alerta'
import { Botao } from './ui/Botao'
import { Modal } from './ui/Modal'

interface Props {
  plano: Plano
  /** O que fazer com workflow que já existe: serve para explicar quando nada foi achado para substituir. */
  politica: PoliticaConflito
  /** Publicar de novo os substituídos que já estavam publicados. */
  republicar: boolean
  aoEscolher: (idOrigem: string, idDestino: string) => void
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

const COMO_RESOLVEU: Record<ReferenciaPlano['como'], string> = {
  unica: 'o único com esse nome no destino',
  'mesma-pasta': 'na mesma pasta de quem chama',
  proxima: 'na pasta mais próxima de quem chama',
  escolhida: 'escolhido por você',
  ambigua: 'há mais de um com esse nome: escolha',
  deixada: 'a chamada fica como está',
  'nao-encontrada': 'não achado no destino: a chamada fica como está',
}

/** Chamadas a workflows que não vão na importação, e para qual workflow do destino cada uma será apontada. */
function ListaChamadas({ referencias, desabilitado, aoEscolher }: { referencias: ReferenciaPlano[]; desabilitado: boolean; aoEscolher: (idOrigem: string, idDestino: string) => void }) {
  const precisam = referencias.filter((r) => r.como === 'ambigua').length
  return (
    <details className="text-[13px]" open={precisam > 0}>
      <summary className={`cursor-pointer select-none font-medium hover:text-slate-900 ${precisam > 0 ? 'text-amber-700' : 'text-slate-700'}`}>
        Chamadas a outros workflows ({referencias.length}){precisam > 0 ? ` · ${precisam} para escolher` : ''}
      </summary>
      <ul className="mt-1.5 space-y-2">
        {referencias.map((r) => {
          const atual = r.candidatos.find((c) => c.id === r.destinoId)
          return (
            <li key={r.idOrigem} className="break-words rounded-lg border border-slate-100 px-2.5 py-2">
              <p className="text-slate-700">
                <span className="text-slate-500">{r.chamadores.slice(0, 3).join(', ')}{r.chamadores.length > 3 ? `… +${r.chamadores.length - 3}` : ''} →</span>{' '}
                <strong className="font-semibold">{r.nome ?? r.idOrigem}</strong>
              </p>
              <p className={`text-[12px] ${r.como === 'ambigua' || r.como === 'nao-encontrada' ? 'text-amber-700' : 'text-slate-500'}`}>
                {COMO_RESOLVEU[r.como]}
                {atual && atual.caminho ? ` · ${atual.caminho}` : ''}
              </p>
              {r.candidatos.length > 1 && (
                <select
                  aria-label={`Qual ${r.nome ?? 'workflow'} usar no destino`}
                  value={r.destinoId ?? ''}
                  disabled={desabilitado}
                  onChange={(ev) => aoEscolher(r.idOrigem, ev.target.value)}
                  className="mt-1 block h-8 w-full rounded-lg border-slate-200 bg-surface text-[13px] text-slate-900 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
                >
                  <option value="">Deixar como está</option>
                  {r.candidatos.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.caminho || 'raiz do projeto'} ({c.id})
                    </option>
                  ))}
                </select>
              )}
            </li>
          )
        })}
      </ul>
    </details>
  )
}

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
  politica,
  republicar,
  aoEscolher,
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
          {resultado.substituidos.length > 0 && ` ${plural(resultado.substituidos.length, 'foi substituído', 'foram substituídos')}, mantendo o ID.`}
          {resultado.publicados.length > 0 && ` ${plural(resultado.publicados.length, 'foi publicado de novo', 'foram publicados de novo')}.`}
          {resultado.referenciasAtualizadas > 0 && ` ${plural(resultado.referenciasAtualizadas, 'workflow teve', 'workflows tiveram')} as chamadas a outros workflows ligadas aos IDs novos.`}
        </Alerta>
        <p className="text-[13px] text-slate-500">
          {resultado.criados.length > 0 && (
            <>
              Os workflows criados entram <strong>inativos</strong>. Abra cada um, escolha as credenciais certas e só então publique (os sub-workflows antes de quem chama).{' '}
            </>
          )}
          {resultado.substituidos.length > 0 &&
            (resultado.credenciaisMantidas > 0
              ? `Nos substituídos, ${plural(resultado.credenciaisMantidas, 'credencial voltou', 'credenciais voltaram')} a ser a que o destino já usava; confira só os nodes que não existiam antes.`
              : 'Nos substituídos, confira as credenciais dos nodes que não existiam antes.')}
        </p>
        {resultado.avisos.length > 0 && (
          <div>
            <p className="text-[13px] font-semibold text-amber-700">Atenção</p>
            <Lista itens={resultado.avisos} max={10} />
          </div>
        )}

        {resultado.falhas.length > 0 && (
          <div>
            <p className="text-[13px] font-semibold text-red-600">{plural(resultado.falhas.length, 'workflow não foi importado', 'workflows não foram importados')}</p>
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
        {resultado.chamadasQuebradas.length > 0 && (
          <div>
            <p className="text-[13px] font-semibold text-amber-700">
              {plural(resultado.chamadasQuebradas.length, 'chamada aponta para um workflow que não existe no destino', 'chamadas apontam para workflows que não existem no destino')}
            </p>
            <Lista itens={resultado.chamadasQuebradas.map((c) => `${c.nome} → ${c.chamado ?? c.id}`)} max={10} />
          </div>
        )}
        {resultado.publicacaoComFalha.length > 0 && (
          <div>
            <p className="text-[13px] font-semibold text-amber-700">
              {plural(resultado.publicacaoComFalha.length, 'workflow substituído não foi publicado de novo', 'workflows substituídos não foram publicados de novo')}
            </p>
            <Lista itens={resultado.publicacaoComFalha.map((f) => `${f.nome}: ${f.erro}`)} max={10} />
            <p className="text-[13px] text-slate-500">Eles continuam com a versão publicada antiga. Se o motivo for um sub-workflow inativo, publique-o no n8n e depois este.</p>
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
  const { criar, pular, substituir, bytes } = plano.resumo
  const total = criar + substituir
  const partes = [
    criar > 0 ? plural(criar, 'workflow será criado', 'workflows serão criados') : null,
    substituir > 0 ? plural(substituir, 'workflow será substituído', 'workflows serão substituídos') : null,
    plano.pastas.length > 0 ? plural(plano.pastas.length, 'pasta nova', 'pastas novas') : null,
  ].filter(Boolean)
  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-slate-800">{partes.length > 0 ? `${partes.join(', ')}.` : 'Nada a importar.'}</p>
        <p className="text-[13px] text-slate-500">
          {pular > 0 && `${plural(pular, 'será pulado', 'serão pulados')} por já existirem · `}
          {plano.pastasExistentes > 0 && `${plural(plano.pastasExistentes, 'pasta já existe e será reaproveitada', 'pastas já existem e serão reaproveitadas')} · `}
          {total > 0 && tamanho(bytes)}
        </p>
      </div>

      {politica === 'substituir' && substituir === 0 && criar > 0 && (
        <p className="text-[13px] text-amber-700">
          Nenhum workflow com o mesmo nome foi achado em <strong>{destino}</strong>: nada será substituído, {plural(criar, 'o workflow será criado', 'os workflows serão criados')}. Para
          substituir, escolha como destino a pasta onde eles já estão (a que tem exatamente o mesmo nome e a mesma posição).
        </p>
      )}

      {plano.pastas.length > 0 && (
        <details className="text-[13px] text-slate-600">
          <summary className="cursor-pointer select-none font-medium text-slate-700 hover:text-slate-900">Pastas que serão criadas</summary>
          <div className="mt-1.5">
            <Lista itens={plano.pastas.map((p) => p.chave)} max={20} />
          </div>
        </details>
      )}

      {plano.referencias.length > 0 && <ListaChamadas referencias={plano.referencias} desabilitado={false} aoEscolher={aoEscolher} />}

      {plano.avisos.map((a) => (
        <details key={a.tipo} className="text-[13px]" open={a.tipo === 'id-em-outra-pasta'}>
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
      <Botao type="button" disabled={Boolean(bloqueio) || total === 0} onClick={() => setConfirmando(true)}>
        {total === 0 ? 'Importar' : `Importar ${plural(total, 'workflow', 'workflows')}`}
      </Botao>

      {confirmando && (
        <Modal idTitulo="titulo-confirmar-importacao" aoFechar={() => setConfirmando(false)} larguraMax="max-w-lg">
          <div className="space-y-4 p-6">
            <h3 id="titulo-confirmar-importacao" className="text-lg font-semibold text-slate-900">
              Importar para {instanciaNome}?
            </h3>
            <p className="text-sm text-slate-600">
              Vão ser enviados <strong>{plural(total, 'workflow', 'workflows')}</strong> e criadas <strong>{plural(plano.pastas.length, 'pasta', 'pastas')}</strong> em{' '}
              <strong>{instanciaNome}</strong>, dentro de <strong>{destino}</strong>.
            </p>
            {plano.avisos.some((a) => a.tipo === 'id-em-outra-pasta') && (
              <Alerta tom="aviso" titulo="Cópias de workflows que já existem">
                Alguns workflows do arquivo já existem em outra pasta do destino e vão virar cópias novas. Confira se o destino é o certo antes de seguir.
              </Alerta>
            )}
            {substituir > 0 && (
              <Alerta tom="aviso" titulo="Substituição de workflows existentes">
                {plural(substituir, 'workflow existente será sobrescrito', 'workflows existentes serão sobrescritos')} (o conteúdo atual é perdido). O ID é mantido.
              </Alerta>
            )}
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-slate-600">
              {substituir === 0 && <li>Nada que já existe é alterado ou apagado.</li>}
              {criar > 0 && <li>Os workflows criados entram inativos e as credenciais precisam ser escolhidas depois.</li>}
              {substituir > 0 && <li>Nos substituídos, as credenciais que o destino já usava são mantidas; só os nodes novos trazem as da origem.</li>}
              {substituir > 0 && republicar && <li>Os substituídos que já estavam publicados serão publicados de novo no fim, sub-workflows antes de quem chama.</li>}
              {substituir > 0 && !republicar && <li>Os substituídos continuam com a versão publicada antiga até alguém publicar de novo no n8n.</li>}
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