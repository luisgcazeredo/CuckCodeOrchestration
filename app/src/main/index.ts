import { app, BrowserWindow, dialog, Menu, session, shell } from 'electron'
import { join } from 'node:path'
import { CANAIS_APP } from '../shared/api'
import { registrarAndares } from './andares'
import { registrarArea, registrarEsquemaImagem, servirImagens } from './area'
import { registrarDados } from './dados'
import { encerrarTodos, registrarTerminais } from './terminais'
import { rodarAutoteste } from './autoteste'

const autoteste = process.argv.includes('--autoteste')
// No autoteste a janela pode ficar atrás de outras; sem isto o Windows para de desenhá-la e o print sai velho.
if (autoteste) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
const ehWeb = (endereco: string): boolean => {
  try {
    return ['https:', 'http:'].includes(new URL(endereco).protocol)
  } catch {
    return false
  }
}

function abrirNoNavegador(endereco: string): void {
  if (ehWeb(endereco)) shell.openExternal(new URL(endereco).href)
}

/**
 * Pede à janela que salve o que estiver pendente. `true`: gravou (ou a janela não respondeu em 5 s,
 * travada, e não há o que esperar); `false`: tentou e a gravação falhou.
 */
function pedirSalvamento(janela: BrowserWindow): Promise<boolean> {
  return new Promise((resolver) => {
    const pronto = (_evento: unknown, gravou?: boolean): void => {
      clearTimeout(limite)
      janela.webContents.ipc.removeListener(CANAIS_APP.podeFechar, pronto)
      resolver(gravou !== false)
    }
    const limite = setTimeout(() => pronto(null, true), 5000)
    janela.webContents.ipc.on(CANAIS_APP.podeFechar, pronto)
    janela.webContents.send(CANAIS_APP.vaiFechar)
  })
}

function criarJanela(): BrowserWindow {
  const janela = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 640,
    minHeight: 420,
    title: 'Maestri Próprio',
    // instalado, o ícone vem do próprio .exe
    icon: app.isPackaged ? undefined : join(__dirname, '../../build/icon.png'),
    backgroundColor: '#1E1E1E',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // portais (navegador no quadro); cada um é conferido em `will-attach-webview`
      webviewTag: true,
      backgroundThrottling: !autoteste,
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

  // Portal só abre site (http/https), sem preload e sem Node, isolado do app.
  janela.webContents.on('will-attach-webview', (evento, preferencias, parametros) => {
    delete preferencias.preload
    preferencias.nodeIntegration = false
    preferencias.nodeIntegrationInSubFrames = false
    preferencias.contextIsolation = true
    preferencias.sandbox = true
    if (!ehWeb(parametros.src) || parametros.partition !== 'persist:portal') evento.preventDefault()
  })

  // Fechar: a janela salva o que estiver pendente e só então fecha; se não conseguir salvar, pergunta.
  let podeFechar = autoteste
  let fechando = false
  async function tentarFechar(): Promise<void> {
    if (!(await pedirSalvamento(janela))) {
      const { response } = await dialog.showMessageBox(janela, {
        type: 'warning',
        title: 'Maestri Próprio',
        message: 'Não consegui salvar as últimas mudanças.',
        detail: 'Se fechar agora, o que mudou desde o último salvamento se perde.',
        buttons: ['Tentar de novo', 'Fechar sem salvar', 'Cancelar'],
        defaultId: 0,
        cancelId: 2
      })
      if (response === 0) return tentarFechar()
      if (response === 2) return
    }
    podeFechar = true
    if (!janela.isDestroyed()) janela.close()
  }
  janela.on('close', (evento) => {
    if (podeFechar) return
    evento.preventDefault()
    if (fechando) return
    fechando = true
    void tentarFechar().finally(() => (fechando = false))
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    janela.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    janela.loadFile(join(__dirname, '../renderer/index.html'))
  }

  if (autoteste) janela.webContents.once('did-finish-load', () => rodarAutoteste(janela, pedirSalvamento))
  return janela
}

// Dentro do portal: janelas novas vão para o navegador do sistema; o site não sai de http/https.
app.on('web-contents-created', (_evento, conteudo) => {
  if (conteudo.getType() !== 'webview') return
  conteudo.setWindowOpenHandler(({ url }) => {
    abrirNoNavegador(url)
    return { action: 'deny' }
  })
  conteudo.on('will-navigate', (evento, url) => {
    if (!ehWeb(url)) evento.preventDefault()
  })
})

// antes de o app ficar pronto: o esquema das imagens do quadro precisa ser declarado cedo
registrarEsquemaImagem()

// Sem o menu padrão do Electron: os atalhos dele (zoom da página, recarregar) brigam com os do quadro.
Menu.setApplicationMenu(null)

// Uma janela só: abrir o atalho de novo traz a que já está aberta.
if (!autoteste && !app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    const janela = BrowserWindow.getAllWindows()[0]
    if (janela) {
      if (janela.isMinimized()) janela.restore()
      janela.focus()
    }
  })

  app.whenReady().then(() => {
    // o portal se apresenta como Chrome comum: com "Electron" no nome, sites como o login do Google recusam
    const portal = session.fromPartition('persist:portal')
    portal.setUserAgent(portal.getUserAgent().replace(/ (Electron|maestri-proprio|Maestri ?Proprio)\/\S+/gi, ''))
    registrarDados()
    registrarAndares()
    registrarArea()
    servirImagens()
    registrarTerminais()
    criarJanela()
  })
}

app.on('window-all-closed', () => {
  encerrarTodos()
  app.quit()
})
