import assert from 'node:assert/strict'
import test from 'node:test'

const moduloDoContexto = new URL('./contexto.ts', import.meta.url).href
const { extrairContextoRestante, extrairLeituraDoRodape } = await import(moduloDoContexto)

test('extrai o Free space real do /context do Claude', () => {
  assert.equal(extrairContextoRestante('⚙ Free space: 897.6k (89.8%)'), 89.8)
})

test('extrai Free space com unidade grande ou sem unidade', () => {
  assert.equal(extrairContextoRestante('⚙ Free space: 1.2m (62.0%)'), 62)
  assert.equal(extrairContextoRestante('⚙ Free space: 897 (89.8%)'), 89.8)
})

test('preserva os três formatos legados', () => {
  assert.equal(extrairContextoRestante('Context left until auto-compact: 23%'), 23)
  assert.equal(extrairContextoRestante('17% context left'), 17)
  assert.equal(extrairContextoRestante('tokens remaining: 8%'), 8)
})

test('uma tela real do Codex não inventa contexto', () => {
  const codex = 'GPT-5.6-Terra high · ~\\ARQUIVOS GERAL\\02 PROJETOS\\Maestri Proprio\n← for agents · ? for shortcuts                             ⚠ 2 warnings · f2 to view'
  assert.equal(extrairContextoRestante(codex), null)
})

test('uma tela sem número retorna null, nunca zero', () => {
  assert.equal(extrairContextoRestante('❯ Try "write a test for <filepath>"\n⏵⏵ auto mode on (shift+tab to cycle)'), null)
})

test('não lê no rodapé um percentual citado no miolo da conversa', () => {
  const tela = [
    'O diff antigo dizia: 50% context left.',
    'Essa frase é conteúdo da conversa, não estado do cliente.',
    'Saída antiga 1.',
    'Saída antiga 2.',
    'Saída antiga 3.',
    'Saída antiga 4.',
    'Saída antiga 5.',
    '❯ Try "write a test for <filepath>"',
    '⏵⏵ auto mode on (shift+tab to cycle)'
  ].join('\n')
  assert.equal(extrairLeituraDoRodape(tela), null)
})
