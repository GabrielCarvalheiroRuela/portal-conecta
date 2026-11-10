import { useState, type FormEvent } from 'react'
import { ApiError, apiDelete, apiPatch, apiPost } from '../../services/api'
import type {
  DadosCriacaoFuncionalidade,
  DadosEdicaoFuncionalidade,
  Funcionalidade,
  SituacaoFuncionalidade,
} from '../../types/funcionalidades'
import { Alerta } from '../ui/Alerta'
import { Botao } from '../ui/Botao'
import { Campo } from '../ui/Campo'
import { IconeLapis, IconeLixeira, IconeMais } from '../ui/Icones'
import { Modal } from '../ui/Modal'
import { Textarea } from '../ui/Textarea'

interface Props {
  /** Ausente = nova funcionalidade. Presente = editar (e excluir) a funcionalidade desta linha. */
  existente?: SituacaoFuncionalidade
  /** Módulos que já existem, para sugerir no campo (evita "Pedidos - Pagamento" e "Pedidos – Pagamento"). */
  modulos: string[]
  /** Quantas plataformas cadastradas perdem a situação desta funcionalidade se ela for excluída. */
  plataformasAfetadas: number
  aoFechar: () => void
  /** Chamado depois de criar, editar ou excluir, com a frase que a tela mostra ao admin. */
  aoConcluir: (mensagem: string) => void
}

interface Formulario {
  modulo: string
  nome: string
  descricao: string
  ordem: string
}

const ROTULOS: Record<keyof Formulario, string> = {
  modulo: 'módulo',
  nome: 'nome',
  descricao: 'descrição',
  ordem: 'ordem',
}

const CAMPOS = Object.keys(ROTULOS) as (keyof Formulario)[]

function formularioDe(item?: SituacaoFuncionalidade): Formulario {
  return {
    modulo: item?.modulo ?? '',
    nome: item?.nome ?? '',
    descricao: (item?.descricao ?? '').replace(/\r\n/g, '\n').trim(),
    ordem: item ? String(item.ordem) : '',
  }
}

/** Criar, editar e excluir uma funcionalidade da lista única (vale para todas as plataformas). Só admin. */
export function ModalFuncionalidade({ existente, modulos, plataformasAfetadas, aoFechar, aoConcluir }: Props) {
  const edicao = existente !== undefined
  const [original] = useState(() => formularioDe(existente))
  const [form, setForm] = useState<Formulario>(original)
  const [erros, setErros] = useState<Partial<Record<keyof Formulario, string>>>({})
  const [erroApi, setErroApi] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false)

  const alterados = CAMPOS.filter((campo) => form[campo].trim() !== original[campo].trim())
  const temAlteracao = alterados.length > 0

  function alterar(campo: keyof Formulario, valor: string) {
    setForm((atual) => ({ ...atual, [campo]: valor }))
    setErros((atuais) => ({ ...atuais, [campo]: undefined }))
    setErroApi(null)
  }

  function validar() {
    const encontrados: Partial<Record<keyof Formulario, string>> = {}
    if (!form.modulo.trim()) encontrados.modulo = 'Informe o módulo'
    if (!form.nome.trim()) encontrados.nome = 'Informe o nome'
    const ordem = form.ordem.trim()
    if (edicao && ordem === '') encontrados.ordem = 'Informe a ordem'
    else if (ordem !== '' && !/^\d+$/.test(ordem)) encontrados.ordem = 'Use um número inteiro, 0 ou maior'
    return encontrados
  }

  async function executar(acao: () => Promise<string>) {
    setEnviando(true)
    setErroApi(null)
    try {
      aoConcluir(await acao())
    } catch (e) {
      setErroApi(e instanceof ApiError ? e.message : 'Não foi possível concluir. Tente novamente.')
      setEnviando(false)
    }
  }

  async function salvar(evento: FormEvent) {
    evento.preventDefault()
    if (enviando || (edicao && !temAlteracao)) {
      return
    }
    const encontrados = validar()
    if (Object.keys(encontrados).length > 0) {
      setErros(encontrados)
      return
    }

    if (!existente) {
      const corpo: DadosCriacaoFuncionalidade = {
        modulo: form.modulo.trim(),
        nome: form.nome.trim(),
        ...(form.descricao.trim() && { descricao: form.descricao.trim() }),
        ...(form.ordem.trim() && { ordem: Number(form.ordem) }),
      }
      await executar(async () => {
        await apiPost<Funcionalidade>('/funcionalidades', corpo)
        return `Funcionalidade "${corpo.nome}" cadastrada. Ela entra como não implementada em todas as plataformas até alguém definir a situação.`
      })
      return
    }

    // Só o que mudou: o que ficar de fora o servidor preserva, e só vira histórico o que realmente mudou.
    const corpo: DadosEdicaoFuncionalidade = {}
    if (alterados.includes('modulo')) corpo.modulo = form.modulo.trim()
    if (alterados.includes('nome')) corpo.nome = form.nome.trim()
    if (alterados.includes('descricao')) corpo.descricao = form.descricao.trim()
    if (alterados.includes('ordem')) corpo.ordem = Number(form.ordem)
    await executar(async () => {
      await apiPatch<Funcionalidade>(`/funcionalidades/${existente.funcionalidadeId}`, corpo)
      return `Funcionalidade "${form.nome.trim()}" atualizada (${alterados.map((c) => ROTULOS[c]).join(', ')}).`
    })
  }

  async function excluir() {
    if (!existente || enviando) {
      return
    }
    await executar(async () => {
      await apiDelete(`/funcionalidades/${existente.funcionalidadeId}`)
      return `Funcionalidade "${existente.nome}" excluída de todas as plataformas.`
    })
  }

  const titulo = confirmandoExclusao ? 'Excluir funcionalidade?' : edicao ? 'Editar funcionalidade' : 'Nova funcionalidade'
  const Icone = confirmandoExclusao ? IconeLixeira : edicao ? IconeLapis : IconeMais

  return (
    <Modal idTitulo="tituloFuncionalidade" aoFechar={aoFechar} podeFechar={!enviando && !temAlteracao} larguraMax="max-w-xl">
      <header className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${
            confirmandoExclusao ? 'bg-red-50 text-red-600 ring-red-600/15' : 'bg-brand-50 text-brand-600 ring-brand-600/10'
          }`}
        >
          <span className="h-[18px] w-[18px]">
            <Icone />
          </span>
        </div>
        <div>
          <h2 id="tituloFuncionalidade" className="text-[15px] font-semibold tracking-tight text-slate-900">
            {titulo}
          </h2>
          <p className="text-[13px] text-slate-500">A lista é única e vale para todas as plataformas.</p>
        </div>
      </header>

      {confirmandoExclusao && existente ? (
        <>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <p className="text-sm leading-relaxed text-slate-600">
              <strong className="font-semibold text-slate-800">{existente.nome}</strong> ({existente.modulo}) sai da
              lista e a situação dela é apagada em{' '}
              <strong className="font-semibold text-slate-800">
                {plataformasAfetadas} {plataformasAfetadas === 1 ? 'plataforma' : 'plataformas'}
              </strong>
              . A cobertura de cada uma é recalculada.
            </p>
            <Alerta tom="aviso" titulo="Não dá para desfazer">
              O histórico guarda o nome e quem excluiu, mas os dados da situação (status, observação, workflow) se
              perdem.
            </Alerta>
            {erroApi && (
              <Alerta tom="erro" titulo="Não foi possível excluir">
                {erroApi}
              </Alerta>
            )}
          </div>
          <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
            <Botao type="button" variante="secundario" onClick={() => setConfirmandoExclusao(false)} disabled={enviando}>
              Voltar
            </Botao>
            <Botao
              type="button"
              onClick={excluir}
              disabled={enviando}
              className="!bg-red-600 !text-white hover:!bg-red-700 disabled:!bg-slate-300 dark:!bg-red-600 dark:hover:!bg-red-500"
            >
              <span className="h-4 w-4">
                <IconeLixeira />
              </span>
              {enviando ? 'Excluindo…' : 'Excluir definitivamente'}
            </Botao>
          </footer>
        </>
      ) : (
        <form onSubmit={salvar} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
            <Campo
              id="funModulo"
              label="Módulo"
              list="funModulos"
              value={form.modulo}
              onChange={(e) => alterar('modulo', e.target.value)}
              erro={erros.modulo}
              maxLength={80}
              disabled={enviando}
              autoComplete="off"
              autoFocus
            />
            <datalist id="funModulos">
              {modulos.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <Campo
              id="funNome"
              label="Nome curto"
              value={form.nome}
              onChange={(e) => alterar('nome', e.target.value)}
              erro={erros.nome}
              maxLength={120}
              disabled={enviando}
              autoComplete="off"
            />
            <Textarea
              id="funDescricao"
              label="Descrição"
              mono={false}
              rows={5}
              value={form.descricao}
              onChange={(e) => alterar('descricao', e.target.value)}
              ajuda="O que a funcionalidade faz e qual a regra, com calma."
              disabled={enviando}
            />
            <Campo
              id="funOrdem"
              label="Ordem"
              inputMode="numeric"
              value={form.ordem}
              onChange={(e) => alterar('ordem', e.target.value)}
              erro={erros.ordem}
              ajuda={
                edicao
                  ? 'Posição na lista inteira. Os módulos aparecem na ordem de quem vem primeiro.'
                  : 'Posição na lista inteira. Vazio: entra no fim.'
              }
              disabled={enviando}
              autoComplete="off"
            />

            {erroApi && (
              <Alerta tom="erro" titulo="Não foi possível salvar">
                {erroApi}
              </Alerta>
            )}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
            {edicao ? (
              <button
                type="button"
                onClick={() => setConfirmandoExclusao(true)}
                disabled={enviando}
                className="inline-flex h-10 items-center gap-2 rounded-lg px-3 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-red-500/20 disabled:cursor-not-allowed disabled:text-slate-400"
              >
                <span className="h-4 w-4">
                  <IconeLixeira />
                </span>
                Excluir
              </button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Botao type="button" variante="secundario" onClick={aoFechar} disabled={enviando}>
                Cancelar
              </Botao>
              <Botao type="submit" disabled={enviando || (edicao && !temAlteracao)}>
                {enviando ? 'Salvando…' : edicao ? 'Salvar alterações' : 'Cadastrar'}
              </Botao>
            </div>
          </footer>
        </form>
      )}
    </Modal>
  )
}
