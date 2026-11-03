import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import php from 'highlight.js/lib/languages/php'
import powershell from 'highlight.js/lib/languages/powershell'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import { dividirHtmlPorLinhas, escaparHtml, linguaDe } from '../../../shared/realce'

// Realce de sintaxe no cartão de código. O highlight.js entra pelo núcleo, com as línguas escolhidas uma por
// uma: o pacote inteiro são 5 MB de 190 línguas, e isto são as que aparecem aqui. As cores são as do tema
// Dark+ e Light+ do VS Code, nos estilos (`.hljs-*` em estilos.css).

for (const [nome, lingua] of Object.entries({
  bash,
  c,
  cpp,
  csharp,
  css,
  dockerfile,
  go,
  ini,
  java,
  javascript,
  json,
  markdown,
  php,
  powershell,
  python,
  ruby,
  rust,
  sql,
  typescript,
  xml,
  yaml
})) {
  hljs.registerLanguage(nome, lingua)
}

/**
 * Uma linha de HTML colorido para cada linha do texto. Arquivo de língua desconhecida sai só escapado — sem
 * cor, mas sem adivinhação: `highlightAuto` erra feio em arquivo pequeno e fica caro em arquivo grande.
 */
export function realcarLinhas(texto: string, caminho: string): string[] {
  const lingua = linguaDe(caminho)
  if (!lingua || !hljs.getLanguage(lingua)) return texto.split('\n').map(escaparHtml)
  try {
    return dividirHtmlPorLinhas(hljs.highlight(texto, { language: lingua, ignoreIllegals: true }).value)
  } catch {
    return texto.split('\n').map(escaparHtml)
  }
}
