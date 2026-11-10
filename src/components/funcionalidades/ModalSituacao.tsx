import { useMemo, useState, type FormEvent } from 'react'
import { ApiError, apiPut } from '../../services/api'
import type {
  DadosSituacao,
  Prioridade,
  SituacaoFuncionalidade,
  StatusFuncionalidade,
  StatusTeste,
} from '../../types/funcionalidades'
import { Alerta } from '../ui/Alerta'
import { Botao } from '../ui/Botao'
import { Campo } from '../ui/Campo'
import { IconeEngrenagem } from '../ui/Icones'
import { Modal } from '../ui/Modal'
import { Select } from '../ui/Select'
import { Textarea } from '../ui/Textarea'
import { formatarData, PRIORIDADES, ROTULO_PRIORIDADE, ROTULO_STATUS, ROTULO_TESTE, STATUS, TESTES } from './Etiquetas'

interface Props {
  /** A linha da lista: a funcionalidade na plataforma escolhida. */
  item: SituacaoFuncionalidade
  aoFechar: () => void
  /** Chamado depois do PUT, com os rótulos dos campos que mudaram. */
  aoSalvar: (camposAlterados: string[]) => void
}

interface Formulario {
  status: StatusFuncionalidade
  teste: StatusTeste
  observacao: string
  configuracaoErp: string
  workflow: string
  responsavel: string
  prioridade: Prioridade | ''
  previsao: string
  requisitoAltera: string
}

const ROTULOS: Record<keyof Formulario, string> = {
  status: 'status',
  teste: 'teste',
  observacao: 'observação',
  configuracaoErp: 'configuração (ERP)',
  workflow: 'workflow',
  responsavel: 'responsável',
  prioridade: 'prioridade',
  previsao: 'previsão',
  requisitoAltera: 'requisito Altera',
}

const CAMPOS = Object.keys(ROTULOS) as (keyof Formulario)[]

/** O textarea entrega quebras de linha como \n mesmo que o banco tenha \r\n; as pontas o servidor apara. */
function normalizado(valor: string): string {
  return valor.replace(/\r\n/g, '\n').trim()
}

function formularioDe(item: SituacaoFuncionalidade): Formulario {
  return {
    status: item.status,
    teste: item.teste,
    observacao: normalizado(item.observacao ?? ''),
    configuracaoErp: normalizado(item.configuracaoErp ?? ''),
    workflow: normalizado(item.workflow ?? ''),
    responsavel: normalizado(item.responsavel ?? ''),
    prioridade: item.prioridade ?? '',
    previsao: item.previsao ?? '',
    requisitoAltera: normalizado(item.requisitoAltera ?? ''),
  }
}

/** Texto vazio vai como nulo: o PUT substitui tudo, e nulo é o campo limpo. */
const ouNulo = (valor: string) => (normalizado(valor) === '' ? null : normalizado(valor))

/**
 * Popup da situação de uma funcionalidade numa plataforma, aberto pela engrenagem da linha. Só admin chega aqui: o
 * botão some para os demais e a API responde 403 a quem tentar pelo Swagger.
 *
 * O PUT substitui a situação inteira, então o formulário leva todos os campos. O carimbo do teste (quando e quem) é
 * do servidor: não há campo para digitar.
 */
export function ModalSituacao({ item, aoFechar, aoSalvar }: Props) {
  const original = useMemo(() => formularioDe(item), [item])
  const [form, setForm] = useState<Formulario>(original)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const alterados = CAMPOS.filter((campo) => form[campo] !== original[campo])
  const temAlteracao = alterados.length > 0
  const testeMudou = form.teste !== original.teste && form.teste !== 'NAO_TESTADO'

  function alterar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }))
    setErro(null)
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    if (!temAlteracao || enviando) {
      return
    }

    const corpo: DadosSituacao = {
      status: form.status,
      teste: form.teste,
      observacao: ouNulo(form.observacao),
      configuracaoErp: ouNulo(form.configuracaoErp),
      workflow: ouNulo(form.workflow),
      responsavel: ouNulo(form.responsavel),
      prioridade: form.prioridade || null,
      previsao: form.previsao || null,
      requisitoAltera: ouNulo(form.requisitoAltera),
    }

    setEnviando(true)
    setErro(null)
    try {
      await apiPut(`/funcionalidades/${item.funcionalidadeId}/plataformas/${encodeURIComponent(item.plataforma)}`, corpo)
      aoSalvar(alterados.map((campo) => ROTULOS[campo]))
    } catch (e) {
      setErro(e instanceof ApiError ? e.message : 'Não foi possível salvar. Tente novamente.')
      setEnviando(false)
    }
  }

  return (
    <Modal idTitulo="tituloSituacao" aoFechar={aoFechar} podeFechar={!enviando && !temAlteracao} larguraMax="max-w-2xl">
      <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10">
          <span className="h-[18px] w-[18px]">
            <IconeEngrenagem />
          </span>
        </div>
        <div className="min-w-0">
          <h2 id="tituloSituacao" className="truncate text-[15px] font-semibold tracking-tight text-slate-900">
            {item.nome}
          </h2>
          <p className="text-[13px] text-slate-500">
            {item.modulo} · {item.plataformaNome}
          </p>
        </div>
      </header>

      <form onSubmit={salvar} noValidate className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {item.descricao && <p className="text-[13px] leading-relaxed text-slate-500">{item.descricao}</p>}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              id="sitStatus"
              label="Status"
              value={form.status}
              onChange={(e) => alterar('status', e.target.value as StatusFuncionalidade)}
              disabled={enviando}
            >
              {STATUS.map((s) => (
                <option key={s} value={s}>
                  {ROTULO_STATUS[s]}
                </option>
              ))}
            </Select>
            <Select
              id="sitTeste"
              label="Teste"
              value={form.teste}
              onChange={(e) => alterar('teste', e.target.value as StatusTeste)}
              disabled={enviando}
              ajuda={
                testeMudou
                  ? 'Será registrado em seu nome, com a data de hoje.'
                  : item.teste !== 'NAO_TESTADO' && item.testadoEm
                    ? `Registrado por ${item.testadoPor ?? 'não informado'} em ${formatarData(item.testadoEm)}.`
                    : undefined
              }
            >
              {TESTES.map((t) => (
                <option key={t} value={t}>
                  {ROTULO_TESTE[t]}
                </option>
              ))}
            </Select>
          </div>

          <Textarea
            id="sitObservacao"
            label="Observação / regra desta plataforma"
            mono={false}
            rows={4}
            value={form.observacao}
            onChange={(e) => alterar('observacao', e.target.value)}
            disabled={enviando}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo
              id="sitConfig"
              label="Configuração (ERP)"
              value={form.configuracaoErp}
              onChange={(e) => alterar('configuracaoErp', e.target.value)}
              ajuda="Parâmetros do ERP envolvidos, ex.: CFG_CONKEY."
              disabled={enviando}
              autoComplete="off"
              spellCheck={false}
            />
            <Campo
              id="sitRequisito"
              label="Requisito no Altera"
              value={form.requisitoAltera}
              onChange={(e) => alterar('requisitoAltera', e.target.value)}
              maxLength={20}
              disabled={enviando}
              autoComplete="off"
            />
          </div>

          <Textarea
            id="sitWorkflow"
            label="Workflow"
            rows={2}
            value={form.workflow}
            onChange={(e) => alterar('workflow', e.target.value)}
            ajuda="Workflow(s) do n8n que implementam."
            disabled={enviando}
            spellCheck={false}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Campo
              id="sitResponsavel"
              label="Responsável"
              value={form.responsavel}
              onChange={(e) => alterar('responsavel', e.target.value)}
              disabled={enviando}
              autoComplete="off"
            />
            <Select
              id="sitPrioridade"
              label="Prioridade"
              value={form.prioridade}
              onChange={(e) => alterar('prioridade', e.target.value as Prioridade | '')}
              disabled={enviando}
            >
              <option value="">Sem prioridade</option>
              {PRIORIDADES.map((p) => (
                <option key={p} value={p}>
                  {ROTULO_PRIORIDADE[p]}
                </option>
              ))}
            </Select>
            <Campo
              id="sitPrevisao"
              label="Previsão de entrega"
              type="date"
              value={form.previsao}
              onChange={(e) => alterar('previsao', e.target.value)}
              disabled={enviando}
            />
          </div>

          {item.alteradoPor && (
            <p className="text-[12px] text-slate-400">
              Última alteração por {item.alteradoPor}
              {item.alteradoEm ? ` em ${formatarData(item.alteradoEm)}` : ''}.
            </p>
          )}
        </div>

        {erro && (
          <div className="border-t border-slate-100 px-5 py-3">
            <Alerta tom="erro" titulo="Não foi possível salvar">
              {erro}
            </Alerta>
          </div>
        )}

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
          <p className="text-[13px] text-slate-500" aria-live="polite">
            {temAlteracao ? `Vai alterar: ${alterados.map((c) => ROTULOS[c]).join(', ')}.` : 'Nenhuma alteração ainda.'}
          </p>
          <div className="flex gap-2">
            <Botao type="button" variante="secundario" onClick={aoFechar} disabled={enviando}>
              Cancelar
            </Botao>
            <Botao type="submit" disabled={!temAlteracao || enviando}>
              {enviando ? 'Salvando…' : 'Salvar alterações'}
            </Botao>
          </div>
        </footer>
      </form>
    </Modal>
  )
}
