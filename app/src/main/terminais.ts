import { ipcMain, webContents, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { randomBytes } from 'node:crypto'
import { closeSync, existsSync, openSync, readdirSync, readSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'
import * as pty from 'node-pty'
import { Terminal as Espelho } from '@xterm/headless'
import { SerializeAddon } from '@xterm/addon-serialize'
import { CANAIS, type EspecTerminal, type RetratoTerminal } from '../shared/api'
import { ambienteDoComando } from './comandos'
import { donoDe, exigirDono } from './janelas'

// Cada cartão de terminal é um processo de verdade (ConPTY no Windows). O processo é do app, não da janela:
// trocar de espaço, fechar uma janela ou recarregar não o encerra (decisão do Luís, 28/10/2026); o cartão só
// se liga e se desliga dele. Um espelho (xterm sem tela) acompanha cada processo: é dele que sai o retrato
// para o cartão que se liga de novo e a tela que os agentes leem pelo `mpro`.

const AUTOTESTE = process.argv.includes('--autoteste')
const MAX_TERMINAIS = 64
const MAX_COLUNAS = 1000
const MAX_LINHAS = 500
const MAX_BYTES_POR_ESCRITA = 1024 * 1024
const HISTORICO = 5000
/** Cartão apagado: o processo espera isto antes de morrer (o Ctrl+Z traz o cartão de volta com ele vivo). */
const FOLGA_AO_APAGAR = AUTOTESTE ? 1500 : 10_000
const ID_VALIDO = /^[0-9a-f-]{36}$/i
const AGENTES = new Set(['claude', 'codex', 'shell'])

export interface Sessao {
  id: string
  espacoId: string
  espec: EspecTerminal
  processo: pty.IPty | null
  espelho: Espelho
  serializar: SerializeAddon
  /** Cartões que mostram este terminal. */
  vistas: Set<WebContents>
  /** Cartões se ligando: a saída fica guardada até o retrato ficar pronto. */
  chegando: Map<WebContents, string[]>
  ultimaSaida: number
  iniciadoEm: number
  /** Código de saída; null enquanto o processo vive. */
  saiu: number | null
  /** Identifica o terminal no `mpro` (vai no ambiente do processo, nunca para a janela). */
  cracha: string
  fim: ReturnType<typeof setTimeout> | null
}

const sessoes = new Map<string, Sessao>()
/** Cordas de cada espaço (todos os andares), como a janela mandou: a permissão do `mpro`. */
const cordas = new Map<string, Array<[string, string]>>()
/** Conversa do Codex descoberta: vai também na resposta do próximo `sincronizar` (o espaço pode estar fechado). */
const descobertas = new Map<string, string>()
const vigiadas = new WeakSet<WebContents>()

function shellPadrao(): { arquivo: string; argumentos: string[] } {
  return process.platform === 'win32'
    ? { arquivo: 'powershell.exe', argumentos: ['-NoLogo'] }
    : { arquivo: process.env.SHELL || '/bin/bash', argumentos: [] }
}

function inteiroEntre(valor: unknown, minimo: number, maximo: number): number | null {
  return Number.isInteger(valor) && (valor as number) >= minimo && (valor as number) <= maximo ? (valor as number) : null
}

function pastaValida(pasta: unknown): string {
  if (typeof pasta === 'string' && pasta && existsSync(pasta) && statSync(pasta).isDirectory()) return pasta
  return homedir()
}

const pastaClaude = (): string => process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude')
const pastaCodex = (): string => process.env.CODEX_HOME || join(homedir(), '.codex')

/** O Claude grava cada conversa em projects/<pasta do projeto>/<id>.jsonl. */
function conversaDoClaudeExiste(sessao: string): boolean {
  const projetos = join(pastaClaude(), 'projects')
  try {
    return readdirSync(projetos).some((p) => existsSync(join(projetos, p, `${sessao}.jsonl`)))
  } catch {
    return false
  }
}

/**
 * A linha digitada no shell: o comando do preset, retomando a conversa do agente quando há uma.
 * Claude: o id é nosso desde o começo (`--session-id`), e volta com `--resume` depois que a conversa existe.
 * Codex: não deixa escolher o id; ele é descoberto pelo arquivo da conversa e volta com `codex resume`.
 */
export function linhaDeComando(espec: EspecTerminal): string {
  const comando = espec.comando.trim()
  const sessao = espec.sessao && ID_VALIDO.test(espec.sessao) ? espec.sessao : null
  if (espec.agente === 'claude' && sessao && /^claude(\s|$)/i.test(comando)) {
    return `${comando} ${conversaDoClaudeExiste(sessao) ? '--resume' : '--session-id'} ${sessao}`
  }
  if (espec.agente === 'codex' && sessao && /^codex(\s|$)/i.test(comando)) return comando.replace(/^codex/i, `codex resume ${sessao}`)
  return comando
}

function ambiente(s: Sessao): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [chave, valor] of Object.entries(process.env)) if (valor !== undefined) env[chave] = valor
  // aberto de dentro do Claude Code (desenvolvimento, autoteste): o terminal não herda o modo Node do Electron nem
  // a sessão de fora (id, token de mensagens, "sessão filha" — com ela o Claude do cartão nem grava a conversa)
  for (const chave of ['ELECTRON_RUN_AS_NODE', 'ELECTRON_RENDERER_URL']) delete env[chave]
  if (env.CLAUDECODE) {
    for (const chave of Object.keys(env)) {
      if (/^(CLAUDECODE|CLAUDE_CODE_|CLAUDE_PID$|CLAUDE_EFFORT$|CLAUDE_AGENT_SDK|AI_AGENT$)/.test(chave)) delete env[chave]
    }
  }
  const { pastaBin, variaveis } = ambienteDoComando(s)
  const chavePath = Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH'
  env[chavePath] = `${pastaBin}${delimiter}${env[chavePath] ?? ''}`
  return { ...env, ...variaveis, TERM: 'xterm-256color', COLORTERM: 'truecolor' }
}

function avisarVistas(s: Sessao, canal: string, valor: unknown): void {
  for (const vista of s.vistas) if (!vista.isDestroyed()) vista.send(canal, s.id, valor)
}

function iniciarProcesso(s: Sessao): void {
  const { arquivo, argumentos } = shellPadrao()
  // crachá novo a cada processo; o de um processo que saiu deixa de valer
  s.cracha = randomBytes(24).toString('hex')
  const processo = pty.spawn(arquivo, argumentos, {
    name: 'xterm-256color',
    cols: s.espelho.cols,
    rows: s.espelho.rows,
    cwd: pastaValida(s.espec.pasta),
    env: ambiente(s),
    useConpty: true
  })
  s.processo = processo
  s.saiu = null
  s.iniciadoEm = s.ultimaSaida = Date.now()
  processo.onData((dados) => {
    if (s.processo !== processo) return
    s.ultimaSaida = Date.now()
    s.espelho.write(dados)
    for (const fila of s.chegando.values()) fila.push(dados)
    avisarVistas(s, CANAIS.dados, dados)
  })
  processo.onExit(({ exitCode }) => {
    if (s.processo !== processo) return
    s.processo = null
    s.saiu = exitCode
    s.cracha = ''
    avisarVistas(s, CANAIS.saida, exitCode)
  })
  // no autoteste não abre Claude nem Codex de verdade (gastaria a conta), a não ser na checagem opcional
  // MP_AGENTES_DE_VERDADE, e só nos que ela abre pelo `mpro`
  const deVerdade = !AUTOTESTE || s.espec.agente === 'shell' || (!!process.env.MP_AGENTES_DE_VERDADE && !!s.espec.criadoPor)
  const linha = deVerdade ? linhaDeComando(s.espec) : ''
  if (linha) processo.write(`${linha}\r`)
  if (s.espec.agente === 'codex' && !s.espec.sessao) vigiarConversaDoCodex(s, processo)
}

function criarSessao(espacoId: string, espec: EspecTerminal): Sessao {
  const espelho = new Espelho({ cols: 100, rows: 28, scrollback: HISTORICO, allowProposedApi: true })
  const serializar = new SerializeAddon()
  espelho.loadAddon(serializar as unknown as Parameters<Espelho['loadAddon']>[0])
  const s: Sessao = {
    id: espec.id,
    espacoId,
    espec,
    processo: null,
    espelho,
    serializar,
    vistas: new Set(),
    chegando: new Map(),
    ultimaSaida: 0,
    iniciadoEm: 0,
    saiu: null,
    cracha: '',
    fim: null
  }
  sessoes.set(s.id, s)
  iniciarProcesso(s)
  return s
}

function encerrar(id: string): void {
  const s = sessoes.get(id)
  if (!s) return
  sessoes.delete(id)
  if (s.fim) clearTimeout(s.fim)
  const processo = s.processo
  s.processo = null
  try {
    processo?.kill()
  } catch {
    // já tinha saído
  }
  s.espelho.dispose()
}

// ---------- conversa do Codex ----------

function primeiraLinha(caminho: string): { type?: string; payload?: Record<string, unknown> } | null {
  const pedaco = Buffer.alloc(64 * 1024)
  let arquivo: number | null = null
  try {
    arquivo = openSync(caminho, 'r')
    const lidos = readSync(arquivo, pedaco, 0, pedaco.length, 0)
    const texto = pedaco.subarray(0, lidos).toString('utf8')
    const fim = texto.indexOf('\n')
    return JSON.parse(fim < 0 ? texto : texto.slice(0, fim))
  } catch {
    return null
  } finally {
    if (arquivo !== null) closeSync(arquivo)
  }
}

const pastaDoDia = (d: Date): string =>
  join(String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0'))

/** A conversa nova do Codex aberta nesta pasta depois que o processo começou, que nenhum outro cartão pegou. */
function procurarConversaDoCodex(s: Sessao): string | null {
  const emUso = new Set([...sessoes.values()].map((x) => x.espec.sessao))
  const pasta = resolve(s.espec.pasta).toLowerCase()
  for (const dia of new Set([pastaDoDia(new Date(s.iniciadoEm)), pastaDoDia(new Date())])) {
    const diretorio = join(pastaCodex(), 'sessions', dia)
    let arquivos: string[]
    try {
      arquivos = readdirSync(diretorio).filter((a) => a.startsWith('rollout-') && a.endsWith('.jsonl'))
    } catch {
      continue
    }
    for (const nome of arquivos.sort()) {
      const caminho = join(diretorio, nome)
      try {
        if (statSync(caminho).birthtimeMs < s.iniciadoEm - 2000) continue
      } catch {
        continue
      }
      const meta = primeiraLinha(caminho)
      const p = meta?.payload
      if (meta?.type !== 'session_meta' || !p || typeof p.id !== 'string' || !ID_VALIDO.test(p.id) || emUso.has(p.id)) continue
      if (p.source === 'exec' || typeof p.cwd !== 'string' || resolve(p.cwd).toLowerCase() !== pasta) continue
      return p.id
    }
  }
  return null
}

/** O Codex só cria o arquivo da conversa depois da primeira mensagem: procura a cada 5 s, por até 30 min. */
function vigiarConversaDoCodex(s: Sessao, processo: pty.IPty): void {
  const tentar = (): void => {
    if (sessoes.get(s.id) !== s || s.processo !== processo || s.espec.sessao) return
    const achada = procurarConversaDoCodex(s)
    if (achada) return anotarSessao(s, achada)
    if (Date.now() - s.iniciadoEm < 30 * 60_000) setTimeout(tentar, 5000)
  }
  setTimeout(tentar, 5000)
}

function anotarSessao(s: Sessao, sessao: string): void {
  s.espec = { ...s.espec, sessao }
  descobertas.set(s.id, sessao)
  const dono = donoDe(s.espacoId)
  const janela = dono !== undefined ? webContents.fromId(dono) : undefined
  if (janela && !janela.isDestroyed()) janela.send(CANAIS.sessao, s.id, sessao)
}

// ---------- janelas ----------

function especValida(e: unknown): e is EspecTerminal {
  const x = e as EspecTerminal
  return (
    !!x &&
    typeof x.id === 'string' &&
    ID_VALIDO.test(x.id) &&
    typeof x.nome === 'string' &&
    x.nome.length <= 200 &&
    AGENTES.has(x.agente) &&
    typeof x.comando === 'string' &&
    x.comando.length <= 2000 &&
    !/[\r\n]/.test(x.comando) &&
    typeof x.pasta === 'string' &&
    (x.sessao === undefined || (typeof x.sessao === 'string' && ID_VALIDO.test(x.sessao))) &&
    (x.criadoPor === undefined || (typeof x.criadoPor === 'string' && ID_VALIDO.test(x.criadoPor)))
  )
}

/** Só a janela dona do espaço do terminal mexe nele. */
function daJanelaDona(evento: IpcMainEvent | IpcMainInvokeEvent, id: unknown): Sessao | undefined {
  const s = typeof id === 'string' ? sessoes.get(id) : undefined
  return s && donoDe(s.espacoId) === evento.sender.id ? s : undefined
}

/** Janela fechou, recarregou ou caiu: deixa de receber a saída. Os processos continuam. */
function vigiar(janela: WebContents): void {
  if (vigiadas.has(janela)) return
  vigiadas.add(janela)
  const soltar = (): void => {
    for (const s of sessoes.values()) {
      s.vistas.delete(janela)
      s.chegando.delete(janela)
    }
  }
  janela.on('did-start-navigation', (detalhes) => {
    if (detalhes.isMainFrame && !detalhes.isSameDocument) soltar()
  })
  janela.on('render-process-gone', soltar)
  janela.once('destroyed', soltar)
}

export function registrarTerminais(): void {
  ipcMain.handle(CANAIS.sincronizar, (evento, espacoId: unknown, lista: unknown, ligacoes: unknown) => {
    if (typeof espacoId !== 'string' || !Array.isArray(lista) || !Array.isArray(ligacoes)) throw new Error('sincronização inválida')
    exigirDono(evento, espacoId)
    const especs = lista.filter(especValida)
    const ids = new Set(especs.map((e) => e.id))
    for (const espec of especs) {
      const s = sessoes.get(espec.id)
      // o mesmo id em outro espaço (não deveria acontecer): não mexe no de lá
      if (s && s.espacoId !== espacoId) continue
      if (s) {
        if (s.fim) clearTimeout(s.fim)
        s.fim = null
        s.espec = { ...espec, sessao: espec.sessao ?? s.espec.sessao }
      } else if (sessoes.size < MAX_TERMINAIS) {
        criarSessao(espacoId, espec)
      }
    }
    for (const s of sessoes.values()) {
      if (s.espacoId === espacoId && !ids.has(s.id) && !s.fim) s.fim = setTimeout(() => encerrar(s.id), FOLGA_AO_APAGAR)
    }
    cordas.set(
      espacoId,
      ligacoes.filter((c): c is [string, string] => Array.isArray(c) && c.length === 2 && c.every((x) => typeof x === 'string'))
    )
    const resposta: Record<string, string> = {}
    for (const id of ids) {
      const sessao = descobertas.get(id)
      if (sessao) resposta[id] = sessao
      descobertas.delete(id)
    }
    return resposta
  })

  ipcMain.handle(CANAIS.ligar, async (evento, id: unknown): Promise<RetratoTerminal | null> => {
    const s = daJanelaDona(evento, id)
    if (!s) return null
    const janela = evento.sender
    vigiar(janela)
    s.vistas.delete(janela)
    s.chegando.set(janela, [])
    // o retrato sai depois que o espelho processou tudo o que já chegou; o que chegar depois vai na fila
    const retrato = await new Promise<string>((r) => s.espelho.write('', () => r(s.serializar.serialize({ scrollback: 2000 }))))
    const fila = s.chegando.get(janela) ?? []
    s.chegando.delete(janela)
    if (janela.isDestroyed() || sessoes.get(s.id) !== s) return null
    s.vistas.add(janela)
    return { retrato: retrato + fila.join(''), colunas: s.espelho.cols, linhas: s.espelho.rows, saiu: s.saiu }
  })

  ipcMain.on(CANAIS.desligar, (evento, id: unknown) => {
    const s = typeof id === 'string' ? sessoes.get(id) : undefined
    s?.vistas.delete(evento.sender)
    s?.chegando.delete(evento.sender)
  })

  ipcMain.on(CANAIS.escrever, (evento, id: unknown, dados: unknown) => {
    if (typeof dados !== 'string' || dados.length > MAX_BYTES_POR_ESCRITA) return
    daJanelaDona(evento, id)?.processo?.write(dados)
  })

  ipcMain.on(CANAIS.redimensionar, (evento, id: unknown, colunas: unknown, linhas: unknown) => {
    const c = inteiroEntre(colunas, 2, MAX_COLUNAS)
    const l = inteiroEntre(linhas, 1, MAX_LINHAS)
    const s = daJanelaDona(evento, id)
    if (!s || !c || !l || (c === s.espelho.cols && l === s.espelho.rows)) return
    s.processo?.resize(c, l)
    s.espelho.resize(c, l)
  })

  ipcMain.handle(CANAIS.reiniciar, (evento, id: unknown) => {
    const s = daJanelaDona(evento, id)
    if (!s || s.processo) return
    s.espelho.write('\r\n\x1b[2m— reaberto —\x1b[0m\r\n')
    avisarVistas(s, CANAIS.dados, '\r\n\x1b[2m— reaberto —\x1b[0m\r\n')
    iniciarProcesso(s)
  })
}

// ---------- para o `mpro` (comandos.ts) ----------

export const sessaoPorCracha = (cracha: unknown): Sessao | undefined =>
  typeof cracha === 'string' && cracha ? [...sessoes.values()].find((s) => s.processo && s.cracha === cracha) : undefined

export const sessaoPorId = (id: string): Sessao | undefined => sessoes.get(id)

export const sessoesDoEspaco = (espacoId: string): Sessao[] => [...sessoes.values()].filter((s) => s.espacoId === espacoId && !s.fim)

export const cordasDoEspaco = (espacoId: string): Array<[string, string]> => cordas.get(espacoId) ?? []

/**
 * As últimas `linhas` escritas, terminando na última com texto. A área à mostra costuma ter o fim em branco
 * (um terminal recém-aberto só tem o prompt lá em cima): contar de baixo traria só linhas vazias.
 */
export function telaDe(s: Sessao, linhas = 50): Promise<string> {
  return new Promise((r) =>
    s.espelho.write('', () => {
      const buffer = s.espelho.buffer.active
      const texto = (y: number): string => buffer.getLine(y)?.translateToString(true) ?? ''
      let fim = buffer.baseY + s.espelho.rows
      while (fim > 0 && !texto(fim - 1).trim()) fim--
      const saida: string[] = []
      for (let y = Math.max(0, fim - linhas); y < fim; y++) saida.push(texto(y))
      r(saida.join('\n'))
    })
  )
}

export function escreverNoProcesso(s: Sessao, dados: string): void {
  s.processo?.write(dados)
}

/** O app do terminal pediu colagem entre marcas (ESC[200~ … ESC[201~): texto com várias linhas não vira vários Enter. */
export const aceitaColagem = (s: Sessao): boolean => s.espelho.modes.bracketedPasteMode

/** Espera o `sincronizar` da janela criar o processo de um cartão novo. */
export async function esperarSessao(id: string, ms: number): Promise<Sessao | undefined> {
  for (const limite = Date.now() + ms; Date.now() < limite; await new Promise((r) => setTimeout(r, 50))) {
    const s = sessoes.get(id)
    if (s?.processo) return s
  }
  return undefined
}

export const encerrarAgora = encerrar

export function encerrarDoEspaco(espacoId: string): void {
  for (const s of [...sessoes.values()]) if (s.espacoId === espacoId) encerrar(s.id)
  cordas.delete(espacoId)
}

export function quantosTerminais(): number {
  return sessoes.size
}

export function encerrarTodos(): void {
  for (const id of [...sessoes.keys()]) encerrar(id)
}
