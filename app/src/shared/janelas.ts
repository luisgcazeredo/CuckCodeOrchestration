/**
 * Quais janelas reabrir, e onde. Cálculo puro: não conhece Electron nem disco, só a lista guardada da
 * última sessão, os espaços que ainda existem e as telas ligadas agora.
 *
 * Duas regras que vieram de problema real:
 *
 * - **Um espaço só pode estar numa janela.** É quem grava o quadro e mexe no git dele; duas janelas no
 *   mesmo espaço se sobrescrevem. Então a lista é deduplicada antes de abrir, não depois.
 * - **A tela de ontem pode não existir hoje.** Quem desliga o segundo monitor não pode perder a janela
 *   fora da área visível; por isso toda caixa é encaixada na tela mais próxima antes de abrir.
 */

/** Uma janela da sessão passada, como foi guardada em disco. */
export interface JanelaSalva {
  /** O espaço que ela mostrava; `null` = ela ainda não tinha escolhido um. */
  espacoId: string | null
  x: number
  y: number
  largura: number
  altura: number
  maximizada: boolean
}

export interface Sessao {
  versao: 1
  janelas: JanelaSalva[]
}

/** Área útil de um monitor (sem a barra de tarefas). */
export interface Tela {
  x: number
  y: number
  largura: number
  altura: number
}

/** Teto de janelas reabertas: acima disso é mais atrapalho que ajuda, e cada uma custa um processo. */
export const MAX_JANELAS_REABERTAS = 6
export const LARGURA_MINIMA = 640
export const ALTURA_MINIMA = 420

export const SESSAO_VAZIA: Sessao = { versao: 1, janelas: [] }

const inteiro = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** Uma entrada só serve se tiver os quatro números e um espaço que seja string ou nulo. */
export function janelaValida(j: unknown): j is JanelaSalva {
  if (!j || typeof j !== 'object') return false
  const c = j as JanelaSalva
  const espaco = c.espacoId === null || typeof c.espacoId === 'string'
  return espaco && inteiro(c.x) && inteiro(c.y) && inteiro(c.largura) && inteiro(c.altura) && typeof c.maximizada === 'boolean'
}

export function sessaoValida(s: unknown): s is Sessao {
  if (!s || typeof s !== 'object') return false
  const c = s as Sessao
  return c.versao === 1 && Array.isArray(c.janelas) && c.janelas.every(janelaValida)
}

const centro = (j: JanelaSalva): { x: number; y: number } => ({ x: j.x + j.largura / 2, y: j.y + j.altura / 2 })

const dentro = (tela: Tela, p: { x: number; y: number }): boolean =>
  p.x >= tela.x && p.x < tela.x + tela.largura && p.y >= tela.y && p.y < tela.y + tela.altura

const limitar = (valor: number, minimo: number, maximo: number): number => Math.max(minimo, Math.min(maximo, valor))

/**
 * Põe a caixa inteira dentro de uma tela que existe hoje: a que contém o centro dela, ou a primeira
 * (a principal) se o centro caiu no vazio — monitor desligado desde a última vez.
 */
export function encaixarNaTela(janela: JanelaSalva, telas: Tela[]): JanelaSalva {
  if (telas.length === 0) return janela
  const tela = telas.find((t) => dentro(t, centro(janela))) ?? telas[0]
  const largura = limitar(janela.largura, Math.min(LARGURA_MINIMA, tela.largura), tela.largura)
  const altura = limitar(janela.altura, Math.min(ALTURA_MINIMA, tela.altura), tela.altura)
  return {
    ...janela,
    largura,
    altura,
    x: Math.round(limitar(janela.x, tela.x, tela.x + tela.largura - largura)),
    y: Math.round(limitar(janela.y, tela.y, tela.y + tela.altura - altura))
  }
}

/**
 * A lista final de janelas a abrir. Descarta espaço que não existe mais, não repete espaço, limita a
 * quantidade e encaixa cada uma numa tela de verdade. Lista vazia: quem chama abre uma janela sozinha,
 * como sempre fez.
 */
export function janelasParaAbrir(sessao: Sessao, espacos: string[], telas: Tela[], max = MAX_JANELAS_REABERTAS): JanelaSalva[] {
  const existe = new Set(espacos)
  const jaVi = new Set<string>()
  const fora: JanelaSalva[] = []
  for (const janela of sessao.janelas) {
    if (fora.length >= max) break
    const id = janela.espacoId
    if (id !== null) {
      if (!existe.has(id) || jaVi.has(id)) continue
      jaVi.add(id)
    } else if (fora.length > 0) {
      continue // uma janela sem espaço basta; as outras seriam cópias vazias da mesma coisa
    }
    fora.push(encaixarNaTela(janela, telas))
  }
  return fora
}
