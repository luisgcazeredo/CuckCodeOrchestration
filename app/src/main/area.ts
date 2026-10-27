import { clipboard, ClipboardItem, ipcMain, nativeImage, net, protocol } from 'electron'
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CANAIS_AREA, type ConteudoArea } from '../shared/api'
import { IMAGEM_VALIDA, PASTA_DADOS, pastaImagens } from './dados'

// Copiar e colar cartões entre espaços, andares e janelas, e colar prints como imagem.
// Os cartões vão para a área de transferência como HTML com o JSON assinado (HMAC com uma chave que só
// este app conhece): um site aberto no portal não consegue plantar cartões falsos (ex.: um anexo que
// aponta para um executável). Sem a assinatura, o conteúdo é tratado como texto comum.

const ID_VALIDO = /^[0-9a-f-]{36}$/
const MARCA = /data-maestri-proprio="([A-Za-z0-9+/=]+)\.([0-9a-f]{64})"/
const LIMITE_FRAGMENTO = 20 * 1024 * 1024
const LIMITE_IMAGEM = 40 * 1024 * 1024
const LIMITE_TEXTO = 200_000

let chave: Buffer | null = null

/** Chave da assinatura, criada na primeira vez e guardada na pasta de dados (copiar hoje, colar amanhã). */
function lerChave(): Buffer {
  if (chave) return chave
  const arquivo = join(PASTA_DADOS, 'chave-area')
  try {
    const salva = readFileSync(arquivo)
    if (salva.length === 32) return (chave = salva)
  } catch {
    // primeira vez
  }
  chave = randomBytes(32)
  writeFileSync(arquivo, chave)
  return chave
}

const assinar = (dados: string): string => createHmac('sha256', lerChave()).update(dados).digest('hex')

function confere(dados: string, assinatura: string): boolean {
  const esperada = Buffer.from(assinar(dados), 'hex')
  const recebida = Buffer.from(assinatura, 'hex')
  return esperada.length === recebida.length && timingSafeEqual(esperada, recebida)
}

const escaparHtml = (t: string): string => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)

/** `mp-imagem://<espaço>/<arquivo>.png`: a janela mostra as imagens do quadro sem acesso ao disco. */
export function registrarEsquemaImagem(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: 'mp-imagem', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
}

export function servirImagens(): void {
  protocol.handle('mp-imagem', (pedido) => {
    const url = new URL(pedido.url)
    const espaco = url.hostname
    const arquivo = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (!ID_VALIDO.test(espaco) || !IMAGEM_VALIDA.test(arquivo)) return new Response('não', { status: 400 })
    const caminho = join(pastaImagens(espaco), arquivo)
    if (!existsSync(caminho)) return new Response('não encontrada', { status: 404 })
    return net.fetch(pathToFileURL(caminho).toString())
  })
}

export function registrarArea(): void {
  ipcMain.handle(CANAIS_AREA.copiar, async (_e, json: string, espacoOrigem: string, texto: string) => {
    if (typeof json !== 'string' || json.length > LIMITE_FRAGMENTO || !ID_VALIDO.test(String(espacoOrigem))) {
      throw new Error('cópia inválida')
    }
    const carga = Buffer.from(JSON.stringify({ espacoOrigem, json }), 'utf8').toString('base64')
    const simples = typeof texto === 'string' ? texto.slice(0, LIMITE_TEXTO) : ''
    await clipboard.write([
      new ClipboardItem({
        'text/plain': simples,
        'text/html': `<span data-maestri-proprio="${carga}.${assinar(carga)}"></span><pre>${escaparHtml(simples)}</pre>`
      })
    ])
  })

  ipcMain.handle(CANAIS_AREA.colar, async (_e, espacoId: string): Promise<ConteudoArea> => {
    const itens = await clipboard.read()
    /** Conteúdo do primeiro item que tiver o tipo pedido. */
    const ler = async (tipo: string): Promise<Blob | null> => {
      const item = itens.find((i) => i.types.includes(tipo))
      return item ? ((await item.getType(tipo)) as Blob) : null
    }
    const html = await ler('text/html')
    const marca = html ? MARCA.exec(await html.text()) : null
    if (marca && confere(marca[1], marca[2])) {
      const { espacoOrigem, json } = JSON.parse(Buffer.from(marca[1], 'base64').toString('utf8'))
      if (typeof json === 'string' && typeof espacoOrigem === 'string') return { tipo: 'fragmento', json, espacoOrigem }
    }
    const imagem = await ler('image/png')
    if (imagem && imagem.size > 0) {
      if (!ID_VALIDO.test(String(espacoId))) throw new Error('espaço inválido')
      if (imagem.size > LIMITE_IMAGEM) throw new Error('imagem grande demais (mais de 40 MB)')
      const png = Buffer.from(await imagem.arrayBuffer())
      const { width, height } = nativeImage.createFromBuffer(png).getSize()
      if (!width || !height) return { tipo: 'nada' }
      const arquivo = `${randomUUID()}.png`
      mkdirSync(pastaImagens(espacoId), { recursive: true })
      writeFileSync(join(pastaImagens(espacoId), arquivo), png)
      return { tipo: 'imagem', arquivo, largura: width, altura: height }
    }
    const texto = await clipboard.readText()
    if (texto.trim()) return { tipo: 'texto', texto: texto.slice(0, LIMITE_TEXTO) }
    return { tipo: 'nada' }
  })

  ipcMain.handle(CANAIS_AREA.trazerImagem, (_e, de: string, arquivo: string, para: string): string | null => {
    if (![de, para].every((id) => ID_VALIDO.test(String(id))) || !IMAGEM_VALIDA.test(String(arquivo))) return null
    const origem = join(pastaImagens(de), arquivo)
    if (!existsSync(origem)) return null
    const novo = `${randomUUID()}.png`
    mkdirSync(pastaImagens(para), { recursive: true })
    copyFileSync(origem, join(pastaImagens(para), novo))
    return novo
  })
}
