import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ApiError } from '../services/api'
import {
  LIMITE_LISTA,
  SEM_FILTROS,
  baixarZip,
  listarInstancias,
  listarOpcoes,
  previa,
  temFiltro,
  type Filtros,
  type InstanciaN8n,
  type ItemWorkflow,
  type OpcaoFiltro,
  type Previa,
} from '../services/workflows'
import { Alerta } from './ui/Alerta'
import { Botao } from './ui/Botao'
import { Campo } from './ui/Campo'
import { IconeCheck, IconeMais, IconeX } from './ui/Icones'
import { Select } from './ui/Select'

/** Espera o usuário parar de digitar antes de consultar a prévia. */
const ATRASO_PREVIA_MS = 350

const CLASSE_ACAO_TEXTO =
  'text-[13px] font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline'

function mensagemDe(e: unknown, padrao: string) {
  return e instanceof ApiError ? e.message : padrao
}

function Painel({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-0 flex-col rounded-lg border border-slate-200/80">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
        <h4 className="text-sm font-medium text-slate-700">{titulo}</h4>
        {acao}
      </div>
      {children}
    </div>
  )
}

function Vazio({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center text-sm text-slate-400">{children}</p>
}

function BotaoLinha({
  rotulo,
  aoClicar,
  desabilitado,
  children,
}: {
  rotulo: string
  aoClicar: () => void
  desabilitado?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      onClick={aoClicar}
      disabled={desabilitado}
      className="h-6 w-6 shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 disabled:cursor-not-allowed disabled:text-emerald-500 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

/**
 * Escolhe a instância do n8n, filtra os workflows por cliente, base e/ou trecho do nome e monta a
 * lista final do que será exportado. Os nomes seguem Cliente_Base_Etapa (ex.: LAB_Mercos_Pedido_Captura),
 * então "base = Mercos" pega a Mercos de todos os clientes.
 *
 * Há duas listas: o resultado do filtro (que muda a cada busca) e a lista para exportar (que
 * acumula entre buscas). O ZIP leva exatamente a segunda, identificada por ID.
 */
export function ExportarWorkflows() {
  const [instancias, setInstancias] = useState<InstanciaN8n[]>([])
  const [instancia, setInstancia] = useState('')
  const [clientes, setClientes] = useState<OpcaoFiltro[]>([])
  const [bases, setBases] = useState<OpcaoFiltro[]>([])
  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTROS)
  const [resultado, setResultado] = useState<Previa | null>(null)
  const [escolhidos, setEscolhidos] = useState<ItemWorkflow[]>([])

  const [carregandoInstancias, setCarregandoInstancias] = useState(true)
  const [carregandoOpcoes, setCarregandoOpcoes] = useState(false)
  const [carregandoPrevia, setCarregandoPrevia] = useState(false)
  const [baixando, setBaixando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [baixado, setBaixado] = useState<string | null>(null)

  useEffect(() => {
    let cancelado = false
    listarInstancias()
      .then((lista) => {
        if (cancelado) {
          return
        }
        setInstancias(lista)
        // Com uma única instância não há o que escolher.
        if (lista.length === 1) {
          setInstancia(lista[0].id)
        }
      })
      .catch((e: unknown) => {
        if (!cancelado) {
          setErro(mensagemDe(e, 'Não foi possível carregar as instâncias.'))
        }
      })
      .finally(() => {
        if (!cancelado) {
          setCarregandoInstancias(false)
        }
      })
    return () => {
      cancelado = true
    }
  }, [])

  useEffect(() => {
    // Os IDs são de cada instância: trocar de instância zera filtros e lista.
    setFiltros(SEM_FILTROS)
    setClientes([])
    setBases([])
    setResultado(null)
    setEscolhidos([])
    setBaixado(null)
    if (!instancia) {
      return
    }

    let cancelado = false
    setErro(null)
    setCarregandoOpcoes(true)
    listarOpcoes(instancia)
      .then((opcoes) => {
        if (!cancelado) {
          setClientes(opcoes.clientes)
          setBases(opcoes.bases)
        }
      })
      .catch((e: unknown) => {
        if (!cancelado) {
          setErro(mensagemDe(e, 'Não foi possível carregar os filtros desta instância.'))
        }
      })
      .finally(() => {
        if (!cancelado) {
          setCarregandoOpcoes(false)
        }
      })
    return () => {
      cancelado = true
    }
  }, [instancia])

  // O resultado acompanha os filtros.
  useEffect(() => {
    setResultado(null)
    if (!instancia || !temFiltro(filtros)) {
      setCarregandoPrevia(false)
      return
    }

    let cancelado = false
    setCarregandoPrevia(true)
    const espera = setTimeout(() => {
      previa(instancia, filtros)
        .then((dados) => {
          if (!cancelado) {
            setResultado(dados)
          }
        })
        .catch((e: unknown) => {
          if (!cancelado) {
            setErro(mensagemDe(e, 'Não foi possível consultar os workflows.'))
          }
        })
        .finally(() => {
          if (!cancelado) {
            setCarregandoPrevia(false)
          }
        })
    }, ATRASO_PREVIA_MS)

    return () => {
      cancelado = true
      clearTimeout(espera)
    }
  }, [instancia, filtros])

  const idsEscolhidos = useMemo(() => new Set(escolhidos.map((w) => w.id)), [escolhidos])
  const aAdicionar = resultado?.workflows.filter((w) => !idsEscolhidos.has(w.id)) ?? []
  const cheia = escolhidos.length >= LIMITE_LISTA
  const total = resultado?.total ?? 0

  function alterar(campo: keyof Filtros, valor: string) {
    setErro(null)
    setBaixado(null)
    setFiltros((atual) => ({ ...atual, [campo]: valor }))
  }

  function ordenar(lista: ItemWorkflow[]) {
    return [...lista].sort((a, b) => a.nome.localeCompare(b.nome))
  }

  function adicionar(itens: ItemWorkflow[]) {
    setBaixado(null)
    setEscolhidos((atual) => {
      const ja = new Set(atual.map((w) => w.id))
      const novos = itens.filter((w) => !ja.has(w.id))
      return ordenar([...atual, ...novos].slice(0, LIMITE_LISTA))
    })
  }

  function remover(id: string) {
    setBaixado(null)
    setEscolhidos((atual) => atual.filter((w) => w.id !== id))
  }

  async function baixar() {
    if (!instancia || escolhidos.length === 0) {
      return
    }
    setErro(null)
    setBaixado(null)
    setBaixando(true)
    try {
      const { blob, nomeArquivo } = await baixarZip(
        instancia,
        escolhidos.map((w) => w.id),
      )
      const nome = nomeArquivo ?? `workflows_${instancia}.zip`
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = nome
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      setBaixado(nome)
    } catch (e) {
      setErro(mensagemDe(e, 'Não foi possível gerar o ZIP.'))
    } finally {
      setBaixando(false)
    }
  }

  const ocupado = carregandoOpcoes || baixando

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-card">
      <div className="space-y-6 px-6 py-6">
        <Select
          id="instancia"
          label="Instância do n8n"
          value={instancia}
          disabled={carregandoInstancias || baixando}
          onChange={(e) => setInstancia(e.target.value)}
        >
          <option value="">{carregandoInstancias ? 'Carregando…' : 'Selecione'}</option>
          {instancias.map((i) => (
            <option key={i.id} value={i.id}>
              {i.nome}
            </option>
          ))}
        </Select>

        <div className="grid gap-4 sm:grid-cols-3">
          <Select
            id="filtro-cliente"
            label="Cliente"
            value={filtros.cliente}
            disabled={!instancia || ocupado}
            onChange={(e) => alterar('cliente', e.target.value)}
          >
            <option value="">{carregandoOpcoes ? 'Carregando…' : 'Todos os clientes'}</option>
            {clientes.map((c) => (
              <option key={c.nome} value={c.nome}>
                {c.nome} ({c.total})
              </option>
            ))}
          </Select>

          <Select
            id="filtro-base"
            label="Base"
            value={filtros.base}
            disabled={!instancia || ocupado}
            onChange={(e) => alterar('base', e.target.value)}
          >
            <option value="">{carregandoOpcoes ? 'Carregando…' : 'Todas as bases'}</option>
            {bases.map((b) => (
              <option key={b.nome} value={b.nome}>
                {b.nome} ({b.total})
              </option>
            ))}
          </Select>

          <Campo
            id="filtro-busca"
            label="O nome contém"
            placeholder="ex.: pedido"
            value={filtros.busca}
            disabled={!instancia || ocupado}
            onChange={(e) => alterar('busca', e.target.value)}
          />
        </div>

        <p className="text-sm text-slate-500">
          Os nomes seguem <code>Cliente_Base_Etapa</code>: em <code>LAB_Mercos_Pedido_Captura</code>, o cliente é{' '}
          <code>LAB</code> e a base é <code>Mercos</code>. Os filtros se combinam; para pegar a Mercos de todos
          os clientes, escolha só a base. Workflows arquivados não entram.
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          <Painel
            titulo={
              !instancia || !temFiltro(filtros)
                ? 'Resultado do filtro'
                : carregandoPrevia
                  ? 'Resultado do filtro: buscando…'
                  : `Resultado do filtro (${total})`
            }
            acao={
              <button
                type="button"
                className={CLASSE_ACAO_TEXTO}
                disabled={aAdicionar.length === 0 || cheia || baixando}
                onClick={() => adicionar(aAdicionar)}
              >
                Adicionar todos{aAdicionar.length > 0 ? ` (${aAdicionar.length})` : ''}
              </button>
            }
          >
            {!instancia ? (
              <Vazio>Escolha a instância.</Vazio>
            ) : !temFiltro(filtros) ? (
              <Vazio>Escolha ao menos um filtro para listar workflows.</Vazio>
            ) : resultado && resultado.workflows.length === 0 ? (
              <Vazio>Nenhum workflow neste filtro.</Vazio>
            ) : (
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm text-slate-600">
                {resultado?.workflows.map((w) => {
                  const jaAdicionado = idsEscolhidos.has(w.id)
                  return (
                    <li key={w.id} className="flex items-center justify-between gap-2 px-4 py-1.5">
                      <span className="min-w-0 truncate" title={w.nome}>
                        {w.nome}
                      </span>
                      <BotaoLinha
                        rotulo={jaAdicionado ? `${w.nome} já está na lista` : `Adicionar ${w.nome}`}
                        aoClicar={() => adicionar([w])}
                        desabilitado={jaAdicionado || cheia || baixando}
                      >
                        {jaAdicionado ? <IconeCheck /> : <IconeMais />}
                      </BotaoLinha>
                    </li>
                  )
                })}
                {resultado && total > resultado.workflows.length && (
                  <li className="px-4 py-1.5 text-slate-400">
                    …e mais {total - resultado.workflows.length}. Refine o filtro para ver o restante.
                  </li>
                )}
              </ul>
            )}
          </Painel>

          <Painel
            titulo={`Para exportar (${escolhidos.length})`}
            acao={
              <button
                type="button"
                className={CLASSE_ACAO_TEXTO}
                disabled={escolhidos.length === 0 || baixando}
                onClick={() => setEscolhidos([])}
              >
                Limpar lista
              </button>
            }
          >
            {escolhidos.length === 0 ? (
              <Vazio>Adicione workflows do resultado do filtro. A lista se mantém ao trocar de filtro.</Vazio>
            ) : (
              <ul className="max-h-72 divide-y divide-slate-100 overflow-y-auto text-sm text-slate-600">
                {escolhidos.map((w) => (
                  <li key={w.id} className="flex items-center justify-between gap-2 px-4 py-1.5">
                    <span className="min-w-0 truncate" title={w.nome}>
                      {w.nome}
                    </span>
                    <BotaoLinha rotulo={`Remover ${w.nome}`} aoClicar={() => remover(w.id)} desabilitado={baixando}>
                      <IconeX />
                    </BotaoLinha>
                  </li>
                ))}
              </ul>
            )}
          </Painel>
        </div>

        {cheia && (
          <Alerta tom="aviso">
            A lista chegou ao limite de {LIMITE_LISTA} workflows por ZIP. Baixe este e monte outro para o restante.
          </Alerta>
        )}

        <Alerta tom="aviso" titulo="Cuidado com o arquivo baixado">
          Os JSONs podem conter senhas e tokens em texto puro dentro dos nodes. Guarde o ZIP com cuidado: cada
          exportação fica registrada com o seu e-mail e os nomes dos workflows exportados.
        </Alerta>

        {erro && <Alerta tom="erro">{erro}</Alerta>}
        {baixado && (
          <Alerta tom="sucesso" titulo="ZIP gerado">
            {baixado}
          </Alerta>
        )}

        <div>
          <Botao type="button" onClick={baixar} disabled={escolhidos.length === 0 || baixando}>
            {baixando ? 'Gerando ZIP…' : `Baixar ZIP${escolhidos.length > 0 ? ` (${escolhidos.length})` : ''}`}
          </Botao>
        </div>
      </div>
    </div>
  )
}
