import { useMemo, useState, type ReactNode } from 'react'
import {
  ordenarWebservices,
  retratoEstaVelho,
  tempoDesde,
  type RetratoWebservices,
} from '../types/webservices'
import { IconeAviso, IconeCheck, IconeLupa } from './ui/Icones'
import {
  BotaoLimpar,
  CampoBusca,
  Carregando,
  CartaoConsulta,
  Celula,
  Codigo,
  EstadoVazio,
  EtiquetaPlataforma,
  EtiquetaSituacaoWebservice,
  Linha,
  RodapeContagem,
  SelectFiltro,
  Tabela,
} from './ui/Tabela'

interface Filtros {
  cliente: string
  plataforma: string
  somenteFora: boolean
}

// Abre com todos: os fora do ar já vêm no topo, e os que estão rodando ficam logo abaixo.
const FILTROS_PADRAO: Filtros = { cliente: '', plataforma: '', somenteFora: false }

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

/**
 * Webservices do ERP por integração: quem está fora do ar primeiro, depois os que respondem. Os dados
 * vêm prontos do Monitoramento (que também usa a contagem na aba); aqui ficam os filtros e a tabela.
 */
export function PainelWebservices({
  cabecalho,
  retrato,
  indisponivel,
}: {
  cabecalho: ReactNode
  /** Última leitura do n8n; nulo enquanto a primeira não chega. */
  retrato: RetratoWebservices | null
  /** A leitura falhou e não há retrato anterior para mostrar. */
  indisponivel: boolean
}) {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_PADRAO)

  const linhas = useMemo(() => ordenarWebservices(retrato?.itens ?? []), [retrato])
  const plataformas = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.plataforma).filter(Boolean))).sort(),
    [linhas],
  )

  const visiveis = useMemo(() => {
    const busca = normalizar(filtros.cliente)
    return linhas.filter(
      (l) =>
        (!busca || normalizar(l.cliente).includes(busca) || l.codigoIntegracao.includes(busca)) &&
        (!filtros.plataforma || l.plataforma === filtros.plataforma) &&
        (!filtros.somenteFora || l.situacao === 'fora'),
    )
  }, [linhas, filtros])

  const temFiltro = (Object.keys(FILTROS_PADRAO) as (keyof Filtros)[]).some((k) => filtros[k] !== FILTROS_PADRAO[k])
  const limpar = () => setFiltros(FILTROS_PADRAO)
  const soFiltroDeFora = filtros.somenteFora && !filtros.cliente && !filtros.plataforma
  const velho = retratoEstaVelho(retrato)

  const colunas = [
    { rotulo: 'Código' },
    { rotulo: 'Cliente' },
    { rotulo: 'Plataforma' },
    { rotulo: 'Situação' },
    { rotulo: 'Fora desde' },
    { rotulo: 'Erro', className: 'w-full' },
    { rotulo: 'Webservice' },
  ]

  return (
    <CartaoConsulta
      cabecalho={cabecalho}
      filtros={
        <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_auto_auto]">
          <CampoBusca
            id="filtroClienteWebservices"
            aria-label="Cliente"
            placeholder="Buscar cliente…"
            value={filtros.cliente}
            onChange={(v) => setFiltros((f) => ({ ...f, cliente: v }))}
          />
          <SelectFiltro
            id="filtroPlataformaWebservices"
            aria-label="Plataforma"
            value={filtros.plataforma}
            onChange={(v) => setFiltros((f) => ({ ...f, plataforma: v }))}
          >
            <option value="">Todas as plataformas</option>
            {plataformas.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </SelectFiltro>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              checked={filtros.somenteFora}
              onChange={(e) => setFiltros((f) => ({ ...f, somenteFora: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Somente fora do ar
          </label>
          <BotaoLimpar onClick={limpar} disabled={!temFiltro} />
        </div>
      }
      rodape={linhas.length > 0 ? <RodapeContagem visiveis={visiveis.length} total={linhas.length} /> : undefined}
    >
      {velho && retrato?.geradoEm && (
        <div
          role="alert"
          className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-5 py-2.5 text-[13px] font-medium text-amber-800"
        >
          <span className="h-4 w-4 shrink-0">
            <IconeAviso />
          </span>
          A última checagem foi {tempoDesde(retrato.geradoEm)}. O fluxo do n8n pode estar parado, então a situação
          abaixo pode não ser a atual.
        </div>
      )}
      {indisponivel ? (
        <EstadoVazio
          tom="erro"
          icone={<IconeLupa />}
          titulo="Não foi possível ler os webservices"
          texto="O n8n não respondeu. A tela tenta de novo em 1 minuto."
        />
      ) : retrato === null ? (
        <Carregando texto="Lendo os webservices…" />
      ) : !retrato.geradoEm ? (
        // O n8n ainda não terminou nenhuma checagem (ela roda a cada minuto): a tela tenta de novo a cada 10 s.
        <Carregando texto="Aguardando a primeira checagem do n8n… ela leva alguns segundos." />
      ) : linhas.length === 0 ? (
        <EstadoVazio icone={<IconeLupa />} texto="Nenhuma integração ativa foi encontrada na última checagem." />
      ) : visiveis.length === 0 ? (
        <EstadoVazio
          tom={soFiltroDeFora ? 'sucesso' : 'neutro'}
          icone={soFiltroDeFora ? <IconeCheck /> : <IconeLupa />}
          titulo={soFiltroDeFora ? 'Nenhum webservice fora do ar' : undefined}
          texto={
            soFiltroDeFora
              ? 'Todos os webservices responderam na última checagem.'
              : 'Nenhum cliente encontrado com os filtros aplicados.'
          }
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
        <Tabela colunas={colunas}>
          {visiveis.map((l) => (
            <Linha key={l.chave}>
              <Celula primeira className="whitespace-nowrap">
                <Codigo>{l.codigoIntegracao || '—'}</Codigo>
              </Celula>
              <Celula className="whitespace-nowrap font-medium text-slate-900">{l.cliente.toUpperCase()}</Celula>
              <Celula className="whitespace-nowrap">
                <EtiquetaPlataforma nome={l.plataforma} />
              </Celula>
              <Celula className="whitespace-nowrap">
                <EtiquetaSituacaoWebservice item={l} />
              </Celula>
              <Celula className="whitespace-nowrap tabular-nums text-slate-600">
                {l.foraDesde ? (
                  <span title={new Date(l.foraDesde).toLocaleString('pt-BR')}>{tempoDesde(l.foraDesde)}</span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </Celula>
              <Celula className="min-w-[16rem] text-slate-600">
                {l.erro ? <span className="break-words text-red-700">{l.erro}</span> : <span className="text-slate-300">—</span>}
              </Celula>
              <Celula ultima className="whitespace-nowrap font-mono text-xs text-slate-500">
                {l.urlWebservice || '—'}
              </Celula>
            </Linha>
          ))}
        </Tabela>
      )}
    </CartaoConsulta>
  )
}
