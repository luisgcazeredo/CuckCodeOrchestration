// Gera build/icon.png (512 px; o ícone do Windows vai até 256) a partir de build/icon.svg,
// usando o próprio Electron para desenhar. Rodar: npx electron scripts/gerar-icone.cjs
const { app, BrowserWindow } = require('electron')
const { readFileSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')

const LADO = 512 // janela invisível maior que a tela é cortada, então fica abaixo da altura de qualquer tela
const pasta = join(__dirname, '..', 'build')
const svg = readFileSync(join(pasta, 'icon.svg'), 'utf8').replace('width="1024" height="1024"', `width="${LADO}" height="${LADO}"`)
const pagina = `<html><body style="margin:0;background:transparent">${svg}</body></html>`

app.whenReady().then(async () => {
  const janela = new BrowserWindow({
    width: LADO,
    height: LADO,
    show: false,
    transparent: true,
    frame: false,
    useContentSize: true,
    webPreferences: { offscreen: true }
  })
  await janela.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(pagina)}`)
  await new Promise((r) => setTimeout(r, 300))
  const imagem = await janela.webContents.capturePage({ x: 0, y: 0, width: LADO, height: LADO })
  const { width, height } = imagem.getSize()
  if (width !== LADO || height !== LADO) throw new Error(`captura saiu ${width}x${height}, esperado ${LADO}x${LADO}`)
  writeFileSync(join(pasta, 'icon.png'), imagem.toPNG())
  console.log('build/icon.png gerado:', imagem.getSize())
  app.quit()
})
