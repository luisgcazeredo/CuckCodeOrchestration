import { strict as assert } from 'node:assert'
import { test } from 'node:test'
// Node executa provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { empurrarParaBaixo } from './empurrar.ts'

const peca = (id: string, x: number, y: number, largura = 100, altura = 100) => ({ id, x, y, largura, altura })

test('quem está longe da coluna não se mexe', () => {
  const mudou = empurrarParaBaixo([peca('col', 0, 0, 200, 400)], [peca('a', 900, 0), peca('b', 0, 900)])
  assert.equal(mudou.size, 0)
})

test('quem está debaixo da coluna desce o mínimo', () => {
  const mudou = empurrarParaBaixo([peca('col', 0, 0, 200, 400)], [peca('a', 50, 300)])
  assert.equal(mudou.get('a'), 414)
})

test('o empurrão vai em cascata, sem embaralhar a ordem', () => {
  const mudou = empurrarParaBaixo([peca('col', 0, 0, 200, 400)], [peca('a', 50, 300), peca('b', 50, 420)])
  assert.equal(mudou.get('a'), 414)
  assert.equal(mudou.get('b'), 528)
})

test('sem coluna não empurra nada', () => {
  assert.equal(empurrarParaBaixo([], [peca('a', 0, 0)]).size, 0)
})

test('ninguém sobe', () => {
  const mudou = empurrarParaBaixo([peca('col', 0, 500, 200, 100)], [peca('a', 50, 520)])
  assert.ok((mudou.get('a') ?? 0) > 520)
})
