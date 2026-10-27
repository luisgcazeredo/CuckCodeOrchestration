import type { Camera, Desenho, No } from '../../../shared/modelo'

export interface Ponto {
  x: number
  y: number
}

export interface Caixa {
  x: number
  y: number
  largura: number
  altura: number
}

// Tamanho atual da área do quadro na tela, atualizado pelo próprio quadro.
let viewport = { largura: 1, altura: 1 }
export const definirViewport = (largura: number, altura: number): void => {
  viewport = { largura, altura }
}
export const lerViewport = (): { largura: number; altura: number } => viewport

// Onde o mouse está sobre o quadro (na tela), para colar ali; null com o mouse fora do quadro.
let mouse: Ponto | null = null
export const definirMouse = (p: Ponto | null): void => {
  mouse = p
}

/** Ponto do quadro onde colar: embaixo do mouse, ou no meio da tela. */
export function pontoParaColar(camera: Camera): Ponto {
  return mouse ? telaParaQuadro(mouse, camera) : centroDaTela(camera)
}

export function telaParaQuadro(p: Ponto, camera: Camera): Ponto {
  return { x: (p.x - camera.x) / camera.zoom, y: (p.y - camera.y) / camera.zoom }
}

/** Câmera nova com `zoom`, mantendo parado o ponto da tela `ancora`. */
export function zoomEm(camera: Camera, zoom: number, ancora: Ponto): Camera {
  const noQuadro = telaParaQuadro(ancora, camera)
  return { zoom, x: ancora.x - noQuadro.x * zoom, y: ancora.y - noQuadro.y * zoom }
}

export function centroDaTela(camera: Camera): Ponto {
  return telaParaQuadro({ x: viewport.largura / 2, y: viewport.altura / 2 }, camera)
}

export const caixaDoNo = (n: No): Caixa => ({ x: n.x, y: n.y, largura: n.largura, altura: n.altura })

export function seTocam(a: Caixa, b: Caixa): boolean {
  return a.x <= b.x + b.largura && b.x <= a.x + a.largura && a.y <= b.y + b.altura && b.y <= a.y + a.altura
}

/** Caixa entre dois pontos, em qualquer direção (retângulo de seleção). */
export function caixaEntre(a: Ponto, b: Ponto): Caixa {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), largura: Math.abs(b.x - a.x), altura: Math.abs(b.y - a.y) }
}

/** Linha-guia de alinhamento, em coordenadas do quadro: vertical (x fixo) ou horizontal (y fixo). */
export interface Guia {
  eixo: 'x' | 'y'
  valor: number
  de: number
  ate: number
}

/**
 * Ímã de alinhamento: se a borda ou o centro de `caixa` passa a menos de `limiar` da borda ou do centro de
 * outra, devolve o ajuste que encosta as duas e as linhas-guia para mostrar.
 */
export function imantar(caixa: Caixa, outras: Caixa[], limiar: number): { dx: number; dy: number; guias: Guia[] } {
  const linhas = (c: Caixa, eixo: 'x' | 'y'): number[] =>
    eixo === 'x' ? [c.x, c.x + c.largura / 2, c.x + c.largura] : [c.y, c.y + c.altura / 2, c.y + c.altura]
  const ajuste = { x: 0, y: 0 }
  const guias: Guia[] = []
  for (const eixo of ['x', 'y'] as const) {
    let melhor: number | null = null
    for (const outra of outras) {
      for (const a of linhas(caixa, eixo)) {
        for (const b of linhas(outra, eixo)) {
          const d = b - a
          if (Math.abs(d) <= limiar && (melhor === null || Math.abs(d) < Math.abs(melhor))) melhor = d
        }
      }
    }
    if (melhor === null) continue
    ajuste[eixo] = melhor
    // a guia vai de ponta a ponta de tudo o que ficou alinhado naquela linha
    const movida = eixo === 'x' ? { ...caixa, x: caixa.x + melhor } : { ...caixa, y: caixa.y + melhor }
    for (const valor of new Set(linhas(movida, eixo))) {
      const alinhadas = outras.filter((o) => linhas(o, eixo).some((b) => Math.abs(b - valor) < 0.5))
      if (!alinhadas.length) continue
      const todas = [movida, ...alinhadas]
      const inicio = (c: Caixa): number => (eixo === 'x' ? c.y : c.x)
      const fim = (c: Caixa): number => (eixo === 'x' ? c.y + c.altura : c.x + c.largura)
      guias.push({ eixo, valor, de: Math.min(...todas.map(inicio)), ate: Math.max(...todas.map(fim)) })
    }
  }
  return { dx: ajuste.x, dy: ajuste.y, guias }
}

export function caixaDoDesenho(d: Desenho): Caixa {
  const xs = d.pontos.map((p) => p[0])
  const ys = d.pontos.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, largura: Math.max(...xs) - x, altura: Math.max(...ys) - y }
}

function distanciaAoSegmento(p: Ponto, a: [number, number], b: [number, number]): number {
  const [ax, ay] = a
  const [bx, by] = b
  const dx = bx - ax
  const dy = by - ay
  const t = dx || dy ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy))) : 0
  return Math.hypot(p.x - (ax + t * dx), p.y - (ay + t * dy))
}

/** Distância do ponto ao traço (não à caixa): é o que a borracha usa para saber se tocou. */
export function distanciaAoDesenho(d: Desenho, p: Ponto): number {
  const pts = d.pontos
  if (pts.length === 0) return Infinity
  let segmentos: Array<[[number, number], [number, number]]>
  if (d.ferramenta === 'retangulo' && pts.length === 2) {
    const [[x1, y1], [x2, y2]] = pts
    segmentos = [
      [[x1, y1], [x2, y1]],
      [[x2, y1], [x2, y2]],
      [[x2, y2], [x1, y2]],
      [[x1, y2], [x1, y1]]
    ]
  } else if (pts.length === 1) {
    segmentos = [[pts[0], pts[0]]]
  } else {
    segmentos = pts.slice(1).map((b, i) => [pts[i], b] as [[number, number], [number, number]])
  }
  return Math.min(...segmentos.map(([a, b]) => distanciaAoSegmento(p, a, b)))
}

export function uniao(caixas: Caixa[]): Caixa | null {
  if (caixas.length === 0) return null
  const x = Math.min(...caixas.map((c) => c.x))
  const y = Math.min(...caixas.map((c) => c.y))
  const fimX = Math.max(...caixas.map((c) => c.x + c.largura))
  const fimY = Math.max(...caixas.map((c) => c.y + c.altura))
  return { x, y, largura: fimX - x, altura: fimY - y }
}

/** Câmera que mostra a caixa inteira com uma folga, sem passar de 100%. */
export function enquadrar(caixa: Caixa, folga = 80): Camera {
  const zoom = Math.min(
    1,
    Math.max(0.1, Math.min((viewport.largura - folga * 2) / caixa.largura, (viewport.altura - folga * 2) / caixa.altura))
  )
  return {
    zoom,
    x: viewport.largura / 2 - (caixa.x + caixa.largura / 2) * zoom,
    y: viewport.altura / 2 - (caixa.y + caixa.altura / 2) * zoom
  }
}

/**
 * Curva da corda entre dois nós: sai do lado de A que olha para B e entra no lado de B que olha para A,
 * com as alças na direção desses lados (fica como uma corda pendurada, não uma reta).
 */
export function curvaEntre(a: No, b: No): string {
  const ca = { x: a.x + a.largura / 2, y: a.y + a.altura / 2 }
  const cb = { x: b.x + b.largura / 2, y: b.y + b.altura / 2 }
  const dx = cb.x - ca.x
  const dy = cb.y - ca.y
  let p1: Ponto, p2: Ponto, n1: Ponto, n2: Ponto
  if (Math.abs(dx) * a.altura >= Math.abs(dy) * a.largura) {
    const s = Math.sign(dx) || 1
    p1 = { x: ca.x + (s * a.largura) / 2, y: ca.y }
    p2 = { x: cb.x - (s * b.largura) / 2, y: cb.y }
    n1 = { x: s, y: 0 }
    n2 = { x: -s, y: 0 }
  } else {
    const s = Math.sign(dy) || 1
    p1 = { x: ca.x, y: ca.y + (s * a.altura) / 2 }
    p2 = { x: cb.x, y: cb.y - (s * b.altura) / 2 }
    n1 = { x: 0, y: s }
    n2 = { x: 0, y: -s }
  }
  const alca = Math.max(40, Math.hypot(p2.x - p1.x, p2.y - p1.y) / 3)
  return `M ${p1.x} ${p1.y} C ${p1.x + n1.x * alca} ${p1.y + n1.y * alca}, ${p2.x + n2.x * alca} ${p2.y + n2.y * alca}, ${p2.x} ${p2.y}`
}

export function pontasDaCorda(a: No, b: No): [Ponto, Ponto] {
  const partes = curvaEntre(a, b).match(/-?\d+(\.\d+)?/g)!.map(Number)
  return [
    { x: partes[0], y: partes[1] },
    { x: partes[6], y: partes[7] }
  ]
}
