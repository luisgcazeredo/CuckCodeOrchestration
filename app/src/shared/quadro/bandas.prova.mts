import assert from 'node:assert/strict'
import test from 'node:test'
// Node executa provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { bandasDoNo, cordasEfetivas, criarBanda, dentroDaBanda, membrosDaBanda } from './bandas.ts'
import type { No, NoBanda, Plano } from '../modelo'

const instante = '2026-11-06T10:00:00.000Z'

const ambiente = () => {
  let proximo = 0
  return { novoId: () => `novo-${++proximo}`, agora: () => instante }
}

const agente = (id: string, nome: string, x: number, y: number, extra: Partial<No> = {}): No =>
  ({ id, tipo: 'terminal', nome, agente: 'claude', comando: 'claude', x, y, largura: 200, altura: 100, z: 2, criadoEm: instante, ...extra }) as No

const banda = (id: string, nome: string, x: number, y: number, largura = 1000, altura = 600): No =>
  ({ id, tipo: 'banda', nome, x, y, largura, altura, z: -1, criadoEm: instante }) as No

const texto = (id: string, x: number, y: number): No =>
  ({ id, tipo: 'texto', texto: 'recado', tamanhoFonte: 20, mono: false, x, y, largura: 100, altura: 40, z: 1, criadoEm: instante }) as No

const corda = (id: string, de: string, para: string) => ({ id, de, para, criadoEm: instante })

function plano(nos: No[], cordas: Plano['cordas'] = []): Plano {
  return { camera: { x: 0, y: 0, zoom: 1 }, nos, desenhos: [], cordas }
}

/** Uma banda com três agentes dentro e um quarto fora dela. */
function time(): Plano {
  return plano([
    banda('b', 'Revisores', 0, 0),
    agente('a', 'Main', 100, 100),
    agente('r', 'Revisor', 400, 100),
    agente('p', 'Prova', 100, 300),
    agente('f', 'Fora', 2000, 2000)
  ])
}

const pares = (p: Plano): string[] => cordasEfetivas(p).map(([a, b]) => [a, b].sort().join('-')).sort()

test('é o centro do cartão que diz se ele está na banda', () => {
  const b = banda('b', 'T', 0, 0, 500, 500) as NoBanda
  assert.equal(dentroDaBanda(b, agente('x', 'X', 100, 100)), true)
  // metade de fora, centro fora: não é do time
  assert.equal(dentroDaBanda(b, agente('y', 'Y', 450, 100)), false)
  assert.equal(dentroDaBanda(b, agente('z', 'Z', 600, 600)), false)
})

test('os membros são os agentes de dentro, de cima para baixo', () => {
  assert.deepEqual(
    membrosDaBanda(time(), 'b').map((n) => n.nome),
    ['Main', 'Revisor', 'Prova']
  )
})

test('só agente entra no time: recado dentro da moldura não é membro', () => {
  const p = plano([banda('b', 'T', 0, 0), agente('a', 'Main', 100, 100), texto('t', 200, 200)])
  assert.deepEqual(membrosDaBanda(p, 'b').map((n) => n.id), ['a'])
})

test('a banda liga todos os de dentro entre si, e não toca em quem está fora', () => {
  assert.deepEqual(pares(time()), ['a-p', 'a-r', 'p-r'])
})

test('três agentes numa banda são três pares, não seis cordas na mão', () => {
  const p = time()
  assert.equal(p.cordas.length, 0)
  assert.equal(cordasEfetivas(p).length, 3)
})

test('corda desenhada na banda vale para cada um dos de dentro', () => {
  const p = plano(time().nos, [corda('c', 'b', 'f')])
  assert.deepEqual(pares(p), ['a-f', 'a-p', 'a-r', 'f-p', 'f-r', 'p-r'])
})

test('banda ligada a banda liga os dois times', () => {
  const p = plano(
    [...time().nos, banda('b2', 'Fora', 1900, 1900, 400, 400)],
    [corda('c', 'b', 'b2')]
  )
  // "Fora" está na segunda banda; cada um da primeira passa a falar com ele
  assert.deepEqual(pares(p), ['a-f', 'a-p', 'a-r', 'f-p', 'f-r', 'p-r'])
})

test('corda desenhada entre dois agentes continua valendo igual', () => {
  const p = plano([agente('a', 'A', 0, 0), agente('b', 'B', 500, 0)], [corda('c', 'a', 'b')])
  assert.deepEqual(pares(p), ['a-b'])
})

test('cartão sai do time quando sai da moldura: nada de lista guardada', () => {
  const p = time()
  const fora = plano(p.nos.map((n) => (n.id === 'p' ? ({ ...n, x: 5000, y: 5000 } as No) : n)))
  assert.deepEqual(membrosDaBanda(fora, 'b').map((n) => n.id), ['a', 'r'])
  assert.deepEqual(pares(fora), ['a-r'])
})

test('molduras sobrepostas: o cartão é dos dois times', () => {
  const p = plano([banda('b1', 'Um', 0, 0, 600, 600), banda('b2', 'Dois', 300, 0, 600, 600), agente('x', 'X', 400, 300)])
  assert.deepEqual(bandasDoNo(p, 'x').map((b) => b.nome), ['Um', 'Dois'])
})

test('criar banda em volta dos escolhidos: a moldura cabe neles e nasce atrás de tudo', () => {
  const p = plano([agente('a', 'Main', 1000, 1000), agente('r', 'Revisor', 1400, 1000), agente('f', 'Fora', 5000, 5000)])
  const feito = criarBanda(p, 'Dupla', ['a', 'r'], { x: 0, y: 0 }, ambiente())
  assert.ok(!('erro' in feito), 'erro' in feito ? feito.erro : '')
  if ('erro' in feito) return
  const b = feito.banda
  assert.ok(b.x < 1000 && b.y < 1000 && b.x + b.largura > 1600 && b.y + b.altura > 1100)
  assert.ok(b.z < 2, 'a moldura fica atrás dos cartões')
  assert.deepEqual(membrosDaBanda(feito.plano, b.id).map((n) => n.nome), ['Main', 'Revisor'])
  assert.match(feito.texto, /Criei a banda "Dupla" com 2 agentes/)
})

test('banda vazia é moldura para arrastar agentes para dentro, e diz isso', () => {
  const feito = criarBanda(plano([]), 'Vazia', [], { x: 500, y: 500 }, ambiente())
  assert.ok(!('erro' in feito))
  if ('erro' in feito) return
  assert.deepEqual(membrosDaBanda(feito.plano, feito.banda.id), [])
  assert.match(feito.texto, /arraste agentes para dentro/)
})

test('nome repetido e nome vazio são recusados', () => {
  const p = plano([banda('b', 'Revisores', 0, 0)])
  assert.match((criarBanda(p, 'revisores', [], { x: 0, y: 0 }, ambiente()) as { erro: string }).erro, /já existe uma banda/)
  assert.match((criarBanda(p, '  ', [], { x: 0, y: 0 }, ambiente()) as { erro: string }).erro, /dê um nome/)
})

test('escolher só cartões que não são agente: recusa em vez de criar moldura torta', () => {
  const p = plano([texto('t', 0, 0)])
  assert.match((criarBanda(p, 'Nada', ['t'], { x: 0, y: 0 }, ambiente()) as { erro: string }).erro, /time de agentes/)
})

test('criar banda não apaga nem move nada', () => {
  const antes = plano([agente('a', 'Main', 0, 0), agente('r', 'Revisor', 400, 0)])
  const feito = criarBanda(antes, 'Dupla', ['a', 'r'], { x: 0, y: 0 }, ambiente()) as { plano: Plano }
  assert.equal(feito.plano.nos.length, antes.nos.length + 1)
  for (const velho of antes.nos) assert.deepEqual(feito.plano.nos.find((n) => n.id === velho.id), velho)
})
