/**
 * Bandas: grupos de agentes. Uma banda é uma **moldura** no quadro; quem está dentro dela fala com todos os
 * outros de dentro, e a corda desenhada na banda vale para cada um dos que estão dentro.
 *
 * Por que moldura, e não lista de membros: um time de quatro precisa de seis cordas desenhadas à mão, e uma
 * lista guardada pode discordar do que está na tela. Aqui **o que se vê é a verdade** — o cartão que entra na
 * moldura entra no time, o que sai sai, sem gesto novo para aprender e sem estado escondido.
 *
 * Tudo aqui é função pura sobre o plano, para a janela só aplicar e as provas rodarem sem Electron. A
 * permissão do `ork` continua sendo corda: a janela manda para o processo principal as **cordas efetivas**
 * (as desenhadas mais as que a banda implica), e o main segue sem saber o que é banda.
 */
import type { Caixa } from './geometria'
import type { Corda, No, NoBanda, NoTerminal, Plano } from '../modelo'

/** Folga entre a borda da moldura e os cartões de dentro quando a banda nasce em volta deles. */
export const FOLGA = 40
/** Barra de cima, onde fica o nome da banda. */
export const TITULO = 46
export const MIN_LARGURA = 320
export const MIN_ALTURA = 220
export const MAX_NOME = 60
/** Teto de agentes que uma banda liga entre si (acima disso, a conta de pares não vale a pena). */
export const MAX_MEMBROS = 24
/** Teto de pares de permissão que as bandas podem gerar, somadas. */
export const MAX_PARES = 600

const centroDe = (no: No): { x: number; y: number } => ({ x: no.x + no.largura / 2, y: no.y + no.altura / 2 })

/** O cartão está nesta banda? É o centro dele que conta, para um cartão meio de fora não ficar em dúvida. */
export function dentroDaBanda(banda: NoBanda, no: No): boolean {
  if (no.id === banda.id) return false
  const c = centroDe(no)
  return c.x >= banda.x && c.x <= banda.x + banda.largura && c.y >= banda.y && c.y <= banda.y + banda.altura
}

/** Os agentes de uma banda, de cima para baixo (só cartão de terminal entra num time). */
export function membrosDaBanda(plano: Plano, bandaId: string): NoTerminal[] {
  const banda = plano.nos.find((no) => no.id === bandaId)
  if (banda?.tipo !== 'banda') return []
  return plano.nos
    .filter((no): no is NoTerminal => no.tipo === 'terminal' && dentroDaBanda(banda, no))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))
    .slice(0, MAX_MEMBROS)
}

/** As bandas em que este cartão está (mais de uma, se as molduras se sobrepõem). */
export function bandasDoNo(plano: Plano, noId: string): NoBanda[] {
  const no = plano.nos.find((x) => x.id === noId)
  if (!no || no.tipo === 'banda') return []
  return plano.nos.filter((x): x is NoBanda => x.tipo === 'banda' && dentroDaBanda(x, no))
}

/** Todas as bandas do plano, de cima para baixo. */
export function bandasDoPlano(plano: Plano): NoBanda[] {
  return plano.nos.filter((no): no is NoBanda => no.tipo === 'banda').sort((a, b) => a.y - b.y || a.x - b.x)
}

/** A moldura que cabe em volta destas caixas, com folga e com espaço para o nome em cima. */
export function caixaDaBandaPara(caixas: Caixa[]): Caixa {
  if (!caixas.length) return { x: 0, y: 0, largura: MIN_LARGURA, altura: MIN_ALTURA }
  const x = Math.min(...caixas.map((c) => c.x)) - FOLGA
  const y = Math.min(...caixas.map((c) => c.y)) - FOLGA - TITULO
  const direita = Math.max(...caixas.map((c) => c.x + c.largura)) + FOLGA
  const base = Math.max(...caixas.map((c) => c.y + c.altura)) + FOLGA
  return { x, y, largura: Math.max(MIN_LARGURA, direita - x), altura: Math.max(MIN_ALTURA, base - y) }
}

const chaveDoPar = (a: string, b: string): string => (a < b ? `${a}\u0001${b}` : `${b}\u0001${a}`)

/**
 * As cordas que valem como permissão: as desenhadas entre dois agentes, mais as que as bandas implicam —
 * todos os de dentro entre si, e cada um deles com quem a banda estiver ligada. É isto que a janela manda
 * para o processo principal, para ele continuar com uma regra só ("corda é permissão").
 */
export function cordasEfetivas(plano: Plano): Array<[string, string]> {
  const tipos = new Map(plano.nos.map((no) => [no.id, no.tipo]));
  const pares: Array<[string, string]> = []
  const vistos = new Set<string>()
  const juntar = (a: string, b: string): void => {
    if (a === b || pares.length >= MAX_PARES) return
    if (tipos.get(a) !== 'terminal' || tipos.get(b) !== 'terminal') return
    const chave = chaveDoPar(a, b)
    if (vistos.has(chave)) return
    vistos.add(chave)
    pares.push([a, b])
  }

  for (const corda of plano.cordas) juntar(corda.de, corda.para)

  const membros = new Map<string, string[]>()
  for (const banda of plano.nos) {
    if (banda.tipo !== 'banda') continue
    const ids = membrosDaBanda(plano, banda.id).map((no) => no.id)
    membros.set(banda.id, ids)
    // todos os de dentro falam entre si: é o que a banda existe para dar
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) juntar(ids[i], ids[j])
  }

  // corda desenhada numa banda vale para cada um dos que estão dentro dela
  for (const corda of plano.cordas) {
    const daBanda = membros.get(corda.de)
    const paraBanda = membros.get(corda.para)
    if (!daBanda && !paraBanda) continue
    for (const a of daBanda ?? [corda.de]) for (const b of paraBanda ?? [corda.para]) juntar(a, b)
  }
  return pares
}

export interface AmbienteDeBanda {
  novoId: () => string
  agora: () => string
}

export type ResultadoDeBanda = { erro: string } | { plano: Plano; banda: NoBanda; texto: string }

/**
 * Cria a banda em volta dos cartões escolhidos (ou solta, do tamanho mínimo, em (x, y) — é a moldura vazia
 * que você depois arrasta os agentes para dentro). Ela nasce **atrás de tudo**: é moldura, não cartão.
 */
export function criarBanda(
  plano: Plano,
  nome: string,
  ids: string[],
  onde: { x: number; y: number },
  amb: AmbienteDeBanda
): ResultadoDeBanda {
  const limpo = nome.trim().slice(0, MAX_NOME)
  if (!limpo) return { erro: 'dê um nome à banda' }
  if (plano.nos.some((no) => no.tipo === 'banda' && no.nome.toLowerCase() === limpo.toLowerCase())) {
    return { erro: `já existe uma banda chamada "${limpo}" neste andar` }
  }
  const escolhidos = plano.nos.filter((no) => ids.includes(no.id) && no.tipo === 'terminal')
  if (ids.length && !escolhidos.length) return { erro: 'uma banda é um time de agentes: escolha cartões de agente' }
  const caixa = escolhidos.length
    ? caixaDaBandaPara(escolhidos.map((no) => ({ x: no.x, y: no.y, largura: no.largura, altura: no.altura })))
    : { x: Math.round(onde.x - MIN_LARGURA / 2), y: Math.round(onde.y - MIN_ALTURA / 2), largura: MIN_LARGURA, altura: MIN_ALTURA }
  const banda: NoBanda = {
    id: amb.novoId(),
    tipo: 'banda',
    nome: limpo,
    ...caixa,
    // atrás dos cartões: a moldura é fundo, e quem está dentro continua clicável
    z: Math.min(0, ...plano.nos.map((no) => no.z)) - 1,
    criadoEm: amb.agora()
  }
  const proximo: Plano = { ...plano, nos: [...plano.nos, banda] }
  const dentro = membrosDaBanda(proximo, banda.id)
  return {
    plano: proximo,
    banda,
    texto: dentro.length
      ? `Criei a banda "${limpo}" com ${dentro.length} ${dentro.length === 1 ? 'agente' : 'agentes'}: ${dentro
          .map((no) => `"${no.nome}"`)
          .join(', ')}. Todos passam a se falar.`
      : `Criei a banda "${limpo}", vazia: arraste agentes para dentro da moldura (ou mova a moldura até eles).`
  }
}

/** Cordas que uma banda tem desenhadas (para contar no texto de quem pergunta). */
export function cordasDaBanda(plano: Plano, bandaId: string): Corda[] {
  return plano.cordas.filter((corda) => corda.de === bandaId || corda.para === bandaId)
}
