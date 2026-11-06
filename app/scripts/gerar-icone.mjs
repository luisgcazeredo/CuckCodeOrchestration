// Desenha o símbolo do Orkester — três peças orbitando um núcleo — e escreve as duas formas dele:
//   build/icon.svg            vetor, com a chapa de fundo: é o ícone do app e do instalador
//   build/icon.png            o mesmo, rasterizado (512 px; o ícone do Windows vai até 256)
//   ../identidade/orkester-simbolo-vetor.svg   só o símbolo, fundo transparente
//
// O desenho é todo analítico (círculos e faixas em coordenadas polares), então o mesmo cálculo gera o
// vetor e o pixel, e a rasterização não precisa de navegador: 3x3 amostras por pixel dão a suavização.
//
// Rodar de dentro de app/: npm run icone
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { escreverPng } from './png.mjs'

const LADO = 1024 // unidade do desenho; o PNG sai reduzido
const PNG = 512
const C = LADO / 2
const ORBITA = 296 // raio onde as três peças correm
const PECA = 115 // raio de cada peça
const NUCLEO = 135 // raio do núcleo
const GROSSO = 96 // a faixa no começo, logo depois de uma peça
const FINO = 10 // e no fim, entrando na próxima
const ENTRADA = 13 // graus de folga no começo da faixa
const SAIDA = 34 // e no fim, para a ponta fina aparecer antes da próxima peça
const CHAPA = { meio: LADO / 2, lado: 896, raio: 208, borda: 7 }

const AZUL = [0x40, 0x60, 0xe8]
const CLARO = [0x98, 0xa8, 0xf8]
const BRANCO = [0xff, 0xff, 0xff]
const CONTORNO = [0xe2, 0xe6, 0xf5]

const ANGULOS = [-90, 30, 150] // topo, baixo-direita, baixo-esquerda
const grau = (a) => (a * Math.PI) / 180
const ponto = (angulo, raio) => [C + Math.cos(grau(angulo)) * raio, C + Math.sin(grau(angulo)) * raio]
const larguraEm = (t) => GROSSO + (FINO - GROSSO) * t

/** As três faixas: cada uma sai de uma peça e afina até a seguinte, no sentido do relógio. */
const FAIXAS = ANGULOS.map((a) => ({ de: a + ENTRADA, ate: a + 120 - SAIDA }))

// ---------------------------------------------------------------- vetor

function faixaEmPath({ de, ate }, passos = 48) {
  const fora = []
  const dentro = []
  for (let i = 0; i <= passos; i++) {
    const t = i / passos
    const a = de + (ate - de) * t
    const meia = larguraEm(t) / 2
    fora.push(ponto(a, ORBITA + meia))
    dentro.push(ponto(a, ORBITA - meia))
  }
  const pts = [...fora, ...dentro.reverse()]
  return `M ${pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ')} Z`
}

const cor = ([r, g, b]) => `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`

function simboloSvg(indento = '  ') {
  const partes = FAIXAS.map((f) => `${indento}<path d="${faixaEmPath(f)}" fill="${cor(AZUL)}"/>`)
  for (const a of ANGULOS) {
    const [x, y] = ponto(a, ORBITA)
    partes.push(`${indento}<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${PECA}" fill="${cor(AZUL)}"/>`)
  }
  partes.push(`${indento}<circle cx="${C}" cy="${C}" r="${NUCLEO}" fill="${cor(CLARO)}"/>`)
  return partes.join('\n')
}

const x0 = CHAPA.meio - CHAPA.lado / 2
const icone = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LADO} ${LADO}" width="${LADO}" height="${LADO}">
  <!-- Ícone do Orkester: três agentes orbitando o trabalho. Gerado por scripts/gerar-icone.mjs — não editar à mão. -->
  <rect x="${x0}" y="${x0}" width="${CHAPA.lado}" height="${CHAPA.lado}" rx="${CHAPA.raio}" fill="${cor(BRANCO)}" stroke="${cor(CONTORNO)}" stroke-width="${CHAPA.borda}"/>
${simboloSvg()}
</svg>
`

const soSimbolo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${LADO} ${LADO}" width="${LADO}" height="${LADO}">
  <!-- Símbolo do Orkester, sem fundo. Gerado por app/scripts/gerar-icone.mjs — não editar à mão. -->
${simboloSvg()}
</svg>
`

// ---------------------------------------------------------------- pixel

/** Distância com sinal até a chapa arredondada: negativa dentro. */
function distanciaDaChapa(x, y) {
  const meia = CHAPA.lado / 2 - CHAPA.raio
  const dx = Math.max(Math.abs(x - CHAPA.meio) - meia, 0)
  const dy = Math.max(Math.abs(y - CHAPA.meio) - meia, 0)
  return Math.hypot(dx, dy) - CHAPA.raio
}

function naFaixa(x, y) {
  const raio = Math.hypot(x - C, y - C)
  if (raio < ORBITA - GROSSO / 2 || raio > ORBITA + GROSSO / 2) return false
  let angulo = (Math.atan2(y - C, x - C) * 180) / Math.PI
  for (const { de, ate } of FAIXAS) {
    let d = angulo - de
    while (d < 0) d += 360
    while (d >= 360) d -= 360
    const vao = ate - de
    if (d > vao) continue
    if (Math.abs(raio - ORBITA) <= larguraEm(d / vao) / 2) return true
  }
  return false
}

const PECAS = ANGULOS.map((a) => ponto(a, ORBITA))

/** A cor de um ponto do desenho, ou null se está fora da chapa. */
function corEm(x, y) {
  const d = distanciaDaChapa(x, y)
  if (d > 0) return null
  if (Math.hypot(x - C, y - C) <= NUCLEO) return CLARO
  if (PECAS.some(([px, py]) => Math.hypot(x - px, y - py) <= PECA)) return AZUL
  if (naFaixa(x, y)) return AZUL
  return d > -CHAPA.borda ? CONTORNO : BRANCO
}

function rasterizar(lado, amostras = 3) {
  const pixels = Buffer.alloc(lado * lado * 4)
  const escala = LADO / lado
  for (let y = 0; y < lado; y++) {
    for (let x = 0; x < lado; x++) {
      let [r, g, b, a] = [0, 0, 0, 0]
      for (let sy = 0; sy < amostras; sy++) {
        for (let sx = 0; sx < amostras; sx++) {
          const c = corEm((x + (sx + 0.5) / amostras) * escala, (y + (sy + 0.5) / amostras) * escala)
          if (!c) continue
          r += c[0]
          g += c[1]
          b += c[2]
          a += 255
        }
      }
      const total = amostras * amostras
      const i = (y * lado + x) * 4
      const cobertura = a / 255
      // cor média só dos pontos que pintaram; alfa é a fatia do pixel que a chapa cobre
      pixels[i] = cobertura ? Math.round(r / cobertura) : 0
      pixels[i + 1] = cobertura ? Math.round(g / cobertura) : 0
      pixels[i + 2] = cobertura ? Math.round(b / cobertura) : 0
      pixels[i + 3] = Math.round(a / total)
    }
  }
  return { largura: lado, altura: lado, pixels }
}

const build = join(import.meta.dirname, '..', 'build')
writeFileSync(join(build, 'icon.svg'), icone)
writeFileSync(join(import.meta.dirname, '..', '..', 'identidade', 'orkester-simbolo-vetor.svg'), soSimbolo)
escreverPng(join(build, 'icon.png'), rasterizar(PNG))
console.log(`build/icon.svg, build/icon.png (${PNG}px) e identidade/orkester-simbolo-vetor.svg gerados`)
