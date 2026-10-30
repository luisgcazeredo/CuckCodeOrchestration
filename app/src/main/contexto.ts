/**
 * Leitura pura dos formatos que os clientes imprimem para contexto. Esta parte
 * não conhece Electron, processos nem sessões: serve tanto ao main quanto às
 * provas por exemplos copiados das telas.
 */
export type OrigemDoContexto = 'rodape' | 'comando-claude'

export interface ContextoExtraido {
  percentual: number
  origem: OrigemDoContexto
}

const percentual = (texto: string): number | null => {
  const valor = Number(texto.replace(',', '.'))
  return Number.isFinite(valor) && valor >= 0 && valor <= 100 ? valor : null
}

/** Extrai o percentual e informa se ele veio de um rodapé ou de `/context` do Claude. */
export function extrairLeituraDeContexto(tela: string): ContextoExtraido | null {
  const formatos: Array<{ formato: RegExp; origem: OrigemDoContexto }> = [
    { formato: /\bcontext left until auto-compact\s*:\s*(\d{1,3}(?:[.,]\d+)?)%/i, origem: 'rodape' },
    { formato: /\b(\d{1,3}(?:[.,]\d+)?)%\s+(?:context|tokens?)\s+(?:left|remaining)\b/i, origem: 'rodape' },
    { formato: /\b(?:context|tokens?)\s+(?:left|remaining)\s*:\s*(\d{1,3}(?:[.,]\d+)?)%/i, origem: 'rodape' },
    // Saída real de `/context` no Claude Code v2.1.314: "Free space: 897.6k (89.8%)".
    { formato: /\bfree space\s*:\s*\d+(?:[.,]\d+)?(?:[kmg])?\s*\(\s*(\d{1,3}(?:[.,]\d+)?)%\s*\)/i, origem: 'comando-claude' }
  ]
  for (const { formato, origem } of formatos) {
    const achou = tela.match(formato)
    const valor = achou ? percentual(achou[1]) : null
    if (valor !== null) return { percentual: valor, origem }
  }
  return null
}

/** Só o número, para consumidores que não precisam saber de onde ele veio. */
export function extrairContextoRestante(tela: string): number | null {
  return extrairLeituraDeContexto(tela)?.percentual ?? null
}

/** Um rodapé vivo fica no fim; não confunda percentuais citados no histórico da conversa com o estado atual. */
export function extrairLeituraDoRodape(tela: string, linhas = 6): ContextoExtraido | null {
  const rodape = tela.split('\n').filter((linha) => linha.trim()).slice(-linhas).join('\n')
  const leitura = extrairLeituraDeContexto(rodape)
  return leitura?.origem === 'rodape' ? leitura : null
}
