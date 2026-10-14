import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { clienteImportacao, listarInstanciasImportacao, type InstanciaImportacao } from '../importacao/cliente'
import { executarImportacao, type ProgressoImportacao, type ResultadoImportacao } from '../importacao/executor'
import { lerOrigem, type Origem, type WorkflowOrigem } from '../importacao/origem'
import { montarPlano, type ExistentesNoDestino, type OpcoesImportacao, type PoliticaConflito } from '../importacao/plano'
import { ApiError } from '../services/api'
import { SEM_FILTROS, listarPastas, previa, type MapaPastas } from '../services/workflows'
import { ArvoreOrigem } from './ArvoreOrigem'
import { ResumoImportacao } from './ResumoImportacao'
import { SeletorDestino, caminhoDaPastaDestino } from './SeletorDestino'
import { Alerta } from './ui/Alerta'
import { Botao } from './ui/Botao'
import { CaixaSelecao } from './ui/CaixaSelecao'
import { Campo } from './ui/Campo'
import { IconeSetaDireita } from './ui/Icones'
import { Select } from './ui/Select'

const CLASSE_ACAO_TEXTO =
  'text-[13px] font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline disabled:cursor-not-allowed disabled:text-slate-300 disabled:no-underline'

function mensagemDe(e: unknown, padrao: string) {
  return e instanceof ApiError ? e.message : e instanceof Error ? e.message : padrao
}

function Painel({ titulo, acao, children, className = '' }: { titulo: string; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-lg border border-slate-200/80 ${className}`}>
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
        <h4 className="text-sm font-semibold text-slate-800">{titulo}</h4>
        {acao}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  )
}

/**
 * Explicação que fica escondida atrás de uma setinha: abre e fecha ao clicar. Com `rotulo` mostra a setinha com o
 * texto ao lado (para pôr sob um campo); sem ele, só a setinha (para pôr ao lado de um título).
 */
function Explicacao({ id, texto, rotulo }: { id: string; texto: string; rotulo?: string }) {
  const [aberta, setAberta] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-expanded={aberta}
        aria-controls={id}
        aria-label={rotulo ? undefined : aberta ? 'Esconder a explicação' : 'Mostrar a explicação'}
        title={rotulo ? undefined : aberta ? 'Esconder a explicação' : 'Mostrar a explicação'}
        onClick={() => setAberta((v) => !v)}
        className="inline-flex items-center gap-1 rounded text-[12px] text-slate-500 transition-colors hover:text-slate-800 focus-visible:ring-2 focus-visible:ring-brand-500"
      >
        <span className={`h-3.5 w-3.5 transition-transform duration-150 ${aberta ? 'rotate-90' : ''}`}>
          <IconeSetaDireita />
        </span>
        {rotulo}
      </button>
      {aberta && (
        <span id={id} className="mt-1 block w-full text-[12px] leading-snug text-slate-500">
          {texto}
        </span>
      )}
    </>
  )
}

/** A caixa de seleção com uma explicação escondida atrás de uma setinha. */
function Opcao({ id, marcado, aoMudar, desabilitado, titulo, ajuda }: { id: string; marcado: boolean; aoMudar: (v: boolean) => void; desabilitado: boolean; titulo: string; ajuda: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 inline-flex">
        <CaixaSelecao id={id} estado={marcado ? 'todos' : 'nenhum'} desabilitado={desabilitado} aoClicar={() => aoMudar(!marcado)} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <label htmlFor={id} className="text-sm text-slate-700">
            {titulo}
          </label>
          <Explicacao id={`${id}-explicacao`} texto={ajuda} />
        </div>
      </div>
    </div>
  )
}

/**
 * Importação de workflows para uma instância do n8n, mantendo a hierarquia de pastas do arquivo original.
 *
 * A pessoa abre o que exportou (ZIPs, JSONs ou uma pasta), marca workflows ou pastas inteiras, escolhe a
 * instância e a pasta que vai recebê-los e confere o plano antes de confirmar. Quem escreve na instância é o
 * webhook `portal-wf-importar` do n8n (ADMIN, instâncias liberadas, credencial de escrita guardada no n8n).
 */
export function ImportarWorkflows() {
  // instâncias liberadas para importação
  const [instancias, setInstancias] = useState<InstanciaImportacao[]>([])
  const [carregandoInstancias, setCarregandoInstancias] = useState(true)
  const [erroInstancias, setErroInstancias] = useState<string | null>(null)
  const [instancia, setInstancia] = useState('')

  // o que já existe no destino
  const [destinoDados, setDestinoDados] = useState<{ mapa: MapaPastas; existentes: ExistentesNoDestino } | null>(null)
  const [carregandoDestino, setCarregandoDestino] = useState(false)
  const [erroDestino, setErroDestino] = useState<string | null>(null)

  // a origem
  const [arquivos, setArquivos] = useState<File[]>([])
  const [origem, setOrigem] = useState<Origem | null>(null)
  const [lendo, setLendo] = useState(false)
  const [erroOrigem, setErroOrigem] = useState<string | null>(null)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  // O que a pessoa tirou da importação com o X: some da lista e não entra em nenhuma contagem.
  const [removidos, setRemovidos] = useState<Set<string>>(new Set())
  const [busca, setBusca] = useState('')

  // onde guardar e como
  const [destinoId, setDestinoId] = useState<string | null>(null)
  const [subpasta, setSubpasta] = useState('')
  const [caminhoCompleto, setCaminhoCompleto] = useState(true)
  const [conflito, setConflito] = useState<PoliticaConflito>('pular')
  const [remapear, setRemapear] = useState(true)

  // execução
  const [executando, setExecutando] = useState(false)
  const [progresso, setProgresso] = useState<ProgressoImportacao | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [erroExecucao, setErroExecucao] = useState<string | null>(null)
  const controle = useRef<AbortController | null>(null)

  const entradaZip = useRef<HTMLInputElement>(null)
  const entradaJson = useRef<HTMLInputElement>(null)
  const entradaPasta = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let cancelado = false
    listarInstanciasImportacao()
      .then((lista) => {
        if (!cancelado) {
          setInstancias(lista)
        }
      })
      .catch((e: unknown) => {
        if (!cancelado) {
          setErroInstancias(
            e instanceof ApiError && (e.status === 403 || e.status === 404)
              ? 'A importação não está liberada para o seu usuário, ou o workflow Portal_WF_Importar ainda não foi publicado no n8n.'
              : e instanceof ApiError && e.status >= 500
                ? `O n8n respondeu com erro (${e.status}) ao consultar as instâncias. Confira se o workflow Portal_WF_Importar está publicado e veja a última execução dele no n8n.`
                : mensagemDe(e, 'Não foi possível consultar as instâncias liberadas para importação.'),
          )
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

  async function carregarDestino(id: string, aindaVale: () => boolean = () => true) {
    setCarregandoDestino(true)
    setErroDestino(null)
    try {
      const [mapa, lista] = await Promise.all([listarPastas(id), previa(id, SEM_FILTROS)])
      if (!aindaVale()) {
        return
      }
      const porPasta = new Map<string | null, Map<string, string>>()
      for (const w of lista.workflows) {
        const pasta = mapa.workflows[w.id] ?? null
        const nomes = porPasta.get(pasta) ?? new Map<string, string>()
        nomes.set(w.nome.trim().toLowerCase(), w.id)
        porPasta.set(pasta, nomes)
      }
      setDestinoDados({ mapa, existentes: { pastas: mapa.pastas, porPasta, ids: new Set(lista.workflows.map((w) => w.id)) } })
    } catch (e) {
      if (aindaVale()) {
        setDestinoDados(null)
        setErroDestino(mensagemDe(e, 'Não foi possível ler as pastas da instância de destino.'))
      }
    } finally {
      if (aindaVale()) {
        setCarregandoDestino(false)
      }
    }
  }

  useEffect(() => {
    setDestinoDados(null)
    setDestinoId(null)
    setResultado(null)
    if (!instancia) {
      setCarregandoDestino(false)
      return
    }
    let vale = true
    void carregarDestino(instancia, () => vale)
    return () => {
      vale = false
    }
  }, [instancia])

  // A origem é relida a cada arquivo novo, para vários ZIPs (as partes de uma exportação) formarem uma árvore só.
  useEffect(() => {
    if (arquivos.length === 0) {
      setOrigem(null)
      return
    }
    let vale = true
    setLendo(true)
    setErroOrigem(null)
    lerOrigem(arquivos)
      .then((o) => {
        if (!vale) {
          return
        }
        setOrigem(o)
        setSelecionados((atual) => new Set([...atual].filter((chave) => o.workflows.some((w) => w.chave === chave))))
      })
      .catch((e: unknown) => {
        if (vale) {
          setOrigem(null)
          setErroOrigem(mensagemDe(e, 'Não foi possível ler os arquivos.'))
        }
      })
      .finally(() => {
        if (vale) {
          setLendo(false)
        }
      })
    return () => {
      vale = false
    }
  }, [arquivos])

  // Fechar a aba no meio da importação deixa pastas e workflows pela metade.
  useEffect(() => {
    if (!executando) {
      return
    }
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [executando])

  function adicionarArquivos(novos: File[]) {
    const uteis = novos.filter((f) => /\.(zip|json)$/i.test(f.name))
    if (uteis.length === 0) {
      setErroOrigem('Escolha arquivos .zip ou .json (ou uma pasta com eles).')
      return
    }
    setResultado(null)
    setArquivos((atual) => {
      const chave = (f: File) => `${(f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name}|${f.size}|${f.lastModified}`
      const jaTem = new Set(atual.map(chave))
      return [...atual, ...uteis.filter((f) => !jaTem.has(chave(f)))]
    })
  }

  function aoSoltar(e: DragEvent) {
    e.preventDefault()
    if (!executando) {
      adicionarArquivos(Array.from(e.dataTransfer.files))
    }
  }

  function alterarSelecao(itens: WorkflowOrigem[], marcar: boolean) {
    setSelecionados((atual) => {
      const novo = new Set(atual)
      itens.forEach((i) => (marcar ? novo.add(i.chave) : novo.delete(i.chave)))
      return novo
    })
  }

  function removerDaImportacao(itens: WorkflowOrigem[]) {
    setRemovidos((atual) => new Set([...atual, ...itens.map((i) => i.chave)]))
    alterarSelecao(itens, false)
  }

  function limparOrigem() {
    setArquivos([])
    setOrigem(null)
    setSelecionados(new Set())
    setRemovidos(new Set())
    setBusca('')
    setErroOrigem(null)
    setResultado(null)
  }

  const opcoes: OpcoesImportacao = useMemo(
    () => ({ destinoId, subpasta, caminhoCompleto, conflito, remapearReferencias: remapear }),
    [destinoId, subpasta, caminhoCompleto, conflito, remapear],
  )
  const disponiveis = useMemo(() => (origem ? origem.workflows.filter((w) => !removidos.has(w.chave)) : []), [origem, removidos])
  const selecionadosLista = useMemo(() => disponiveis.filter((w) => selecionados.has(w.chave)), [disponiveis, selecionados])

  const plano = useMemo(
    () =>
      origem && destinoDados
        ? montarPlano({ selecionados: selecionadosLista, todos: origem.workflows, opcoes, destino: destinoDados.existentes })
        : null,
    [origem, destinoDados, selecionadosLista, opcoes],
  )
  // Quem já existe no destino aparece como "Já existe" mesmo sem estar marcado: olha todos os workflows da lista.
  const existentesDaLista = useMemo(
    () =>
      origem && destinoDados
        ? montarPlano({
            selecionados: disponiveis,
            todos: origem.workflows,
            opcoes: { ...opcoes, conflito: 'pular' },
            destino: destinoDados.existentes,
            somenteSituacao: true,
          }).itens.filter((i) => i.acao === 'pular' && i.idExistente)
        : [],
    [origem, destinoDados, disponiveis, opcoes],
  )
  const situacao = useMemo(
    () => new Map([...existentesDaLista, ...(plano?.itens ?? [])].map((i) => [i.chave, i])),
    [existentesDaLista, plano],
  )

  const instanciaNome = instancias.find((i) => i.id === instancia)?.nome ?? instancia
  const pastasDestino = destinoDados?.mapa.pastas ?? []
  const destinoTexto = [...caminhoDaPastaDestino(pastasDestino, destinoId), ...(subpasta.trim() ? [subpasta.trim()] : [])].join(' / ')

  const bloqueio = !instancia
    ? 'Escolha a instância de destino.'
    : carregandoDestino
      ? 'Carregando as pastas da instância de destino…'
      : erroDestino
        ? 'Não consegui ler a instância de destino, então não dá para checar o que já existe lá.'
        : !origem
          ? 'Abra os arquivos que quer importar.'
          : selecionadosLista.length === 0
            ? 'Marque os workflows ou as pastas que quer importar.'
            : null

  async function importar() {
    if (!plano || !origem || !instancia) {
      return
    }
    const controleNovo = new AbortController()
    controle.current = controleNovo
    setErroExecucao(null)
    setResultado(null)
    setProgresso({ fase: 'pastas', feitos: 0, total: Math.max(plano.pastas.length, 1), texto: 'Preparando…' })
    setExecutando(true)
    try {
      const r = await executarImportacao({
        instancia,
        plano,
        selecionados: selecionadosLista,
        opcoes,
        cliente: clienteImportacao,
        aoProgresso: setProgresso,
        sinal: controleNovo.signal,
      })
      setResultado(r)
    } catch (e) {
      setErroExecucao(mensagemDe(e, 'A importação foi interrompida por um erro inesperado.'))
    } finally {
      setExecutando(false)
      controle.current = null
      // O que acabou de ser criado já conta como "existente" na próxima conferência.
      void carregarDestino(instancia)
    }
  }

  function baixarRelatorio() {
    if (!resultado) {
      return
    }
    const corpo = JSON.stringify({ instancia, destino: destinoTexto || '(raiz do projeto)', quando: new Date().toISOString(), opcoes, resultado }, null, 2)
    const url = URL.createObjectURL(new Blob([corpo], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `importacao_${instancia}_${new Date().toISOString().slice(0, 16).replace(/\D/g, '')}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const travado = executando

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200/80 bg-surface shadow-card">
      <div className="space-y-4 px-5 py-5">
        {erroInstancias && <Alerta tom="erro">{erroInstancias}</Alerta>}
        {!erroInstancias && !carregandoInstancias && instancias.length === 0 && (
          <Alerta tom="aviso">Nenhuma instância está liberada para importação. A lista é definida no workflow Portal_WF_Importar do n8n.</Alerta>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select
            id="importar-instancia"
            label="Instância de destino"
            value={instancia}
            disabled={carregandoInstancias || travado || instancias.length === 0}
            onChange={(e) => setInstancia(e.target.value)}
          >
            <option value="">{carregandoInstancias ? 'Carregando…' : 'Selecione'}</option>
            {instancias.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
              </option>
            ))}
          </Select>
        </div>

        {erroDestino && <Alerta tom="erro">{erroDestino}</Alerta>}
        {destinoDados?.mapa.erro && (
          <p className="text-[13px] text-amber-700">
            Algumas pastas da instância não puderam ser lidas ({destinoDados.mapa.erro}). Os workflows dessas pastas podem não aparecer na checagem de nomes repetidos.
          </p>
        )}
        {erroExecucao && <Alerta tom="erro">{erroExecucao}</Alerta>}

        <div className="grid gap-4 xl:grid-cols-2">
          {/* ------------------------------------------------------------ origem */}
          <Painel
            titulo="O que importar"
            className="h-[42rem]"
            acao={
              origem ? (
                <div className="flex items-center gap-3">
                  <button type="button" className={CLASSE_ACAO_TEXTO} disabled={travado} onClick={() => alterarSelecao(disponiveis, true)}>
                    Selecionar tudo
                  </button>
                  <button type="button" className={CLASSE_ACAO_TEXTO} disabled={travado || selecionados.size === 0} onClick={() => setSelecionados(new Set())}>
                    Limpar seleção
                  </button>
                </div>
              ) : undefined
            }
          >
            <div className="flex min-h-0 flex-1 flex-col" onDragOver={(e) => e.preventDefault()} onDrop={aoSoltar}>
              <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-2.5">
                <Botao type="button" variante="secundario" className="!h-8 !px-3 text-[13px]" disabled={travado} onClick={() => entradaZip.current?.click()}>
                  Abrir ZIP…
                </Botao>
                <Botao type="button" variante="secundario" className="!h-8 !px-3 text-[13px]" disabled={travado} onClick={() => entradaJson.current?.click()}>
                  Abrir JSON…
                </Botao>
                <Botao type="button" variante="secundario" className="!h-8 !px-3 text-[13px]" disabled={travado} onClick={() => entradaPasta.current?.click()}>
                  Abrir pasta…
                </Botao>
                {origem && (
                  <button type="button" className={`${CLASSE_ACAO_TEXTO} ml-auto`} disabled={travado} onClick={limparOrigem}>
                    Limpar origem
                  </button>
                )}
                <input
                  ref={entradaZip}
                  type="file"
                  accept=".zip"
                  multiple
                  hidden
                  data-testid="entrada-zip"
                  onChange={(e) => {
                    adicionarArquivos(Array.from(e.target.files ?? []))
                    e.target.value = ''
                  }}
                />
                <input
                  ref={entradaJson}
                  type="file"
                  accept=".json,application/json"
                  multiple
                  hidden
                  data-testid="entrada-json"
                  onChange={(e) => {
                    adicionarArquivos(Array.from(e.target.files ?? []))
                    e.target.value = ''
                  }}
                />
                <input
                  ref={entradaPasta}
                  type="file"
                  multiple
                  hidden
                  data-testid="entrada-pasta"
                  {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
                  onChange={(e) => {
                    adicionarArquivos(Array.from(e.target.files ?? []))
                    e.target.value = ''
                  }}
                />
              </div>

              {erroOrigem && (
                <div className="px-4 pt-3">
                  <Alerta tom="erro">{erroOrigem}</Alerta>
                </div>
              )}

              {lendo ? (
                <p className="px-4 py-10 text-center text-sm text-slate-400">Lendo os arquivos…</p>
              ) : !origem ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate-400">
                  <p>Abra um ou mais ZIPs exportados pelo portal (as partes de uma exportação juntas), arquivos .json ou uma pasta.</p>
                  <p className="text-[13px]">Você também pode arrastar os arquivos para cá. As pastas do arquivo viram as pastas na instância.</p>
                </div>
              ) : (
                <>
                  <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-100 px-4 py-2 text-[13px] text-slate-500">
                    <span>
                      <strong className="font-semibold text-slate-700">{disponiveis.length}</strong> workflow{disponiveis.length === 1 ? '' : 's'}
                      {' · '}
                      <strong className="font-semibold text-slate-700">{selecionados.size}</strong> marcado{selecionados.size === 1 ? '' : 's'}
                    </span>
                    {removidos.size > 0 && (
                      <button type="button" className={CLASSE_ACAO_TEXTO} disabled={travado} onClick={() => setRemovidos(new Set())}>
                        {removidos.size} removido{removidos.size === 1 ? '' : 's'} · restaurar
                      </button>
                    )}
                    {origem.ignorados.length > 0 && (
                      <details className="relative">
                        <summary className="cursor-pointer select-none text-amber-700">{origem.ignorados.length} arquivo(s) ignorado(s)</summary>
                        <ul className="absolute left-0 z-10 mt-1 max-h-48 w-80 overflow-y-auto rounded-lg border border-slate-200 bg-surface p-2 text-[12px] shadow-card">
                          {origem.ignorados.slice(0, 50).map((i) => (
                            <li key={i.caminho} className="break-words py-0.5">
                              <span className="text-slate-700">{i.caminho}</span>: {i.motivo}
                            </li>
                          ))}
                          {origem.ignorados.length > 50 && <li className="py-0.5 text-slate-400">…e mais {origem.ignorados.length - 50}</li>}
                        </ul>
                      </details>
                    )}
                    <div className="ml-auto w-44">
                      <input
                        type="search"
                        value={busca}
                        onChange={(e) => setBusca(e.target.value)}
                        placeholder="Filtrar por nome…"
                        aria-label="Filtrar a lista pelo nome"
                        className="block h-8 w-full rounded-lg border-slate-200 bg-surface text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/15"
                      />
                    </div>
                  </div>
                  <ArvoreOrigem
                    raiz={origem.raiz}
                    selecionados={selecionados}
                    removidos={removidos}
                    situacao={situacao}
                    busca={busca}
                    desabilitado={travado}
                    aoAlterar={alterarSelecao}
                    aoRemover={removerDaImportacao}
                  />
                </>
              )}
            </div>
          </Painel>

          {/* ------------------------------------------------------------ destino, opções e resumo */}
          <div className="flex min-w-0 flex-col gap-4">
            <Painel titulo="Onde guardar">
              <div className="space-y-3 p-4">
                {!instancia ? (
                  <p className="text-sm text-slate-400">Escolha a instância de destino.</p>
                ) : carregandoDestino && !destinoDados ? (
                  <p className="text-sm text-slate-400">Carregando as pastas da instância…</p>
                ) : destinoDados ? (
                  <>
                    <div>
                      <Explicacao
                        id="importar-destino-explicacao"
                        rotulo="Como funciona"
                        texto="Escolha a pasta que vai receber tudo. Dentro dela, as pastas do arquivo são recriadas do jeito que estão."
                      />
                    </div>
                    <SeletorDestino pastas={pastasDestino} valor={destinoId} desabilitado={travado} aoEscolher={setDestinoId} />
                    <Campo
                      id="importar-subpasta"
                      label="Pasta nova para esta importação (opcional)"
                      placeholder="ex.: Importado em 13-10"
                      value={subpasta}
                      disabled={travado}
                      maxLength={128}
                      onChange={(e) => setSubpasta(e.target.value)}
                    />
                    <div className="-mt-1.5">
                      <Explicacao
                        id="importar-subpasta-explicacao"
                        rotulo="Explicação"
                        texto="Cria uma pasta com este nome dentro do destino e guarda tudo nela."
                      />
                    </div>
                    <p className="text-[13px] text-slate-500">
                      Destino: <strong className="text-slate-700">{destinoTexto || 'raiz do projeto'}</strong>
                    </p>
                  </>
                ) : null}
              </div>
            </Painel>

            <Painel titulo="Opções">
              <div className="space-y-3 p-4">
                <Opcao
                  id="importar-caminho"
                  marcado={caminhoCompleto}
                  aoMudar={setCaminhoCompleto}
                  desabilitado={travado}
                  titulo="Manter as pastas do arquivo"
                  ajuda="Ligado: o caminho completo do arquivo é recriado. Desligado: tira as pastas que todos os marcados têm em comum."
                />
                <Opcao
                  id="importar-referencias"
                  marcado={remapear}
                  aoMudar={setRemapear}
                  desabilitado={travado}
                  titulo="Ligar os workflows entre si"
                  ajuda="Como o n8n dá IDs novos, troca nas chamadas a sub-workflows o ID antigo pelo novo."
                />
                <Select
                  id="importar-conflito"
                  label="Se já existir um workflow com o mesmo nome na pasta"
                  value={conflito}
                  disabled={travado}
                  onChange={(e) => setConflito(e.target.value as PoliticaConflito)}
                >
                  <option value="pular">Pular (não importar esse)</option>
                  <option value="renomear">Importar com outro nome ("… (importado)")</option>
                </Select>
                <div className="-mt-1.5">
                  <Explicacao id="importar-conflito-explicacao" rotulo="Explicação" texto="Nada é sobrescrito: o que já existe nunca é alterado." />
                </div>
              </div>
            </Painel>

            <Painel titulo="Conferir e importar">
              <div className="p-4">
                {plano ? (
                  <ResumoImportacao
                    plano={plano}
                    instanciaNome={instanciaNome}
                    destinoTexto={destinoTexto}
                    bloqueio={bloqueio}
                    executando={executando}
                    progresso={progresso}
                    resultado={resultado}
                    aoImportar={() => void importar()}
                    aoCancelar={() => controle.current?.abort()}
                    aoRecomecar={() => {
                      limparOrigem()
                      setResultado(null)
                    }}
                    aoBaixarRelatorio={baixarRelatorio}
                  />
                ) : (
                  <p className="text-sm text-slate-400">{bloqueio ?? 'Escolha a instância e abra os arquivos para ver o plano.'}</p>
                )}
              </div>
            </Painel>
          </div>
        </div>
      </div>
    </div>
  )
}
