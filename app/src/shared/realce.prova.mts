import assert from 'node:assert/strict'
import test from 'node:test'
// Node executa provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { dividirHtmlPorLinhas, escaparHtml, linguaDe } from './realce.ts'

test('língua pela extensão, com barra dos dois tipos', () => {
  assert.equal(linguaDe('src/main/codigo.ts'), 'typescript')
  assert.equal(linguaDe(String.raw`C:\projeto\src\App.tsx`), 'typescript')
  assert.equal(linguaDe('README.md'), 'markdown')
  assert.equal(linguaDe('scripts/instalar.mjs'), 'javascript')
  assert.equal(linguaDe('Dockerfile'), 'dockerfile')
  assert.equal(linguaDe('dados.bin'), null)
  assert.equal(linguaDe('sem-extensao'), null)
})

test('escapar: o texto do arquivo não vira marcação', () => {
  assert.equal(escaparHtml('if (a < b && c > d) {}'), 'if (a &lt; b &amp;&amp; c &gt; d) {}')
})

test('quebra em linhas sem marca aberta', () => {
  assert.deepEqual(dividirHtmlPorLinhas('um\ndois\n'), ['um', 'dois', ''])
  assert.deepEqual(dividirHtmlPorLinhas('uma linha só'), ['uma linha só'])
})

test('marca que atravessa linha fecha e reabre em cada uma', () => {
  const html = '<span class="hljs-comment">/* um\ndois */</span>\ncodigo'
  assert.deepEqual(dividirHtmlPorLinhas(html), [
    '<span class="hljs-comment">/* um</span>',
    '<span class="hljs-comment">dois */</span>',
    'codigo'
  ])
})

test('marcas aninhadas são reabertas na ordem', () => {
  const html = '<span class="a"><span class="b">x\ny</span>z</span>'
  assert.deepEqual(dividirHtmlPorLinhas(html), [
    '<span class="a"><span class="b">x</span></span>',
    '<span class="a"><span class="b">y</span>z</span>'
  ])
})

test('cada linha tem o mesmo número de abre e fecha', () => {
  const html = '<span class="a">um\n<span class="b">dois\ntrês</span>\nquatro</span>'
  for (const linha of dividirHtmlPorLinhas(html)) {
    const abre = (linha.match(/<span/g) ?? []).length
    const fecha = (linha.match(/<\/span>/g) ?? []).length
    assert.equal(abre, fecha, linha)
  }
})

test('html mal formado não derruba nem perde texto', () => {
  assert.deepEqual(dividirHtmlPorLinhas('texto <span class="sem fim'), ['texto <span class="sem fim'])
})
