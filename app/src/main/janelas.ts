import { BrowserWindow, ipcMain, type IpcMainInvokeEvent, type Rectangle, type WebContents } from 'electron'
import { CANAIS_JANELAS, CANAL_AVISO, type AvisoJanelas } from '../shared/api'
import type { JanelaSalva, Sessao } from '../shared/janelas'

// Vários espaços ao mesmo tempo, um por janela. Cada espaço fica aberto em uma janela só: é ela que
// grava o quadro e mexe no git dele. Assim duas janelas nunca sobrescrevem o mesmo espaço.

/** Espaço → janela (id do webContents) que o mostra. */
const dono = new Map<string, number>()
/** Espaço com que cada janela nova começa. */
const inicial = new Map<number, string | null>()

type Fabrica = (espacoId: string | null, caixa?: Partial<Rectangle> & { maximizada?: boolean }) => BrowserWindow

let fabrica: Fabrica | null = null
let listarIds: () => string[] = () => []
let salvarSessao: (sessao: Sessao) => void = () => {}

/** index.ts entrega como criar uma janela, de onde vem a lista de espaços e como gravar (evita import circular). */
export function configurarJanelas(criar: Fabrica, ids: () => string[], gravar: (sessao: Sessao) => void): void {
  fabrica = criar
  listarIds = ids
  salvarSessao = gravar
}

// ------------------------------------------------------------------ a sessão

/**
 * Quais janelas estavam abertas, para reabrir todas da próxima vez. A lista é gravada o tempo todo, e
 * não só ao sair: desligar o PC no botão também tem que deixar um arquivo bom.
 *
 * O detalhe que faz isto funcionar é a **carência**: fechar uma janela não a tira da lista na hora, só
 * alguns segundos depois. No Windows o app morre quando a última janela fecha, então fechar três janelas
 * seguidas para encerrar o dia é indistinguível de "quis ficar só com uma" — e a carência resolve isso
 * sem adivinhação: se o app sobreviver àqueles segundos, a janela realmente saiu; se não sobreviver, ela
 * fazia parte do que estava aberto ao fim.
 */
const CARENCIA_AO_FECHAR = 8000
const ESPERA_PARA_GRAVAR = 500

/** Ordem de abertura (não a do `Map`, que muda ao reinserir): é ela que a próxima sessão repete. */
const sessao = new Map<number, JanelaSalva>()
let gravacaoAgendada: NodeJS.Timeout | null = null

function agendarGravacao(): void {
  if (gravacaoAgendada) clearTimeout(gravacaoAgendada)
  gravacaoAgendada = setTimeout(() => {
    gravacaoAgendada = null
    salvarSessao({ versao: 1, janelas: [...sessao.values()] })
  }, ESPERA_PARA_GRAVAR)
}

/** Grava sem esperar o adiamento: ao sair não há "daqui a meio segundo". */
export function gravarSessaoAgora(): void {
  if (gravacaoAgendada) clearTimeout(gravacaoAgendada)
  gravacaoAgendada = null
  salvarSessao({ versao: 1, janelas: [...sessao.values()] })
}

const espacoDaJanela = (idConteudo: number): string | null =>
  [...dono.entries()].find(([, janela]) => janela === idConteudo)?.[0] ?? null

/** Guarda onde a janela está agora. Usa o tamanho "normal": maximizada, o que importa é para onde ela volta. */
function anotar(janela: BrowserWindow): void {
  if (janela.isDestroyed()) return
  const id = janela.webContents.id
  const caixa = janela.getNormalBounds()
  sessao.set(id, {
    espacoId: espacoDaJanela(id),
    x: caixa.x,
    y: caixa.y,
    largura: caixa.width,
    altura: caixa.height,
    maximizada: janela.isMaximized()
  })
  agendarGravacao()
}

function anotarTodas(): void {
  for (const j of BrowserWindow.getAllWindows()) if (!j.isDestroyed()) anotar(j)
}

/** index.ts chama para cada janela criada: daqui em diante ela entra na sessão. */
export function acompanharJanela(janela: BrowserWindow): void {
  const id = janela.webContents.id
  anotar(janela)
  janela.on('move', () => anotar(janela))
  janela.on('resize', () => anotar(janela))
  janela.on('maximize', () => anotar(janela))
  janela.on('unmaximize', () => anotar(janela))
  janela.on('closed', () => {
    setTimeout(() => {
      sessao.delete(id)
      agendarGravacao()
    }, CARENCIA_AO_FECHAR).unref?.()
  })
}

/** Reabre as janelas da sessão passada, cada uma já dona do espaço dela. */
export function reabrirJanelas(lista: JanelaSalva[]): void {
  for (const j of lista) {
    const janela = fabrica?.(j.espacoId, { x: j.x, y: j.y, width: j.largura, height: j.altura, maximizada: j.maximizada })
    if (janela && j.espacoId) {
      dono.set(j.espacoId, janela.webContents.id)
    }
  }
  if (lista.length > 1) avisarAbertos()
}

const janelaDe = (id: number): BrowserWindow | undefined =>
  BrowserWindow.getAllWindows().find((j) => !j.isDestroyed() && j.webContents.id === id)

function trazer(janela: BrowserWindow): void {
  if (janela.isMinimized()) janela.restore()
  janela.focus()
}

export function avisar(conteudo: WebContents, aviso: AvisoJanelas): void {
  if (!conteudo.isDestroyed()) conteudo.send(CANAL_AVISO, aviso)
}

/** Manda o aviso para todas as janelas, menos `exceto`. */
export function avisarTodas(aviso: AvisoJanelas, exceto?: WebContents): void {
  for (const j of BrowserWindow.getAllWindows()) if (!j.isDestroyed() && j.webContents !== exceto) avisar(j.webContents, aviso)
}

/** Cada janela fica sabendo quais espaços estão abertos nas outras — e a sessão anota quem mostra o quê. */
function avisarAbertos(): void {
  anotarTodas()
  for (const j of BrowserWindow.getAllWindows()) {
    if (j.isDestroyed()) continue
    const ids = [...dono.entries()].filter(([, janela]) => janela !== j.webContents.id).map(([espaco]) => espaco)
    avisar(j.webContents, { tipo: 'abertos', ids })
  }
}

export function donoDe(espacoId: string): number | undefined {
  return dono.get(espacoId)
}

/** Para gravar ou mexer no git de um espaço, a janela precisa ser a dona dele. */
export function exigirDono(evento: IpcMainInvokeEvent, espacoId: string): void {
  if (dono.get(espacoId) !== evento.sender.id) throw new Error('este espaço está aberto em outra janela')
}

/** Solta tudo o que a janela tinha (ela fechou). */
export function soltarJanela(idConteudo: number): void {
  inicial.delete(idConteudo)
  let mudou = false
  for (const [espaco, janela] of dono) {
    if (janela === idConteudo) {
      dono.delete(espaco)
      mudou = true
    }
  }
  if (mudou) avisarAbertos()
}

/** Espaço apagado: ninguém mais é dono dele. */
export function esquecerEspaco(espacoId: string): void {
  dono.delete(espacoId)
}

export function lembrarInicial(idConteudo: number, espacoId: string | null): void {
  inicial.set(idConteudo, espacoId)
}

/** Janela nova: traz a que já mostra o espaço pedido, ou cria uma com ele (ou com o primeiro espaço livre). */
export function abrirJanela(espacoId: string | null): BrowserWindow | null {
  if (espacoId) {
    const existente = dono.has(espacoId) ? janelaDe(dono.get(espacoId)!) : undefined
    if (existente) {
      trazer(existente)
      return existente
    }
  }
  const livre = espacoId ?? listarIds().find((id) => !dono.has(id)) ?? null
  const janela = fabrica?.(livre) ?? null
  // já reservado para a janela nova: várias "Nova janela" seguidas não pegam o mesmo espaço
  if (janela && livre) {
    dono.set(livre, janela.webContents.id)
    avisarAbertos()
  }
  return janela
}

export function registrarJanelas(): void {
  ipcMain.handle(CANAIS_JANELAS.reservar, (evento, espacoId: string): boolean => {
    if (typeof espacoId !== 'string') return false
    const atual = dono.get(espacoId)
    if (atual !== undefined && atual !== evento.sender.id) {
      const outra = janelaDe(atual)
      if (outra) {
        trazer(outra)
        return false
      }
    }
    // o espaço de antes continua desta janela até o novo carregar (ela ainda pode precisar salvá-lo): quem solta é `soltar`
    dono.set(espacoId, evento.sender.id)
    avisarAbertos()
    return true
  })

  ipcMain.handle(CANAIS_JANELAS.soltar, (evento, espacoId: string) => {
    if (dono.get(espacoId) !== evento.sender.id) return
    dono.delete(espacoId)
    avisarAbertos()
  })

  ipcMain.handle(CANAIS_JANELAS.nova, (_evento, espacoId: string | null) => {
    abrirJanela(typeof espacoId === 'string' ? espacoId : null)
  })

  ipcMain.handle(CANAIS_JANELAS.inicio, (evento) => {
    // recarregou a página: continua com o espaço que já era seu; janela nova: o que pediram para ela
    const meu = [...dono.entries()].find(([, janela]) => janela === evento.sender.id)?.[0]
    return {
      espacoId: meu ?? inicial.get(evento.sender.id) ?? null,
      abertosEmOutras: [...dono.entries()].filter(([, janela]) => janela !== evento.sender.id).map(([espaco]) => espaco)
    }
  })
}
