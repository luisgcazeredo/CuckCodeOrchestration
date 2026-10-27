import { BrowserWindow, ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { CANAIS_JANELAS, CANAL_AVISO, type AvisoJanelas } from '../shared/api'

// Vários espaços ao mesmo tempo, um por janela. Cada espaço fica aberto em uma janela só: é ela que
// grava o quadro e mexe no git dele. Assim duas janelas nunca sobrescrevem o mesmo espaço.

/** Espaço → janela (id do webContents) que o mostra. */
const dono = new Map<string, number>()
/** Espaço com que cada janela nova começa. */
const inicial = new Map<number, string | null>()

let fabrica: ((espacoId: string | null) => BrowserWindow) | null = null
let listarIds: () => string[] = () => []

/** index.ts entrega como criar uma janela e de onde vem a lista de espaços (evita import circular). */
export function configurarJanelas(criar: (espacoId: string | null) => BrowserWindow, ids: () => string[]): void {
  fabrica = criar
  listarIds = ids
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

/** Cada janela fica sabendo quais espaços estão abertos nas outras. */
function avisarAbertos(): void {
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
