import { ipcMain, webContents } from 'electron'
import { randomBytes, randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Socket } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { CANAIS_AGENTES, type PedidoDoAgente, type RespostaAoAgente } from '../shared/api'
import type { Agente } from '../shared/modelo'
import { PASTA_DADOS } from './dados'
import { donoDe } from './janelas'
import { AJUDA, SKILL } from './manual'
import {
  aceitaColagem,
  cordasDoEspaco,
  encerrarAgora,
  escreverNoProcesso,
  esperarSessao,
  sessaoPorCracha,
  sessoesDoEspaco,
  telaDe,
  type Sessao
} from './terminais'

// O `mpro`: a linha de comando dos agentes. Cada terminal do app ganha no ambiente o endereço de um pipe local
// (MP_PIPE) e um crachá próprio (MP_CRACHA), e a pasta com o `mpro` no PATH. O `mpro` (src/cli/mpro.ts) manda uma
// linha JSON e recebe uma de volta. A corda entre dois terminais é a permissão: sem corda, não há conversa.
// O nome do crachá não tem KEY, TOKEN nem SECRET: o Codex tira essas variáveis do ambiente dos comandos.

const AUTOTESTE = process.argv.includes('--autoteste')
const PIPE =
  process.platform === 'win32'
    ? `\\\\.\\pipe\\maestri-proprio-${randomBytes(12).toString('hex')}`
    : join(tmpdir(), `maestri-proprio-${randomBytes(12).toString('hex')}.sock`)
const PASTA_BIN = join(PASTA_DADOS, 'bin')
const MAX_PEDIDO = 512 * 1024
const MAX_FILHOS = 8
const TEMPO_PADRAO = 100
const TEMPO_MAX = 3600
/** O que aparece na tela de quem está ocupado (Claude Code e Codex). */
const OCUPADO = /esc to interrupt|esc para interromper/i
/**
 * Rodapés e perguntas de diálogo (confiança na pasta, servidores MCP, permissão de ferramenta, atualização,
 * sim/não). Olhando só o fim da tela: o texto da conversa pode citar essas palavras.
 */
const DIALOGO =
  /enter to confirm|esc to cancel|esc to reject|enter continue|press enter to continue|update now|trust this folder|do you trust|do you want to proceed|\(y\/n\)|\[y\/n\]/i
/** Agente desenhado e esperando o primeiro pedido (Claude Code e Codex). */
const PRONTO = /for shortcuts|context left|ask codex/i
/** A última linha é o prompt do PowerShell: o agente nem abriu, ou já saiu. */
const PROMPT_DO_SHELL = /^PS .*>\s*$/

const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** O cli.js fica fora do app.asar (asarUnpack): o Electron em modo Node roda de lá. */
function caminhoDoCli(): string {
  return join(__dirname, 'cli.js').replace(`app.asar${sep}`, `app.asar.unpacked${sep}`)
}

/** Variáveis que cada terminal ganha para o `mpro` funcionar. */
export function ambienteDoComando(s: Sessao): { pastaBin: string; variaveis: Record<string, string> } {
  return {
    pastaBin: PASTA_BIN,
    variaveis: { MP_PIPE: PIPE, MP_CRACHA: s.cracha, MP_TERMINAL: s.espec.nome, MP_NODE: process.execPath, MP_CLI: caminhoDoCli() }
  }
}

function gravarSeMudou(caminho: string, conteudo: string): void {
  try {
    if (existsSync(caminho) && readFileSync(caminho, 'utf8') === conteudo) return
    writeFileSync(caminho, conteudo, 'utf8')
  } catch (erro) {
    console.error('não consegui gravar', caminho, erro)
  }
}

/** O `mpro` no PATH dos terminais: um .cmd (PowerShell e cmd) e um script sh (o Git Bash do Claude Code). */
function instalarComando(): void {
  mkdirSync(PASTA_BIN, { recursive: true })
  gravarSeMudou(
    join(PASTA_BIN, 'mpro.cmd'),
    [
      '@echo off',
      'rem Maestri Proprio: o comando dos agentes (so funciona dentro de um terminal do app)',
      'if not defined MP_PIPE (echo mpro: so funciona dentro de um terminal do Maestri Proprio 1>&2 & exit /b 2)',
      'setlocal',
      'set ELECTRON_RUN_AS_NODE=1',
      '"%MP_NODE%" "%MP_CLI%" %*',
      'exit /b %ERRORLEVEL%',
      ''
    ].join('\r\n')
  )
  gravarSeMudou(
    join(PASTA_BIN, 'mpro'),
    [
      '#!/bin/sh',
      '# Maestri Proprio: o comando dos agentes (so funciona dentro de um terminal do app)',
      'if [ -z "$MP_PIPE" ]; then echo "mpro: so funciona dentro de um terminal do Maestri Proprio" >&2; exit 2; fi',
      'ELECTRON_RUN_AS_NODE=1 exec "$MP_NODE" "$MP_CLI" "$@"',
      ''
    ].join('\n')
  )
  // o manual vira skill do Claude Code e do Codex (decisão do Luís, 28/10/2026); fora do app ela manda não usar
  if (AUTOTESTE) return
  for (const pasta of [process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), process.env.CODEX_HOME || join(homedir(), '.codex')]) {
    if (!existsSync(pasta)) continue
    const destino = join(pasta, 'skills', 'maestri-proprio')
    mkdirSync(destino, { recursive: true })
    gravarSeMudou(join(destino, 'SKILL.md'), SKILL)
  }
}

// ---------- pedidos que mexem no quadro: vão para a janela dona do espaço ----------

const respostas = new Map<string, { janela: number; resolver: (r: RespostaAoAgente) => void }>()

function pedirAJanela(pedido: PedidoDoAgente): Promise<RespostaAoAgente> {
  const dono = donoDe(pedido.espacoId)
  const janela = dono !== undefined ? webContents.fromId(dono) : undefined
  if (!janela || janela.isDestroyed()) {
    return Promise.resolve({ ok: false, erro: 'o espaço deste terminal não está aberto em nenhuma janela; peça ao usuário para abri-lo' })
  }
  const id = randomUUID()
  return new Promise((resolver) => {
    const limite = setTimeout(() => {
      respostas.delete(id)
      resolver({ ok: false, erro: 'a janela do app não respondeu' })
    }, 10_000)
    respostas.set(id, {
      janela: janela.id,
      resolver: (r) => {
        clearTimeout(limite)
        respostas.delete(id)
        resolver(r)
      }
    })
    janela.send(CANAIS_AGENTES.pedido, id, pedido)
  })
}

// ---------- estado e espera ----------

/** `pergunta`: parado num diálogo, esperando alguém responder (nada deve ser digitado nele por engano). */
type Situacao = 'encerrado' | 'trabalhando' | 'pergunta' | 'livre'

async function situacao(s: Sessao): Promise<Situacao> {
  if (!s.processo) return 'encerrado'
  if (Date.now() - s.ultimaSaida < 1200) return 'trabalhando'
  if (s.espec.agente === 'shell') return 'livre'
  const fim = await telaDe(s, 20)
  if (DIALOGO.test(fim)) return 'pergunta'
  return OCUPADO.test(fim) ? 'trabalhando' : 'livre'
}

/** Espera começar (até 8 s) e depois sossegar (livre ou numa pergunta) por 2,5 s seguidos. false = o tempo acabou antes. */
async function aguardarFim(s: Sessao, ms: number, cancelado: () => boolean): Promise<boolean> {
  const limite = Date.now() + ms
  for (const comeco = Date.now() + Math.min(8000, ms); Date.now() < comeco && !cancelado(); await esperar(250)) {
    if ((await situacao(s)) === 'trabalhando') break
  }
  let paradoDesde = 0
  while (Date.now() < limite && !cancelado()) {
    const agora = await situacao(s)
    if (agora === 'encerrado') return true
    if (agora === 'trabalhando') {
      paradoDesde = 0
    } else {
      paradoDesde ||= Date.now()
      if (Date.now() - paradoDesde >= 2500) return true
    }
    await esperar(250)
  }
  return false
}

/** Sessão recém-aberta: espera o agente desenhar a tela dele e sossegar, ou parar numa pergunta. */
async function aguardarPronto(s: Sessao, ms: number, cancelado: () => boolean): Promise<'pronto' | 'confirmar' | 'tempo' | 'encerrado'> {
  for (const limite = Date.now() + ms; Date.now() < limite && !cancelado(); await esperar(300)) {
    if (!s.processo) return 'encerrado'
    const quieto = Date.now() - s.ultimaSaida
    if (Date.now() - s.iniciadoEm < 2000 || quieto < 1500) continue
    if (s.espec.agente === 'shell') return 'pronto'
    const tela = await telaDe(s, 40)
    if (DIALOGO.test(tela.split('\n').slice(-20).join('\n'))) return 'confirmar'
    if (PRONTO.test(tela)) return 'pronto'
    // sem a marca de pronto (outra versão do agente?): quieto há 6 s, sem diálogo e sem o prompt do shell no fim
    if (quieto > 6000 && tela.trim() && !PROMPT_DO_SHELL.test(tela.split('\n').pop() ?? '')) return 'pronto'
  }
  return 'tempo'
}

/** Nada é digitado num terminal parado numa pergunta: devolve a tela para quem pediu decidir. */
async function recusarSeEmPergunta(s: Sessao): Promise<void> {
  if ((await situacao(s)) !== 'pergunta') return
  throw new Error(
    `"${s.espec.nome}" está parado numa pergunta (confiança na pasta, permissão, atualização…) e nada foi digitado. ` +
      `Responda com \`mpro teclas "${s.espec.nome}" …\` se for seguro, ou pergunte ao usuário. Tela:\n${await telaDe(s, 25)}`
  )
}

async function digitarPedido(s: Sessao, texto: string): Promise<void> {
  const limpo = texto.replace(/\r\n?/g, '\n').trimEnd()
  if (s.espec.agente !== 'shell' && aceitaColagem(s)) {
    escreverNoProcesso(s, `\x1b[200~${limpo.replace(/\x1b\[20[01]~/g, '')}\x1b[201~`)
  } else {
    escreverNoProcesso(s, s.espec.agente === 'shell' ? limpo.replace(/\n/g, '\r') : limpo.replace(/\n/g, ' '))
  }
  // o Enter separado da colagem: junto, alguns agentes o tomam como parte do texto
  await esperar(250)
  escreverNoProcesso(s, '\r')
}

function registrar(de: Sessao, para: Sessao | null, comando: string, texto = ''): void {
  try {
    const pasta = join(PASTA_DADOS, 'registro')
    mkdirSync(pasta, { recursive: true })
    const quando = new Date()
    const dia = `${quando.getFullYear()}-${String(quando.getMonth() + 1).padStart(2, '0')}-${String(quando.getDate()).padStart(2, '0')}`
    const linha = { quando: quando.toISOString(), espaco: de.espacoId, de: de.espec.nome, para: para?.espec.nome ?? null, comando, texto: texto.slice(0, 4000) }
    appendFileSync(join(pasta, `${dia}.jsonl`), `${JSON.stringify(linha)}\n`, 'utf8')
  } catch {
    // registro é extra: não atrapalha o comando
  }
}

// ---------- quem fala com quem ----------

/** Quem está ligado a mim por corda, mais quem eu abri. */
function ligadosA(eu: Sessao): Sessao[] {
  const ids = new Set<string>()
  for (const [a, b] of cordasDoEspaco(eu.espacoId)) {
    if (a === eu.id) ids.add(b)
    if (b === eu.id) ids.add(a)
  }
  return sessoesDoEspaco(eu.espacoId).filter((s) => s.id !== eu.id && (ids.has(s.id) || s.espec.criadoPor === eu.id))
}

function acharEntre(lista: Sessao[], nome: string | undefined): Sessao {
  if (!nome) throw new Error('diga com quem: o nome do cartão (veja `mpro quem`)')
  const procurado = nome.trim().toLowerCase()
  const exatos = lista.filter((s) => s.espec.nome.toLowerCase() === procurado || s.id === procurado)
  const candidatos = exatos.length ? exatos : lista.filter((s) => s.espec.nome.toLowerCase().startsWith(procurado))
  if (candidatos.length === 1) return candidatos[0]
  const nomes = lista.map((s) => `"${s.espec.nome}"`).join(', ') || 'ninguém'
  if (candidatos.length > 1) throw new Error(`mais de um cartão com "${nome}": ${candidatos.map((s) => `"${s.espec.nome}"`).join(', ')}`)
  throw new Error(`ninguém ligado a você se chama "${nome}". Ligados: ${nomes}`)
}

function tempoDe(opcoes: Record<string, unknown>): number {
  const n = Number(opcoes.tempo ?? TEMPO_PADRAO)
  return Number.isFinite(n) && n > 0 ? Math.min(n, TEMPO_MAX) : TEMPO_PADRAO
}

async function resultado(s: Sessao, segundos: number, cancelado: () => boolean): Promise<string> {
  const terminou = await aguardarFim(s, segundos * 1000, cancelado)
  const tela = await telaDe(s, 60)
  if (terminou && (await situacao(s)) === 'pergunta') {
    return `"${s.espec.nome}" parou numa pergunta e espera resposta (responda com \`mpro teclas\` se for seguro, ou pergunte ao usuário). Tela:\n${tela}`
  }
  if (terminou) return `"${s.espec.nome}" terminou. Tela:\n${tela}`
  return `"${s.espec.nome}" ainda está trabalhando depois de ${segundos} s. Use \`mpro esperar "${s.espec.nome}"\` depois. Tela agora:\n${tela}`
}

const TECLAS: Record<string, string> = {
  enter: '\r',
  esc: '\x1b',
  tab: '\t',
  'shift-tab': '\x1b[Z',
  cima: '\x1b[A',
  up: '\x1b[A',
  baixo: '\x1b[B',
  down: '\x1b[B',
  direita: '\x1b[C',
  right: '\x1b[C',
  esquerda: '\x1b[D',
  left: '\x1b[D',
  'ctrl-c': '\x03',
  'ctrl-d': '\x04',
  backspace: '\x7f',
  espaco: ' ',
  space: ' '
}

function agenteDe(texto: string | undefined): Agente | null {
  const t = (texto ?? '').toLowerCase()
  if (t === 'claude') return 'claude'
  if (t === 'codex') return 'codex'
  if (t === 'shell' || t === 'powershell') return 'shell'
  return null
}

interface Pedido {
  cracha?: unknown
  comando?: unknown
  posicionais?: unknown
  opcoes?: unknown
  texto?: unknown
}

async function executar(eu: Sessao, pedido: Pedido, cancelado: () => boolean): Promise<string> {
  const comando = typeof pedido.comando === 'string' ? pedido.comando : 'ajuda'
  const pos = Array.isArray(pedido.posicionais) ? pedido.posicionais.filter((p): p is string => typeof p === 'string') : []
  const opcoes = typeof pedido.opcoes === 'object' && pedido.opcoes !== null ? (pedido.opcoes as Record<string, unknown>) : {}
  const texto = typeof pedido.texto === 'string' ? pedido.texto : ''

  switch (comando) {
    case 'ajuda':
    case 'help':
      return AJUDA

    case 'quem': {
      const ligados = ligadosA(eu)
      const linhas = await Promise.all(
        ligados.map(async (s) => `  "${s.espec.nome}" · ${s.espec.agente} · ${await situacao(s)}${s.espec.criadoPor === eu.id ? ' · aberto por você' : ''}`)
      )
      const filhos = sessoesDoEspaco(eu.espacoId).filter((s) => s.espec.criadoPor === eu.id).length
      return [
        `Você é "${eu.espec.nome}" (${eu.espec.agente}) · pasta ${eu.espec.pasta}`,
        'Ligados a você:',
        ...(linhas.length ? linhas : ['  ninguém (o usuário liga cartões com uma corda; quem você abre já nasce ligado)']),
        `Você abriu ${filhos} de ${MAX_FILHOS} sessões possíveis.`
      ].join('\n')
    }

    case 'abrir': {
      const agente = agenteDe(pos[0])
      if (!agente) throw new Error('diga qual agente: mpro abrir claude|codex|shell [--nome N] [--pedido "texto"]')
      const filhos = sessoesDoEspaco(eu.espacoId).filter((s) => s.espec.criadoPor === eu.id).length
      if (filhos >= MAX_FILHOS) throw new Error(`você já abriu ${filhos} sessões (o limite é ${MAX_FILHOS}); feche uma com \`mpro fechar\``)
      const pasta = typeof opcoes.pasta === 'string' ? opcoes.pasta : undefined
      if (pasta && !(existsSync(pasta) && statSync(pasta).isDirectory())) throw new Error(`a pasta não existe: ${pasta}`)
      const nome = typeof opcoes.nome === 'string' ? opcoes.nome.trim().slice(0, 80) || undefined : undefined
      const r = await pedirAJanela({ tipo: 'abrir', espacoId: eu.espacoId, criador: eu.id, agente, nome, pasta })
      if (!r.ok) throw new Error(r.erro)
      const novo = r.id ? await esperarSessao(r.id, 5000) : undefined
      if (!novo) throw new Error('o cartão foi criado, mas o processo não abriu')
      registrar(eu, novo, 'abrir', texto)
      const aberto = `Abri "${novo.espec.nome}" (${agente}), ligado a você.`
      if (!texto) return `${aberto} Mande o primeiro pedido com: mpro pedir "${novo.espec.nome}" "…"`
      const pronto = await aguardarPronto(novo, 90_000, cancelado)
      if (pronto !== 'pronto') {
        const motivo = {
          confirmar:
            'Ele parou numa pergunta (confiar na pasta? servidores MCP? atualização?). O pedido NÃO foi enviado: responda com `mpro teclas` se for seguro, ou pergunte ao usuário, e depois use `mpro pedir`.',
          tempo: 'Ele não ficou pronto em 90 s; o pedido NÃO foi enviado. Veja com `mpro ver` e use `mpro pedir` depois.',
          encerrado: 'O processo terminou antes de ficar pronto; o pedido NÃO foi enviado.'
        }[pronto]
        return `${aberto}\n${motivo}\nTela agora:\n${await telaDe(novo, 30)}`
      }
      await digitarPedido(novo, texto)
      if (!opcoes.esperar) return `${aberto} Pedido enviado. Acompanhe com \`mpro esperar "${novo.espec.nome}"\` ou \`mpro ver\`.`
      return `${aberto}\n${await resultado(novo, tempoDe(opcoes), cancelado)}`
    }

    case 'pedir': {
      const alvo = acharEntre(ligadosA(eu), pos[0])
      if (!texto.trim()) throw new Error('falta o pedido: mpro pedir <nome> "texto" (ou --arquivo pedido.md)')
      if (!alvo.processo) throw new Error(`"${alvo.espec.nome}" está encerrado`)
      await recusarSeEmPergunta(alvo)
      registrar(eu, alvo, 'pedir', texto)
      await digitarPedido(alvo, texto)
      if (opcoes['sem-esperar']) return `Pedido enviado para "${alvo.espec.nome}".`
      return resultado(alvo, tempoDe(opcoes), cancelado)
    }

    case 'esperar': {
      const alvo = acharEntre(ligadosA(eu), pos[0])
      return resultado(alvo, tempoDe(opcoes), cancelado)
    }

    case 'ver': {
      const alvo = acharEntre(ligadosA(eu), pos[0])
      const linhas = Math.min(2000, Math.max(1, Number(opcoes.linhas) || 50))
      return `"${alvo.espec.nome}" · ${await situacao(alvo)}\n${await telaDe(alvo, linhas)}`
    }

    case 'teclas': {
      const alvo = acharEntre(ligadosA(eu), pos[0])
      const teclas = pos.slice(1)
      if (!teclas.length) throw new Error('quais teclas? ex.: mpro teclas <nome> enter (veja `mpro ajuda`)')
      const sequencias = teclas.map((t) => {
        const s = TECLAS[t.toLowerCase()] ?? (t.length === 1 ? t : null)
        if (s === null) throw new Error(`tecla desconhecida: ${t}`)
        return s
      })
      registrar(eu, alvo, 'teclas', teclas.join(' '))
      for (const s of sequencias) {
        escreverNoProcesso(alvo, s)
        await esperar(120)
      }
      await esperar(800)
      return `"${alvo.espec.nome}" · ${await situacao(alvo)}\n${await telaDe(alvo, 30)}`
    }

    case 'limpar': {
      const alvo = acharEntre(ligadosA(eu), pos[0])
      if (!alvo.processo) throw new Error(`"${alvo.espec.nome}" está encerrado`)
      if ((await situacao(alvo)) === 'trabalhando') throw new Error(`"${alvo.espec.nome}" está trabalhando; espere terminar antes de limpar`)
      await recusarSeEmPergunta(alvo)
      registrar(eu, alvo, 'limpar')
      const comandoLimpar = alvo.espec.agente === 'claude' ? '/clear' : alvo.espec.agente === 'codex' ? '/new' : process.platform === 'win32' ? 'Clear-Host' : 'clear'
      escreverNoProcesso(alvo, comandoLimpar)
      await esperar(400)
      escreverNoProcesso(alvo, '\r')
      await aguardarFim(alvo, 15_000, cancelado)
      return `Contexto de "${alvo.espec.nome}" zerado.`
    }

    case 'fechar': {
      const meus = sessoesDoEspaco(eu.espacoId).filter((s) => s.espec.criadoPor === eu.id)
      const alvo = acharEntre(meus, pos[0])
      const r = await pedirAJanela({ tipo: 'fechar', espacoId: eu.espacoId, id: alvo.id })
      if (!r.ok) throw new Error(r.erro)
      registrar(eu, alvo, 'fechar')
      encerrarAgora(alvo.id)
      return `Fechei "${alvo.espec.nome}".`
    }

    default:
      throw new Error(`comando desconhecido: ${comando}. Veja \`mpro ajuda\`.`)
  }
}

async function atender(linha: string, socket: Socket, fechado: () => boolean): Promise<void> {
  let resposta: { ok: boolean; saida?: string; erro?: string }
  try {
    const pedido = JSON.parse(linha) as Pedido
    const eu = sessaoPorCracha(pedido.cracha)
    if (!eu) throw new Error('este terminal não é do Maestri Próprio (ou o app foi reaberto: feche e abra o terminal)')
    resposta = { ok: true, saida: await executar(eu, pedido, fechado) }
  } catch (erro) {
    resposta = { ok: false, erro: erro instanceof Error ? erro.message : String(erro) }
  }
  if (!socket.destroyed) socket.end(`${JSON.stringify(resposta)}\n`)
}

export function registrarComandos(): void {
  instalarComando()

  ipcMain.on(CANAIS_AGENTES.resposta, (evento, id: unknown, resposta: RespostaAoAgente) => {
    const pendente = typeof id === 'string' ? respostas.get(id) : undefined
    if (!pendente || pendente.janela !== evento.sender.id) return
    const valida = resposta && typeof resposta === 'object' && typeof resposta.ok === 'boolean'
    pendente.resolver(valida ? resposta : { ok: false, erro: 'resposta inválida da janela' })
  })

  const servidor = createServer((socket) => {
    let recebido = ''
    let fechado = false
    socket.setEncoding('utf8')
    socket.on('close', () => (fechado = true))
    socket.on('error', () => (fechado = true))
    const aoReceber = (parte: string): void => {
      recebido += parte
      if (recebido.length > MAX_PEDIDO) return void socket.destroy()
      const fim = recebido.indexOf('\n')
      if (fim < 0) return
      socket.off('data', aoReceber)
      void atender(recebido.slice(0, fim), socket, () => fechado)
    }
    socket.on('data', aoReceber)
  })
  servidor.on('error', (erro) => console.error('mpro: o pipe não abriu', erro))
  servidor.listen(PIPE)
}
