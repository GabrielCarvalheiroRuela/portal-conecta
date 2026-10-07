import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react'
import { apiGet } from '../services/api'
import {
  assinarFilas,
  iniciarSincronizacaoAutomatica,
  lerEstadoFilas,
  sincronizarFilas,
} from '../services/filas'
import { classificarClientes } from '../types/filas'
import type { PedidoComErro, ProdutoComErro } from '../types/monitoramento'
import { PainelFilas } from './PainelFilas'
import { IconeAlerta, IconeCaixa, IconeCheck, IconeEtiqueta, IconeLupa, IconePessoas } from './ui/Icones'
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
  RodapeContagem,
  SelectFiltro,
  Tabela,
} from './ui/Tabela'

type SubAba = 'pedidos' | 'produtos' | 'filas'

const INTERVALO_ATUALIZACAO_MS = 10_000

/** Remove acentos e caixa, para a busca achar "integracao" em "Integração". */
function normalizar(texto: string): string {
  // NFD separa a letra do acento; \p{M} casa os acentos soltos.
  return texto.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

function formatarDataHora(valor: string): { data: string; hora: string } | null {
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) {
    return null
  }
  return {
    data: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }),
    hora: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
  }
}

/**
 * Mescla a resposta nova na lista atual sem embaralhar a tabela a cada atualização: mantém na
 * posição os itens que continuam com erro, descarta os que saíram e acrescenta os novos no fim.
 * Devolve a própria lista atual quando nada mudou, para o React não renderizar à toa.
 */
function mesclar<T>(atual: T[], recebidos: T[], chave: (item: T) => string): T[] {
  const idsRecebidos = new Set(recebidos.map(chave))
  const mantidos = atual.filter((item) => idsRecebidos.has(chave(item)))
  const idsMantidos = new Set(mantidos.map(chave))
  const novos = recebidos.filter((item) => !idsMantidos.has(chave(item)))
  if (mantidos.length === atual.length && novos.length === 0) {
    return atual
  }
  return [...mantidos, ...novos]
}

interface Filtros {
  codigo: string
  cliente: string
  plataforma: string
  erro: string
}

const FILTROS_VAZIOS: Filtros = { codigo: '', cliente: '', plataforma: '', erro: '' }

interface ItemFiltravel {
  cliente: string
  plataforma?: string | null
  erro?: string | null
}

function filtrar<T extends ItemFiltravel>(itens: T[], filtros: Filtros, codigoDe: (item: T) => string): T[] {
  const codigo = normalizar(filtros.codigo)
  const erro = normalizar(filtros.erro)
  return itens.filter(
    (item) =>
      (!codigo || normalizar(codigoDe(item)).includes(codigo)) &&
      (!filtros.cliente || item.cliente === filtros.cliente) &&
      (!filtros.plataforma || item.plataforma === filtros.plataforma) &&
      (!erro || normalizar(item.erro || '').includes(erro)),
  )
}

const chaveProduto = (p: ProdutoComErro) => p.id ?? `${p.cliente}|${p.codigoProduto}`
// O codigoPedido se repete entre clientes (ex.: TRY_001_001_1745 em dois lojistas da Tray), então não serve de chave sozinho.
const chavePedido = (p: PedidoComErro) => `${p.cliente}|${p.plataforma ?? ''}|${p.codigoPedido}`

/**
 * Monitoramento das integrações: pedidos e produtos que falharam, atualizados a cada 10s, e as filas
 * de processamento por cliente, coletadas pelo n8n a cada 5 minutos. Somente leitura. Usa a mesma sessão do portal (JWT do Monint).
 */
export function Monitoramento() {
  const [subAba, setSubAba] = useState<SubAba>('pedidos')
  const [carregando, setCarregando] = useState(true)

  const [pedidos, setPedidos] = useState<PedidoComErro[]>([])
  const [produtos, setProdutos] = useState<ProdutoComErro[]>([])
  // O total vem da resposta da API, não da lista mesclada.
  const [totalPedidos, setTotalPedidos] = useState(0)
  const [totalProdutos, setTotalProdutos] = useState(0)
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null)

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS)
  const primeiraCarga = useRef(true)

  // O retrato das filas vive no serviço, não aqui: ao trocar de tela e voltar, o último retrato
  // continua na tela e a coleta só acontece quando passam 5 minutos ou a pessoa pede.
  const {
    retrato: retratoFilas,
    falha: falhaFilas,
    sincronizando,
  } = useSyncExternalStore(assinarFilas, lerEstadoFilas)

  useEffect(() => iniciarSincronizacaoAutomatica(), [])

  useEffect(() => {
    let ativo = true

    function carregar() {
      const buscaPedidos = apiGet<PedidoComErro[]>('/pendentes?status=2')
        .then((recebidos) => {
          if (!ativo) return
          setPedidos((atual) => mesclar(atual, recebidos, chavePedido))
          setTotalPedidos(recebidos.length)
          setUltimaAtualizacao(new Date())
        })
        .catch((e: unknown) => console.error('[MONITORAMENTO] Erro ao carregar pedidos', e))

      const buscaProdutos = apiGet<ProdutoComErro[]>('/produtos')
        // A API chama o campo de mensagemErro; o monitoramento antigo lia "erro" e a coluna vinha vazia.
        .then((brutos) => brutos.map((p) => ({ ...p, erro: p.mensagemErro ?? p.erro })))
        .then((recebidos) => {
          if (!ativo) return
          setProdutos((atual) => mesclar(atual, recebidos, chaveProduto))
          setTotalProdutos(recebidos.length)
          setUltimaAtualizacao(new Date())
        })
        .catch((e: unknown) => console.error('[MONITORAMENTO] Erro ao carregar produtos', e))

      // Falha numa atualização não limpa a tela: fica o último retrato bom até a próxima.
      Promise.all([buscaPedidos, buscaProdutos]).finally(() => {
        if (ativo && primeiraCarga.current) {
          primeiraCarga.current = false
          setCarregando(false)
        }
      })
    }

    carregar()
    const intervalo = setInterval(carregar, INTERVALO_ATUALIZACAO_MS)
    return () => {
      ativo = false
      clearInterval(intervalo)
    }
  }, [])

  const linhasFilas = useMemo(() => classificarClientes(retratoFilas), [retratoFilas])
  const clientesComFilaEmAtencao = useMemo(
    () => linhasFilas.filter((l) => l.filasEmAtencao.length > 0).length,
    [linhasFilas],
  )

  const dadosDaAba: ItemFiltravel[] = subAba === 'produtos' ? produtos : pedidos

  const clientes = useMemo(
    () => Array.from(new Set(dadosDaAba.map((i) => i.cliente))).sort(),
    [dadosDaAba],
  )
  const plataformas = useMemo(
    () =>
      Array.from(
        new Set(dadosDaAba.map((i) => i.plataforma).filter((p): p is string => !!p)),
      ).sort(),
    [dadosDaAba],
  )
  const clientesAfetados = useMemo(
    () => new Set([...pedidos, ...produtos].map((i) => (i.cliente ?? '').toUpperCase())).size,
    [pedidos, produtos],
  )

  const pedidosFiltrados = useMemo(
    () => filtrar(pedidos, filtros, (p) => p.codigoPedido),
    [pedidos, filtros],
  )
  const produtosFiltrados = useMemo(
    () => filtrar(produtos, filtros, (p) => p.codigoProduto),
    [produtos, filtros],
  )

  function trocarSubAba(nova: SubAba) {
    setSubAba(nova)
    setFiltros(FILTROS_VAZIOS)
  }

  function alterarFiltro(campo: keyof Filtros, valor: string) {
    setFiltros((f) => ({ ...f, [campo]: valor }))
  }

  const ehPedidos = subAba !== 'produtos'
  const total = ehPedidos ? totalPedidos : totalProdutos
  const semErros = (ehPedidos ? pedidos : produtos).length === 0
  const visiveis = ehPedidos ? pedidosFiltrados.length : produtosFiltrados.length
  const temFiltro = Object.values(filtros).some(Boolean)
  const termo = ehPedidos ? 'pedido' : 'produto'

  if (carregando) {
    return (
      <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-card">
        <Carregando />
      </div>
    )
  }

  const colunas = [
    { rotulo: 'Cliente' },
    { rotulo: 'Plataforma' },
    ...(ehPedidos ? [{ rotulo: 'Pedido' }] : [{ rotulo: 'Data e hora' }, { rotulo: 'Produto' }]),
    { rotulo: 'Erro', className: 'w-full' },
    { rotulo: 'Rotina' },
  ]

  const emFilas = subAba === 'filas'
  // As filas usam amarelo ("atenção"): ainda não é falha, é volume acima do normal.
  const abas = [
    { id: 'pedidos', rotulo: 'Pedidos', contador: totalPedidos, icone: <IconeCaixa />, tom: 'erro' },
    { id: 'produtos', rotulo: 'Produtos', contador: totalProdutos, icone: <IconeEtiqueta />, tom: 'erro' },
    { id: 'filas', rotulo: 'Filas', contador: clientesComFilaEmAtencao, icone: <IconeAlerta />, tom: 'atencao' },
  ] as const

  const cabecalho = (
    <>
      <div className="inline-flex rounded-lg bg-slate-100 p-1" role="tablist">
        {abas.map(({ id, rotulo, contador, icone, tom }) => {
          const ativa = subAba === id
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={ativa}
              onClick={() => trocarSubAba(id)}
              title={id === 'filas' ? 'Clientes com alguma fila acima do limite' : undefined}
              className={`flex items-center gap-2 rounded-md px-3.5 py-1.5 text-sm font-medium transition-all duration-150 ${
                ativa
                  ? 'bg-surface text-slate-900 shadow-soft ring-1 ring-slate-200/80 dark:bg-slate-200 dark:ring-slate-300/60'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className={`h-4 w-4 ${ativa ? 'text-brand-600' : ''}`}>{icone}</span>
              {rotulo}
              <span
                className={`min-w-[1.5rem] rounded-full px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${
                  contador === 0
                    ? 'bg-slate-200/70 text-slate-500'
                    : tom === 'atencao'
                      ? ativa
                        ? 'bg-amber-500 text-white'
                        : 'bg-amber-100 text-amber-700'
                      : ativa
                        ? 'bg-red-500 text-white'
                        : 'bg-red-100 text-red-700'
                }`}
              >
                {contador}
              </span>
            </button>
          )
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3">
      {emFilas && (
        <BotaoAtualizar
          onClick={() => void sincronizarFilas()}
          carregando={sincronizando}
          rotulo="Sincronizar filas"
          rotuloCarregando="Sincronizando…"
        />
      )}
      <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/15">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
        <span>
          {emFilas ? 'Coleta a cada 5 min' : 'Ao vivo · a cada 10s'}
          {(emFilas ? retratoFilas?.geradoEm : ultimaAtualizacao) && (
            <span className="text-emerald-600/70 tabular-nums">
              {' '}
              · {new Date((emFilas ? retratoFilas?.geradoEm : ultimaAtualizacao) as string | Date).toLocaleTimeString('pt-BR')}
            </span>
          )}
        </span>
      </div>
      </div>
    </>
  )

  const resumo = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <CartaoResumo
        rotulo="Pedidos com erro"
        valor={totalPedidos}
        destaque={totalPedidos > 0}
        legenda={totalPedidos > 0 ? 'Aguardando correção' : 'Tudo processado'}
        icone={<IconeCaixa />}
      />
      <CartaoResumo
        rotulo="Produtos com erro"
        valor={totalProdutos}
        destaque={totalProdutos > 0}
        legenda={totalProdutos > 0 ? 'Aguardando correção' : 'Tudo processado'}
        icone={<IconeEtiqueta />}
      />
      <CartaoResumo
        rotulo="Clientes afetados"
        valor={clientesAfetados}
        legenda="Com pedido ou produto em erro"
        icone={<IconePessoas />}
      />
      <CartaoResumo
        rotulo="Filas em atenção"
        valor={clientesComFilaEmAtencao}
        destaque={clientesComFilaEmAtencao > 0}
        tom="atencao"
        legenda={
          clientesComFilaEmAtencao > 0 ? 'Clientes com fila acima do limite' : 'Todas as filas dentro do limite'
        }
        icone={<IconeAlerta />}
      />
    </div>
  )

  if (emFilas) {
    return (
      <div className="space-y-6">
        {resumo}
        <PainelFilas
          cabecalho={cabecalho}
          linhas={linhasFilas}
          coletado={retratoFilas !== null && !!retratoFilas.geradoEm}
          indisponivel={falhaFilas && retratoFilas === null}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {resumo}

      <CartaoConsulta
        cabecalho={cabecalho}
        filtros={
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_1.3fr_auto] gap-3 items-center">
            <CampoBusca
              id="filtroCodigo"
              aria-label={ehPedidos ? 'Pedido' : 'Produto'}
              placeholder={ehPedidos ? 'Buscar pedido…' : 'Buscar produto…'}
              value={filtros.codigo}
              onChange={(v) => alterarFiltro('codigo', v)}
            />
            <SelectFiltro
              id="filtroCliente"
              aria-label="Cliente"
              value={filtros.cliente}
              onChange={(v) => alterarFiltro('cliente', v)}
            >
              <option value="">Todos os clientes</option>
              {clientes.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </SelectFiltro>
            <SelectFiltro
              id="filtroPlataformaMonitor"
              aria-label="Plataforma"
              value={filtros.plataforma}
              onChange={(v) => alterarFiltro('plataforma', v)}
            >
              <option value="">Todas as plataformas</option>
              {plataformas.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </SelectFiltro>
            <CampoBusca
              id="filtroErro"
              aria-label="Erro"
              placeholder="Buscar na mensagem de erro…"
              value={filtros.erro}
              onChange={(v) => alterarFiltro('erro', v)}
            />
            <BotaoLimpar onClick={() => setFiltros(FILTROS_VAZIOS)} disabled={!temFiltro} />
          </div>
        }
        rodape={semErros ? undefined : <RodapeContagem visiveis={visiveis} total={total} />}
      >
        {semErros ? (
          <EstadoVazio
            tom="sucesso"
            icone={<IconeCheck />}
            titulo={`Nenhum ${termo} com erro`}
            texto={`Todos os ${termo}s foram processados com sucesso!`}
          />
        ) : visiveis === 0 ? (
          <EstadoVazio
            icone={<IconeLupa />}
            texto={`Nenhum ${termo} encontrado com os filtros aplicados.`}
            acao={
              <button
                type="button"
                onClick={() => setFiltros(FILTROS_VAZIOS)}
                className="text-sm font-medium text-brand-700 underline-offset-4 hover:text-brand-800 hover:underline"
              >
                Limpar filtros
              </button>
            }
          />
        ) : (
          <Tabela colunas={colunas}>
            {ehPedidos
              ? pedidosFiltrados.map((p) => (
                  <Linha key={chavePedido(p)}>
                    <CelulaCliente nome={p.cliente} />
                    <Celula className="whitespace-nowrap">
                      <EtiquetaPlataforma nome={p.plataforma} />
                    </Celula>
                    <Celula className="whitespace-nowrap">
                      <Codigo>{p.codigoPedido}</Codigo>
                    </Celula>
                    <CelulaErro texto={p.erro || 'Erro desconhecido'} />
                    <CelulaRotina texto={p.rotina?.toUpperCase() || 'Não Informado'} vazia={!p.rotina} />
                  </Linha>
                ))
              : produtosFiltrados.map((p) => {
                  const quando = formatarDataHora(p.dataErro)
                  return (
                    <Linha key={chaveProduto(p)}>
                      <CelulaCliente nome={p.cliente} />
                      <Celula className="whitespace-nowrap">
                        <EtiquetaPlataforma nome={p.plataforma} />
                      </Celula>
                      <Celula className="whitespace-nowrap tabular-nums">
                        {quando ? (
                          <>
                            <div className="text-slate-700">{quando.data}</div>
                            <div className="text-xs text-slate-400">{quando.hora}</div>
                          </>
                        ) : (
                          <span className="text-slate-700">{p.dataErro}</span>
                        )}
                      </Celula>
                      <Celula className="whitespace-nowrap">
                        <Codigo>{p.codigoProduto}</Codigo>
                      </Celula>
                      <CelulaErro texto={p.erro || 'Erro desconhecido'} />
                      <CelulaRotina texto={p.rotina?.toUpperCase() || 'N/A'} vazia={!p.rotina} />
                    </Linha>
                  )
                })}
          </Tabela>
        )}
      </CartaoConsulta>
    </div>
  )
}

/* ---------- Peças específicas do monitoramento ---------- */

function CartaoResumo({
  rotulo,
  valor,
  icone,
  legenda,
  destaque = false,
  tom = 'erro',
}: {
  rotulo: string
  valor: number
  icone: ReactNode
  legenda?: string
  destaque?: boolean
  /** Cor do destaque: vermelho para falha, amarelo para atenção. */
  tom?: 'erro' | 'atencao'
}) {
  const cor = tom === 'atencao' ? 'amber' : 'red'
  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-surface p-5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
      {destaque && <span className={`absolute inset-x-0 top-0 h-[3px] ${tom === 'atencao' ? 'bg-amber-500' : 'bg-red-500'}`} />}
      <div className="flex items-start justify-between gap-3">
        <p className="text-[13px] font-medium text-slate-500">{rotulo}</p>
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset transition-transform duration-200 group-hover:scale-110 ${
            destaque
              ? cor === 'amber'
                ? 'bg-amber-50 text-amber-600 ring-amber-600/10'
                : 'bg-red-50 text-red-600 ring-red-600/10'
              : 'bg-brand-50 text-brand-600 ring-brand-600/10'
          }`}
        >
          <span className="h-[18px] w-[18px]">{icone}</span>
        </span>
      </div>
      <p className="mt-2 text-[34px] font-semibold leading-none tracking-tight text-slate-900 tabular-nums">
        {valor.toLocaleString('pt-BR')}
      </p>
      {legenda && (
        <p
          className={`mt-3 flex items-center gap-1.5 text-xs font-medium ${
            destaque ? (cor === 'amber' ? 'text-amber-600' : 'text-red-600') : 'text-slate-500'
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${destaque ? (cor === 'amber' ? 'bg-amber-500' : 'bg-red-500') : 'bg-slate-300'}`}
          />
          {legenda}
        </p>
      )}
    </div>
  )
}

function CelulaCliente({ nome }: { nome?: string | null }) {
  return (
    <Celula primeira className="whitespace-nowrap font-medium text-slate-900">
      {nome ? nome.toUpperCase() : <span className="font-normal text-slate-400">N/A</span>}
    </Celula>
  )
}

/** Erro em até duas linhas; clicar abre o texto inteiro. */
function CelulaErro({ texto }: { texto: string }) {
  const [aberto, setAberto] = useState(false)
  const longo = texto.length > 120
  return (
    <Celula className="min-w-[20rem]">
      <div className="flex gap-2">
        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
        <div className="min-w-0">
          <p
            className={`text-slate-600 break-words leading-relaxed ${aberto ? '' : 'line-clamp-2'}`}
            title={aberto ? undefined : texto}
          >
            {texto}
          </p>
          {longo && (
            <button
              type="button"
              onClick={() => setAberto((a) => !a)}
              className="mt-0.5 text-xs font-medium text-brand-700 underline-offset-4 hover:text-brand-800 hover:underline"
            >
              {aberto ? 'Ver menos' : 'Ver mais'}
            </button>
          )}
        </div>
      </div>
    </Celula>
  )
}

function CelulaRotina({ texto, vazia }: { texto: string; vazia: boolean }) {
  return (
    <Celula ultima className="whitespace-nowrap">
      {vazia ? (
        <span className="text-xs text-slate-400">{texto}</span>
      ) : (
        <span className="inline-flex rounded-md bg-violet-50 px-2 py-0.5 font-mono text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-600/15">
          {texto}
        </span>
      )}
    </Celula>
  )
}
