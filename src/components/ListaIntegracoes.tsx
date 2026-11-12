import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ApiError, apiGet } from '../services/api'
import { coletaWebservices } from '../services/webservices'
import { ROTULO_SITUACAO, SITUACOES, type IntegracaoResumo, type PlataformaResumo } from '../types/integracao'
import { ModalEditarIntegracao } from './ModalEditarIntegracao'
import { PedidosDoCliente } from './PedidosDoCliente'
import { Alerta } from './ui/Alerta'
import { IconeEngrenagem, IconeLink, IconeLupa, IconeSetaDireita } from './ui/Icones'
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
  EtiquetaSituacao,
  EtiquetaSituacaoWebservice,
  Linha,
  RodapeContagem,
  SelectFiltro,
  Tabela,
  TituloConsulta,
} from './ui/Tabela'

interface Props {
  /** Incrementado quando uma integração é criada na outra aba. */
  versao?: number
}

function formatarData(valor: string | null): { data: string; hora: string } | null {
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

function normalizar(texto: string): string {
  return texto.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

/**
 * Consulta das integrações cadastradas. A situação (ATIVO, INATIVO, EM DESENVOLVIMENTO) é só exibição aqui: quem altera
 * é o popup da engrenagem, aberto por qualquer usuário (ver ModalEditarIntegracao, que decide o que cada perfil edita).
 *
 * A lista usa o GET /integracoes sem incluirCredenciais, então nenhum segredo trafega até aqui: a
 * chave privada só chega ao popup, pela rota de admin. Plataforma e situação filtram na API; a busca
 * por texto filtra o que já veio.
 */
export function ListaIntegracoes({ versao = 0 }: Props) {
  const [integracoes, setIntegracoes] = useState<IntegracaoResumo[]>([])
  const [opcoesPlataforma, setOpcoesPlataforma] = useState<string[]>(['mercos', 'tray'])
  const [plataforma, setPlataforma] = useState('')
  const [ativo, setAtivo] = useState('')
  const [busca, setBusca] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  /** Lojista cujos pedidos estão abertos. Enquanto aberto, a lista fica guardada com os filtros. */
  // A integração da linha clicada: a tela de pedidos é do lojista, mas mostra o webservice desta integração.
  const [integracaoAberta, setIntegracaoAberta] = useState<IntegracaoResumo | null>(null)
  /** Integração cujo popup de edição está aberto. */
  const [emEdicao, setEmEdicao] = useState<IntegracaoResumo | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  // O filtro de plataforma segue o cadastro (aba Plataformas). Se a consulta falhar, ficam as duas
  // que a tela sempre ofereceu.
  useEffect(() => {
    apiGet<PlataformaResumo[]>('/plataformas')
      .then((lista) => {
        if (lista.length > 0) {
          setOpcoesPlataforma(lista.map((p) => p.descricao).sort())
        }
      })
      .catch(() => {})
  }, [versao])

  const carregar = useCallback(() => {
    const parametros = new URLSearchParams()
    if (plataforma) {
      parametros.set('plataforma', plataforma)
    }
    if (ativo) {
      parametros.set('ativo', ativo)
    }
    const query = parametros.toString()

    setCarregando(true)
    setErro(null)

    return apiGet<IntegracaoResumo[]>(`/integracoes${query ? `?${query}` : ''}`)
      .then(setIntegracoes)
      .catch((e: unknown) => {
        setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar as integrações.')
      })
      .finally(() => setCarregando(false))
  }, [plataforma, ativo])

  useEffect(() => {
    carregar()
  }, [carregar, versao])

  // Situação do webservice de cada integração, lida da última checagem que o Monitoramento deixou em memória.
  // Esta tela não chama o n8n: sem checagem nesta sessão (ou para integração que não está ativa), fica "—".
  const { retrato: retratoWebservices } = useSyncExternalStore(coletaWebservices.assinar, coletaWebservices.ler)
  const webservices = useMemo(
    () => new Map((retratoWebservices?.itens ?? []).map((w) => [w.chave, w])),
    [retratoWebservices],
  )
  const checadoAs = retratoWebservices?.geradoEm
    ? new Date(retratoWebservices.geradoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : null

  const visiveis = useMemo(() => {
    const termo = normalizar(busca.trim())
    const filtradas = termo
      ? integracoes.filter((i) =>
          [i.codigoIntegracao, i.nomeCliente, String(i.codigoCliente)].some((campo) =>
            normalizar(campo ?? '').includes(termo),
          ),
        )
      : integracoes
    return [...filtradas].sort((a, b) =>
      (a.nomeCliente ?? '').localeCompare(b.nomeCliente ?? '', 'pt-BR', { sensitivity: 'base', numeric: true }),
    )
  }, [integracoes, busca])

  // O aviso de sucesso some sozinho; quem quiser reler a alteração tem o histórico no LOGINT.
  useEffect(() => {
    if (!aviso) {
      return
    }
    const temporizador = setTimeout(() => setAviso(null), 8000)
    return () => clearTimeout(temporizador)
  }, [aviso])

  const temFiltro = Boolean(plataforma || ativo || busca)
  const primeiraCarga = carregando && integracoes.length === 0 && !erro

  if (integracaoAberta) {
    return (
      <PedidosDoCliente
        integracao={integracaoAberta}
        aoVoltar={() => setIntegracaoAberta(null)}
      />
    )
  }

  function aoSalvarEdicao(editada: IntegracaoResumo, camposAlterados: string[]) {
    setEmEdicao(null)
    setAviso(
      `Integração ${editada.codigoIntegracao} (${editada.nomeCliente}) atualizada: ${camposAlterados.join(', ')}.`,
    )
    carregar()
  }

  function limpar() {
    setPlataforma('')
    setAtivo('')
    setBusca('')
  }

  return (
    <CartaoConsulta
      cabecalho={
        <>
          <TituloConsulta
            icone={<IconeLink />}
            titulo="Integrações cadastradas"
            subtitulo="Lojistas conectados às plataformas."
          />
          <BotaoAtualizar onClick={carregar} carregando={carregando} />
        </>
      }
      filtros={
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_auto] gap-3 items-center">
          <CampoBusca
            id="buscaIntegracao"
            aria-label="Buscar"
            placeholder="Buscar por código ou lojista…"
            value={busca}
            onChange={setBusca}
          />
          <SelectFiltro
            id="filtroPlataforma"
            aria-label="Plataforma"
            value={plataforma}
            onChange={setPlataforma}
          >
            <option value="">Todas as plataformas</option>
            {opcoesPlataforma.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </SelectFiltro>
          <SelectFiltro id="filtroAtivo" aria-label="Situação" value={ativo} onChange={setAtivo}>
            <option value="">Todas as situações</option>
            {SITUACOES.map((codigo) => (
              <option key={codigo} value={codigo}>
                {ROTULO_SITUACAO[codigo]}
              </option>
            ))}
          </SelectFiltro>
          <BotaoLimpar onClick={limpar} disabled={!temFiltro} />
        </div>
      }
      rodape={
        !erro && integracoes.length > 0 ? (
          <RodapeContagem visiveis={visiveis.length} total={integracoes.length} />
        ) : undefined
      }
    >
      <>
        {aviso && (
          <div className="px-5 pt-4">
            <Alerta tom="sucesso" titulo="Alterações salvas">
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
        ) : primeiraCarga ? (
          <Carregando />
        ) : visiveis.length === 0 ? (
          <EstadoVazio
            icone={<IconeLupa />}
            texto={
              integracoes.length === 0
                ? 'Nenhuma integração encontrada com esses filtros.'
                : 'Nenhuma integração corresponde à busca.'
            }
            acao={
              temFiltro && (
                <button
                  type="button"
                  onClick={limpar}
                  className="text-sm font-medium text-brand-700 underline-offset-4 hover:text-brand-800 hover:underline"
                >
                  Limpar filtros
                </button>
              )
            }
          />
        ) : (
          <Tabela
            colunas={[
              { rotulo: 'Código' },
              { rotulo: 'Lojista', className: 'w-full' },
              { rotulo: 'Plataforma' },
              { rotulo: 'Situação' },
              { rotulo: 'Webservice' },
              { rotulo: 'Cadastrada em' },
              { rotulo: 'Ações' },
            ]}
          >
            {visiveis.map((i) => {
              const quando = formatarData(i.dataInclusao)
              const webservice = webservices.get(`${i.codigoIntegracao}|${i.codigoCliente}`)
              return (
                <Linha key={`${i.codigoIntegracao}-${i.codigoCliente}`}>
                  <Celula primeira className="whitespace-nowrap">
                    <Codigo>{i.codigoIntegracao}</Codigo>
                  </Celula>
                  <Celula className="whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setIntegracaoAberta(i)}
                      title="Ver pedidos deste lojista"
                      className="group/lojista inline-flex items-center gap-1 font-medium text-slate-900 transition-colors hover:text-brand-700"
                    >
                      {i.nomeCliente}
                      <span className="h-3.5 w-3.5 -translate-x-1 text-brand-600 opacity-0 transition-all duration-150 group-hover/lojista:translate-x-0 group-hover/lojista:opacity-100">
                        <IconeSetaDireita />
                      </span>
                    </button>
                    <span className="ml-1.5 text-xs text-slate-400 tabular-nums">#{i.codigoCliente}</span>
                  </Celula>
                  <Celula className="whitespace-nowrap">
                    <EtiquetaPlataforma nome={i.plataforma} />
                  </Celula>
                  <Celula className="whitespace-nowrap">
                    <EtiquetaSituacao situacao={i.situacao} />
                  </Celula>
                  <Celula className="whitespace-nowrap">
                    {webservice ? (
                      <EtiquetaSituacaoWebservice
                        item={webservice}
                        title={`Checado às ${checadoAs}${webservice.erro ? ` · ${webservice.erro}` : ''}`}
                      />
                    ) : (
                      <span
                        className="cursor-help text-slate-300"
                        title={
                          retratoWebservices
                            ? 'Só as integrações ativas são checadas.'
                            : 'Sem checagem nesta sessão. Abra o Monitoramento para checar os webservices.'
                        }
                      >
                        —
                      </span>
                    )}
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
                      onClick={() => setEmEdicao(i)}
                      title={`Editar a configuração da integração ${i.codigoIntegracao}`}
                      aria-label={`Editar a configuração da integração ${i.codigoIntegracao} de ${i.nomeCliente}`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all duration-150 hover:bg-slate-100 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 active:scale-95"
                    >
                      <span className="h-4 w-4">
                        <IconeEngrenagem />
                      </span>
                    </button>
                  </Celula>
                </Linha>
              )
            })}
          </Tabela>
        )}
        {emEdicao && (
          <ModalEditarIntegracao integracao={emEdicao} aoFechar={() => setEmEdicao(null)} aoSalvar={aoSalvarEdicao} />
        )}
      </>
    </CartaoConsulta>
  )
}
