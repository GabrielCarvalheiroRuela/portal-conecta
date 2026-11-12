/**
 * Coleta periódica de um retrato que vem do n8n (filas, webservices). O último retrato fica no
 * módulo que cria a coleta, fora do componente: trocar de tela e voltar não perde o que foi coletado
 * nem dispara outra coleta antes da hora.
 */

export interface EstadoColeta<T> {
  /** Última coleta bem-sucedida. Uma falha não apaga: fica o último retrato bom. */
  retrato: T | null
  /** A última tentativa falhou. */
  falha: boolean
  sincronizando: boolean
}

export interface Coleta<T> {
  /** Para o useSyncExternalStore. */
  assinar: (ouvinte: () => void) => () => void
  ler: () => EstadoColeta<T>
  /** Coleta agora. Se já há uma coleta em andamento, reaproveita a mesma em vez de abrir outra. */
  sincronizar: () => Promise<void>
  /**
   * Mantém a coleta no intervalo enquanto a tela está aberta. Ao abrir, só coleta se a última
   * tentativa for mais velha que o intervalo (ou se nunca houve); senão espera o que falta. Uma
   * coleta manual reinicia a contagem. Devolve a função que para o agendamento.
   */
  iniciarAutomatica: () => () => void
}

/**
 * `intervalo` pode depender do que já se tem: uma função recebe o último retrato (nulo se ainda não houve) e
 * devolve o intervalo até a próxima coleta, para tentar mais cedo enquanto não há nada para mostrar.
 */
export function criarColeta<T>(
  nome: string,
  intervalo: number | ((retrato: T | null) => number),
  carregar: () => Promise<T>,
): Coleta<T> {
  const intervaloMs = () => (typeof intervalo === 'function' ? intervalo(estado.retrato) : intervalo)
  let estado: EstadoColeta<T> = { retrato: null, falha: false, sincronizando: false }
  /** Conta também tentativas que falharam, para uma falha não virar uma chamada a cada render. */
  let ultimaTentativa = 0
  let emAndamento: Promise<void> | null = null
  const ouvintes = new Set<() => void>()

  function atualizar(parcial: Partial<EstadoColeta<T>>) {
    estado = { ...estado, ...parcial }
    ouvintes.forEach((avisar) => avisar())
  }

  function sincronizar(): Promise<void> {
    if (emAndamento) {
      return emAndamento
    }
    ultimaTentativa = Date.now()
    atualizar({ sincronizando: true })
    emAndamento = carregar()
      .then((retrato) => atualizar({ retrato, falha: false }))
      .catch((e: unknown) => {
        console.error(`[MONITORAMENTO] Erro ao carregar ${nome}`, e)
        atualizar({ falha: true })
      })
      .finally(() => {
        emAndamento = null
        atualizar({ sincronizando: false })
      })
    return emAndamento
  }

  function iniciarAutomatica(): () => void {
    let parado = false
    let timer: ReturnType<typeof setTimeout>

    function agendar() {
      const falta = Math.max(0, ultimaTentativa + intervaloMs() - Date.now())
      timer = setTimeout(async () => {
        if (parado) return
        // Alguém sincronizou manualmente no meio da espera: a contagem recomeçou.
        if (Date.now() - ultimaTentativa >= intervaloMs()) {
          await sincronizar()
        }
        if (!parado) agendar()
      }, falta)
    }

    agendar()
    return () => {
      parado = true
      clearTimeout(timer)
    }
  }

  return {
    assinar(ouvinte) {
      ouvintes.add(ouvinte)
      return () => ouvintes.delete(ouvinte)
    },
    ler: () => estado,
    sincronizar,
    iniciarAutomatica,
  }
}
