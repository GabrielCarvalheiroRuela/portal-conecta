import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { ApiError, apiGet, ehAdmin, temPerfil } from '../../services/api'
import type { CoberturaPlataforma, SituacaoFuncionalidade, StatusFuncionalidade, StatusTeste } from '../../types/funcionalidades'
import { Alerta } from '../ui/Alerta'
import { Botao } from '../ui/Botao'
import { IconeCamadas, IconeEngrenagem, IconeLapis, IconeLupa, IconeMais, IconeSetaDireita, IconeX } from '../ui/Icones'
import {
  BotaoAtualizar,
  BotaoLimpar,
  CampoBusca,
  Carregando,
  Celula,
  Codigo,
  EstadoVazio,
  Linha,
  RodapeContagem,
  SelectFiltro,
  Tabela,
  TituloConsulta,
} from '../ui/Tabela'
import { AbasStatus } from './AbasStatus'
import { ConectarMcp } from './ConectarMcp'
import { EscolherPlataforma } from './EscolherPlataforma'
import { EtiquetaPrioridade, EtiquetaStatus, EtiquetaTeste, formatarData, formatarPercentual, ROTULO_TESTE, TESTES } from './Etiquetas'
import { ModalFuncionalidade } from './ModalFuncionalidade'
import { ModalSituacao } from './ModalSituacao'
import { ResumoPlataforma } from './ResumoPlataforma'
import { SeloMcp } from './SeloMcp'
import { VisaoGeralPlataformas } from './VisaoGeralPlataformas'

const CLASSE_ICONE =
  'flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-all duration-150 hover:bg-slate-100 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 active:scale-95'

const AVISO_MS = 6000

/** Texto da linha em minúsculas e sem acento, para a busca achar "preco" em "Preço". */
function simplificar(texto: string | null | undefined): string {
  return (texto ?? '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
}

type Edicao = { tipo: 'situacao'; item: SituacaoFuncionalidade } | { tipo: 'funcionalidade'; item?: SituacaoFuncionalidade }

/**
 * A matriz de funcionalidades das integrações (Req. Altera 474225): a cobertura de cada plataforma e, embaixo, a
 * situação de cada funcionalidade na plataforma escolhida. DEV e ADM consultam e marcam a situação (o botão Situação); só o
 * ADM cria, edita e exclui funcionalidades (o lápis e o botão Nova funcionalidade), e a API confere o perfil a cada
 * chamada (esconder os botões é só conforto).
 *
 * A API devolve tudo de uma vez (a lista é pequena: algumas centenas de linhas no máximo), então os filtros rodam aqui, na hora.
 */
export function PaginaFuncionalidades() {
  const admin = ehAdmin()
  const podeMarcar = temPerfil('DEV')

  const [linhas, setLinhas] = useState<SituacaoFuncionalidade[]>([])
  const [cobertura, setCobertura] = useState<CoberturaPlataforma[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const [plataforma, setPlataforma] = useState<string | null>(null)
  // A lista de uma plataforma, ou a tabela com todas elas.
  const [visao, setVisao] = useState<'plataforma' | 'geral'>('plataforma')
  const [busca, setBusca] = useState('')
  const [modulo, setModulo] = useState('')
  const [status, setStatus] = useState<StatusFuncionalidade | ''>('')
  const [teste, setTeste] = useState<StatusTeste | ''>('')
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set())
  const [edicao, setEdicao] = useState<Edicao | null>(null)

  const carregar = useCallback(() => {
    setCarregando(true)
    setErro(null)
    return Promise.all([
      apiGet<SituacaoFuncionalidade[]>('/funcionalidades'),
      apiGet<CoberturaPlataforma[]>('/funcionalidades/cobertura'),
    ])
      .then(([situacoes, coberturas]) => {
        setLinhas(situacoes)
        setCobertura(coberturas)
        setPlataforma((atual) => (atual && coberturas.some((c) => c.plataforma === atual) ? atual : (coberturas[0]?.plataforma ?? null)))
      })
      .catch((e: unknown) => {
        setErro(e instanceof ApiError ? e.message : 'Não foi possível carregar as funcionalidades.')
      })
      .finally(() => setCarregando(false))
  }, [])

  useEffect(() => {
    carregar()
  }, [carregar])

  // O aviso de "salvo" some sozinho: é confirmação, não algo para ficar ocupando o topo da tela.
  useEffect(() => {
    if (!aviso) return
    const id = window.setTimeout(() => setAviso(null), AVISO_MS)
    return () => window.clearTimeout(id)
  }, [aviso])

  const resumo = cobertura.find((c) => c.plataforma === plataforma)
  const daPlataforma = useMemo(() => linhas.filter((l) => l.plataforma === plataforma), [linhas, plataforma])
  const modulosDaLista = useMemo(() => Array.from(new Set(linhas.map((l) => l.modulo))), [linhas])

  const visiveis = useMemo(() => {
    const termo = simplificar(busca.trim())
    return daPlataforma.filter(
      (l) =>
        (!modulo || l.modulo === modulo) &&
        (!status || l.status === status) &&
        (!teste || l.teste === teste) &&
        (!termo ||
          simplificar(`${l.nome} ${l.descricao} ${l.observacao} ${l.workflow} ${l.configuracaoErp} ${l.responsavel} ${l.requisitoAltera}`).includes(termo)),
    )
  }, [daPlataforma, busca, modulo, status, teste])

  // Agrupa por módulo na ordem em que a API devolve (a ordem da lista).
  const grupos = useMemo(() => {
    const porModulo = new Map<string, SituacaoFuncionalidade[]>()
    for (const l of visiveis) {
      porModulo.set(l.modulo, [...(porModulo.get(l.modulo) ?? []), l])
    }
    return Array.from(porModulo, ([nome, itens]) => ({ nome, itens, cobertura: resumo?.modulos.find((m) => m.modulo === nome) }))
  }, [visiveis, resumo])

  const temFiltro = busca !== '' || modulo !== '' || status !== '' || teste !== ''
  // Com busca ou filtro ativo os módulos ficam todos abertos: um resultado escondido num módulo recolhido pareceria "não achei".
  const fechado = (nome: string) => !temFiltro && recolhidos.has(nome)
  const todosRecolhidos = grupos.length > 0 && grupos.every((g) => recolhidos.has(g.nome))

  function alternarModulo(nome: string) {
    setRecolhidos((atual) => {
      const novo = new Set(atual)
      if (!novo.delete(nome)) novo.add(nome)
      return novo
    })
  }

  function escolherPlataforma(id: string) {
    setPlataforma(id)
    setModulo('')
    setRecolhidos(new Set())
    setVisao('plataforma')
  }

  function limparFiltros() {
    setBusca('')
    setModulo('')
    setStatus('')
    setTeste('')
  }

  function concluir(mensagem: string) {
    setEdicao(null)
    setAviso(mensagem)
    carregar()
  }

  const primeiraCarga = carregando && linhas.length === 0 && !erro
  const colunas = [
    { rotulo: 'Funcionalidade', className: 'min-w-[14rem]' },
    { rotulo: 'Situação', className: 'min-w-[9rem]' },
    { rotulo: 'Regra / observação', className: 'min-w-[13rem]' },
    { rotulo: 'Workflow e ERP' },
    { rotulo: 'Responsável' },
    // Fixa à direita: com a tabela larga, o botão de editar não pode ficar para fora da tela.
    ...(podeMarcar ? [{ rotulo: 'Ações', className: 'sticky right-0 bg-slate-50' }] : []),
  ]

  return (
    <div className="space-y-5">
      {aviso && (
        <div className="relative">
          <Alerta tom="sucesso">{aviso}</Alerta>
          <button
            type="button"
            onClick={() => setAviso(null)}
            aria-label="Fechar aviso"
            className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-lg text-emerald-700/70 transition-colors hover:bg-emerald-500/10 hover:text-emerald-700"
          >
            <span className="h-4 w-4">
              <IconeX />
            </span>
          </button>
        </div>
      )}

      {erro && !carregando ? (
        <Alerta tom="erro" titulo="Não foi possível carregar">
          {erro}
          <div className="mt-2">
            <BotaoAtualizar onClick={carregar} carregando={carregando} rotulo="Tentar de novo" />
          </div>
        </Alerta>
      ) : primeiraCarga ? (
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-card">
          <Carregando texto="Carregando a matriz…" />
        </div>
      ) : cobertura.length === 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-card">
          <EstadoVazio
            icone={<IconeCamadas />}
            titulo="Nenhuma funcionalidade cadastrada ainda"
            texto={
              admin
                ? 'Cadastre a primeira funcionalidade. Ela vale para todas as plataformas já cadastradas, e depois você marca a situação dela em cada uma.'
                : 'O time ainda não cadastrou funcionalidades.'
            }
            acao={
              admin ? (
                <Botao type="button" onClick={() => setEdicao({ tipo: 'funcionalidade' })}>
                  <span className="h-4 w-4">
                    <IconeMais />
                  </span>
                  Nova funcionalidade
                </Botao>
              ) : undefined
            }
          />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <EscolherPlataforma plataformas={cobertura} selecionada={plataforma} aoSelecionar={escolherPlataforma} />
            <button
              type="button"
              aria-pressed={visao === 'geral'}
              onClick={() => setVisao(visao === 'geral' ? 'plataforma' : 'geral')}
              className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium shadow-soft transition-all duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25 ${
                visao === 'geral'
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-slate-200 bg-surface text-slate-700 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span className="h-4 w-4">
                <IconeCamadas />
              </span>
              Visão geral
              <span className="rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold tabular-nums text-slate-600">{cobertura.length}</span>
            </button>
            {/* O MCP é infraestrutura, não o assunto da tela: fica à direita, menor e com menos peso. */}
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <SeloMcp />
              <ConectarMcp />
            </div>
          </div>

          {visao === 'geral' ? (
            <VisaoGeralPlataformas plataformas={cobertura} aoEscolher={escolherPlataforma} />
          ) : (
            <>
              {resumo && <ResumoPlataforma plataforma={resumo} />}

              <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-card">
                <div className="group flex flex-wrap items-center justify-between gap-4 px-5 py-4">
                  <TituloConsulta
                    icone={<IconeCamadas />}
                    titulo={`Funcionalidades de ${resumo?.plataformaNome ?? ''}`}
                    subtitulo={resumo ? `${resumo.total} no total, em ${resumo.modulos.length} ${resumo.modulos.length === 1 ? 'módulo' : 'módulos'}` : undefined}
                  />
                  <div className="flex items-center gap-2">
                    <BotaoAtualizar
                      onClick={() => {
                        setAviso(null)
                        carregar()
                      }}
                      carregando={carregando}
                    />
                    {admin && (
                      <Botao type="button" className="!h-9 !px-3" onClick={() => setEdicao({ tipo: 'funcionalidade' })}>
                        <span className="h-4 w-4">
                          <IconeMais />
                        </span>
                        Nova funcionalidade
                      </Botao>
                    )}
                  </div>
                </div>

                {resumo && (
                  <div className="border-b border-slate-100 px-5">
                    <AbasStatus plataforma={resumo} valor={status} aoEscolher={setStatus} />
                  </div>
                )}

                <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="w-full sm:w-72">
                      <CampoBusca
                        id="buscaFuncionalidade"
                        aria-label="Buscar funcionalidade"
                        placeholder="Buscar por nome, regra, workflow, responsável…"
                        value={busca}
                        onChange={setBusca}
                      />
                    </div>
                    <div className="w-full sm:w-52">
                      <SelectFiltro aria-label="Filtrar por módulo" value={modulo} onChange={setModulo}>
                        <option value="">Todos os módulos</option>
                        {(resumo?.modulos ?? []).map((m) => (
                          <option key={m.modulo} value={m.modulo}>
                            {m.modulo}
                          </option>
                        ))}
                      </SelectFiltro>
                    </div>
                    <div className="w-full sm:w-40">
                      <SelectFiltro aria-label="Filtrar por teste" value={teste} onChange={(v) => setTeste(v as StatusTeste | '')}>
                        <option value="">Qualquer teste</option>
                        {TESTES.map((t) => (
                          <option key={t} value={t}>
                            {ROTULO_TESTE[t]}
                          </option>
                        ))}
                      </SelectFiltro>
                    </div>
                    <BotaoLimpar onClick={limparFiltros} disabled={!temFiltro} />
                    {grupos.length > 1 && !temFiltro && (
                      <button
                        type="button"
                        onClick={() => setRecolhidos(todosRecolhidos ? new Set() : new Set(grupos.map((g) => g.nome)))}
                        className="ml-auto rounded-lg px-2 py-1.5 text-[13px] font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25"
                      >
                        {todosRecolhidos ? 'Expandir módulos' : 'Recolher módulos'}
                      </button>
                    )}
                  </div>
                </div>

                {visiveis.length === 0 ? (
                  <EstadoVazio
                    icone={<IconeLupa />}
                    texto={daPlataforma.length === 0 ? 'Nenhuma funcionalidade nesta plataforma.' : 'Nenhuma funcionalidade corresponde aos filtros.'}
                  />
                ) : (
                  <Tabela colunas={colunas} alturaMaxima="max-h-[70vh]">
                    {grupos.map((grupo) => {
                      const oculto = fechado(grupo.nome)
                      return (
                        <Fragment key={grupo.nome}>
                          <tr className="bg-slate-50/90">
                            <td colSpan={colunas.length} className="p-0">
                              <button
                                type="button"
                                onClick={() => alternarModulo(grupo.nome)}
                                aria-expanded={!oculto}
                                disabled={temFiltro}
                                title={temFiltro ? 'Com filtro ativo os módulos ficam abertos' : oculto ? 'Expandir o módulo' : 'Recolher o módulo'}
                                className="flex w-full items-center gap-3 py-2.5 pl-1 pr-5 text-left transition-colors enabled:hover:bg-slate-100/70 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-brand-500/25 disabled:cursor-default"
                              >
                                {/* A seta fica na margem (4 + 16 = 20 px) para o nome do módulo começar na mesma linha dos nomes das funcionalidades. */}
                                <span className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-150 ${oculto ? '' : 'rotate-90'}`}>
                                  <IconeSetaDireita />
                                </span>
                                <span className="-ml-3 text-[12px] font-semibold uppercase tracking-[0.06em] text-slate-700">{grupo.nome}</span>
                                <span className="text-[12px] text-slate-500">
                                  {grupo.itens.length} {grupo.itens.length === 1 ? 'funcionalidade' : 'funcionalidades'}
                                </span>
                                {grupo.cobertura && (
                                  <span className="ml-auto flex items-center gap-2.5" title="Cobertura do módulo">
                                    <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-slate-200 sm:block">
                                      <span
                                        className="block h-full rounded-full bg-brand-500"
                                        style={{ width: `${grupo.cobertura.percentual ?? 0}%` }}
                                      />
                                    </span>
                                    <span className="w-12 text-right text-[12px] font-semibold tabular-nums text-slate-600">
                                      {formatarPercentual(grupo.cobertura.percentual)}
                                    </span>
                                  </span>
                                )}
                              </button>
                            </td>
                          </tr>
                          {!oculto &&
                            grupo.itens.map((l) => (
                              <Linha key={l.funcionalidadeId}>
                                <Celula primeira>
                                  <p className="font-medium text-slate-900">{l.nome}</p>
                                  {l.descricao && (
                                    <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-slate-500" title={l.descricao}>
                                      {l.descricao}
                                    </p>
                                  )}
                                  {l.requisitoAltera && (
                                    <p className="mt-1 text-[12px] text-slate-500">
                                      Req. Altera <Codigo>{l.requisitoAltera}</Codigo>
                                    </p>
                                  )}
                                </Celula>
                                <Celula>
                                  <EtiquetaStatus status={l.status} />
                                  {l.status !== 'NAO_SE_APLICA' && (
                                    <div className="mt-1.5">
                                      <EtiquetaTeste teste={l.teste} status={l.status} />
                                      {l.teste !== 'NAO_TESTADO' && l.testadoEm && (
                                        <p className="text-[12px] text-slate-500">
                                          {l.testadoPor ? `${l.testadoPor} · ` : ''}
                                          {formatarData(l.testadoEm)}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </Celula>
                                <Celula className="max-w-[24rem]">
                                  {l.observacao ? (
                                    <p className="whitespace-pre-line break-words text-[13px] leading-relaxed text-slate-600">{l.observacao}</p>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </Celula>
                                <Celula className="max-w-[12rem]">
                                  {l.workflow || l.configuracaoErp ? (
                                    <div className="space-y-1.5">
                                      {l.workflow && <p className="break-words font-mono text-xs text-slate-700">{l.workflow}</p>}
                                      {l.configuracaoErp && (
                                        <p className="text-[12px] text-slate-500">
                                          ERP: <span className="font-mono">{l.configuracaoErp}</span>
                                        </p>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </Celula>
                                <Celula ultima={!podeMarcar} className="whitespace-nowrap">
                                  {l.responsavel || l.prioridade || l.previsao ? (
                                    <div className="space-y-1">
                                      {l.responsavel && <p className="text-[13px] text-slate-700">{l.responsavel}</p>}
                                      {l.prioridade && <EtiquetaPrioridade prioridade={l.prioridade} />}
                                      {l.previsao && <p className="text-[12px] text-slate-500">até {formatarData(l.previsao)}</p>}
                                    </div>
                                  ) : (
                                    <span className="text-slate-300">—</span>
                                  )}
                                </Celula>
                                {podeMarcar && (
                                  <Celula ultima className="sticky right-0 bg-surface group-hover:bg-slate-50">
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        title="Marcar status, teste, observação e responsável nesta plataforma"
                                        aria-label={`Editar a situação de ${l.nome} na plataforma`}
                                        onClick={() => setEdicao({ tipo: 'situacao', item: l })}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25"
                                      >
                                        <span className="h-3.5 w-3.5">
                                          <IconeEngrenagem />
                                        </span>
                                        Situação
                                      </button>
                                      {admin && (
                                        <button
                                          type="button"
                                          title="Editar ou excluir a funcionalidade (vale para todas as plataformas)"
                                          aria-label={`Editar ou excluir a funcionalidade ${l.nome}`}
                                          onClick={() => setEdicao({ tipo: 'funcionalidade', item: l })}
                                          className={CLASSE_ICONE}
                                        >
                                          <span className="h-4 w-4">
                                            <IconeLapis />
                                          </span>
                                        </button>
                                      )}
                                    </div>
                                  </Celula>
                                )}
                              </Linha>
                            ))}
                        </Fragment>
                      )
                    })}
                  </Tabela>
                )}

                <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-3 text-[13px] text-slate-500">
                  <RodapeContagem visiveis={visiveis.length} total={daPlataforma.length} />
                </div>
              </div>
            </>
          )}
        </>
      )}

      {podeMarcar && edicao?.tipo === 'situacao' && (
        <ModalSituacao
          item={edicao.item}
          aoFechar={() => setEdicao(null)}
          aoSalvar={(campos) =>
            concluir(`Situação de "${edicao.item.nome}" em ${edicao.item.plataformaNome} atualizada (${campos.join(', ')}).`)
          }
        />
      )}
      {admin && edicao?.tipo === 'funcionalidade' && (
        <ModalFuncionalidade
          existente={edicao.item}
          modulos={modulosDaLista}
          plataformasAfetadas={cobertura.length}
          aoFechar={() => setEdicao(null)}
          aoConcluir={concluir}
        />
      )}
    </div>
  )
}
