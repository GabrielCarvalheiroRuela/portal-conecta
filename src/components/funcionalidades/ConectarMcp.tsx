import { useEffect, useState } from 'react'
import { McpForaDoArError, buscarConexaoMcp, type ConexaoMcp } from '../../services/mcp'
import { Alerta } from '../ui/Alerta'
import { Botao } from '../ui/Botao'
import { IconeCheck, IconeChave, IconeCopiar, IconeOlho, IconeOlhoRiscado, IconeX } from '../ui/Icones'
import { Modal } from '../ui/Modal'

/**
 * Botão "Conectar MCP", ao lado do selo de status: abre a janela com o comando que registra o servidor MCP no Claude
 * Code. A URL e o token vêm do próprio MCP, que só os entrega a DEV e ADM (o token é uma credencial e não pode ir no
 * bundle do portal: ele é público). Esta tela só aparece para esses perfis, mas quem barra é o MCP. Se o servidor
 * estiver fora do ar, a janela diz isso e troca o passo a passo pelo que conferir.
 */
export function ConectarMcp() {
  const [aberto, setAberto] = useState(false)

  return (
    <>
      <Botao type="button" variante="secundario" className="!h-9 !px-3 !text-[13px]" onClick={() => setAberto(true)} title="Mostra o comando que conecta o MCP ao Claude">
        <span className="h-4 w-4">
          <IconeChave />
        </span>
        Conectar MCP
      </Botao>
      {aberto && <JanelaConectarMcp aoFechar={() => setAberto(false)} />}
    </>
  )
}

/**
 * Esconde o miolo do token no comando (c644********8fa), para a tela aberta não entregar a credencial a quem só olha de
 * relance. O Copiar continua levando o comando inteiro. Se o comando não tiver o formato esperado, volta como veio.
 */
function esconderToken(comando: string): string {
  return comando.replace(/(Bearer )([^']+)(')/, (_, antes: string, token: string, depois: string) => {
    const miolo = '********'
    return antes + (token.length > 12 ? token.slice(0, 4) + miolo + token.slice(-4) : miolo) + depois
  })
}

/**
 * Copia para a área de transferência. A API moderna só funciona em página segura (https ou localhost) e com permissão do
 * navegador; em janelas embutidas e em http ela é recusada, então cai no jeito antigo (selecionar e copiar).
 */
async function copiarTexto(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = texto
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      document.body.removeChild(area)
    }
  }
}

function JanelaConectarMcp({ aoFechar }: { aoFechar: () => void }) {
  const [conexao, setConexao] = useState<ConexaoMcp | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  /** O MCP não respondeu: troca o passo a passo e oferece tentar de novo. `detalhe` é o que ele disse, se disse. */
  const [fora, setFora] = useState<{ detalhe?: string } | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [copiado, setCopiado] = useState(false)
  const [mostrarToken, setMostrarToken] = useState(false)

  // Busca ao abrir (e a cada "Tentar de novo"), e não antes: o MCP registra quem pediu o comando (que leva o token).
  useEffect(() => {
    let cancelado = false
    setErro(null)
    setFora(null)
    buscarConexaoMcp()
      .then((c) => !cancelado && setConexao(c))
      .catch((e: unknown) => {
        if (cancelado) {
          return
        }
        if (e instanceof McpForaDoArError) {
          setFora({ detalhe: e.detalhe })
        } else {
          setErro(e instanceof Error ? e.message : 'Não foi possível buscar o comando de conexão.')
        }
      })
    return () => {
      cancelado = true
    }
  }, [tentativa])

  async function copiar() {
    if (!conexao) {
      return
    }
    if (await copiarTexto(conexao.comando)) {
      setErro(null)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2000)
    } else {
      setErro('O navegador não deixou copiar. Selecione o comando e copie com Ctrl+C.')
    }
  }

  return (
    <Modal idTitulo="tituloConectarMcp" aoFechar={aoFechar} larguraMax="max-w-2xl">
      <header className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 ring-1 ring-inset ring-brand-600/10">
            <span className="h-[18px] w-[18px]">
              <IconeChave />
            </span>
          </div>
          <div>
            <h2 id="tituloConectarMcp" className="text-[15px] font-semibold tracking-tight text-slate-900">
              Conectar o MCP ao Claude
            </h2>
            <p className="text-[13px] text-slate-500">Com ele, a Claude consulta esta matriz (somente leitura).</p>
          </div>
        </div>
        <button
          type="button"
          onClick={aoFechar}
          aria-label="Fechar"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
        >
          <span className="h-4 w-4">
            <IconeX />
          </span>
        </button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
        {fora ? (
          <>
            <Alerta tom="erro" titulo="O servidor MCP está fora do ar">
              {fora.detalhe ?? 'O portal não conseguiu falar com ele, então não há comando para mostrar agora.'}
            </Alerta>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
              <li>
                Olhe o selo ao lado: vermelho (<strong className="font-semibold text-slate-800">MCP fora do ar</strong>) quer dizer que o
                servidor não está respondendo ao portal.
              </li>
              <li>
                Peça a quem cuida do servidor para conferir se o container{' '}
                <code className="rounded bg-slate-100 px-1 font-mono text-xs">mcp-funcionalidades</code> está de pé (o endereço{' '}
                <code className="rounded bg-slate-100 px-1 font-mono text-xs">/health</code> dele deve responder) e se a variável{' '}
                <code className="rounded bg-slate-100 px-1 font-mono text-xs">MONITORAMENTO_API_URL</code> está definida nele.
              </li>
              <li>
                Quando o selo ficar verde, clique em <strong className="font-semibold text-slate-800">Tentar de novo</strong>.
              </li>
            </ol>
          </>
        ) : (
          <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-slate-600">
            <li>Confira se o selo ao lado está verde, <strong className="font-semibold text-slate-800">MCP ativo</strong>.</li>
            <li>
              Abra um <strong className="font-semibold text-slate-800">terminal comum</strong> (PowerShell), e não o prompt do Claude
              Code, e cole o comando abaixo.
            </li>
            <li>
              Abra uma sessão nova do Claude Code, digite <code className="rounded bg-slate-100 px-1 font-mono text-xs">/mcp</code> para
              ver se <code className="rounded bg-slate-100 px-1 font-mono text-xs">funcionalidades</code> está conectado e pergunte, por
              exemplo: “Liste as plataformas e a cobertura de cada uma”.
            </li>
          </ol>
        )}

        {fora ? null : erro && !conexao ? (
          <Alerta tom="erro" titulo="Não foi possível mostrar o comando">
            {erro}
          </Alerta>
        ) : !conexao ? (
          <div className="flex items-center gap-2 text-[13px] font-medium text-slate-500" aria-busy="true">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-brand-500" />
            Buscando o comando…
          </div>
        ) : (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">Comando</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setMostrarToken((v) => !v)}
                  aria-pressed={mostrarToken}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium text-slate-600 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25"
                >
                  <span className="h-4 w-4">{mostrarToken ? <IconeOlhoRiscado /> : <IconeOlho />}</span>
                  {mostrarToken ? 'Ocultar token' : 'Mostrar token'}
                </button>
                <button
                  type="button"
                  onClick={copiar}
                  title="Copia o comando inteiro, mesmo com o token escondido"
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[13px] font-medium text-brand-700 transition-colors hover:bg-brand-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/25"
                >
                  <span className="h-4 w-4">{copiado ? <IconeCheck /> : <IconeCopiar />}</span>
                  {copiado ? 'Copiado' : 'Copiar'}
                </button>
              </div>
            </div>
            <pre className="whitespace-pre-wrap break-all rounded-lg bg-slate-100 p-3.5 font-mono text-xs leading-relaxed text-slate-800 ring-1 ring-inset ring-slate-200/70">
              {mostrarToken ? conexao.comando : esconderToken(conexao.comando)}
            </pre>
            <p className="mt-1.5 text-[12px] text-slate-500">O botão Copiar leva o comando inteiro, mesmo com o token escondido.</p>
            {erro && <p className="mt-2 text-[13px] font-medium text-red-600">{erro}</p>}
          </div>
        )}

        {conexao && (
          <Alerta tom="aviso" titulo="O comando leva o token do MCP">
            É uma credencial: não cole em chats, chamados nem repositórios. Se ela vazar, peça para trocar o token.
          </Alerta>
        )}
      </div>

      <footer className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-3">
        {fora && (
          <Botao type="button" onClick={() => setTentativa((n) => n + 1)}>
            Tentar de novo
          </Botao>
        )}
        <Botao type="button" variante="secundario" onClick={aoFechar}>
          Fechar
        </Botao>
      </footer>
    </Modal>
  )
}
