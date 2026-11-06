import assert from 'node:assert/strict'
import test from 'node:test'
// Node executa provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { encaixarNaTela, janelaValida, janelasParaAbrir, sessaoValida } from './janelas.ts'
import type { JanelaSalva, Sessao, Tela } from './janelas'

const PRINCIPAL: Tela = { x: 0, y: 0, largura: 1920, altura: 1040 }
const SEGUNDA: Tela = { x: 1920, y: 0, largura: 1440, altura: 860 }

const janela = (espacoId: string | null, extra: Partial<JanelaSalva> = {}): JanelaSalva => ({
  espacoId,
  x: 100,
  y: 100,
  largura: 1280,
  altura: 820,
  maximizada: false,
  ...extra
})

const sessao = (janelas: JanelaSalva[]): Sessao => ({ versao: 1, janelas })

test('abre uma janela por espaço, na ordem guardada', () => {
  const fora = janelasParaAbrir(sessao([janela('a'), janela('b')]), ['a', 'b', 'c'], [PRINCIPAL])
  assert.deepEqual(
    fora.map((j) => j.espacoId),
    ['a', 'b']
  )
})

test('espaço apagado entre uma sessão e outra some da lista', () => {
  const fora = janelasParaAbrir(sessao([janela('a'), janela('sumiu'), janela('b')]), ['a', 'b'], [PRINCIPAL])
  assert.deepEqual(
    fora.map((j) => j.espacoId),
    ['a', 'b']
  )
})

test('o mesmo espaço não abre em duas janelas', () => {
  const fora = janelasParaAbrir(sessao([janela('a'), janela('a'), janela('b')]), ['a', 'b'], [PRINCIPAL])
  assert.deepEqual(
    fora.map((j) => j.espacoId),
    ['a', 'b']
  )
})

test('janela sem espaço vale uma vez só', () => {
  const fora = janelasParaAbrir(sessao([janela(null), janela(null)]), [], [PRINCIPAL])
  assert.equal(fora.length, 1)
  assert.equal(fora[0].espacoId, null)
})

test('janela sem espaço depois de outra janela é descartada', () => {
  const fora = janelasParaAbrir(sessao([janela('a'), janela(null)]), ['a'], [PRINCIPAL])
  assert.deepEqual(
    fora.map((j) => j.espacoId),
    ['a']
  )
})

test('o teto de janelas é respeitado', () => {
  const muitas = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
  const fora = janelasParaAbrir(sessao(muitas.map((id) => janela(id))), muitas, [PRINCIPAL], 3)
  assert.equal(fora.length, 3)
})

test('sessão sem nada guardado devolve lista vazia (quem chama abre a janela de sempre)', () => {
  assert.deepEqual(janelasParaAbrir(sessao([]), ['a'], [PRINCIPAL]), [])
})

test('janela que estava no segundo monitor volta para ele, no mesmo lugar', () => {
  const nela = janela('a', { x: 2000, y: 20 })
  const [fora] = janelasParaAbrir(sessao([nela]), ['a'], [PRINCIPAL, SEGUNDA])
  assert.deepEqual({ x: fora.x, y: fora.y, largura: fora.largura }, { x: 2000, y: 20, largura: 1280 })
})

test('monitor desligado: a janela volta para a tela principal, inteira', () => {
  const nela = janela('a', { x: 2100, y: 60 })
  const [fora] = janelasParaAbrir(sessao([nela]), ['a'], [PRINCIPAL])
  assert.ok(fora.x >= PRINCIPAL.x && fora.x + fora.largura <= PRINCIPAL.largura, `x fora da tela: ${fora.x}`)
  assert.ok(fora.y >= PRINCIPAL.y && fora.y + fora.altura <= PRINCIPAL.altura, `y fora da tela: ${fora.y}`)
})

test('janela maior que a tela de hoje encolhe até caber', () => {
  const gigante = janela('a', { x: 0, y: 0, largura: 3000, altura: 2000 })
  const [fora] = janelasParaAbrir(sessao([gigante]), ['a'], [PRINCIPAL])
  assert.deepEqual({ largura: fora.largura, altura: fora.altura }, { largura: 1920, altura: 1040 })
})

test('janela meio fora da borda é puxada para dentro, sem mudar de tamanho', () => {
  const quaseFora = janela('a', { x: 1800, y: 900, largura: 1280, altura: 820 })
  const [fora] = janelasParaAbrir(sessao([quaseFora]), ['a'], [PRINCIPAL])
  assert.deepEqual(
    { x: fora.x, y: fora.y, largura: fora.largura, altura: fora.altura },
    { x: 640, y: 220, largura: 1280, altura: 820 }
  )
})

test('sem tela nenhuma, a caixa fica como está (não há onde encaixar)', () => {
  const nela = janela('a', { x: 2100, y: 60 })
  assert.deepEqual(encaixarNaTela(nela, []), nela)
})

test('maximizada atravessa a lista', () => {
  const [fora] = janelasParaAbrir(sessao([janela('a', { maximizada: true })]), ['a'], [PRINCIPAL])
  assert.equal(fora.maximizada, true)
})

test('arquivo estragado não passa pela validação', () => {
  assert.equal(sessaoValida({ versao: 1, janelas: [] }), true)
  assert.equal(sessaoValida({ versao: 2, janelas: [] }), false)
  assert.equal(sessaoValida({ janelas: [janela('a')] }), false)
  assert.equal(sessaoValida({ versao: 1, janelas: [{ espacoId: 'a' }] }), false)
  assert.equal(janelaValida({ ...janela('a'), x: 'perto da borda' }), false)
  assert.equal(janelaValida({ ...janela('a'), espacoId: 7 }), false)
  assert.equal(janelaValida(null), false)
})
