import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import * as pty from 'node-pty'
import { CANAIS, type OpcoesTerminal } from '../shared/api'

// Cada terminal do quadro é um processo de verdade (ConPTY no Windows), dono de uma janela só.
const terminais = new Map<string, { processo: pty.IPty; dono: WebContents }>()
const janelasVigiadas = new WeakSet<WebContents>()

const MAX_TERMINAIS_POR_JANELA = 64
const MAX_COLUNAS = 1000
const MAX_LINHAS = 500
const MAX_BYTES_POR_ESCRITA = 1024 * 1024

function shellPadrao(): string {
  return process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash'
}

function argumentosPadrao(): string[] {
  return process.platform === 'win32' ? ['-NoLogo'] : []
}

function inteiroEntre(valor: unknown, minimo: number, maximo: number): number | null {
  return Number.isInteger(valor) && (valor as number) >= minimo && (valor as number) <= maximo ? (valor as number) : null
}

function pastaValida(pasta: unknown): string {
  if (typeof pasta === 'string' && pasta && existsSync(pasta) && statSync(pasta).isDirectory()) return pasta
  return homedir()
}

/** Só quem criou o terminal mexe nele. */
function doRemetente(evento: IpcMainEvent | IpcMainInvokeEvent, id: unknown) {
  const terminal = typeof id === 'string' ? terminais.get(id) : undefined
  return terminal && terminal.dono === evento.sender ? terminal : undefined
}

/** Um vigia por janela: fechou, recarregou ou o renderer caiu, os terminais dela morrem juntos. */
function vigiar(dono: WebContents): void {
  if (janelasVigiadas.has(dono)) return
  janelasVigiadas.add(dono)
  const encerrarDaJanela = (): void => {
    for (const [id, terminal] of terminais) if (terminal.dono === dono) encerrar(id)
  }
  dono.on('did-start-navigation', (detalhes) => {
    if (detalhes.isMainFrame && !detalhes.isSameDocument) encerrarDaJanela()
  })
  dono.on('render-process-gone', encerrarDaJanela)
  dono.once('destroyed', encerrarDaJanela)
}

export function registrarTerminais(): void {
  ipcMain.handle(CANAIS.criar, (evento, opcoes: OpcoesTerminal) => {
    const colunas = inteiroEntre(opcoes?.colunas, 1, MAX_COLUNAS)
    const linhas = inteiroEntre(opcoes?.linhas, 1, MAX_LINHAS)
    if (!colunas || !linhas) throw new Error('tamanho de terminal inválido')
    const dono = evento.sender
    const daJanela = [...terminais.values()].filter((t) => t.dono === dono).length
    if (daJanela >= MAX_TERMINAIS_POR_JANELA) throw new Error('limite de terminais nesta janela')

    const id = randomUUID()
    const processo = pty.spawn(shellPadrao(), argumentosPadrao(), {
      name: 'xterm-256color',
      cols: colunas,
      rows: linhas,
      cwd: pastaValida(opcoes?.pasta),
      env: { ...process.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>,
      useConpty: true
    })
    terminais.set(id, { processo, dono })
    vigiar(dono)

    processo.onData((dados) => {
      if (!dono.isDestroyed()) dono.send(CANAIS.dados, id, dados)
    })
    processo.onExit(({ exitCode }) => {
      terminais.delete(id)
      if (!dono.isDestroyed()) dono.send(CANAIS.saida, id, exitCode)
    })
    return id
  })

  ipcMain.on(CANAIS.escrever, (evento, id: unknown, dados: unknown) => {
    if (typeof dados !== 'string' || dados.length > MAX_BYTES_POR_ESCRITA) return
    doRemetente(evento, id)?.processo.write(dados)
  })

  ipcMain.on(CANAIS.redimensionar, (evento, id: unknown, colunas: unknown, linhas: unknown) => {
    const c = inteiroEntre(colunas, 1, MAX_COLUNAS)
    const l = inteiroEntre(linhas, 1, MAX_LINHAS)
    if (c && l) doRemetente(evento, id)?.processo.resize(c, l)
  })

  ipcMain.on(CANAIS.encerrar, (evento, id: unknown) => {
    if (doRemetente(evento, id)) encerrar(id as string)
  })
}

function encerrar(id: string): void {
  const terminal = terminais.get(id)
  if (!terminal) return
  terminais.delete(id)
  try {
    terminal.processo.kill()
  } catch {
    // já tinha saído
  }
}

export function quantosTerminais(): number {
  return terminais.size
}

export function encerrarTodos(): void {
  for (const id of [...terminais.keys()]) encerrar(id)
}
