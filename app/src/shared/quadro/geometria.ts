import type { No, Plano } from '../modelo'

export interface Caixa {
  x: number
  y: number
  largura: number
  altura: number
}

export const caixaDoNo = (no: No): Caixa => ({ x: no.x, y: no.y, largura: no.largura, altura: no.altura })

export const tocam = (a: Caixa, b: Caixa, folga: number): boolean =>
  a.x < b.x + b.largura + folga && b.x < a.x + a.largura + folga && a.y < b.y + b.altura + folga && b.y < a.y + a.altura + folga

export const proximoZ = (plano: Plano): number => Math.max(0, ...plano.nos.map((no) => no.z), ...plano.desenhos.map((desenho) => desenho.z)) + 1
