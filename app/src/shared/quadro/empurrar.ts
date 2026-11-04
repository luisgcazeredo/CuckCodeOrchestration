export interface Caixa {
  x: number
  y: number
  largura: number
  altura: number
}

/** Igual ao tocam de geometria.ts, repetido aqui para este arquivo rodar sozinho nas provas. */
const tocam = (a: Caixa, b: Caixa, folga: number): boolean =>
  a.x < b.x + b.largura + folga && b.x < a.x + a.largura + folga && a.y < b.y + b.altura + folga && b.y < a.y + a.altura + folga

export interface Peca extends Caixa {
  id: string
}

/** Quanto de folga fica entre o que foi empurrado e quem empurrou. */
export const FOLGA = 14

/**
 * Abre espaço para `fixos` (a coluna de um agente, que acabou de crescer): cada peça de `moveis` que ficaria
 * debaixo deles desce o mínimo para sair, e quem estava embaixo dela desce junto, em cascata.
 *
 * Só desce — nunca sobe nem anda de lado — para o quadro não "respirar" para os dois lados a cada arquivo
 * que o agente grava: o usuário precisa reconhecer o quadro dele depois do empurrão.
 *
 * Devolve só o y novo de quem de fato se mexeu.
 */
export function empurrarParaBaixo(fixos: Caixa[], moveis: Peca[], folga = FOLGA): Map<string, number> {
  const mudou = new Map<string, number>()
  if (!fixos.length) return mudou
  // quem já tem lugar definido: os fixos e as peças que este laço já resolveu
  const postos: Caixa[] = [...fixos]
  for (const peca of [...moveis].sort((a, b) => a.y - b.y || a.x - b.x)) {
    let caixa: Caixa = { x: peca.x, y: peca.y, largura: peca.largura, altura: peca.altura }
    // descer pode esbarrar em outro: repete até achar lugar livre, com teto para nunca travar
    for (let volta = 0; volta < 100; volta++) {
      const bate = postos.find((o) => tocam(caixa, o, folga))
      if (!bate) break
      caixa = { ...caixa, y: bate.y + bate.altura + folga }
    }
    postos.push(caixa)
    if (caixa.y !== peca.y) mudou.set(peca.id, caixa.y)
  }
  return mudou
}
