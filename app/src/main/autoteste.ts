import { app, type BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { quantosTerminais } from './terminais'

// `npm run autoteste`: digita um comando no terminal como um usuário faria (teclado da janela),
// espera a resposta voltar na tela, salva um print e sai com 0 (passou) ou 1 (falhou).
const MARCA = 'MAESTRI-PROPRIO-OK'

export async function rodarAutoteste(janela: BrowserWindow): Promise<void> {
  const conteudo = janela.webContents
  const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  const textoDaTela = (): Promise<string> =>
    conteudo.executeJavaScript('window.__textoDoTerminal ? window.__textoDoTerminal() : ""')

  let passou = false
  try {
    // o PowerShell leva alguns segundos para mostrar o prompt
    for (let i = 0; i < 40 && !/PS .*>/.test(await textoDaTela()); i++) await esperar(250)

    janela.focus()
    conteudo.focus()
    for (const tecla of `echo ${MARCA}-$((2+3))`) {
      conteudo.sendInputEvent({ type: 'char', keyCode: tecla })
    }
    conteudo.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
    conteudo.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })

    // a resposta do PowerShell é a marca com 5, não o 2+3 digitado
    for (let i = 0; i < 40 && !passou; i++) {
      await esperar(250)
      passou = (await textoDaTela()).includes(`${MARCA}-5`)
    }

    const pasta = join(app.getAppPath(), 'out')
    const imagem = await conteudo.capturePage()
    writeFileSync(join(pasta, 'autoteste.png'), imagem.toPNG())
    writeFileSync(join(pasta, 'autoteste.txt'), await textoDaTela())
    console.log(`AUTOTESTE terminal: ${passou ? 'ok' : 'FALHOU'} — print em out/autoteste.png`)

    // recarregar a janela não pode deixar o PowerShell antigo vivo
    conteudo.reload()
    await new Promise<void>((r) => conteudo.once('did-finish-load', () => r()))
    await esperar(2000)
    const depois = quantosTerminais()
    console.log(`AUTOTESTE recarga: ${depois === 1 ? 'ok' : 'FALHOU'} — terminais vivos depois de recarregar: ${depois}`)
    passou = passou && depois === 1
    console.log(`AUTOTESTE ${passou ? 'PASSOU' : 'FALHOU'}`)
  } catch (erro) {
    console.error('AUTOTESTE ERRO', erro)
  }
  app.exit(passou ? 0 : 1)
}
