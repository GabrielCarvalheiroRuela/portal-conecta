import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { apiGet } from '../services/api'
import {
  assinarFilas,
  iniciarSincronizacaoAutomatica,
  lerEstadoFilas,
  sincronizarFilas,
} from '../services/filas'
import { classificarClientes } from '../types/filas'
import type { FiltrosProdutos, PaginaProdutos, PedidoComErro, ProdutoComErro } from '../types/monitoramento'
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
function normalizar(texto?: string | null): string {
  // NFD separa a letra do acento; \p{M} casa os acentos soltos.
  return (texto ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
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

/** 0 = todos os registros numa página só (a API trata tamanho=0 assim). */
type TamanhoPagina = 50 | 100 | 1000 | 0
const TAMANHOS_PAGINA: TamanhoPagina[] = [50, 100, 1000, 0]
const rotuloTamanho = (t: TamanhoPagina) => (t === 0 ? 'Todos' : String(t))
type Ordem = 'desc' | 'asc'

/** Espera depois da última tecla antes de pesquisar na API: evita uma consulta por letra digitada. */
const ESPERA_PESQUISA_MS = 400

/**
 * O que o GET /produtos recebe: página, tamanho, ordem e os filtros. Cliente e plataforma são escolhas
 * entre as opções do GET /produtos/filtros; produto e erro são texto. Tudo é filtrado pela API em todos
 * os registros, não só nos da página que está na tela.
 */
interface ConsultaProdutos {
  /** Começa em 1. */
  pagina: number
  tamanho: TamanhoPagina
  /** Pela data do erro: desc = mais recente primeiro (o padrão). */
  ordem: Ordem
  produto: string
  cliente: string
  plataforma: string
  erro: string
}

const CONSULTA_PRODUTOS_INICIAL: ConsultaProdutos = {
  pagina: 1,
  tamanho: 50,
  ordem: 'desc',
  produto: '',
  cliente: '',
  plataforma: '',
  erro: '',
}

function montarQueryProdutos(c: ConsultaProdutos): string {
  const params = new URLSearchParams({ pagina: String(c.pagina), tamanho: String(c.tamanho), ordem: c.ordem })
  const filtros = { produtoContem: c.produto, cliente: c.cliente, plataforma: c.plataforma, erroContem: c.erro }
  for (const [nome, valor] of Object.entries(filtros)) {
    if (valor) params.set(nome, valor)
  }
  return params.toString()
}

/** Os filtros da tela no formato da consulta (sem espaços nas pontas). */
function pesquisasDe(filtros: Filtros): Pick<ConsultaProdutos, 'produto' | 'cliente' | 'plataforma' | 'erro'> {
  return {
    produto: filtros.codigo.trim(),
    cliente: filtros.cliente.trim(),
    plataforma: filtros.plataforma.trim(),
    erro: filtros.erro.trim(),
  }
}

/**
 * Mantém a escolha atual no select mesmo quando a opção some da lista (o último produto daquele cliente foi
 * resolvido): sem isso o select cairia em "Todos" sem a pessoa ter mexido, e a tela e a consulta divergiriam.
 */
function opcoesCom(opcoes: string[], escolhida: string): string[] {
  return escolhida && !opcoes.includes(escolhida) ? [...opcoes, escolhida].sort() : opcoes
}

interface ItemFiltravel {
  cliente?: string | null
  plataforma?: string | null
  erro?: string | null
}

function filtrar<T extends ItemFiltravel>(
  itens: T[],
  filtros: Filtros,
  codigoDe: (item: T) => string | null | undefined,
): T[] {
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

const chaveProduto = (p: ProdutoComErro) => p.id ?? `${p.cliente ?? ''}|${p.codigoProduto ?? ''}`
// O codigoPedido se repete entre clientes (ex.: TRY_001_001_1745 em dois lojistas da Tray), então não serve de chave sozinho.
const chavePedido = (p: PedidoComErro) => `${p.cliente ?? ''}|${p.plataforma ?? ''}|${p.codigoPedido}`

/**
 * Monitoramento das integrações: pedidos e produtos que falharam, atualizados a cada 10s, e as filas
 * de processamento por cliente, coletadas pelo n8n a cada 5 minutos. Somente leitura. Usa a mesma sessão do portal (JWT do Monint).
 */
export function Monitoramento() {
  const [subAba, setSubAba] = useState<SubAba>('pedidos')
  const [pedidosCarregados, setPedidosCarregados] = useState(false)
  const [produtosCarregados, setProdutosCarregados] = useState(false)
  const carregando = !(pedidosCarregados && produtosCarregados)

  const [pedidos, setPedidos] = useState<PedidoComErro[]>([])
  // Só a página atual: a API entrega no máximo 100 produtos por consulta.
  const [produtos, setProdutos] = useState<ProdutoComErro[]>([])
  // O total vem da resposta da API, não da lista na tela. No de produtos, é o de todas as páginas.
  const [totalPedidos, setTotalPedidos] = useState(0)
  const [totalProdutos, setTotalProdutos] = useState(0)
  const [totalPaginasProdutos, setTotalPaginasProdutos] = useState(0)
  const [ultimaAtualizacao, setUltimaAtualizacao] = useState<Date | null>(null)

  // Clientes e plataformas que têm produto com erro, de toda a base e não só da página aberta.
  const [opcoesProdutos, setOpcoesProdutos] = useState<FiltrosProdutos>({ clientes: [], plataformas: [] })

  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS)
  const [consulta, setConsulta] = useState<ConsultaProdutos>(CONSULTA_PRODUTOS_INICIAL)

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

    // Falha numa atualização não limpa a tela: fica o último retrato bom até a próxima.
    function carregar() {
      apiGet<PedidoComErro[]>('/pendentes?status=2')
        .then((recebidos) => {
          if (!ativo) return
          setPedidos((atual) => mesclar(atual, recebidos, chavePedido))
          setTotalPedidos(recebidos.length)
          setUltimaAtualizacao(new Date())
        })
        .catch((e: unknown) => console.error('[MONITORAMENTO] Erro ao carregar pedidos', e))
        .finally(() => {
          if (ativo) setPedidosCarregados(true)
        })
    }

    carregar()
    const intervalo = setInterval(carregar, INTERVALO_ATUALIZACAO_MS)
    return () => {
      ativo = false
      clearInterval(intervalo)
    }
  }, [])

  // Produtos: o polling de 10s continua, mas cada GET pede só a página atual. Mudou a página, o tamanho
  // ou a ordem, o efeito recomeça e já busca na hora; a atualização automática mantém tudo isso.
  useEffect(() => {
    let ativo = true

    function carregar() {
      apiGet<PaginaProdutos>(`/produtos?${montarQueryProdutos(consulta)}`)
        .then((resposta) => {
          if (!ativo) return
          setTotalProdutos(resposta.totalItens)
          setTotalPaginasProdutos(resposta.totalPaginas)
          setUltimaAtualizacao(new Date())
          // Produtos resolvidos podem ter feito a página atual sumir: vai para a última que existe.
          if (resposta.totalPaginas > 0 && consulta.pagina > resposta.totalPaginas) {
            setConsulta((c) => ({ ...c, pagina: resposta.totalPaginas }))
            return
          }
          // A API chama o campo de mensagemErro; o monitoramento antigo lia "erro" e a coluna vinha vazia.
          setProdutos(resposta.itens.map((p) => ({ ...p, erro: p.mensagemErro ?? p.erro })))
        })
        .catch((e: unknown) => console.error('[MONITORAMENTO] Erro ao carregar produtos', e))
        .finally(() => {
          if (ativo) setProdutosCarregados(true)
        })
    }

    carregar()
    const intervalo = setInterval(carregar, INTERVALO_ATUALIZACAO_MS)
    return () => {
      ativo = false
      clearInterval(intervalo)
    }
  }, [consulta])

  // Opções dos filtros de produtos: um GET à parte, leve, que acompanha o ritmo da lista
  const { cliente: clienteConsultado, plataforma: plataformaConsultada } = consulta
  useEffect(() => {
    let ativo = true

    function carregar() {
      const params = new URLSearchParams()
      if (clienteConsultado) params.set('cliente', clienteConsultado)
      if (plataformaConsultada) params.set('plataforma', plataformaConsultada)
      apiGet<FiltrosProdutos>(`/produtos/filtros?${params.toString()}`)
        .then((recebidas) => {
          if (ativo) setOpcoesProdutos(recebidas)
        })
        .catch((e: unknown) => console.error('[MONITORAMENTO] Erro ao carregar filtros de produtos', e))
    }

    carregar()
    const intervalo = setInterval(carregar, INTERVALO_ATUALIZACAO_MS)
    return () => {
      ativo = false
      clearInterval(intervalo)
    }
  }, [clienteConsultado, plataformaConsultada])

  const linhasFilas = useMemo(() => classificarClientes(retratoFilas), [retratoFilas])
  const clientesComFilaEmAtencao = useMemo(
    () => linhasFilas.filter((l) => l.filasEmAtencao.length > 0).length,
    [linhasFilas],
  )

  const clientes = useMemo(
    () =>
      subAba === 'produtos'
        ? opcoesProdutos.clientes
        : Array.from(new Set(pedidos.map((i) => i.cliente).filter((c): c is string => !!c))).sort(),
    [subAba, opcoesProdutos, pedidos],
  )
  const plataformas = useMemo(
    () =>
      subAba === 'produtos'
        ? opcoesProdutos.plataformas
        : Array.from(new Set(pedidos.map((i) => i.plataforma).filter((p): p is string => !!p))).sort(),
    [subAba, opcoesProdutos, pedidos],
  )
  const clientesAfetados = useMemo(
    () => new Set([...pedidos, ...produtos].map((i) => (i.cliente ?? '').toUpperCase())).size,
    [pedidos, produtos],
  )

  // Pedidos vêm inteiros e são filtrados aqui. Produtos já chegam filtrados pela API.
  const pedidosFiltrados = useMemo(
    () => filtrar(pedidos, filtros, (p) => p.codigoPedido),
    [pedidos, filtros],
  )

  // Digitou na aba de produtos: depois de uma pausa, a pesquisa vai para a API (página 1). Fora dessa
  // aba os filtros não valem para produtos, então a consulta volta a ficar sem pesquisa.
  useEffect(() => {
    const alvo = pesquisasDe(subAba === 'produtos' ? filtros : FILTROS_VAZIOS)
    const espera = setTimeout(() => {
      setConsulta((c) =>
        c.produto === alvo.produto && c.cliente === alvo.cliente && c.plataforma === alvo.plataforma && c.erro === alvo.erro
          ? c
          : { ...c, ...alvo, pagina: 1 },
      )
    }, ESPERA_PESQUISA_MS)
    return () => clearTimeout(espera)
  }, [filtros, subAba])

  function trocarSubAba(nova: SubAba) {
    setSubAba(nova)
    setFiltros(FILTROS_VAZIOS)
  }

  function alterarFiltro(campo: keyof Filtros, valor: string) {
    setFiltros((f) => ({ ...f, [campo]: valor }))
  }

  /** Tamanho ou ordem novos recomeçam da página 1; só navegar entre páginas mantém a posição. */
  function alterarConsulta(parcial: Partial<ConsultaProdutos>) {
    setConsulta((c) => ({ ...c, ...parcial, pagina: 1 }))
  }

  function irParaPagina(pagina: number) {
    setConsulta((c) => ({ ...c, pagina: Math.min(Math.max(pagina, 1), Math.max(totalPaginasProdutos, 1)) }))
  }

  const ehPedidos = subAba !== 'produtos'
  const total = ehPedidos ? totalPedidos : totalProdutos
  const temFiltro = Object.values(filtros).some(Boolean)
  // Produtos vazios com pesquisa na consulta é "nada encontrado", não "fila sem erros".
  const pesquisandoProdutos = [consulta.produto, consulta.cliente, consulta.plataforma, consulta.erro].some(Boolean)
  const semErros = ehPedidos ? pedidos.length === 0 : produtos.length === 0 && !pesquisandoProdutos
  const visiveis = ehPedidos ? pedidosFiltrados.length : produtos.length
  const termo = ehPedidos ? 'pedido' : 'produto'

  function limparFiltros() {
    setFiltros(FILTROS_VAZIOS)
    // Já limpa a consulta, sem esperar a pausa da digitação.
    setConsulta((c) =>
      c.produto || c.cliente || c.plataforma || c.erro ? { ...c, ...pesquisasDe(FILTROS_VAZIOS), pagina: 1 } : c,
    )
  }

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
    ...(ehPedidos
      ? [{ rotulo: 'Pedido' }]
      : [
          // A API ordena pela data do erro: mais recentes primeiro de início, e cada clique inverte.
          {
            rotulo: 'Data e hora',
            ordenacao: consulta.ordem,
            onOrdenar: () => alterarConsulta({ ordem: consulta.ordem === 'desc' ? 'asc' : 'desc' }),
          },
          { rotulo: 'Produto' },
        ]),
    { rotulo: ehPedidos ? 'Processamentos' : 'Tentativas' },
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
              {opcoesCom(clientes, filtros.cliente).map((c) => (
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
              {opcoesCom(plataformas, filtros.plataforma).map((p) => (
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
            <BotaoLimpar onClick={limparFiltros} disabled={!temFiltro} />
          </div>
        }
        rodape={
          semErros ? undefined : ehPedidos ? (
            <RodapeContagem visiveis={visiveis} total={total} />
          ) : (
            <RodapePaginacao
              pagina={consulta.pagina}
              tamanho={consulta.tamanho}
              total={totalProdutos}
              totalPaginas={totalPaginasProdutos}
              naPagina={produtos.length}
              onPagina={irParaPagina}
              onTamanho={(tamanho) => alterarConsulta({ tamanho })}
            />
          )
        }
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
                onClick={limparFiltros}
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
                    <CelulaContagem valor={p.sequencialProcessamento} />
                    <CelulaErro texto={p.erro || 'Erro desconhecido'} />
                    <CelulaRotina texto={p.rotina?.toUpperCase() || 'Não Informado'} vazia={!p.rotina} />
                  </Linha>
                ))
              : produtos.map((p) => {
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
                        <Codigo>{p.codigoProduto || '—'}</Codigo>
                      </Celula>
                      <CelulaContagem valor={p.tentativa} />
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

const CLASSE_BOTAO_PAGINA =
  'inline-flex h-8 items-center justify-center rounded-lg border border-slate-200 bg-surface px-3 text-[13px] font-medium text-slate-700 shadow-soft transition-all duration-150 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.97] disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:border-slate-200 disabled:hover:bg-surface disabled:active:scale-100'

const formatarInteiro = (n: number) => n.toLocaleString('pt-BR')

function RodapePaginacao({
  pagina,
  tamanho,
  total,
  totalPaginas,
  naPagina,
  onPagina,
  onTamanho,
}: {
  pagina: number
  tamanho: TamanhoPagina
  total: number
  totalPaginas: number
  /** Quantos registros vieram na página atual. */
  naPagina: number
  onPagina: (pagina: number) => void
  onTamanho: (tamanho: TamanhoPagina) => void
}) {
  const [destino, setDestino] = useState('')
  // Com "todos" a página é sempre a 1: (pagina - 1) * 0 + 1.
  const inicio = naPagina === 0 ? 0 : (pagina - 1) * tamanho + 1
  const fim = naPagina === 0 ? 0 : inicio + naPagina - 1
  const ultima = Math.max(totalPaginas, 1)

  function ir() {
    const numero = Number.parseInt(destino, 10)
    if (Number.isFinite(numero)) {
      onPagina(numero)
    }
    setDestino('')
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
      <p>
        Exibindo{' '}
        <strong className="font-semibold text-slate-700 tabular-nums">
          {formatarInteiro(inicio)}–{formatarInteiro(fim)}
        </strong>{' '}
        de <strong className="font-semibold text-slate-700 tabular-nums">{formatarInteiro(total)}</strong> registros
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2">
          <span>Por página</span>
          <div className="w-24">
            <SelectFiltro
              aria-label="Registros por página"
              value={String(tamanho)}
              onChange={(v) => onTamanho(Number(v) as TamanhoPagina)}
            >
              {TAMANHOS_PAGINA.map((t) => (
                <option key={t} value={t}>
                  {rotuloTamanho(t)}
                </option>
              ))}
            </SelectFiltro>
          </div>
        </label>

        <div className="flex items-center gap-2">
          <button type="button" className={CLASSE_BOTAO_PAGINA} disabled={pagina <= 1} onClick={() => onPagina(pagina - 1)}>
            Anterior
          </button>
          <span className="tabular-nums">
            Página <strong className="font-semibold text-slate-700">{formatarInteiro(pagina)}</strong> de{' '}
            <strong className="font-semibold text-slate-700">{formatarInteiro(ultima)}</strong>
          </span>
          <button
            type="button"
            className={CLASSE_BOTAO_PAGINA}
            disabled={pagina >= ultima}
            onClick={() => onPagina(pagina + 1)}
          >
            Próxima
          </button>
        </div>

        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            ir()
          }}
        >
          <label className="flex items-center gap-2">
            <span>Ir para</span>
            <input
              type="number"
              min={1}
              max={ultima}
              inputMode="numeric"
              aria-label="Ir para a página"
              placeholder="nº"
              value={destino}
              onChange={(e) => setDestino(e.target.value)}
              className="block h-8 w-20 rounded-lg border-slate-200 bg-surface text-[13px] shadow-soft focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
            />
          </label>
          <button type="submit" className={CLASSE_BOTAO_PAGINA} disabled={destino === '' || ultima <= 1}>
            Ir
          </button>
        </form>
      </div>
    </div>
  )
}

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

/** Quantas vezes o item foi processado: o número como a API manda, sem conta. Alinhado ao centro, em colunas. */
function CelulaContagem({ valor }: { valor?: number | null }) {
  return (
    <Celula className="whitespace-nowrap text-center tabular-nums text-slate-600">
      {typeof valor === 'number' ? valor.toLocaleString('pt-BR') : <span className="text-slate-300">—</span>}
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
