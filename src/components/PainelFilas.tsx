import { useMemo, useState, type ReactNode } from 'react'
import {
  FILAS,
  LIMITE_ATENCAO,
  ROTULO_FILA,
  situacaoDaFila,
  type LinhaFilas,
  type NomeFila,
  type ValorFila,
} from '../types/filas'
import { IconeCheck, IconeLupa } from './ui/Icones'
import {
  BotaoLimpar,
  CampoBusca,
  CartaoConsulta,
  Celula,
  EstadoVazio,
  EtiquetaPlataforma,
  Linha,
  RodapeContagem,
  SelectFiltro,
  Tabela,
} from './ui/Tabela'

interface Filtros {
  cliente: string
  plataforma: string
  somenteAtencao: boolean
  somenteComFila: boolean
}

// "Somente em atenção" e "Somente com fila" já vêm marcados: a tela abre só com o que precisa de olhar.
const FILTROS_PADRAO: Filtros = { cliente: '', plataforma: '', somenteAtencao: true, somenteComFila: true }

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

/** Tem ao menos um item esperando em alguma fila. "-" (timeout) e "erro" não contam: não são contagem. */
function temAlgoNaFila(linha: LinhaFilas): boolean {
  return FILAS.some((fila) => {
    const valor = linha.dados[fila]
    return typeof valor === 'number' && valor > 0
  })
}

/**
 * Filas de processamento por cliente. Os dados vêm prontos do Monitoramento (que também usa a
 * contagem na aba); aqui ficam só os filtros e a tabela.
 */
export function PainelFilas({
  cabecalho,
  linhas,
  coletado,
  indisponivel,
}: {
  cabecalho: ReactNode
  linhas: LinhaFilas[]
  /** Já houve ao menos uma coleta do n8n. */
  coletado: boolean
  /** A leitura do retrato falhou e não há retrato anterior para mostrar. */
  indisponivel: boolean
}) {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_PADRAO)

  const plataformas = useMemo(
    () => Array.from(new Set(linhas.map((l) => l.plataforma).filter(Boolean))).sort(),
    [linhas],
  )

  const visiveis = useMemo(() => {
    const busca = normalizar(filtros.cliente)
    return linhas.filter(
      (l) =>
        (!busca || normalizar(l.cliente).includes(busca)) &&
        (!filtros.plataforma || l.plataforma === filtros.plataforma) &&
        (!filtros.somenteAtencao || l.filasEmAtencao.length > 0) &&
        (!filtros.somenteComFila || temAlgoNaFila(l)),
    )
  }, [linhas, filtros])

  // "Limpar" volta ao padrão, então só habilita quando algo difere dele.
  const temFiltro = (Object.keys(FILTROS_PADRAO) as (keyof Filtros)[]).some((k) => filtros[k] !== FILTROS_PADRAO[k])
  const limpar = () => setFiltros(FILTROS_PADRAO)

  const colunas = [
    { rotulo: 'Cliente' },
    { rotulo: 'Plataforma' },
    ...FILAS.map((fila) => ({
      rotulo: `${ROTULO_FILA[fila]} · >${LIMITE_ATENCAO[fila]}`,
      className: 'text-right',
    })),
  ]

  return (
    <CartaoConsulta
      cabecalho={cabecalho}
      filtros={
        <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-2 lg:grid-cols-[1.3fr_1fr_auto_auto_auto]">
          <CampoBusca
            id="filtroClienteFilas"
            aria-label="Cliente"
            placeholder="Buscar cliente…"
            value={filtros.cliente}
            onChange={(v) => setFiltros((f) => ({ ...f, cliente: v }))}
          />
          <SelectFiltro
            id="filtroPlataformaFilas"
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
              checked={filtros.somenteAtencao}
              onChange={(e) => setFiltros((f) => ({ ...f, somenteAtencao: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Somente em atenção
          </label>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 text-sm font-medium text-slate-600">
            <input
              type="checkbox"
              checked={filtros.somenteComFila}
              onChange={(e) => setFiltros((f) => ({ ...f, somenteComFila: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Somente com fila
          </label>
          <BotaoLimpar onClick={limpar} disabled={!temFiltro} />
        </div>
      }
      rodape={linhas.length > 0 ? <RodapeContagem visiveis={visiveis.length} total={linhas.length} /> : undefined}
    >
      {indisponivel ? (
        <EstadoVazio
          tom="erro"
          icone={<IconeLupa />}
          titulo="Não foi possível ler as filas"
          texto="O n8n não respondeu. A tela tenta de novo em 5 minutos."
        />
      ) : !coletado ? (
        <EstadoVazio
          icone={<IconeLupa />}
          titulo="Coletando as filas…"
          texto="Aguardando a primeira coleta do n8n, que pode levar alguns instantes. Depois ela se repete a cada 5 minutos."
        />
      ) : linhas.length === 0 ? (
        <EstadoVazio icone={<IconeLupa />} texto="Nenhum cliente ativo foi encontrado na última coleta." />
      ) : visiveis.length === 0 ? (
        <EstadoVazio
          tom={filtros.somenteAtencao && !filtros.cliente && !filtros.plataforma ? 'sucesso' : 'neutro'}
          icone={filtros.somenteAtencao && !filtros.cliente && !filtros.plataforma ? <IconeCheck /> : <IconeLupa />}
          titulo={
            filtros.somenteAtencao && !filtros.cliente && !filtros.plataforma ? 'Nenhuma fila em atenção' : undefined
          }
          texto={
            filtros.somenteAtencao && !filtros.cliente && !filtros.plataforma
              ? 'Todas as filas estão abaixo do limite.'
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
        <Tabela colunas={colunas} arrastavel>
          {visiveis.map((l) => (
            <Linha key={l.cliente}>
              <Celula primeira className="whitespace-nowrap font-medium text-slate-900">
                <span className="inline-flex items-center gap-2">
                  {l.cliente.toUpperCase()}
                  {l.filasEmAtencao.length > 0 && (
                    <span
                      className="rounded-full bg-red-100 px-1.5 py-0.5 text-[11px] font-semibold text-red-700"
                      title={`Em atenção: ${l.filasEmAtencao.map((f) => ROTULO_FILA[f]).join(', ')}`}
                    >
                      {l.filasEmAtencao.length}
                    </span>
                  )}
                </span>
              </Celula>
              <Celula className="whitespace-nowrap">
                <EtiquetaPlataforma nome={l.plataforma} />
              </Celula>
              {FILAS.map((fila) => (
                <Celula key={fila} className="whitespace-nowrap text-right tabular-nums">
                  <ValorDaFila fila={fila} valor={l.dados[fila]} />
                </Celula>
              ))}
            </Linha>
          ))}
        </Tabela>
      )}
    </CartaoConsulta>
  )
}

function ValorDaFila({ fila, valor }: { fila: NomeFila; valor: ValorFila }) {
  // Fila que não existe para a plataforma (ex.: NFe no Shopify) nem vem no retrato.
  if (valor === undefined || valor === null) {
    return <span className="text-slate-300">n/a</span>
  }

  const situacao = situacaoDaFila(fila, valor)

  if (situacao === 'sem-dado') {
    const timeout = valor === '-'
    return (
      <span
        className="cursor-help text-amber-600"
        title={timeout ? 'A consulta estourou o tempo limite.' : String(valor)}
      >
        {timeout ? '—' : 'erro'}
      </span>
    )
  }

  if (situacao === 'atencao') {
    return (
      <span
        className="inline-flex rounded-md bg-red-50 px-2 py-0.5 font-semibold text-red-700 ring-1 ring-inset ring-red-600/20"
        title={`Acima do limite de ${LIMITE_ATENCAO[fila].toLocaleString('pt-BR')}`}
      >
        {Number(valor).toLocaleString('pt-BR')}
      </span>
    )
  }

  return <span className={valor === 0 ? 'text-slate-400' : 'text-slate-700'}>{Number(valor).toLocaleString('pt-BR')}</span>
}
