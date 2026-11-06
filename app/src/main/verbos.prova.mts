import assert from 'node:assert/strict'
import test from 'node:test'

const modulo = new URL('./verbos.ts', import.meta.url).href
const { VERBOS, tabelaDeComandos, validarChamada, verboPorNome } = (await import(modulo)) as typeof import('./verbos')

test('registro declara os verbos operacionais, a ajuda, aliases e opções', () => {
  assert.deepEqual(VERBOS.map((verbo) => verbo.nome), [
    'ajuda', 'quem', 'orcamento', 'espacos', 'janela', 'abrir', 'pedir', 'esperar', 'ver', 'teclas', 'arvore',
    'quadro', 'mover', 'arrumar', 'nome', 'ligar', 'desligar', 'anotar', 'juntar',
    'trocar', 'banda', 'partitura', 'funcoes', 'limpar', 'fechar', 'passar', 'sair'
  ])
  assert.equal(verboPorNome('help')?.nome, 'ajuda')
  for (const verbo of VERBOS) {
    assert.ok(Array.isArray(verbo.opcoes), `${verbo.nome} declara opções`)
    assert.ok(verbo.descricao, `${verbo.nome} tem descrição`)
  }
})

test('parser rejeita opção desconhecida, valor ausente, número fora de faixa e posicional faltando', () => {
  assert.throws(() => validarChamada('ver', ['Ana'], { surpresa: true }), /opção desconhecida: --surpresa/)
  assert.throws(() => validarChamada('abrir', ['claude'], { nome: true }), /falta o valor de --nome/)
  assert.throws(() => validarChamada('ver', ['Ana'], { linhas: '2001' }), /--linhas deve ser um número entre 1 e 2000/)
  assert.throws(() => validarChamada('fechar', [], {}), /falta nome/)
})

test('parser preserva alias e opções tipadas', () => {
  const chamada = validarChamada('help', [], {})
  assert.equal(chamada.verbo.nome, 'ajuda')
  assert.deepEqual(validarChamada('esperar', ['Ana'], { tempo: '30' }).opcoes, { tempo: 30 })
  assert.deepEqual(validarChamada('sair', [], { 'com-as-minhas': true }).opcoes, { 'com-as-minhas': true })
})

test('a tabela de ajuda vem do registro', () => {
  const tabela = tabelaDeComandos()
  for (const verbo of VERBOS.filter((verbo) => verbo.ajuda)) assert.ok(tabela.includes(verbo.ajuda))
  assert.match(tabela, /mpro abrir <claude\|codex\|shell>/)
})
