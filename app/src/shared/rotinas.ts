/**
 * Rotinas: a conta de quando cada uma vence e o que fazer com o resultado. Tudo função pura sobre data, para
 * o processo principal só precisar olhar o relógio e as provas rodarem sem Electron.
 *
 * A regra que dá sentido a isto existir dentro do app (em vez de numa tarefa do Windows): **uma rotina que
 * vence com o terminal ocupado pula a vez**, e vai para a próxima. Nunca se escreve no meio do trabalho de um
 * agente, e nunca se enfileira pedido: o que passou, passou.
 */
import type { QuandoDaRotina, ResultadoDaRotina, Rotina } from './modelo'

export const MIN_MINUTOS = 1
/** Teto de uma semana: acima disso, o lugar é "semanal". */
export const MAX_MINUTOS = 7 * 24 * 60
export const MAX_ROTINAS = 40
export const MAX_TEXTO = 2000
export const MAX_NOME = 80

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

const minutosValidos = (minutos: number): number =>
  Math.min(MAX_MINUTOS, Math.max(MIN_MINUTOS, Math.round(Number.isFinite(minutos) ? minutos : MIN_MINUTOS)))

const dois = (n: number): string => String(n).padStart(2, '0')

/** Quando esta rotina vence pela próxima vez, contada de `agora` (sempre no futuro). */
export function proximaDe(quando: QuandoDaRotina, agora: Date): Date {
  if (quando.tipo === 'cada') return new Date(agora.getTime() + minutosValidos(quando.minutos) * 60_000)
  const alvo = new Date(agora)
  alvo.setHours(quando.hora, quando.minuto, 0, 0)
  if (quando.tipo === 'diario') {
    if (alvo.getTime() <= agora.getTime()) alvo.setDate(alvo.getDate() + 1)
    return alvo
  }
  const dias = (quando.dia - alvo.getDay() + 7) % 7
  alvo.setDate(alvo.getDate() + dias)
  if (alvo.getTime() <= agora.getTime()) alvo.setDate(alvo.getDate() + 7)
  return alvo
}

/** As rotinas que já venceram e não estão pausadas. */
export function vencidas(rotinas: Rotina[], agora: Date): Rotina[] {
  return rotinas.filter((r) => !r.pausada && Date.parse(r.proxima) <= agora.getTime())
}

/**
 * A rotina depois de um disparo: a vez conta só quando digitou de verdade, e a próxima é sempre recalculada
 * — pular não acumula pedido para depois.
 */
export function aplicarDisparo(rotina: Rotina, resultado: ResultadoDaRotina, em: Date): Rotina {
  return {
    ...rotina,
    vezes: rotina.vezes + (resultado === 'rodou' ? 1 : 0),
    ultima: { em: em.toISOString(), resultado },
    proxima: proximaDe(rotina.quando, em).toISOString()
  }
}

/** "a cada 30 min", "todo dia às 09:00", "toda terça às 09:00". */
export function descricaoDe(quando: QuandoDaRotina): string {
  if (quando.tipo === 'cada') {
    const minutos = minutosValidos(quando.minutos)
    if (minutos % 60 === 0 && minutos >= 60) {
      const horas = minutos / 60
      return horas === 24 ? 'a cada 24 h' : `a cada ${horas} h`
    }
    return `a cada ${minutos} min`
  }
  const hora = `${dois(quando.hora)}:${dois(quando.minuto)}`
  return quando.tipo === 'diario' ? `todo dia às ${hora}` : `toda ${DIAS[quando.dia] ?? 'semana'} às ${hora}`
}

/** O que dizer sobre a última vez (é isto que aparece na lista de rotinas). */
export function textoDoResultado(resultado: ResultadoDaRotina): string {
  switch (resultado) {
    case 'rodou':
      return 'rodou'
    case 'ocupado':
      return 'pulou: o terminal estava ocupado'
    case 'pergunta':
      return 'pulou: o terminal estava parado numa pergunta'
    case 'encerrado':
      return 'pulou: o processo do cartão estava encerrado'
    case 'sem-cartao':
      return 'pulou: o cartão não está mais no quadro'
  }
}

/** Uma rotina nova, já com a primeira vez marcada. */
export function novaRotina(
  dados: { nome: string; terminal: string; texto: string; quando: QuandoDaRotina },
  amb: { novoId: () => string; agora: () => Date }
): Rotina | string {
  const nome = dados.nome.trim().slice(0, MAX_NOME)
  const texto = dados.texto.trim().slice(0, MAX_TEXTO)
  if (!nome) return 'dê um nome à rotina'
  if (!texto) return 'escreva o que a rotina deve digitar'
  if (!dados.terminal) return 'diga em qual cartão ela digita'
  const quando: QuandoDaRotina =
    dados.quando.tipo === 'cada' ? { tipo: 'cada', minutos: minutosValidos(dados.quando.minutos) } : dados.quando
  return {
    id: amb.novoId(),
    nome,
    terminal: dados.terminal,
    texto,
    quando,
    proxima: proximaDe(quando, amb.agora()).toISOString(),
    vezes: 0
  }
}

/** Serve para guardar? (o que vem de fora passa por aqui antes de ir ao disco e ao relógio) */
export function rotinaValida(r: Rotina): boolean {
  const q = r?.quando
  const horaValida = (h: unknown, m: unknown): boolean =>
    Number.isInteger(h) && (h as number) >= 0 && (h as number) <= 23 && Number.isInteger(m) && (m as number) >= 0 && (m as number) <= 59
  return (
    typeof r?.id === 'string' &&
    typeof r.nome === 'string' &&
    r.nome.length <= MAX_NOME &&
    typeof r.terminal === 'string' &&
    typeof r.texto === 'string' &&
    r.texto.length > 0 &&
    r.texto.length <= MAX_TEXTO &&
    typeof r.proxima === 'string' &&
    Number.isFinite(Date.parse(r.proxima)) &&
    Number.isInteger(r.vezes) &&
    r.vezes >= 0 &&
    !!q &&
    ((q.tipo === 'cada' && Number.isFinite(q.minutos) && q.minutos >= MIN_MINUTOS && q.minutos <= MAX_MINUTOS) ||
      (q.tipo === 'diario' && horaValida(q.hora, q.minuto)) ||
      (q.tipo === 'semanal' && Number.isInteger(q.dia) && q.dia >= 0 && q.dia <= 6 && horaValida(q.hora, q.minuto)))
  )
}
