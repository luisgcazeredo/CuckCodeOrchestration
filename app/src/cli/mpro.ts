// O `mpro`, rodado pelos agentes dentro de um terminal do app (pelo Electron em modo Node, ver comandos.ts).
// Lê os argumentos, manda uma linha JSON pelo pipe do app e escreve a resposta. Saída: 0 ok, 1 recusado, 2 sem app.
import { readFileSync } from 'node:fs'
import { connect } from 'node:net'

const OPCOES_COM_VALOR = new Set(['nome', 'pasta', 'pedido', 'arquivo', 'tempo', 'linhas'])

function falhar(mensagem: string, codigo: number): void {
  process.stderr.write(`mpro: ${mensagem}\n`)
  process.exitCode = codigo
}

function lerArgumentos(argumentos: string[]): { posicionais: string[]; opcoes: Record<string, string | true> } {
  const posicionais: string[] = []
  const opcoes: Record<string, string | true> = {}
  for (let i = 0; i < argumentos.length; i++) {
    const a = argumentos[i]
    if (!a.startsWith('--') || a === '--') {
      posicionais.push(a)
      continue
    }
    const igual = a.indexOf('=')
    const chave = igual > 0 ? a.slice(2, igual) : a.slice(2)
    if (igual > 0) opcoes[chave] = a.slice(igual + 1)
    else if (OPCOES_COM_VALOR.has(chave) && i + 1 < argumentos.length) opcoes[chave] = argumentos[++i]
    else opcoes[chave] = true
  }
  return { posicionais, opcoes }
}

function lerTexto(comando: string, posicionais: string[], opcoes: Record<string, string | true>): string {
  if (typeof opcoes.arquivo === 'string') return readFileSync(opcoes.arquivo, 'utf8')
  if (comando === 'abrir') return typeof opcoes.pedido === 'string' ? opcoes.pedido : ''
  if (comando !== 'pedir') return ''
  // `mpro pedir Nome -`: o pedido vem pela entrada padrão
  if (posicionais[1] === '-') return readFileSync(0, 'utf8')
  return posicionais.slice(1).join(' ')
}

function principal(): void {
  const [comando = 'ajuda', ...resto] = process.argv.slice(2)
  const pipe = process.env.MP_PIPE
  const cracha = process.env.MP_CRACHA
  if (!pipe || !cracha) return falhar('só funciona dentro de um terminal do Maestri Próprio', 2)
  const { posicionais, opcoes } = lerArgumentos(resto)
  let texto: string
  try {
    texto = lerTexto(comando, posicionais, opcoes)
  } catch (erro) {
    return falhar(`não consegui ler o pedido: ${erro instanceof Error ? erro.message : erro}`, 1)
  }

  const conexao = connect(pipe)
  let resposta = ''
  conexao.setEncoding('utf8')
  conexao.on('connect', () => conexao.write(`${JSON.stringify({ cracha, comando, posicionais, opcoes, texto })}\n`))
  conexao.on('data', (parte: string) => (resposta += parte))
  conexao.on('error', () => falhar('não consegui falar com o app (ele foi fechado?)', 2))
  conexao.on('end', () => {
    try {
      const r = JSON.parse(resposta) as { ok: boolean; saida?: string; erro?: string }
      if (r.ok) process.stdout.write(`${r.saida ?? ''}\n`)
      else falhar(r.erro ?? 'recusado', 1)
    } catch {
      falhar('resposta estranha do app', 2)
    }
  })
}

principal()
