// PNG de 8 bits RGBA na mão, com o zlib do próprio Node. Existe para os scripts de marca e de ícone
// não dependerem do Electron: um app de janela rodado do terminal não devolve a saída nem o controle.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'

const ASSINATURA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Desfaz os filtros por linha do PNG; devolve RGBA puro. */
function desfiltrar(cru, largura, altura) {
  const porPixel = 4
  const porLinha = largura * porPixel
  const fora = Buffer.alloc(porLinha * altura)
  let anterior = Buffer.alloc(porLinha)
  for (let y = 0; y < altura; y++) {
    const filtro = cru[y * (porLinha + 1)]
    const linha = cru.subarray(y * (porLinha + 1) + 1, (y + 1) * (porLinha + 1))
    const atual = fora.subarray(y * porLinha, (y + 1) * porLinha)
    for (let i = 0; i < porLinha; i++) {
      const a = i >= porPixel ? atual[i - porPixel] : 0
      const b = anterior[i]
      const c = i >= porPixel ? anterior[i - porPixel] : 0
      let soma = 0
      if (filtro === 1) soma = a
      else if (filtro === 2) soma = b
      else if (filtro === 3) soma = (a + b) >> 1
      else if (filtro === 4) {
        const p = a + b - c
        const [pa, pb, pc] = [Math.abs(p - a), Math.abs(p - b), Math.abs(p - c)]
        soma = pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      } else if (filtro !== 0) throw new Error(`filtro ${filtro} na linha ${y}`)
      atual[i] = (linha[i] + soma) & 0xff
    }
    anterior = atual
  }
  return fora
}

/** Só PNG de 8 bits RGBA sem entrelaçamento — é o que os arquivos daqui são. */
export function lerPng(caminho) {
  const bruto = readFileSync(caminho)
  if (!bruto.subarray(0, 8).equals(ASSINATURA)) throw new Error(`${caminho} não é um PNG`)
  const largura = bruto.readUInt32BE(16)
  const altura = bruto.readUInt32BE(20)
  if (bruto[24] !== 8 || bruto[25] !== 6 || bruto[28] !== 0) {
    throw new Error('só sei ler PNG de 8 bits RGBA sem entrelaçamento')
  }
  const partes = []
  for (let o = 8; o < bruto.length; ) {
    const tamanho = bruto.readUInt32BE(o)
    const tipo = bruto.toString('ascii', o + 4, o + 8)
    if (tipo === 'IDAT') partes.push(bruto.subarray(o + 8, o + 8 + tamanho))
    if (tipo === 'IEND') break
    o += 12 + tamanho
  }
  return { largura, altura, pixels: desfiltrar(inflateSync(Buffer.concat(partes)), largura, altura) }
}

const CRC = (() => {
  const tabela = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabela[n] = c
  }
  return (buf) => {
    let c = -1
    for (const byte of buf) c = tabela[(c ^ byte) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
})()

function pedaco(tipo, dados) {
  const corpo = Buffer.concat([Buffer.from(tipo, 'ascii'), dados])
  const tamanho = Buffer.alloc(4)
  tamanho.writeUInt32BE(dados.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(CRC(corpo))
  return Buffer.concat([tamanho, corpo, crc])
}

export function escreverPng(caminho, { largura, altura, pixels }) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(largura, 0)
  ihdr.writeUInt32BE(altura, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  const porLinha = largura * 4
  const cru = Buffer.alloc((porLinha + 1) * altura)
  for (let y = 0; y < altura; y++) pixels.copy(cru, y * (porLinha + 1) + 1, y * porLinha, (y + 1) * porLinha)
  mkdirSync(dirname(caminho), { recursive: true })
  writeFileSync(
    caminho,
    Buffer.concat([ASSINATURA, pedaco('IHDR', ihdr), pedaco('IDAT', deflateSync(cru, { level: 9 })), pedaco('IEND', Buffer.alloc(0))])
  )
}

export function cortar(img, x, y, largura, altura) {
  const pixels = Buffer.alloc(largura * altura * 4)
  for (let l = 0; l < altura; l++) {
    const de = ((y + l) * img.largura + x) * 4
    img.pixels.copy(pixels, l * largura * 4, de, de + largura * 4)
  }
  return { largura, altura, pixels }
}
