// Corta a marca que o Luís mandou em duas: a assinatura inteira (símbolo + palavra) e só o símbolo.
// Acha sozinho onde a palavra começa — o maior vão de colunas brancas — e mede as cores da marca.
//
// Rodar de dentro de app/: node scripts/gerar-marca.mjs <png de origem>
import { join } from 'node:path'

import { cortar, escreverPng, lerPng } from './png.mjs'

const origem = process.argv[2]
if (!origem) throw new Error('uso: node scripts/gerar-marca.mjs <png de origem>')
const destino = join(import.meta.dirname, '..', '..', 'identidade')

/** Colunas e linhas com algum pixel que não é fundo branco, e as cores da marca. */
function medir({ largura, altura, pixels }) {
  const colunas = new Array(largura).fill(false)
  const linhas = new Array(altura).fill(false)
  const cores = new Map()
  for (let y = 0; y < altura; y++) {
    for (let x = 0; x < largura; x++) {
      const i = (y * largura + x) * 4
      const [r, g, b, a] = [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]]
      // "branco" com folga: o PNG veio de uma imagem gerada, com ruído de compressão
      if (a < 16 || (r > 242 && g > 242 && b > 242)) continue
      colunas[x] = true
      linhas[y] = true
      const chave = `${r >> 3},${g >> 3},${b >> 3}`
      cores.set(chave, (cores.get(chave) ?? 0) + 1)
    }
  }
  return { colunas, linhas, cores }
}

/** O maior vão de colunas vazias: é ele que separa o símbolo da palavra. */
function maiorVao(colunas, de, ate) {
  let melhor = { inicio: -1, fim: -1 }
  let inicio = -1
  for (let x = de; x <= ate; x++) {
    if (!colunas[x]) {
      if (inicio < 0) inicio = x
      continue
    }
    if (inicio >= 0) {
      if (x - inicio > melhor.fim - melhor.inicio) melhor = { inicio, fim: x }
      inicio = -1
    }
  }
  return melhor
}

const imagem = lerPng(origem)
const { colunas, linhas, cores } = medir(imagem)
const x1 = colunas.indexOf(true)
const x2 = colunas.lastIndexOf(true)
const y1 = linhas.indexOf(true)
const y2 = linhas.lastIndexOf(true)
const vao = maiorVao(colunas, x1, x2)
if (vao.inicio < 0) throw new Error('não achei o vão entre o símbolo e a palavra')

const folga = Math.round((y2 - y1) * 0.08)
const corta = (cx, cy, cl, ca) => {
  const x = Math.max(0, cx - folga)
  const y = Math.max(0, cy - folga)
  return cortar(imagem, x, y, Math.min(imagem.largura - x, cl + folga * 2), Math.min(imagem.altura - y, ca + folga * 2))
}

const assinatura = corta(x1, y1, x2 - x1 + 1, y2 - y1 + 1)
escreverPng(join(destino, 'orkester-assinatura.png'), assinatura)

// só o símbolo: as linhas dele são medidas no próprio recorte, porque a palavra pode ser mais baixa
const soSimbolo = cortar(imagem, x1, 0, vao.inicio - x1, imagem.altura)
const ls = medir(soSimbolo).linhas
const simbolo = corta(x1, ls.indexOf(true), vao.inicio - x1, ls.lastIndexOf(true) - ls.indexOf(true) + 1)
escreverPng(join(destino, 'orkester-simbolo.png'), simbolo)

const maisUsadas = [...cores.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 8)
  .map(([chave, quantas]) => {
    const [r, g, b] = chave.split(',').map((n) => Number(n) << 3)
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')} (${quantas} px)`
  })

console.log('origem:', `${imagem.largura}x${imagem.altura}`)
console.log('assinatura:', `${assinatura.largura}x${assinatura.altura}`, '→ identidade/orkester-assinatura.png')
console.log('símbolo:', `${simbolo.largura}x${simbolo.altura}`, '→ identidade/orkester-simbolo.png')
console.log('vão entre símbolo e palavra: x', vao.inicio, 'a', vao.fim)
console.log('cores mais usadas:', maisUsadas.join(' · '))
