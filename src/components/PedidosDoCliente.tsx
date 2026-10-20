import { useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, apiGet } from '../services/api'
import type { PedidoDoCliente } from '../types/monitoramento'
import { ModalReprocessarPedido } from './ModalReprocessarPedido'
import { Alerta } from './ui/Alerta'
import { IconeCaixa, IconeLupa, IconeReciclar, IconeVoltar } from './ui/Icones'
import {
  BotaoAtualizar,
  BotaoLimpar,
  CampoBusca,
  Carregando,
  CartaoConsulta,
  Celula,
  Codigo,
  EstadoVazio,
  EtiquetaPlataforma,
  Linha,
  SelectFiltro,
  Tabela,
} from './ui/Tabela'

interface Props {
  nomeCliente: string
  codigoCliente: number
  aoVoltar: () => void
}

/** Status do PEN_STATUS, na ordem do fluxo de um pedido. */
const STATUS = [
  { codigo: 0, rotulo: 'Aguardando', ponto: 'bg-amber-500', etiqueta: 'bg-amber-50 text-amber-700 ring-amber-600/20', cartao: 'bg-amber-50 text-amber-600' },
  { codigo: 1, rotulo: 'Integrado', ponto: 'bg-sky-500', etiqueta: 'bg-sky-50 text-sky-700 ring-sky-600/20', cartao: 'bg-sky-50 text-sky-600' },
  { codigo: 2, rotulo: 'Erro', ponto: 'bg-red-500', etiqueta: 'bg-red-50 text-red-700 ring-red-600/20', cartao: 'bg-red-50 text-red-600' },
  { codigo: 3, rotulo: 'Finalizado', ponto: 'bg-emerald-500', etiqueta: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', cartao: 'bg-emerald-50 text-emerald-600' },
] as const

const POR_PAGINA = 50

function infoStatus(codigo: number) {
  return (
    STATUS.find((s) => s.codigo === codigo) ?? {
      codigo,
      rotulo: `Status ${codigo}`,
      ponto: 'bg-slate-400',
      etiqueta: 'bg-slate-100 text-slate-600 ring-slate-500/20',
      cartao: 'bg-slate-100 text-slate-500',
    }
  )
}

function formatarDataHora(valor?: string | null): { data: string; hora: string } | null {
  if (!valor) {
    return null
  }
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) {
    return { data: valor, hora: '' }
  }
  return {
    data: d.toLocaleDateString('pt-BR'),
    hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  }
}

/**
 * Todos os pedidos de um lojista, em qualquer status, via GET /pedidos?cliente=.
 *
 * A API compara o cliente pelo nome exato (PEN_NOMCLI), sem diferenciar maiúsculas. Pedidos
 * gravados com outro nome — ex.: "NAUTICA TINTAS 007" para o lojista "NAUTICA TINTAS" — não
 * aparecem aqui.
 */
export function PedidosDoCliente({ nomeCliente, codigoCliente, aoVoltar }: Props) {
  const [pedidos, setPedidos] = useState<PedidoDoCliente[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [status, setStatus] = useState<number | null>(null)
  const [busca, setBusca] = useState('')
  const [plataforma, setPlataforma] = useState('')
  const [pagina, setPagina] = useState(1)

  /** Pedido cujo popup de reprocessamento está aberto. */
  const [emReprocesso, setEmReprocesso] = useState<PedidoDoCliente | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // O botão é de todo usuário interno (admin ou comum); a API responde 409 se o pedido não estiver com erro.

  const carregar = useCallback(() => {
    setCarregando(true)
    setErro(null)
    return apiGet<PedidoDoCliente[]>(`/pedidos?cliente=${encodeURIComponent(nomeCliente)}`)
      .then(setPedidos)
      .catch((e: unknown) => {
        setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar os pedidos.')
      })
      .finally(() => setCarregando(false))
  }, [nomeCliente])

  useEffect(() => {
    carregar()
  }, [carregar])

  // Qualquer mudança de filtro volta para a primeira página.
  useEffect(() => {
    setPagina(1)
  }, [status, busca, plataforma])

  const contagem = useMemo(() => {
    const c = new Map<number, number>()
    for (const p of pedidos) {
      c.set(p.status, (c.get(p.status) ?? 0) + 1)
    }
    return c
  }, [pedidos])

  const plataformas = useMemo(
    () =>
      Array.from(new Set(pedidos.map((p) => p.plataforma).filter((p): p is string => !!p))).sort(),
    [pedidos],
  )

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    return pedidos.filter(
      (p) =>
        (status === null || p.status === status) &&
        (!plataforma || p.plataforma === plataforma) &&
        (!termo || p.codigoPedido.toLowerCase().includes(termo)),
    )
  }, [pedidos, status, busca, plataforma])

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA))
  const paginaAtual = Math.min(pagina, totalPaginas)
  const visiveis = filtrados.slice((paginaAtual - 1) * POR_PAGINA, paginaAtual * POR_PAGINA)
  const temFiltro = status !== null || Boolean(busca || plataforma)

  // O aviso de sucesso some sozinho.
  useEffect(() => {
    if (!aviso) {
      return
    }
    const temporizador = setTimeout(() => setAviso(null), 8000)
    return () => clearTimeout(temporizador)
  }, [aviso])

  function aoReprocessar(pedido: PedidoDoCliente) {
    setEmReprocesso(null)
    setAviso(`Pedido ${pedido.codigoPedido} voltou para a fila (status 0). O n8n vai processá-lo de novo.`)
    carregar()
  }

  function limpar() {
    setStatus(null)
    setBusca('')
    setPlataforma('')
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho da tela */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={aoVoltar}
            className="group inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-surface px-3 text-sm font-medium text-slate-700 shadow-soft transition-all duration-150 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.97]"
          >
            <span className="h-4 w-4 transition-transform duration-150 group-hover:-translate-x-0.5">
              <IconeVoltar />
            </span>
            Integrações
          </button>
          <span className="hidden h-8 w-px bg-slate-200 sm:block" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              {nomeCliente}
              <span className="ml-2 text-sm font-normal text-slate-400 tabular-nums">#{codigoCliente}</span>
            </h2>
            <p className="text-[13px] text-slate-500">Pedidos do lojista em todos os status.</p>
          </div>
        </div>
        <BotaoAtualizar onClick={carregar} carregando={carregando} />
      </div>

      {/* Resumo por status — cada cartão também filtra a tabela */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <CartaoStatus
          rotulo="Todos"
          valor={pedidos.length}
          cor="bg-brand-50 text-brand-600"
          ativo={status === null}
          aoClicar={() => setStatus(null)}
        />
        {STATUS.map((s) => (
          <CartaoStatus
            key={s.codigo}
            rotulo={s.rotulo}
            codigo={s.codigo}
            valor={contagem.get(s.codigo) ?? 0}
            cor={s.cartao}
            ativo={status === s.codigo}
            aoClicar={() => setStatus(status === s.codigo ? null : s.codigo)}
          />
        ))}
      </div>

      <CartaoConsulta
        cabecalho={
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10 transition-transform duration-200 group-hover:scale-105">
              <span className="h-[18px] w-[18px]">
                <IconeCaixa />
              </span>
            </div>
            <div>
              <h3 className="text-[15px] font-semibold tracking-tight text-slate-900">
                Pedidos {status !== null && <span className="text-slate-400">· {infoStatus(status).rotulo}</span>}
              </h3>
              <p className="text-[13px] text-slate-500">Do mais recente para o mais antigo.</p>
            </div>
          </div>
        }
        filtros={
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_auto] gap-3 items-center">
            <CampoBusca
              id="buscaPedidoCliente"
              aria-label="Buscar pedido"
              placeholder="Buscar pedido…"
              value={busca}
              onChange={setBusca}
            />
            <SelectFiltro
              id="filtroStatusPedido"
              aria-label="Status"
              value={status === null ? '' : String(status)}
              onChange={(v) => setStatus(v === '' ? null : Number(v))}
            >
              <option value="">Todos os status</option>
              {STATUS.map((s) => (
                <option key={s.codigo} value={s.codigo}>
                  {s.codigo} - {s.rotulo}
                </option>
              ))}
            </SelectFiltro>
            <SelectFiltro
              id="filtroPlataformaPedido"
              aria-label="Plataforma"
              value={plataforma}
              onChange={setPlataforma}
            >
              <option value="">Todas as plataformas</option>
              {plataformas.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </SelectFiltro>
            <BotaoLimpar onClick={limpar} disabled={!temFiltro} />
          </div>
        }
        rodape={
          !erro && filtrados.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Exibindo{' '}
                <strong className="font-semibold text-slate-700 tabular-nums">
                  {(paginaAtual - 1) * POR_PAGINA + 1}–{(paginaAtual - 1) * POR_PAGINA + visiveis.length}
                </strong>{' '}
                de <strong className="font-semibold text-slate-700 tabular-nums">{filtrados.length}</strong>{' '}
                pedidos
              </span>
              {totalPaginas > 1 && (
                <Paginacao pagina={paginaAtual} total={totalPaginas} aoMudar={setPagina} />
              )}
            </div>
          ) : undefined
        }
      >
        <>
          {aviso && (
            <div className="px-5 pt-4">
              <Alerta tom="sucesso" titulo="Pedido reprocessado">
                {aviso}
              </Alerta>
            </div>
          )}
          {erro ? (
            <div className="p-5">
              <Alerta tom="erro" titulo="Não foi possível carregar">
                {erro}
              </Alerta>
            </div>
          ) : carregando && pedidos.length === 0 ? (
            <Carregando texto="Carregando pedidos…" />
          ) : pedidos.length === 0 ? (
            <EstadoVazio
              icone={<IconeCaixa />}
              titulo="Nenhum pedido encontrado"
              texto={`Não há pedidos gravados com o nome "${nomeCliente}". Se os pedidos deste lojista usam outro nome (ex.: com sufixo de filial), eles não aparecem aqui.`}
            />
          ) : filtrados.length === 0 ? (
            <EstadoVazio
              icone={<IconeLupa />}
              texto="Nenhum pedido corresponde aos filtros."
              acao={
                <button
                  type="button"
                  onClick={limpar}
                  className="text-sm font-medium text-brand-700 underline-offset-4 hover:text-brand-800 hover:underline"
                >
                  Limpar filtros
                </button>
              }
            />
          ) : (
            <Tabela
              colunas={[
                { rotulo: 'Pedido' },
                { rotulo: 'Plataforma' },
                { rotulo: 'Status' },
                { rotulo: 'Mensagem', className: 'w-full' },
                { rotulo: 'Processamentos' },
                { rotulo: 'Última alteração' },
                { rotulo: 'Ações' },
              ]}
            >
              {visiveis.map((p) => {
                const s = infoStatus(p.status)
                const quando = formatarDataHora(p.ultimaAlteracao)
                // Nos finalizados a mensagem só repete o status; não vale a coluna.
                const mensagem = p.erro && p.erro.toUpperCase() !== 'FINALIZADO' ? p.erro : null
                return (
                  <Linha key={p.id ?? `${p.codigoPedido}|${p.plataforma ?? ''}`}>
                    <Celula primeira className="whitespace-nowrap">
                      <Codigo>{p.codigoPedido}</Codigo>
                    </Celula>
                    <Celula className="whitespace-nowrap">
                      <EtiquetaPlataforma nome={p.plataforma} />
                    </Celula>
                    <Celula className="whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${s.etiqueta}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${s.ponto}`} />
                        {s.codigo} - {s.rotulo}
                      </span>
                    </Celula>
                    <Celula className="min-w-[16rem]">
                      {mensagem ? (
                        <p
                          className={`line-clamp-2 break-words leading-relaxed ${p.status === 2 ? 'text-red-700' : 'text-slate-600'}`}
                          title={mensagem}
                        >
                          {mensagem}
                        </p>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </Celula>
                    <Celula className="whitespace-nowrap text-center tabular-nums text-slate-600">
                      {p.sequencialProcessamento ?? '—'}
                    </Celula>
                    <Celula className="whitespace-nowrap tabular-nums">
                      {quando ? (
                        <>
                          <div className="text-slate-700">{quando.data}</div>
                          <div className="text-xs text-slate-400">{quando.hora}</div>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </Celula>
                    <Celula ultima className="whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setEmReprocesso(p)}
                        disabled={p.status !== 2}
                        title={
                          p.status === 2
                            ? `Reprocessar o pedido ${p.codigoPedido}`
                            : 'Só pedidos com erro podem ser reprocessados'
                        }
                        aria-label={`Reprocessar o pedido ${p.codigoPedido}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all duration-150 hover:bg-slate-100 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 active:scale-95 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent disabled:hover:text-slate-300 disabled:active:scale-100"
                      >
                        <span className="h-4 w-4">
                          <IconeReciclar />
                        </span>
                      </button>
                    </Celula>
                  </Linha>
                )
              })}
            </Tabela>
          )}
          {emReprocesso && (
            <ModalReprocessarPedido
              pedido={emReprocesso}
              nomeCliente={nomeCliente}
              aoFechar={() => setEmReprocesso(null)}
              aoReprocessar={aoReprocessar}
            />
          )}
        </>
      </CartaoConsulta>
    </div>
  )
}

function CartaoStatus({
  rotulo,
  codigo,
  valor,
  cor,
  ativo,
  aoClicar,
}: {
  rotulo: string
  codigo?: number
  valor: number
  cor: string
  ativo: boolean
  aoClicar: () => void
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ativo}
      className={`group flex items-center gap-3 rounded-xl border bg-surface p-4 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover active:translate-y-0 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/20 ${
        ativo ? 'border-brand-500 ring-4 ring-brand-500/10' : 'border-slate-200/80 hover:border-slate-300'
      }`}
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold tabular-nums transition-transform duration-200 group-hover:scale-105 ${cor}`}
      >
        {codigo ?? '∑'}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-medium text-slate-500">{rotulo}</p>
        <p className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900 tabular-nums">
          {valor.toLocaleString('pt-BR')}
        </p>
      </div>
    </button>
  )
}

function Paginacao({
  pagina,
  total,
  aoMudar,
}: {
  pagina: number
  total: number
  aoMudar: (p: number) => void
}) {
  const botao =
    'inline-flex h-8 min-w-[2rem] items-center justify-center rounded-lg border border-slate-200 bg-surface px-2 text-sm font-medium text-slate-600 shadow-soft transition-all duration-150 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 active:scale-95 disabled:cursor-not-allowed disabled:text-slate-300 disabled:shadow-none disabled:hover:bg-surface disabled:active:scale-100'
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={botao} onClick={() => aoMudar(1)} disabled={pagina === 1} aria-label="Primeira página">
        «
      </button>
      <button type="button" className={botao} onClick={() => aoMudar(pagina - 1)} disabled={pagina === 1} aria-label="Página anterior">
        ‹
      </button>
      <span className="px-2 text-sm text-slate-600 tabular-nums">
        Página <strong className="font-semibold text-slate-700">{pagina}</strong> de {total}
      </span>
      <button type="button" className={botao} onClick={() => aoMudar(pagina + 1)} disabled={pagina === total} aria-label="Próxima página">
        ›
      </button>
      <button type="button" className={botao} onClick={() => aoMudar(total)} disabled={pagina === total} aria-label="Última página">
        »
      </button>
    </div>
  )
}
