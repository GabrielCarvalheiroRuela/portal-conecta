/**
 * Leitor mínimo de ZIP para o navegador, sem dependências: lê o diretório central, e os arquivos são
 * abertos só quando pedidos (um ZIP de 500 workflows não vai inteiro para a memória descompactado).
 *
 * Cobre o que o n8n e o Windows geram: método 0 (sem compressão) e 8 (deflate), nomes em UTF-8 (ou, sem
 * a marca, tentados em UTF-8 e depois em Windows-1252). ZIP64, ZIP criptografado e outros métodos de
 * compressão não são aceitos, e o motivo vai na mensagem de erro.
 */

export interface EntradaZip {
  /** Caminho dentro do ZIP, com "/" (nunca "\\"). */
  caminho: string
  /** Tamanho descompactado, em bytes, conforme o diretório central. */
  tamanho: number
  /** Descompacta e devolve o conteúdo. */
  ler: () => Promise<Uint8Array>
}

/** Acima disto um único arquivo é recusado: um workflow de verdade fica muito abaixo. */
export const LIMITE_BYTES_ARQUIVO = 20 * 1024 * 1024
/** Entradas lidas por ZIP (mesmo teto do pacote do n8n). */
export const LIMITE_ENTRADAS = 5000

const ASSINATURA_FIM = 0x06054b50
const ASSINATURA_CENTRAL = 0x02014b50
const ASSINATURA_LOCAL = 0x04034b50

function decodificarNome(bytes: Uint8Array, utf8: boolean): string {
  const texto = new TextDecoder('utf-8').decode(bytes)
  if (utf8 || !texto.includes('�')) {
    return texto
  }
  return new TextDecoder('windows-1252').decode(bytes)
}

async function inflar(comprimido: Uint8Array): Promise<Uint8Array> {
  const fluxo = new Blob([comprimido as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(fluxo).arrayBuffer())
}

export async function listarZip(arquivo: Blob): Promise<EntradaZip[]> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Este navegador não consegue abrir ZIP. Atualize o navegador ou extraia o ZIP e escolha a pasta.')
  }

  // O registro de fim do diretório fica nos últimos 22 bytes + um comentário de até 64 KB.
  const cauda = Math.min(arquivo.size, 22 + 0xffff)
  const fim = new Uint8Array(await arquivo.slice(arquivo.size - cauda).arrayBuffer())
  const visaoFim = new DataView(fim.buffer, fim.byteOffset, fim.byteLength)
  let posicaoFim = -1
  for (let i = fim.length - 22; i >= 0; i--) {
    if (visaoFim.getUint32(i, true) === ASSINATURA_FIM) {
      posicaoFim = i
      break
    }
  }
  if (posicaoFim < 0) {
    throw new Error('Não parece um arquivo ZIP (ou está corrompido).')
  }

  const total = visaoFim.getUint16(posicaoFim + 10, true)
  const tamanhoCentral = visaoFim.getUint32(posicaoFim + 12, true)
  const inicioCentral = visaoFim.getUint32(posicaoFim + 16, true)
  if (total === 0xffff || tamanhoCentral === 0xffffffff || inicioCentral === 0xffffffff) {
    throw new Error('ZIP64 (arquivo muito grande) não é aceito. Divida a exportação em partes menores.')
  }
  if (total > LIMITE_ENTRADAS) {
    throw new Error(`O ZIP tem ${total} entradas; o limite é ${LIMITE_ENTRADAS}.`)
  }
  if (inicioCentral + tamanhoCentral > arquivo.size) {
    throw new Error('O diretório do ZIP aponta para fora do arquivo (corrompido).')
  }

  const central = new Uint8Array(await arquivo.slice(inicioCentral, inicioCentral + tamanhoCentral).arrayBuffer())
  const visao = new DataView(central.buffer, central.byteOffset, central.byteLength)
  const entradas: EntradaZip[] = []

  let pos = 0
  for (let n = 0; n < total; n++) {
    if (pos + 46 > central.length || visao.getUint32(pos, true) !== ASSINATURA_CENTRAL) {
      throw new Error('O diretório do ZIP está corrompido.')
    }
    const flags = visao.getUint16(pos + 8, true)
    const metodo = visao.getUint16(pos + 10, true)
    const tamanhoComprimido = visao.getUint32(pos + 20, true)
    const tamanho = visao.getUint32(pos + 24, true)
    const tamanhoNome = visao.getUint16(pos + 28, true)
    const tamanhoExtra = visao.getUint16(pos + 30, true)
    const tamanhoComentario = visao.getUint16(pos + 32, true)
    const deslocamento = visao.getUint32(pos + 42, true)
    const nome = decodificarNome(central.subarray(pos + 46, pos + 46 + tamanhoNome), (flags & 0x800) !== 0)
    pos += 46 + tamanhoNome + tamanhoExtra + tamanhoComentario

    const caminho = nome.replace(/\\/g, '/')
    if (caminho.endsWith('/')) {
      continue // pasta
    }

    entradas.push({
      caminho,
      tamanho,
      ler: async () => {
        if ((flags & 0x1) !== 0) {
          throw new Error(`"${caminho}" está protegido por senha.`)
        }
        if (tamanho > LIMITE_BYTES_ARQUIVO) {
          throw new Error(`"${caminho}" tem ${(tamanho / 1048576).toFixed(1)} MB (limite ${LIMITE_BYTES_ARQUIVO / 1048576} MB).`)
        }
        const cabecalho = new DataView(await arquivo.slice(deslocamento, deslocamento + 30).arrayBuffer())
        if (cabecalho.getUint32(0, true) !== ASSINATURA_LOCAL) {
          throw new Error(`"${caminho}": cabeçalho do arquivo inválido.`)
        }
        const inicio = deslocamento + 30 + cabecalho.getUint16(26, true) + cabecalho.getUint16(28, true)
        const dados = new Uint8Array(await arquivo.slice(inicio, inicio + tamanhoComprimido).arrayBuffer())
        if (metodo === 0) {
          return dados
        }
        if (metodo === 8) {
          return inflar(dados)
        }
        throw new Error(`"${caminho}" usa um método de compressão não suportado (${metodo}).`)
      },
    })
  }
  return entradas
}
