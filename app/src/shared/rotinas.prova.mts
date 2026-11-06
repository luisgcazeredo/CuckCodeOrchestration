import assert from 'node:assert/strict'
import test from 'node:test'
// Node executa provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { aplicarDisparo, descricaoDe, novaRotina, proximaDe, rotinaValida, textoDoResultado, vencidas } from './rotinas.ts'
import type { Rotina } from './modelo'

// 10/11/2026 é uma terça-feira, 14:30 local
const agora = new Date(2026, 10, 10, 14, 30, 0)

const amb = { novoId: () => 'r-1', agora: () => agora }

const rotina = (extra: Partial<Rotina> = {}): Rotina =>
  ({
    id: 'r',
    nome: 'Relatório',
    terminal: 'cartao',
    texto: 'escreva o relatório do dia',
    quando: { tipo: 'cada', minutos: 30 },
    proxima: new Date(agora.getTime() + 30 * 60_000).toISOString(),
    vezes: 0,
    ...extra
  }) as Rotina

test('a cada N minutos conta do disparo, não do relógio redondo', () => {
  assert.equal(proximaDe({ tipo: 'cada', minutos: 30 }, agora).toISOString(), new Date(2026, 10, 10, 15, 0, 0).toISOString())
})

test('minutos fora de faixa são trazidos para dentro, em vez de virar rotina louca', () => {
  assert.equal(proximaDe({ tipo: 'cada', minutos: 0 }, agora).getTime(), agora.getTime() + 60_000)
  assert.equal(proximaDe({ tipo: 'cada', minutos: 999_999 }, agora).getTime(), agora.getTime() + 7 * 24 * 60 * 60_000)
})

test('diário: hoje se ainda vai acontecer, amanhã se já passou', () => {
  assert.deepEqual(proximaDe({ tipo: 'diario', hora: 18, minuto: 0 }, agora), new Date(2026, 10, 10, 18, 0, 0))
  assert.deepEqual(proximaDe({ tipo: 'diario', hora: 9, minuto: 0 }, agora), new Date(2026, 10, 11, 9, 0, 0))
  // a hora exata também é "já passou": senão a rotina dispararia duas vezes no mesmo minuto
  assert.deepEqual(proximaDe({ tipo: 'diario', hora: 14, minuto: 30 }, agora), new Date(2026, 10, 11, 14, 30, 0))
})

test('semanal: o próximo dia da semana pedido, e a semana que vem quando é hoje e já passou', () => {
  // quinta desta semana
  assert.deepEqual(proximaDe({ tipo: 'semanal', dia: 4, hora: 9, minuto: 0 }, agora), new Date(2026, 10, 12, 9, 0, 0))
  // terça é hoje: às 18h ainda é hoje; às 9h, a terça que vem
  assert.deepEqual(proximaDe({ tipo: 'semanal', dia: 2, hora: 18, minuto: 0 }, agora), new Date(2026, 10, 10, 18, 0, 0))
  assert.deepEqual(proximaDe({ tipo: 'semanal', dia: 2, hora: 9, minuto: 0 }, agora), new Date(2026, 10, 17, 9, 0, 0))
  // domingo (dia 0) depois de uma terça é no fim desta semana
  assert.deepEqual(proximaDe({ tipo: 'semanal', dia: 0, hora: 8, minuto: 0 }, agora), new Date(2026, 10, 15, 8, 0, 0))
})

test('vencidas: só as que passaram da hora e não estão pausadas', () => {
  const passada = rotina({ id: 'passada', proxima: new Date(agora.getTime() - 1000).toISOString() })
  const futura = rotina({ id: 'futura', proxima: new Date(agora.getTime() + 60_000).toISOString() })
  const pausada = rotina({ id: 'pausada', proxima: new Date(agora.getTime() - 60_000).toISOString(), pausada: true })
  assert.deepEqual(vencidas([passada, futura, pausada], agora).map((r) => r.id), ['passada'])
})

test('disparo que rodou conta a vez e marca a próxima', () => {
  const depois = aplicarDisparo(rotina(), 'rodou', agora)
  assert.equal(depois.vezes, 1)
  assert.equal(depois.ultima?.resultado, 'rodou')
  assert.equal(Date.parse(depois.proxima), agora.getTime() + 30 * 60_000)
})

test('disparo pulado não conta a vez, não enfileira nada e vai para a próxima vez', () => {
  const depois = aplicarDisparo(rotina(), 'ocupado', agora)
  assert.equal(depois.vezes, 0)
  assert.equal(depois.ultima?.resultado, 'ocupado')
  // o que passou, passou: a próxima é uma só, não duas atrasadas
  assert.equal(Date.parse(depois.proxima), agora.getTime() + 30 * 60_000)
  assert.match(textoDoResultado('ocupado'), /terminal estava ocupado/)
})

test('cada resultado tem um texto que diz o que aconteceu', () => {
  for (const r of ['rodou', 'ocupado', 'pergunta', 'encerrado', 'sem-cartao'] as const) {
    assert.ok(textoDoResultado(r).length > 3, r)
  }
})

test('descrição legível de cada jeito de repetir', () => {
  assert.equal(descricaoDe({ tipo: 'cada', minutos: 30 }), 'a cada 30 min')
  assert.equal(descricaoDe({ tipo: 'cada', minutos: 120 }), 'a cada 2 h')
  assert.equal(descricaoDe({ tipo: 'diario', hora: 9, minuto: 5 }), 'todo dia às 09:05')
  assert.equal(descricaoDe({ tipo: 'semanal', dia: 2, hora: 9, minuto: 0 }), 'toda terça às 09:00')
})

test('rotina nova nasce com a primeira vez marcada; sem nome ou sem texto, recusa', () => {
  const feita = novaRotina({ nome: ' Relatório ', terminal: 'c', texto: ' fala ', quando: { tipo: 'cada', minutos: 10 } }, amb)
  assert.ok(typeof feita !== 'string')
  if (typeof feita === 'string') return
  assert.equal(feita.nome, 'Relatório')
  assert.equal(feita.texto, 'fala')
  assert.equal(feita.vezes, 0)
  assert.equal(Date.parse(feita.proxima), agora.getTime() + 10 * 60_000)
  assert.equal(typeof novaRotina({ nome: '', terminal: 'c', texto: 'x', quando: { tipo: 'cada', minutos: 5 } }, amb), 'string')
  assert.equal(typeof novaRotina({ nome: 'n', terminal: 'c', texto: '  ', quando: { tipo: 'cada', minutos: 5 } }, amb), 'string')
  assert.equal(typeof novaRotina({ nome: 'n', terminal: '', texto: 'x', quando: { tipo: 'cada', minutos: 5 } }, amb), 'string')
})

test('validação recusa o que não serve para guardar nem para o relógio', () => {
  assert.equal(rotinaValida(rotina()), true)
  assert.equal(rotinaValida(rotina({ texto: '' })), false)
  assert.equal(rotinaValida(rotina({ proxima: 'ontem' })), false)
  assert.equal(rotinaValida(rotina({ vezes: -1 })), false)
  assert.equal(rotinaValida(rotina({ quando: { tipo: 'cada', minutos: 0 } })), false)
  assert.equal(rotinaValida(rotina({ quando: { tipo: 'diario', hora: 24, minuto: 0 } })), false)
  assert.equal(rotinaValida(rotina({ quando: { tipo: 'semanal', dia: 9, hora: 1, minuto: 0 } })), false)
  assert.equal(rotinaValida(rotina({ quando: { tipo: 'semanal', dia: 3, hora: 1, minuto: 0 } })), true)
})
