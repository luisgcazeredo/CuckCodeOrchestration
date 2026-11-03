// Parte pura do realce de sintaxe: a língua de cada extensão e a quebra do HTML colorido em linhas.
// Mora aqui, fora do app, porque é o que as provas conseguem testar sem Electron nem navegador.

export function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** Língua do highlight.js por extensão. Sem entrada aqui, o arquivo aparece sem cor (e isso é de propósito). */
const POR_EXTENSAO: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  jsonc: 'json',
  css: 'css',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  svg: 'xml',
  vue: 'xml',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  ps1: 'powershell',
  psm1: 'powershell',
  yml: 'yaml',
  yaml: 'yaml',
  sql: 'sql',
  java: 'java',
  cs: 'csharp',
  go: 'go',
  rs: 'rust',
  php: 'php',
  rb: 'ruby',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  ini: 'ini',
  toml: 'ini',
  env: 'bash',
  dockerfile: 'dockerfile'
}

export function linguaDe(caminho: string): string | null {
  const nome = (caminho.split(/[/\u005C]/).pop() ?? '').toLowerCase()
  if (nome === 'dockerfile') return 'dockerfile'
  const ext = nome.includes('.') ? nome.split('.').pop()! : ''
  return POR_EXTENSAO[ext] ?? null
}

/**
 * O HTML do highlight.js é um bloco só, e um `<span>` de comentário ou de texto com crase atravessa várias
 * linhas. O cartão desenha linha por linha (para pintar o verde e o vermelho do diff), então aqui cada linha
 * fecha as marcas abertas no fim e as reabre no começo da seguinte — o mesmo truque dos plugins de número de
 * linha. Sem isso, uma linha herdaria a cor da anterior ou o HTML sairia quebrado.
 */
export function dividirHtmlPorLinhas(html: string): string[] {
  const linhas: string[] = []
  const abertas: string[] = []
  let atual = ''
  let i = 0
  while (i < html.length) {
    const caractere = html[i]
    if (caractere === '<') {
      const fim = html.indexOf('>', i)
      if (fim === -1) {
        atual += html.slice(i)
        break
      }
      const marca = html.slice(i, fim + 1)
      if (marca.startsWith('</')) abertas.pop()
      else if (!marca.endsWith('/>')) abertas.push(marca)
      atual += marca
      i = fim + 1
      continue
    }
    if (caractere === '\n') {
      linhas.push(atual + '</span>'.repeat(abertas.length))
      atual = abertas.join('')
      i++
      continue
    }
    atual += caractere
    i++
  }
  linhas.push(atual)
  return linhas
}
