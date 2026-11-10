import { useEffect, useState } from 'react'
import { consultarMcp, type EstadoMcp } from '../../services/mcp'

const INTERVALO_MS = 10_000

const VISUAL: Record<EstadoMcp, { rotulo: string; caixa: string; ponto: string; dica: string }> = {
  verificando: {
    rotulo: 'Verificando MCP…',
    caixa: 'bg-slate-100 text-slate-600 ring-slate-500/20',
    ponto: 'bg-slate-400 animate-pulse',
    dica: 'Consultando o servidor MCP.',
  },
  ativo: {
    rotulo: 'MCP ativo',
    caixa: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    ponto: 'bg-emerald-500',
    dica: 'O servidor MCP está no ar e consulta o banco normalmente.',
  },
  'sem-banco': {
    rotulo: 'MCP sem banco',
    caixa: 'bg-amber-50 text-amber-800 ring-amber-600/25',
    ponto: 'bg-amber-500',
    dica: 'O MCP está no ar, mas não consegue consultar o banco (a view VW_COBPLA). A Claude receberia erro. O motivo está no log do MCP.',
  },
  fora: {
    rotulo: 'MCP fora do ar',
    caixa: 'bg-red-50 text-red-700 ring-red-600/20',
    ponto: 'bg-red-500',
    dica: 'O servidor MCP não respondeu.',
  },
}

/**
 * Selo do servidor MCP, que é o que deixa a Claude consultar esta matriz. Consulta o /status a cada 10 s enquanto a tela
 * está aberta e a aba do navegador visível; ao voltar para a aba, consulta de novo na hora. É só informação: nada aqui
 * depende dele.
 */
export function SeloMcp() {
  const [estado, setEstado] = useState<EstadoMcp>('verificando')
  const [verificadoEm, setVerificadoEm] = useState<Date | null>(null)

  useEffect(() => {
    let montado = true

    async function verificar() {
      if (document.hidden) {
        return
      }
      const resultado = await consultarMcp()
      if (montado) {
        setEstado(resultado)
        setVerificadoEm(new Date())
      }
    }

    verificar()
    const id = window.setInterval(verificar, INTERVALO_MS)
    document.addEventListener('visibilitychange', verificar)
    return () => {
      montado = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', verificar)
    }
  }, [])

  const v = VISUAL[estado]
  const hora = verificadoEm?.toLocaleTimeString('pt-BR')
  return (
    <span
      role="status"
      title={`${v.dica}${hora ? ` Última checagem às ${hora}.` : ''}`}
      className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[13px] font-medium ring-1 ring-inset ${v.caixa}`}
    >
      <span className={`h-2 w-2 rounded-full ${v.ponto}`} />
      {v.rotulo}
    </span>
  )
}
