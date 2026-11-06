import { app, BrowserWindow, dialog, Menu, screen, session, shell, type Rectangle } from 'electron'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CANAIS_APP } from '../shared/api'
import { registrarAndares } from './andares'
import { pararRotinas, registrarRotinas } from './rotinas'
import { registrarArea, registrarEsquemaImagem, servirImagens } from './area'
import { registrarCodigo } from './codigo'
import { registrarComandos } from './comandos'
import { gravarSessaoDeJanelas, idsDosEspacos, lerSessaoDeJanelas, quandoApagarEspaco, registrarDados } from './dados'
import { encerrarNavegador, registrarNavegador, soltarAbasDaJanela } from './navegador'
import { acompanharJanela, configurarJanelas, gravarSessaoAgora, lembrarInicial, reabrirJanelas, registrarJanelas, soltarJanela } from './janelas'
import { janelasParaAbrir } from '../shared/janelas'
import { encerrarDoEspaco, encerrarTodos, registrarTerminais } from './terminais'
import { rodarAutoteste } from './autoteste'
import { rodarMedicao } from './medir'

/**
 * Endurecimento do executável (fuses, em `package.json` → `build.electronFuses`), decidido em 06/11/2026:
 * ficam **desligados** o `NODE_OPTIONS` e os argumentos de inspeção, fica **ligada** a criptografia de
 * cookies e o app só carrega de dentro do `.asar`. O `runAsNode` continua **ligado**, e não é descuido: o
 * node-pty faz `fork` do próprio executável para listar os consoles do ConPTY, e o Electron liga
 * `ELECTRON_RUN_AS_NODE` nesse filho — desligar o fuse quebra todo terminal do app. A validação de
 * integridade do asar também fica fora: o node-pty roda desempacotado (`asarUnpack`) e ela exigiria
 * assinatura, que este app não tem.
 */
const autoteste = process.argv.includes('--autoteste')
// Medição de memória: sobe sem janela, abre muitos terminais, mede e sai (npm run medir).
const medindo = process.argv.includes('--medir')
// No autoteste a janela pode ficar atrás de outras; sem isto o Windows para de desenhá-la e o print sai velho.
if (autoteste) app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion')
// E o autoteste usa um perfil do Chromium só dele: com o app instalado aberto, os dois disputavam o mesmo
// perfil e a rodada morria sem dizer nada — ficava um log vazio, que já custou rodadas para entender.
if (autoteste) app.setPath('userData', join(tmpdir(), 'orkester-autoteste-chromium'))
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

let autotesteRodando = false

/** No autoteste a janela abre no segundo monitor (se houver), para não cobrir o que se está vendo no principal. */
function posicaoAutoteste(largura: number, altura: number): { x?: number; y?: number } {
  const principal = screen.getPrimaryDisplay()
  const outra = screen.getAllDisplays().find((tela) => tela.id !== principal.id)
  if (!outra) return {}
  const area = outra.workArea
  return {
    x: area.x + Math.max(0, Math.round((area.width - largura) / 2)),
    y: area.y + Math.max(0, Math.round((area.height - altura) / 2))
  }
}

/**
 * Uma janela do app. `espacoInicial`: o espaço que ela mostra ao abrir (null = o último usado).
 * `caixa`: onde ela estava na sessão passada; sem ela, a janela nasce deslocada da que está na frente.
 */
function criarJanela(espacoInicial: string | null = null, caixa?: Partial<Rectangle> & { maximizada?: boolean }): BrowserWindow {
  // janela nova aparece um pouco deslocada da que está na frente, para não esconder uma atrás da outra
  const frente = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  const posicao = caixa
    ? { x: caixa.x, y: caixa.y }
    : frente && !frente.isDestroyed() && !frente.isMaximized()
      ? { x: frente.getBounds().x + 36, y: frente.getBounds().y + 36 }
      : autoteste
        ? posicaoAutoteste(1280, 820)
        : {}
  const janela = new BrowserWindow({
    width: caixa?.width ?? 1280,
    height: caixa?.height ?? 820,
    ...posicao,
    minWidth: 640,
    minHeight: 420,
    title: 'Orkester',
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

  janela.once('ready-to-show', () => {
    if (caixa?.maximizada) janela.maximize()
    janela.show()
  })
  const idConteudo = janela.webContents.id
  lembrarInicial(idConteudo, espacoInicial)
  acompanharJanela(janela)
  janela.on('closed', () => {
    soltarJanela(idConteudo)
    soltarAbasDaJanela(idConteudo)
  })

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
        title: 'Orkester',
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

  // o autoteste roda na primeira janela; as outras que ele abrir são só parte do teste
  if (autoteste && !autotesteRodando) {
    autotesteRodando = true
    janela.webContents.once('did-finish-load', () => rodarAutoteste(janela, pedirSalvamento))
  }
  return janela
}

/**
 * Abre o que estava aberto da última vez. O autoteste sempre começa com uma janela só, para a rodada
 * não depender do que ficou do dia anterior.
 */
function abrirAsJanelasDaSessao(): void {
  if (autoteste) {
    criarJanela()
    return
  }
  const telas = screen.getAllDisplays().map((t) => ({ x: t.workArea.x, y: t.workArea.y, largura: t.workArea.width, altura: t.workArea.height }))
  const lista = janelasParaAbrir(lerSessaoDeJanelas(), idsDosEspacos(), telas)
  if (lista.length === 0) criarJanela()
  else reabrirJanelas(lista)
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

// Um processo só: abrir o atalho de novo traz a janela que já está aberta (mais janelas: Ctrl+Shift+N).
if (!autoteste && !medindo && !app.requestSingleInstanceLock()) {
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
    portal.setUserAgent(portal.getUserAgent().replace(/ (Electron|Orkester)\/\S+/gi, ''))
    configurarJanelas(criarJanela, idsDosEspacos, gravarSessaoDeJanelas)
    registrarJanelas()
    registrarDados()
    registrarAndares()
    registrarArea()
    registrarNavegador()
    servirImagens()
    registrarTerminais()
    registrarComandos()
    registrarCodigo()
    registrarRotinas()
    quandoApagarEspaco(encerrarDoEspaco)
    if (medindo) void rodarMedicao()
    else abrirAsJanelasDaSessao()
  })
}

// Sair: a sessão de janelas vai para o disco sem esperar o adiamento de meio segundo.
app.on('before-quit', () => {
  if (!autoteste && !medindo) gravarSessaoAgora()
})

app.on('window-all-closed', () => {
  pararRotinas()
  encerrarTodos()
  // o Chrome do app fecha direito antes (sem o aviso de "não foi fechado corretamente" na próxima vez)
  void encerrarNavegador().finally(() => app.quit())
})
