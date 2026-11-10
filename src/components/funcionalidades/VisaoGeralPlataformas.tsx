import { useMemo, useState } from 'react'
import type { CoberturaPlataforma } from '../../types/funcionalidades'
import { IconeCamadas, IconeLupa } from '../ui/Icones'
import {
  CampoBusca,
  CartaoConsulta,
  Celula,
  EstadoVazio,
  EtiquetaPlataforma,
  Linha,
  RodapeContagem,
  Tabela,
  TituloConsulta,
  type ColunaTabela,
} from '../ui/Tabela'
import { formatarPercentual } from './Etiquetas'

interface Props {
  plataformas: CoberturaPlataforma[]
  /** Clicar numa plataforma abre a lista de funcionalidades dela. */
  aoEscolher: (plataforma: string) => void
}

type Coluna = 'nome' | 'percentual' | 'total' | 'implementadas' | 'parciais' | 'naoImplementadas' | 'naoSeAplicam' | 'testadas'
type Sentido = 'asc' | 'desc'

/** Acima disto, plataforma sem nada feito vem escondida: com dezenas delas, são só linhas de "0,0%". */
const LIMITE_PARA_OCULTAR = 15

const simplificar = (texto: string) => texto.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')

function valorDe(p: CoberturaPlataforma, coluna: Coluna): string | number | null {
  switch (coluna) {
    case 'nome':
      return simplificar(p.plataformaNome)
    case 'percentual':
      return p.percentual
    case 'total':
      return p.total
    case 'implementadas':
      return p.implementadas
    case 'parciais':
      return p.parciais
    case 'naoImplementadas':
      return p.naoImplementadas
    case 'naoSeAplicam':
      return p.naoSeAplica
    case 'testadas':
      return p.testadas
  }
}

/**
 * Todas as plataformas numa tabela de uma linha cada: é onde se responde "qual está pior?" ou "qual nem começou?".
 * Ordena por qualquer coluna, busca pelo nome e, com muitas plataformas, esconde as que ainda não têm nada
 * implementado nem parcial (o rodapé sempre diz quantas estão à mostra).
 */
export function VisaoGeralPlataformas({ plataformas, aoEscolher }: Props) {
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<{ coluna: Coluna; sentido: Sentido }>({ coluna: 'nome', sentido: 'asc' })
  const [ocultarSemProgresso, setOcultarSemProgresso] = useState(plataformas.length > LIMITE_PARA_OCULTAR)

  const visiveis = useMemo(() => {
    const termo = simplificar(busca.trim())
    const filtradas = plataformas.filter(
      (p) =>
        (!ocultarSemProgresso || p.implementadas + p.parciais > 0) &&
        (!termo || simplificar(p.plataformaNome).includes(termo) || simplificar(p.plataforma).includes(termo)),
    )
    const fator = ordem.sentido === 'asc' ? 1 : -1
    return [...filtradas].sort((a, b) => {
      const va = valorDe(a, ordem.coluna)
      const vb = valorDe(b, ordem.coluna)
      // Sem percentual (nada se aplica) vai sempre para o fim, qualquer que seja o sentido.
      if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1
      return (va < vb ? -1 : va > vb ? 1 : 0) * fator
    })
  }, [plataformas, busca, ordem, ocultarSemProgresso])

  function ordenarPor(coluna: Coluna, primeiroSentido: Sentido) {
    setOrdem((atual) =>
      atual.coluna === coluna ? { coluna, sentido: atual.sentido === 'asc' ? 'desc' : 'asc' } : { coluna, sentido: primeiroSentido },
    )
  }

  const coluna = (rotulo: string, id: Coluna, primeiroSentido: Sentido = 'desc', className?: string): ColunaTabela => ({
    rotulo,
    className,
    ordenacao: ordem.coluna === id ? ordem.sentido : primeiroSentido,
    onOrdenar: () => ordenarPor(id, primeiroSentido),
    dicaOrdenacao: `Ordenar por ${rotulo.toLowerCase()}: clique para inverter`,
  })

  const escondidas = plataformas.length - visiveis.length

  return (
    <CartaoConsulta
      cabecalho={
        <TituloConsulta
          icone={<IconeCamadas />}
          titulo="Visão geral"
          subtitulo="Cobertura de todas as plataformas. Clique numa para ver as funcionalidades dela."
        />
      }
      filtros={
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="w-full sm:w-72">
            <CampoBusca aria-label="Buscar plataforma" placeholder="Buscar plataforma…" value={busca} onChange={setBusca} />
          </div>
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={ocultarSemProgresso}
              onChange={(e) => setOcultarSemProgresso(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Ocultar plataformas sem nada implementado
          </label>
        </div>
      }
      rodape={
        <>
          <RodapeContagem visiveis={visiveis.length} total={plataformas.length} />
          {escondidas > 0 && ocultarSemProgresso && !busca && (
            <>
              {' '}
              ·{' '}
              <button type="button" onClick={() => setOcultarSemProgresso(false)} className="font-medium text-brand-700 hover:underline">
                mostrar as {escondidas} sem progresso
              </button>
            </>
          )}
        </>
      }
    >
      {visiveis.length === 0 ? (
        <EstadoVazio
          icone={<IconeLupa />}
          texto={busca ? 'Nenhuma plataforma corresponde à busca.' : 'Nenhuma plataforma tem funcionalidade implementada ainda.'}
        />
      ) : (
        <Tabela
          alturaMaxima="max-h-[65vh]"
          colunas={[
            coluna('Plataforma', 'nome', 'asc', 'w-56'),
            coluna('Cobertura', 'percentual', 'asc', 'min-w-[14rem]'),
            coluna('Total', 'total'),
            coluna('Implementadas', 'implementadas'),
            coluna('Parciais', 'parciais'),
            coluna('Faltam', 'naoImplementadas'),
            coluna('Não se aplicam', 'naoSeAplicam'),
            coluna('Testadas', 'testadas'),
          ]}
        >
          {visiveis.map((p) => (
            <Linha key={p.plataforma}>
              <Celula primeira>
                <button
                  type="button"
                  onClick={() => aoEscolher(p.plataforma)}
                  title={`Ver as funcionalidades de ${p.plataformaNome}`}
                  className="rounded-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25"
                >
                  <EtiquetaPlataforma nome={p.plataformaNome} />
                </button>
              </Celula>
              <Celula>
                <div className="flex items-center gap-3">
                  <div
                    className="h-1.5 w-32 overflow-hidden rounded-full bg-slate-100"
                    role="progressbar"
                    aria-label={`Cobertura de ${p.plataformaNome}`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={p.percentual ?? undefined}
                  >
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${p.percentual ?? 0}%` }} />
                  </div>
                  <span className="w-14 text-right font-semibold tabular-nums text-slate-900">{formatarPercentual(p.percentual)}</span>
                </div>
              </Celula>
              <Celula className="tabular-nums font-medium text-slate-900">{p.total}</Celula>
              <Celula className="tabular-nums text-emerald-700">{p.implementadas}</Celula>
              <Celula className="tabular-nums text-amber-700">{p.parciais}</Celula>
              <Celula className="tabular-nums text-red-700">{p.naoImplementadas}</Celula>
              <Celula className="tabular-nums text-slate-500">{p.naoSeAplica}</Celula>
              <Celula ultima className="whitespace-nowrap tabular-nums text-slate-600">
                {p.testadas} <span className="text-slate-400">de {p.implementadas + p.parciais}</span>
              </Celula>
            </Linha>
          ))}
        </Tabela>
      )}
    </CartaoConsulta>
  )
}
