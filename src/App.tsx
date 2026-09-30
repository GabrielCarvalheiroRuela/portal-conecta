import { useEffect, useState } from 'react'
import { FormIntegracao } from './components/FormIntegracao'
import { FormPlataforma } from './components/FormPlataforma'
import { ListaIntegracoes } from './components/ListaIntegracoes'
import { ListaPlataformas } from './components/ListaPlataformas'
import { Monitoramento } from './components/Monitoramento'
import { PainelSucesso } from './components/PainelSucesso'
import { TelaLogin } from './components/TelaLogin'
import { registrarExpiracao, sair, temSessao, usuarioDaSessao } from './services/api'
import type { IntegracaoCriada } from './types/integracao'
import { MenuUsuario } from './components/MenuUsuario'
import { AlternarTema } from './components/ui/AlternarTema'
import { Segredos } from './segredos/Segredos'
import { IconeAtividade, IconeCamadas, IconeLink, IconeMais } from './components/ui/Icones'

type Aba = 'monitoramento' | 'integracao' | 'consulta' | 'plataformas'

const ABAS: { id: Aba; rotulo: string; descricao: string; Icone: () => JSX.Element }[] = [
  {
    id: 'monitoramento',
    rotulo: 'Monitoramento',
    descricao: 'Pedidos e produtos com falha de integração, acompanhados em tempo real.',
    Icone: IconeAtividade,
  },
  {
    id: 'plataformas',
    rotulo: 'Plataformas',
    descricao: 'Cadastre as plataformas que ficam disponíveis no seletor de Nova integração.',
    Icone: IconeCamadas,
  },
  {
    id: 'integracao',
    rotulo: 'Nova integração',
    descricao: 'Vincule uma plataforma a um lojista do Monint. Um mesmo lojista pode ter várias integrações.',
    Icone: IconeMais,
  },
  {
    id: 'consulta',
    rotulo: 'Integrações',
    descricao: 'Integrações cadastradas por lojista. Clique no nome de um lojista para ver os pedidos dele.',
    Icone: IconeLink,
  },
]

// As consultas têm tabelas largas; os formulários ficam mais estreitos.
const LARGURA: Record<Aba, string> = {
  monitoramento: 'max-w-none',
  consulta: 'max-w-none',
  integracao: 'max-w-5xl',
  plataformas: 'max-w-6xl',
}

export default function App() {
  const [autenticado, setAutenticado] = useState(temSessao)
  const [avisoLogin, setAvisoLogin] = useState<string | null>(null)

  const [aba, setAba] = useState<Aba>('monitoramento')
  const [criada, setCriada] = useState<IntegracaoCriada | null>(null)
  // Contadores para as abas recarregarem o que a outra mudou.
  const [versaoLojistas, setVersaoLojistas] = useState(0)
  const [versaoIntegracoes, setVersaoIntegracoes] = useState(0)
  const [versaoPlataformas, setVersaoPlataformas] = useState(0)

  useEffect(() => {
    registrarExpiracao(() => {
      setAutenticado(false)
      setAvisoLogin('Sua sessão expirou. Entre novamente para continuar.')
    })
    return () => registrarExpiracao(null)
  }, [])

  if (!autenticado) {
    return (
      <>
        <TelaLogin
          aviso={avisoLogin}
          aoEntrar={() => {
            setAvisoLogin(null)
            // Todo login começa pelo monitoramento.
            setAba('monitoramento')
            setAutenticado(true)
          }}
        />
        <Segredos />
      </>
    )
  }

  function sairDoPortal() {
    sair()
    setAutenticado(false)
    setAvisoLogin(null)
  }

  const usuario = usuarioDaSessao()
  const atual = ABAS.find((a) => a.id === aba) ?? ABAS[0]

  return (
    <div className="min-h-screen bg-slate-50 lg:pl-64">
      <aside className="escuro-fixo bg-ink-900 lg:fixed lg:inset-y-0 lg:left-0 lg:z-20 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-white/[0.06]">
        <div className="flex h-16 items-center justify-between gap-3 px-5 lg:border-b lg:border-white/[0.06]">
          <div className="flex items-center gap-3">
            <img src="/conecta_logo.png" alt="Conecta" data-segredo="logo" className="h-8 w-auto object-contain" />
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight text-white">Portal Conecta</p>
              <p className="text-[11px] font-medium text-slate-500">Integrações Citel</p>
            </div>
          </div>
          <div className="flex items-center gap-1 lg:hidden">
            <AlternarTema escuroFixo />
            <MenuUsuario usuario={usuario} aoSair={sairDoPortal} compacto />
          </div>
        </div>

        <p className="hidden px-6 pb-2 pt-6 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500 lg:block">
          Menu
        </p>
        <nav
          role="tablist"
          aria-label="Seções do portal"
          className="flex gap-1 overflow-x-auto px-3 pb-3 [scrollbar-width:none] lg:flex-1 lg:flex-col lg:overflow-visible lg:pb-0 [&::-webkit-scrollbar]:hidden"
        >
          {ABAS.map(({ id, rotulo, Icone }) => {
            const ativa = aba === id
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={ativa}
                onClick={() => setAba(id)}
                className={`group relative flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${
                  ativa
                    ? 'bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)]'
                    : 'text-slate-400 hover:bg-white/[0.04] hover:text-slate-100'
                }`}
              >
                {ativa && (
                  <span className="absolute left-0 top-1/2 hidden h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand-400 lg:block" />
                )}
                <span
                  className={`h-[18px] w-[18px] transition-colors duration-150 ${
                    ativa ? 'text-brand-300' : 'text-slate-500 group-hover:text-slate-300'
                  }`}
                >
                  <Icone />
                </span>
                {rotulo}
                {id === 'monitoramento' && (
                  <span className="relative ml-auto flex h-2 w-2" title="Ao vivo">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-signal opacity-60" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-signal" />
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="hidden space-y-1 border-t border-white/[0.06] p-3 lg:block">
          <AlternarTema escuroFixo comRotulo />
          <MenuUsuario usuario={usuario} aoSair={sairDoPortal} />
        </div>
      </aside>

      <main className="px-4 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="mx-auto max-w-7xl">
          <header key={aba} className="mb-8 animate-fade-in">
            <h1
              data-segredo={aba === 'monitoramento' ? 'titulo' : undefined}
              className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-[28px] sm:leading-9"
            >
              {atual.rotulo}
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{atual.descricao}</p>
          </header>

          <div className={LARGURA[aba]}>
            {/* Só monta quando aberto, para a atualização automática não rodar em segundo plano. */}
            {aba === 'monitoramento' && (
              <div className="animate-fade-in">
                <Monitoramento />
              </div>
            )}

            <div hidden={aba !== 'integracao'} className="animate-fade-in">
              {criada ? (
                <PainelSucesso integracao={criada} aoCadastrarOutra={() => setCriada(null)} />
              ) : (
                <FormIntegracao
                  versaoLojistas={versaoLojistas}
                  versaoPlataformas={versaoPlataformas}
                  aoCriarLojista={() => setVersaoLojistas((v) => v + 1)}
                  aoCriar={(integracao) => {
                    setCriada(integracao)
                    setVersaoIntegracoes((v) => v + 1)
                  }}
                />
              )}
            </div>

            {/* A consulta só monta quando aberta, para não buscar a lista à toa. */}
            {aba === 'consulta' && (
              <div className="animate-fade-in">
                <ListaIntegracoes versao={versaoIntegracoes} />
              </div>
            )}

            {aba === 'plataformas' && (
              <div className="grid items-start gap-6 animate-fade-in lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
                <FormPlataforma aoCriar={() => setVersaoPlataformas((v) => v + 1)} />
                <ListaPlataformas versao={versaoPlataformas} />
              </div>
            )}
          </div>
        </div>
      </main>
      <Segredos />
    </div>
  )
}
