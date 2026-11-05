import assert from 'node:assert/strict'
import test from 'node:test'
// Node executa provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { mexerNoQuadro, type MudancaNoQuadro, type PedidoNoQuadro } from './agente.ts'
import type { Desenho, No, Plano } from '../modelo'

const instante = '2026-11-05T12:00:00.000Z'

function ambiente() {
  let proximo = 0
  return { novoId: () => `novo-${++proximo}`, agora: () => instante }
}

const agente = (id: string, nome: string, x: number, y: number, extra: Partial<No> = {}): No =>
  ({ id, tipo: 'terminal', nome, agente: 'claude', comando: 'claude', x, y, largura: 200, altura: 100, z: 1, criadoEm: instante, ...extra }) as No

const texto = (id: string, conteudo: string, x: number, y: number, extra: Partial<No> = {}): No =>
  ({ id, tipo: 'texto', texto: conteudo, tamanhoFonte: 20, mono: false, x, y, largura: 100, altura: 50, z: 1, criadoEm: instante, ...extra }) as No

const codigo = (id: string, caminho: string, x: number, y: number): No =>
  ({ id, tipo: 'codigo', caminho, modo: 'diff', terminal: 'a', automatico: true, x, y, largura: 100, altura: 100, z: 1, criadoEm: instante }) as No

function plano(nos: No[], desenhos: Desenho[] = [], cordas: Plano['cordas'] = []): Plano {
  return { camera: { x: 0, y: 0, zoom: 1 }, nos, desenhos, cordas }
}

function mexer(p: Plano, pedido: Partial<PedidoNoQuadro> & { acao: PedidoNoQuadro['acao'] }) {
  return mexerNoQuadro(p, { eu: 'a', ...pedido } as PedidoNoQuadro, ambiente())
}

const mudou = (r: ReturnType<typeof mexer>): MudancaNoQuadro => {
  assert.ok(!('erro' in r), `esperava mudança, veio erro: ${'erro' in r ? r.erro : ''}`)
  return r as MudancaNoQuadro
}

const naoDeu = (r: ReturnType<typeof mexer>): string => {
  assert.ok('erro' in r, 'esperava erro')
  return (r as { erro: string }).erro
}

const no = (p: Plano, id: string): No => p.nos.find((n) => n.id === id)!

test('a leitura numera os cartões de cima para baixo e marca quem perguntou', () => {
  const p = plano([agente('a', 'Carteiro', 0, 500), texto('t', 'Plano da volta', 0, 0)])
  const saida = mudou(mexer(p, { acao: 'ler', onde: 'Espaço "X" · térreo' })).texto
  assert.match(saida, /Espaço "X" · térreo · 2 cartão/)
  assert.match(saida, /#1 texto "Plano da volta"/)
  assert.match(saida, /#2 agente "Carteiro".*← você/)
})

test('o nome serve pelo começo, e o número desempata o que é ambíguo', () => {
  const p = plano([agente('a', 'Revisor do backend', 0, 0), agente('b', 'Revisor do visual', 0, 300)])
  assert.match(naoDeu(mexer(p, { acao: 'mover', alvos: ['Revisor'], x: 0 })), /serve para mais de um/)
  assert.ok(!('erro' in mexer(p, { acao: 'mover', alvos: ['Revisor do b'], dx: 1 })), 'o começo do nome devia bastar')
  const r = mudou(mexer(p, { acao: 'mover', alvos: ['#2'], dx: 50 }))
  assert.equal(no(r.plano, 'b').x, 50)
})

test('mover com --x leva o cartão para o lugar, e --dx anda de onde está', () => {
  const p = plano([agente('a', 'Carteiro', 10, 20)])
  assert.deepEqual([no(mudou(mexer(p, { acao: 'mover', alvos: ['Carteiro'], x: 100, y: 200 })).plano, 'a').x, 20], [100, 20])
  const andou = no(mudou(mexer(p, { acao: 'mover', alvos: ['Carteiro'], dx: -5, dy: 7 })).plano, 'a')
  assert.deepEqual([andou.x, andou.y], [5, 27])
})

test('mover um cartão de um grupo leva o grupo e os traços dele', () => {
  const traco: Desenho = { id: 'd', ferramenta: 'lapis', pontos: [[0, 0], [10, 10]], cor: '#fff', espessura: 2, z: 1, grupo: 'g' }
  const p = plano([agente('a', 'Carteiro', 0, 0, { grupo: 'g' }), texto('t', 'junto', 300, 0, { grupo: 'g' })], [traco])
  const r = mudou(mexer(p, { acao: 'mover', alvos: ['Carteiro'], dx: 100 }))
  assert.equal(no(r.plano, 't').x, 400)
  assert.deepEqual(r.plano.desenhos[0].pontos, [[100, 0], [110, 10]])
})

test('cartão travado e cartão de código não se mexem, e o agente é avisado', () => {
  const p = plano([
    agente('a', 'Carteiro', 0, 0, { travado: true }),
    codigo('c', 'src/loja.ts', 400, 0),
    texto('t', 'solto', 0, 400),
    texto('t2', 'outro solto', 0, 800)
  ])
  assert.match(naoDeu(mexer(p, { acao: 'mover', alvos: ['Carteiro'], dx: 10 })), /travado/)
  assert.match(naoDeu(mexer(p, { acao: 'mover', alvos: ['loja.ts'], dx: 10 })), /cartão de código/)
  const r = mudou(mexer(p, { acao: 'arrumar' }))
  assert.equal(no(r.plano, 'a').x, 0)
  assert.equal(no(r.plano, 'c').x, 400)
  assert.equal(r.terminais.length, 0)
})

test('arrumar põe os cartões em grade sem sair do canto onde estavam', () => {
  const p = plano([texto('t1', 'um', 1000, 1000), texto('t2', 'dois', 1500, 1000), texto('t3', 'três', 1000, 1600)])
  const r = mudou(mexer(p, { acao: 'arrumar', colunas: 2, vao: 10 }))
  assert.deepEqual([no(r.plano, 't1').x, no(r.plano, 't1').y], [1000, 1000])
  assert.deepEqual([no(r.plano, 't2').x, no(r.plano, 't2').y], [1110, 1000])
  assert.deepEqual([no(r.plano, 't3').x, no(r.plano, 't3').y], [1000, 1060])
})

test('arrumar trata um grupo como um bloco só, sem desmanchá-lo', () => {
  const p = plano([
    texto('t1', 'um', 0, 0, { grupo: 'g' }),
    texto('t2', 'dois', 150, 0, { grupo: 'g' }),
    texto('t3', 'três', 0, 500)
  ])
  const r = mudou(mexer(p, { acao: 'arrumar', colunas: 1, vao: 10 }))
  assert.equal(no(r.plano, 't2').x - no(r.plano, 't1').x, 150)
  assert.equal(no(r.plano, 't3').y, 60)
})

test('renomear vale só para agente, exige nome livre e volta o nome antigo na resposta', () => {
  const p = plano([agente('a', 'Carteiro', 0, 0), agente('b', 'Revisor', 0, 300), texto('t', 'nota', 0, 600)])
  assert.match(naoDeu(mexer(p, { acao: 'nome', alvos: ['nota'], texto: 'X' })), /só cartão de agente/)
  assert.match(naoDeu(mexer(p, { acao: 'nome', alvos: ['Carteiro'], texto: 'revisor' })), /já existe/)
  const r = mudou(mexer(p, { acao: 'nome', alvos: ['Carteiro'], texto: 'Carteiro do backend' }))
  assert.equal((no(r.plano, 'a') as { nome: string }).nome, 'Carteiro do backend')
  assert.match(r.texto, /"Carteiro" agora se chama/)
})

test('ligar cria a corda uma vez e desligar tira a que existe', () => {
  const p = plano([agente('a', 'Carteiro', 0, 0), agente('b', 'Revisor', 0, 300)])
  const ligado = mudou(mexer(p, { acao: 'ligar', alvos: ['Carteiro', 'Revisor'] })).plano
  assert.deepEqual([ligado.cordas.length, ligado.cordas[0].de, ligado.cordas[0].para], [1, 'a', 'b'])
  assert.match(naoDeu(mexer(ligado, { acao: 'ligar', alvos: ['Revisor', 'Carteiro'] })), /já estão ligados/)
  assert.equal(mudou(mexer(ligado, { acao: 'desligar', alvos: ['Carteiro', 'Revisor'] })).plano.cordas.length, 0)
  assert.match(naoDeu(mexer(p, { acao: 'desligar', alvos: ['Carteiro', 'Revisor'] })), /não estão ligados/)
})

test('a corda liga agente com agente, e não um cartão com ele mesmo', () => {
  const p = plano([agente('a', 'Carteiro', 0, 0), texto('t', 'nota', 0, 300)])
  assert.match(naoDeu(mexer(p, { acao: 'ligar', alvos: ['Carteiro', 'nota'] })), /a corda liga agentes/)
  assert.match(naoDeu(mexer(p, { acao: 'ligar', alvos: ['Carteiro', 'Carteiro'] })), /mesmo cartão/)
})

test('anotar nasce abaixo de quem anotou e entra como texto do quadro', () => {
  const p = plano([agente('a', 'Carteiro', 100, 200)])
  const r = mudou(mexer(p, { acao: 'anotar', texto: '  Falta o teste do empurrão  ' }))
  const nova = r.plano.nos.find((n) => n.id === 'novo-1')!
  assert.equal(nova.tipo, 'texto')
  assert.deepEqual([nova.x, nova.y], [100, 340])
  assert.equal((nova as { texto: string }).texto, 'Falta o teste do empurrão')
  assert.match(naoDeu(mexer(p, { acao: 'anotar', texto: '   ' })), /diga o que anotar/)
})

test('juntar agrupa os escolhidos e --soltar desfaz', () => {
  const p = plano([agente('a', 'Carteiro', 0, 0), texto('t', 'nota', 0, 300)])
  const juntos = mudou(mexer(p, { acao: 'juntar', alvos: ['Carteiro', 'nota'] })).plano
  assert.equal(no(juntos, 'a').grupo, no(juntos, 't').grupo)
  const soltos = mudou(mexer(juntos, { acao: 'juntar', alvos: ['Carteiro'], soltar: true })).plano
  assert.equal(no(soltos, 'a').grupo, undefined)
  assert.equal(no(soltos, 't').grupo, undefined)
})

test('nenhuma ação apaga cartão: o quadro nunca encolhe', () => {
  const p = plano([agente('a', 'Carteiro', 0, 0), agente('b', 'Revisor', 0, 300), texto('t', 'nota', 0, 600)])
  const acoes: Array<Partial<PedidoNoQuadro> & { acao: PedidoNoQuadro['acao'] }> = [
    { acao: 'mover', alvos: ['Carteiro'], dx: 10 },
    { acao: 'arrumar' },
    { acao: 'nome', alvos: ['Carteiro'], texto: 'Outro' },
    { acao: 'ligar', alvos: ['Carteiro', 'Revisor'] },
    { acao: 'juntar', alvos: ['Carteiro', 'nota'] },
    { acao: 'anotar', texto: 'oi' }
  ]
  for (const acao of acoes) assert.ok(mudou(mexer(p, acao)).plano.nos.length >= p.nos.length, `${acao.acao} encolheu o quadro`)
})
