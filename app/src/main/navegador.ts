import { ipcMain, webContents, type WebContents } from 'electron'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { Readable, Writable } from 'node:stream'
import { join } from 'node:path'
import { CANAIS_PORTAL, type AvisoPortal, type EntradaPortal, type EstadoPortal, type NavegacaoPortal } from '../shared/api'
import { PASTA_DADOS } from './dados'

// O Chrome do app: um Chrome de verdade, com perfil próprio em ~/.maestri-proprio/navegador (os logins ficam
// lá, separados do Chrome de uso pessoal), aberto pelo app e com as janelas fora da tela. O app fala com ele
// por um pipe (nenhuma porta de rede: outro programa do PC não consegue controlá-lo). Cada cartão de portal é
// uma aba numa janela própria (aba de fundo não desenha), transmitida para o quadro como imagens; mouse e
// teclado do cartão vão para a página pelo mesmo protocolo (CDP). Os agentes vão entrar por aqui, pelo app,
// na integração dos terminais.

const PERFIL = join(PASTA_DADOS, 'navegador')
const FORA_DA_TELA = -24000
const ID_NO = /^[0-9a-f-]{36}$/
const ehWeb = (url: unknown): url is string => typeof url === 'string' && /^https?:\/\//i.test(url) && url.length < 8192

function acharChrome(): string | null {
  const pf = process.env.ProgramFiles ?? 'C:\\Program Files'
  const pf86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'
  const local = process.env.LOCALAPPDATA ?? ''
  const candidatos = [
    join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe')
  ]
  return candidatos.find((c) => existsSync(c)) ?? null
}

// ---------- conexão CDP com o navegador (por pipe: só o app fala com este Chrome) ----------

type Ouvinte = (metodo: string, params: Record<string, unknown>, sessao?: string) => void

/** Tempo máximo de um comando: um Chrome travado não pode prender o app. */
const LIMITE_COMANDO = 15000
/** Com tantos comandos sem resposta, os eventos de mouse e de quadro esperam (o Chrome está atrasado). */
const FILA_MAXIMA = 400

class Conexao {
  private proximo = 0
  private pendentes = new Map<
    number,
    { resolver: (r: Record<string, unknown>) => void; rejeitar: (e: Error) => void; relogio: ReturnType<typeof setTimeout> }
  >()
  private ouvintes = new Set<Ouvinte>()
  private resto = ''
  aberta = true

  constructor(
    private escrita: Writable,
    leitura: Readable,
    aoFechar: () => void
  ) {
    // cada mensagem do Chrome termina com um \0
    leitura.on('data', (pedaco: Buffer) => {
      this.resto += pedaco.toString('utf8')
      let fim: number
      while ((fim = this.resto.indexOf('\0')) >= 0) {
        const texto = this.resto.slice(0, fim)
        this.resto = this.resto.slice(fim + 1)
        this.receber(texto)
      }
    })
    let fechou = false
    const encerrar = (): void => {
      if (fechou) return
      fechou = true
      this.aberta = false
      this.pendentes.forEach((p) => {
        clearTimeout(p.relogio)
        p.rejeitar(new Error('o Chrome do app fechou'))
      })
      this.pendentes.clear()
      aoFechar()
    }
    leitura.on('close', encerrar)
    leitura.on('error', encerrar)
    escrita.on('error', encerrar)
  }

  private receber(texto: string): void {
    const d = JSON.parse(texto) as {
      id?: number
      result?: Record<string, unknown>
      error?: { message: string }
      method?: string
      params?: Record<string, unknown>
      sessionId?: string
    }
    if (d.id !== undefined) {
      const p = this.pendentes.get(d.id)
      if (!p) return
      clearTimeout(p.relogio)
      this.pendentes.delete(d.id)
      if (d.error) p.rejeitar(new Error(d.error.message))
      else p.resolver(d.result ?? {})
    } else if (d.method) {
      this.ouvintes.forEach((o) => o(d.method!, d.params ?? {}, d.sessionId))
    }
  }

  enviar<T = Record<string, unknown>>(metodo: string, params: Record<string, unknown> = {}, sessao?: string): Promise<T> {
    if (!this.aberta) return Promise.reject(new Error('o Chrome do app fechou'))
    const id = ++this.proximo
    return new Promise((resolver, rejeitar) => {
      const relogio = setTimeout(() => {
        this.pendentes.delete(id)
        rejeitar(new Error(`o Chrome do app não respondeu (${metodo})`))
      }, LIMITE_COMANDO)
      this.pendentes.set(id, { resolver: resolver as (r: Record<string, unknown>) => void, rejeitar, relogio })
      this.escrita.write(JSON.stringify({ id, method: metodo, params, sessionId: sessao }) + '\0')
    })
  }

  /** Sem esperar resposta (mouse, confirmação de quadro): erro de aba que já fechou não interessa. */
  disparar(metodo: string, params: Record<string, unknown> = {}, sessao?: string): void {
    if (this.pendentes.size > FILA_MAXIMA) return
    this.enviar(metodo, params, sessao).catch(() => undefined)
  }

  ouvir(o: Ouvinte): void {
    this.ouvintes.add(o)
  }
}

let processo: ChildProcess | null = null
let conexao: Promise<Conexao> | null = null

const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/**
 * Um Chrome com este perfil que ficou aberto de uma vez em que o app caiu: o perfil fica preso nele, e o novo
 * só repassaria o pedido e sairia. Fecha esse que sobrou (o caminho do perfil vai por variável de ambiente).
 */
function fecharSobra(): Promise<void> {
  const comando = [
    `Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'"`,
    `Where-Object { $_.CommandLine -and $_.CommandLine.Contains($env:MP_PERFIL) }`,
    `ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`
  ].join(' | ')
  return new Promise((resolver) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', comando],
      { windowsHide: true, timeout: 15000, env: { ...process.env, MP_PERFIL: `--user-data-dir=${PERFIL}` } },
      () => resolver()
    )
  })
}

function lancar(exe: string): { filho: ChildProcess; escrita: Writable; leitura: Readable } {
  const filho = spawn(
    exe,
    [
      `--user-data-dir=${PERFIL}`,
      // sem porta de rede: o app fala com o Chrome por um canal que só ele tem
      '--remote-debugging-pipe',
      '--no-first-run',
      '--no-default-browser-check',
      // sites (o login do Google, por exemplo) recusam navegador que se diz automatizado
      '--disable-blink-features=AutomationControlled',
      // janela fora da tela continua desenhando (é o que o quadro mostra)
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',
      `--window-position=${FORA_DA_TELA},${FORA_DA_TELA}`,
      '--window-size=1280,800',
      'about:blank'
    ],
    { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] }
  )
  return { filho, escrita: filho.stdio[3] as Writable, leitura: filho.stdio[4] as Readable }
}

/** Liga o Chrome do app e conecta. */
async function conectar(): Promise<Conexao> {
  const exe = acharChrome()
  if (!exe) throw new Error('não achei o Chrome nem o Edge neste PC')
  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    const { filho, escrita, leitura } = lancar(exe)
    processo = filho
    filho.on('exit', () => {
      if (processo === filho) processo = null
    })
    let estabelecida = false
    const c = new Conexao(escrita, leitura, () => {
      // tentativa que não chegou a responder não mexe em nada
      if (!estabelecida) return
      conexao = null
      adotaveis.clear()
      // o Chrome fechou (pelo usuário ou caiu): cada cartão fica sabendo e oferece abrir de novo
      for (const aba of [...abas.values()]) avisar(aba, { tipo: 'fechou', pelaPagina: false })
      abas.clear()
    })
    c.ouvir(aoEvento)
    try {
      await c.enviar('Browser.getVersion')
      await c.enviar('Target.setDiscoverTargets', { discover: true })
      estabelecida = true
      return c
    } catch {
      // não respondeu: quase sempre um Chrome antigo com o mesmo perfil, que ficou aberto
      filho.kill()
      if (tentativa === 1) await fecharSobra()
    }
  }
  throw new Error('o Chrome do app não respondeu')
}

function garantir(): Promise<Conexao> {
  if (!conexao) {
    conexao = conectar()
    conexao.catch(() => (conexao = null))
  }
  return conexao
}

// ---------- abas (uma por cartão) ----------

interface Aba {
  dono: number
  noId: string
  alvo: string
  sessao: string
  janela: number
  tamanho: { largura: number; altura: number; escala: number } | null
  visivel: boolean
  transmitindo: boolean
  naTela: boolean
  estado: EstadoPortal
}

/** `${webContents}:${noId}` → aba. */
const abas = new Map<string, Aba>()
/** Janelas que uma página abriu, esperando virar cartão: alvo → janela (webContents) que pode adotá-la. */
const adotaveis = new Map<string, number>()

const chave = (dono: number, noId: string): string => `${dono}:${noId}`
const abaDaSessao = (sessao?: string): Aba | undefined => [...abas.values()].find((a) => a.sessao === sessao)
const abaDoAlvo = (alvo: string): Aba | undefined => [...abas.values()].find((a) => a.alvo === alvo)

function avisar(aba: Aba, aviso: AvisoPortal): void {
  const destino = webContents.fromId(aba.dono)
  if (destino && !destino.isDestroyed()) destino.send(CANAIS_PORTAL.aviso, aba.noId, aviso)
}

function mudarEstado(aba: Aba, parcial: Partial<EstadoPortal>): void {
  aba.estado = { ...aba.estado, ...parcial }
  avisar(aba, { tipo: 'estado', estado: aba.estado })
}

async function atualizarHistorico(c: Conexao, aba: Aba): Promise<void> {
  try {
    const h = await c.enviar<{ currentIndex: number; entries: unknown[] }>('Page.getNavigationHistory', {}, aba.sessao)
    mudarEstado(aba, { voltar: h.currentIndex > 0, avancar: h.currentIndex < h.entries.length - 1 })
  } catch {
    // a aba fechou no meio
  }
}

/** Liga ou desliga a transmissão conforme o cartão está à mostra (e a janela de verdade não está). */
async function transmitir(c: Conexao, aba: Aba): Promise<void> {
  const deve = aba.visivel && !aba.naTela && aba.tamanho !== null
  if (deve === aba.transmitindo) return
  aba.transmitindo = deve
  if (!deve) return c.disparar('Page.stopScreencast', {}, aba.sessao)
  const { largura, altura, escala } = aba.tamanho!
  c.disparar(
    'Page.startScreencast',
    { format: 'jpeg', quality: 75, maxWidth: Math.round(largura * escala), maxHeight: Math.round(altura * escala) },
    aba.sessao
  )
}

async function aplicarTamanho(c: Conexao, aba: Aba): Promise<void> {
  if (!aba.tamanho || aba.naTela) return
  const { largura, altura, escala } = aba.tamanho
  await c.enviar('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: escala, mobile: false }, aba.sessao)
  // tamanho novo: recomeça a transmissão com o limite novo
  if (aba.transmitindo) {
    aba.transmitindo = false
    c.disparar('Page.stopScreencast', {}, aba.sessao)
  }
  await transmitir(c, aba)
}

/** Põe a janela da aba fora da tela (ou na tela, para o usuário usar o Chrome de verdade). */
async function posicionar(c: Conexao, janela: number, naTela: boolean): Promise<void> {
  const bounds = naTela
    ? { left: 120, top: 80, width: 1280, height: 860, windowState: 'normal' }
    : { left: FORA_DA_TELA, top: FORA_DA_TELA, width: 1280, height: 800, windowState: 'normal' }
  await c.enviar('Browser.setWindowBounds', { windowId: janela, bounds }).catch(() => undefined)
}

/** A janela do app que pediu ainda existe? (pode ter fechado enquanto o Chrome respondia) */
const donoVivo = (dono: number): boolean => {
  const w = webContents.fromId(dono)
  return !!w && !w.isDestroyed()
}

async function ligarAba(c: Conexao, dono: number, noId: string, alvo: string): Promise<Aba> {
  if (!donoVivo(dono)) {
    c.disparar('Target.closeTarget', { targetId: alvo })
    throw new Error('a janela fechou')
  }
  const { sessionId } = await c.enviar<{ sessionId: string }>('Target.attachToTarget', { targetId: alvo, flatten: true })
  const { windowId } = await c.enviar<{ windowId: number }>('Browser.getWindowForTarget', { targetId: alvo })
  await posicionar(c, windowId, false)
  const info = await c.enviar<{ targetInfo: { url: string; title: string } }>('Target.getTargetInfo', { targetId: alvo })
  const aba: Aba = {
    dono,
    noId,
    alvo,
    sessao: sessionId,
    janela: windowId,
    tamanho: null,
    visivel: true,
    transmitindo: false,
    naTela: false,
    estado: { url: info.targetInfo.url, titulo: info.targetInfo.title, carregando: false, voltar: false, avancar: false, naTela: false }
  }
  if (!donoVivo(dono)) {
    c.disparar('Target.closeTarget', { targetId: alvo })
    throw new Error('a janela fechou')
  }
  abas.set(chave(dono, noId), aba)
  await c.enviar('Page.enable', {}, sessionId)
  // a janela fica fora da tela e sem foco: a página precisa achar que está em foco para o cursor de texto aparecer
  await c.enviar('Emulation.setFocusEmulationEnabled', { enabled: true }, sessionId)
  await c.enviar('Runtime.runIfWaitingForDebugger', {}, sessionId).catch(() => undefined)
  avisar(aba, { tipo: 'estado', estado: aba.estado })
  void atualizarHistorico(c, aba)
  return aba
}

function aoEvento(metodo: string, params: Record<string, unknown>, sessao?: string): void {
  const c = conexao
  if (!c) return
  void c.then((cx) => {
    if (metodo === 'Page.screencastFrame') {
      cx.disparar('Page.screencastFrameAck', { sessionId: params.sessionId }, sessao)
      const aba = abaDaSessao(sessao)
      if (aba?.transmitindo) avisar(aba, { tipo: 'quadro', jpeg: params.data as string })
      return
    }
    if (metodo === 'Target.targetInfoChanged') {
      const info = params.targetInfo as { targetId: string; url: string; title: string }
      const aba = abaDoAlvo(info.targetId)
      // endereço que não é página web (erro do Chrome, about:) não vira o endereço salvo do cartão
      const url = ehWeb(info.url) ? info.url : aba?.estado.url
      if (aba && url && (aba.estado.url !== url || aba.estado.titulo !== info.title)) {
        mudarEstado(aba, { url, titulo: info.title })
        void atualizarHistorico(cx, aba)
      }
      return
    }
    if (metodo === 'Target.targetCreated') return void adotarJanelaNova(cx, params.targetInfo as { targetId: string; openerId?: string; url: string; type: string })
    if (metodo === 'Target.targetDestroyed') {
      const aba = abaDoAlvo(params.targetId as string)
      if (aba) {
        abas.delete(chave(aba.dono, aba.noId))
        avisar(aba, { tipo: 'fechou', pelaPagina: true })
      }
      adotaveis.delete(params.targetId as string)
      return
    }
    const aba = abaDaSessao(sessao)
    if (!aba) return
    if (metodo === 'Page.frameStartedLoading' || metodo === 'Page.frameStoppedLoading') {
      // só o quadro principal (o id do quadro principal é o da aba)
      if (params.frameId !== aba.alvo) return
      mudarEstado(aba, { carregando: metodo === 'Page.frameStartedLoading' })
      // o Chrome não avisa quando só o título muda: lê ao terminar de carregar
      if (metodo === 'Page.frameStoppedLoading') {
        void cx
          .enviar<{ targetInfo: { title: string } }>('Target.getTargetInfo', { targetId: aba.alvo })
          .then((r) => r.targetInfo.title !== aba.estado.titulo && mudarEstado(aba, { titulo: r.targetInfo.title }))
          .catch(() => undefined)
      }
    } else if (metodo === 'Page.navigatedWithinDocument' && params.frameId === aba.alvo) {
      // endereço que muda sem recarregar (sites de uma página só, âncoras)
      if (ehWeb(params.url) && params.url !== aba.estado.url) mudarEstado(aba, { url: params.url })
      void atualizarHistorico(cx, aba)
    } else if (metodo === 'Page.javascriptDialogOpening') {
      avisar(aba, {
        tipo: 'dialogo',
        tipoDialogo: String(params.type),
        mensagem: String(params.message ?? ''),
        padrao: String(params.defaultPrompt ?? '')
      })
    }
  })
}

/**
 * A página de um cartão abriu outra janela. Janela própria (pop-up de login): fica fora da tela e vira um
 * cartão novo ao lado. Aba nova na mesma janela esconderia a página do cartão (aba de fundo não desenha):
 * fecha e reabre o endereço numa janela própria.
 */
async function adotarJanelaNova(c: Conexao, info: { targetId: string; openerId?: string; url: string; type: string }): Promise<void> {
  if (info.type !== 'page' || !info.openerId) return
  const origem = abaDoAlvo(info.openerId)
  if (!origem) return
  // depois de cada espera: o cartão de origem continua aí? se não, a janela nova fecha (não sobra no Chrome)
  const origemViva = (): boolean => abas.get(chave(origem.dono, origem.noId)) === origem && donoVivo(origem.dono)
  try {
    const { windowId } = await c.enviar<{ windowId: number }>('Browser.getWindowForTarget', { targetId: info.targetId })
    let alvo = info.targetId
    if (windowId === origem.janela) {
      // o endereço só aparece depois que a aba nova começa a carregar
      let url = info.url
      for (let i = 0; i < 20 && !ehWeb(url); i++) {
        await esperar(100)
        url = (await c.enviar<{ targetInfo: { url: string } }>('Target.getTargetInfo', { targetId: info.targetId })).targetInfo.url
      }
      await c.enviar('Target.closeTarget', { targetId: info.targetId })
      await c.enviar('Target.activateTarget', { targetId: origem.alvo }).catch(() => undefined)
      if (!ehWeb(url) || !origemViva()) return
      alvo = (await c.enviar<{ targetId: string }>('Target.createTarget', { url, newWindow: true, background: true })).targetId
    } else {
      await posicionar(c, windowId, false)
    }
    // espera o endereço de verdade (janela de login costuma nascer em branco e ir para o site logo depois)
    let url = ''
    for (let i = 0; i < 30 && !ehWeb(url); i++) {
      if (i) await esperar(100)
      url = (await c.enviar<{ targetInfo: { url: string } }>('Target.getTargetInfo', { targetId: alvo })).targetInfo.url
    }
    if (!origemViva() || !ehWeb(url)) return c.disparar('Target.closeTarget', { targetId: alvo })
    adotaveis.set(alvo, origem.dono)
    avisar(origem, { tipo: 'janelaNova', alvo, url })
  } catch {
    // a janela nova fechou antes de ser adotada
  }
}

/** Fecha as abas de uma janela do app (ela fechou). */
export function soltarAbasDaJanela(dono: number): void {
  const c = conexao
  for (const [alvo, quem] of [...adotaveis]) {
    if (quem !== dono) continue
    adotaveis.delete(alvo)
    void c?.then((cx) => cx.disparar('Target.closeTarget', { targetId: alvo }))
  }
  for (const aba of [...abas.values()]) {
    if (aba.dono !== dono) continue
    abas.delete(chave(aba.dono, aba.noId))
    void c?.then((cx) => cx.disparar('Target.closeTarget', { targetId: aba.alvo }))
  }
}

/** Ao sair do app: fecha o Chrome do app direito (sem o aviso de "não foi fechado corretamente"). */
export async function encerrarNavegador(): Promise<void> {
  if (!conexao || !processo) return
  try {
    const c = await conexao
    await Promise.race([c.enviar('Browser.close'), esperar(1500)])
  } catch {
    processo?.kill()
  }
}

const VIRTUAIS: Record<string, number> = { Enter: 13, Tab: 9, Backspace: 8, Escape: 27, Delete: 46 }

function entrar(c: Conexao, aba: Aba, e: EntradaPortal): void {
  if (e.tipo === 'mouse') {
    c.disparar(
      'Input.dispatchMouseEvent',
      { type: e.evento, x: e.x, y: e.y, button: e.botao, buttons: e.botoes, clickCount: e.cliques, modifiers: e.modificadores },
      aba.sessao
    )
  } else if (e.tipo === 'roda') {
    c.disparar('Input.dispatchMouseEvent', { type: 'mouseWheel', x: e.x, y: e.y, deltaX: e.dx, deltaY: e.dy, modifiers: e.modificadores }, aba.sessao)
  } else {
    c.disparar(
      'Input.dispatchKeyEvent',
      {
        type: e.evento,
        key: e.key,
        code: e.code,
        text: e.texto,
        unmodifiedText: e.texto,
        windowsVirtualKeyCode: e.codigoTecla || VIRTUAIS[e.key] || 0,
        nativeVirtualKeyCode: e.codigoTecla || VIRTUAIS[e.key] || 0,
        modifiers: e.modificadores,
        commands: e.comandos ?? []
      },
      aba.sessao
    )
  }
}

/** Valida o que veio da janela: tipos certos e números finitos, nada além. */
function entradaValida(e: EntradaPortal): boolean {
  if (!e || typeof e !== 'object') return false
  const finitos = (...v: unknown[]): boolean => v.every((n) => typeof n === 'number' && Number.isFinite(n))
  if (e.tipo === 'mouse') {
    return ['mousePressed', 'mouseReleased', 'mouseMoved'].includes(e.evento) && ['none', 'left', 'middle', 'right'].includes(e.botao) &&
      finitos(e.x, e.y, e.botoes, e.cliques, e.modificadores)
  }
  if (e.tipo === 'roda') return finitos(e.x, e.y, e.dx, e.dy, e.modificadores)
  if (e.tipo === 'tecla') {
    return ['keyDown', 'rawKeyDown', 'keyUp'].includes(e.evento) && typeof e.key === 'string' && e.key.length < 40 &&
      typeof e.code === 'string' && e.code.length < 40 && (e.texto === undefined || (typeof e.texto === 'string' && e.texto.length < 8)) &&
      finitos(e.codigoTecla, e.modificadores) &&
      (e.comandos === undefined || (Array.isArray(e.comandos) && e.comandos.every((x) => ['copy', 'cut', 'paste', 'selectAll', 'undo', 'redo'].includes(x))))
  }
  return false
}

export function registrarNavegador(): void {
  const comAba = (dono: WebContents, noId: unknown, fazer: (c: Conexao, aba: Aba) => void | Promise<void>): void => {
    if (typeof noId !== 'string' || !ID_NO.test(noId)) return
    const aba = abas.get(chave(dono.id, noId))
    if (!aba || !conexao) return
    void conexao.then((c) => fazer(c, aba)).catch(() => undefined)
  }

  ipcMain.handle(CANAIS_PORTAL.disponivel, () => acharChrome() !== null)

  // dois pedidos seguidos para o mesmo cartão (ele remontou) esperam o primeiro: nunca duas abas para um cartão
  const abrindo = new Map<string, Promise<boolean>>()
  ipcMain.handle(CANAIS_PORTAL.abrir, (evento, noId: string, url: string, alvoPedido?: string): Promise<boolean> => {
    if (typeof noId !== 'string' || !ID_NO.test(noId)) return Promise.resolve(false)
    const k = chave(evento.sender.id, noId)
    const antes = abrindo.get(k) ?? Promise.resolve(true)
    const agora = antes.catch(() => false).then(() => abrir(evento.sender.id, noId, url, alvoPedido))
    abrindo.set(k, agora)
    void agora.finally(() => abrindo.get(k) === agora && abrindo.delete(k)).catch(() => undefined)
    return agora
  })

  async function abrir(dono: number, noId: string, url: string, alvoPedido?: string): Promise<boolean> {
    const c = await garantir()
    const existente = abas.get(chave(dono, noId))
    if (existente) {
      // a janela recarregou ou o cartão voltou à tela: a aba continua a mesma
      avisar(existente, { tipo: 'estado', estado: existente.estado })
      existente.visivel = true
      await transmitir(c, existente)
      return true
    }
    let alvo: string
    if (typeof alvoPedido === 'string' && adotaveis.get(alvoPedido) === dono) {
      adotaveis.delete(alvoPedido)
      alvo = alvoPedido
    } else {
      if (!ehWeb(url)) return false
      alvo = (await c.enviar<{ targetId: string }>('Target.createTarget', { url, newWindow: true, background: true })).targetId
    }
    await ligarAba(c, dono, noId, alvo)
    return true
  }

  ipcMain.on(CANAIS_PORTAL.tamanho, (evento, noId, largura, altura, escala) => {
    if (![largura, altura, escala].every((n) => typeof n === 'number' && Number.isFinite(n))) return
    comAba(evento.sender, noId, (c, aba) => {
      aba.tamanho = {
        largura: Math.round(Math.min(4000, Math.max(100, largura))),
        altura: Math.round(Math.min(4000, Math.max(80, altura))),
        escala: Math.min(3, Math.max(0.5, escala))
      }
      return aplicarTamanho(c, aba)
    })
  })

  ipcMain.on(CANAIS_PORTAL.visivel, (evento, noId, sim) =>
    comAba(evento.sender, noId, (c, aba) => {
      aba.visivel = sim === true
      return transmitir(c, aba)
    })
  )

  ipcMain.on(CANAIS_PORTAL.entrada, (evento, noId, entrada: EntradaPortal) => {
    if (!entradaValida(entrada)) return
    comAba(evento.sender, noId, (c, aba) => entrar(c, aba, entrada))
  })

  ipcMain.on(CANAIS_PORTAL.navegar, (evento, noId, nav: NavegacaoPortal) =>
    comAba(evento.sender, noId, async (c, aba) => {
      if (nav?.tipo === 'ir' && ehWeb(nav.url)) await c.enviar('Page.navigate', { url: nav.url }, aba.sessao)
      else if (nav?.tipo === 'recarregar') await c.enviar('Page.reload', {}, aba.sessao)
      else if (nav?.tipo === 'voltar' || nav?.tipo === 'avancar') {
        const h = await c.enviar<{ currentIndex: number; entries: Array<{ id: number }> }>('Page.getNavigationHistory', {}, aba.sessao)
        const destino = h.entries[h.currentIndex + (nav.tipo === 'voltar' ? -1 : 1)]
        if (destino) await c.enviar('Page.navigateToHistoryEntry', { entryId: destino.id }, aba.sessao)
      }
    })
  )

  ipcMain.on(CANAIS_PORTAL.responderDialogo, (evento, noId, aceitar, texto) =>
    comAba(evento.sender, noId, (c, aba) =>
      c.disparar('Page.handleJavaScriptDialog', { accept: aceitar === true, promptText: typeof texto === 'string' ? texto.slice(0, 2000) : undefined }, aba.sessao)
    )
  )

  // a janela de verdade vem para a tela (para logar com passkey, usar extensão...) e volta para o quadro
  ipcMain.on(CANAIS_PORTAL.alternarJanela, (evento, noId) =>
    comAba(evento.sender, noId, async (c, aba) => {
      aba.naTela = !aba.naTela
      if (aba.naTela) {
        await c.enviar('Emulation.clearDeviceMetricsOverride', {}, aba.sessao)
        await transmitir(c, aba)
        await posicionar(c, aba.janela, true)
        await c.enviar('Target.activateTarget', { targetId: aba.alvo }).catch(() => undefined)
      } else {
        await posicionar(c, aba.janela, false)
        await aplicarTamanho(c, aba)
      }
      mudarEstado(aba, { naTela: aba.naTela })
    })
  )

  ipcMain.on(CANAIS_PORTAL.fechar, (evento, noId) =>
    comAba(evento.sender, noId, (c, aba) => {
      abas.delete(chave(aba.dono, aba.noId))
      c.disparar('Target.closeTarget', { targetId: aba.alvo })
    })
  )
}
