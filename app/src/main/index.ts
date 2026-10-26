import { app, BrowserWindow, Menu, shell } from 'electron'
import { join } from 'node:path'
import { CANAIS_APP } from '../shared/api'
import { registrarDados } from './dados'
import { encerrarTodos, registrarTerminais } from './terminais'
import { rodarAutoteste } from './autoteste'

const autoteste = process.argv.includes('--autoteste')

function abrirNoNavegador(endereco: string): void {
  try {
    const url = new URL(endereco)
    if (url.protocol === 'https:' || url.protocol === 'http:') shell.openExternal(url.href)
  } catch {
    // endereço inválido: ignora
  }
}

function criarJanela(): BrowserWindow {
  const janela = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 640,
    minHeight: 420,
    title: 'Maestri Próprio',
    backgroundColor: '#1E1E1E',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: autoteste ? ['--autoteste'] : []
    }
  })

  janela.once('ready-to-show', () => janela.show())

  // A janela tem acesso a terminais: nunca pode virar uma página de fora. Links vão para o navegador.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    abrirNoNavegador(url)
    return { action: 'deny' }
  })
  janela.webContents.on('will-navigate', (evento, url) => {
    if (url === janela.webContents.getURL()) return
    evento.preventDefault()
    abrirNoNavegador(url)
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    janela.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    janela.loadFile(join(__dirname, '../renderer/index.html'))
  }

  // Fechar: a janela salva o que estiver pendente e avisa; sem resposta em 3 s, fecha assim mesmo.
  let podeFechar = autoteste
  const fecharDeVez = (): void => {
    podeFechar = true
    if (!janela.isDestroyed()) janela.close()
  }
  janela.on('close', (evento) => {
    if (podeFechar) return
    evento.preventDefault()
    janela.webContents.send(CANAIS_APP.vaiFechar)
    setTimeout(fecharDeVez, 3000)
  })
  janela.webContents.ipc.on(CANAIS_APP.podeFechar, fecharDeVez)

  if (autoteste) janela.webContents.once('did-finish-load', () => rodarAutoteste(janela))
  return janela
}

// Sem o menu padrão do Electron: os atalhos dele (zoom da página, recarregar) brigam com os do quadro.
Menu.setApplicationMenu(null)

app.whenReady().then(() => {
  registrarDados()
  registrarTerminais()
  criarJanela()
})

app.on('window-all-closed', () => {
  encerrarTodos()
  app.quit()
})
