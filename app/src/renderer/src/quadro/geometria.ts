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

export function caixaDoDesenho(d: Desenho): Caixa {
  const xs = d.pontos.map((p) => p[0])
  const ys = d.pontos.map((p) => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return { x, y, largura: Math.max(...xs) - x, altura: Math.max(...ys) - y }
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
