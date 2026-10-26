import { app, type BrowserWindow } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PASTA_DADOS } from './dados'

// `npm run autoteste`: monta um quadro de exemplo numa pasta de dados temporária, tira print nos dois
// temas, usa o mouse como um usuário (arrastar terminal, ligar dois terminais pela porta), recarrega e
// confere que tudo voltou do disco. Sai com 0 (passou) ou 1 (falhou).

export async function rodarAutoteste(
  janela: BrowserWindow,
  pedirSalvamento: (janela: BrowserWindow) => Promise<boolean>
): Promise<void> {
  const tela = janela.webContents
  const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  const js = <T>(codigo: string): Promise<T> => tela.executeJavaScript(codigo)
  // no app instalado a pasta do app é somente leitura: os prints vão para a pasta temporária
  const pastaSaida = app.isPackaged ? join(tmpdir(), 'maestri-proprio-autoteste-prints') : join(app.getAppPath(), 'out')
  mkdirSync(pastaSaida, { recursive: true })
  const resultados: Array<[string, boolean, string]> = []
  const conferir = (nome: string, ok: boolean, detalhe = ''): void => {
    resultados.push([nome, ok, detalhe])
  }
  // a captura às vezes falha logo depois de recarregar (erro do compositor de vídeo): tenta de novo
  const print = async (nome: string): Promise<void> => {
    for (let tentativa = 1; ; tentativa++) {
      await esperar(400 * tentativa)
      try {
        writeFileSync(join(pastaSaida, `autoteste-${nome}.png`), (await tela.capturePage()).toPNG())
        return
      } catch (erro) {
        if (tentativa === 4) throw erro
      }
    }
  }
  const aguardarCarga = async (): Promise<void> => {
    for (let i = 0; i < 60; i++) {
      if (await js<boolean>('!!(window.__teste && window.__teste.loja.lerEstado().carregado)')) return
      await esperar(100)
    }
    throw new Error('o app não terminou de carregar')
  }
  const centroDe = (seletor: string): Promise<{ x: number; y: number } | null> =>
    js(`(() => { const r = document.querySelector(${JSON.stringify(seletor)})?.getBoundingClientRect();
      return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null })()`)
  const arrastar = async (de: { x: number; y: number }, ate: { x: number; y: number }): Promise<void> => {
    tela.sendInputEvent({ type: 'mouseMove', x: de.x, y: de.y })
    tela.sendInputEvent({ type: 'mouseDown', x: de.x, y: de.y, button: 'left', clickCount: 1 })
    for (let i = 1; i <= 8; i++) {
      const x = Math.round(de.x + ((ate.x - de.x) * i) / 8)
      const y = Math.round(de.y + ((ate.y - de.y) * i) / 8)
      tela.sendInputEvent({ type: 'mouseMove', x, y, button: 'left', modifiers: ['leftbuttondown'] })
      await esperar(16)
    }
    tela.sendInputEvent({ type: 'mouseUp', x: ate.x, y: ate.y, button: 'left', clickCount: 1 })
    await esperar(200)
  }

  let passou = false
  try {
    await aguardarCarga()

    const ids = await js<Record<string, string>>(`(() => {
      const L = window.__teste.loja
      const [claude, codex, shell] = L.lerEstado().preferencias.presets
      const t1 = L.adicionarNo({ tipo: 'terminal', preset: claude }, 560, 420)
      const t2 = L.adicionarNo({ tipo: 'terminal', preset: codex }, 1500, 700)
      const t3 = L.adicionarNo({ tipo: 'terminal', preset: shell }, 560, 1150)
      L.ligar(t1, t2)
      const pi = L.adicionarNo({ tipo: 'postit' }, 1470, 200)
      const arquivo = L.lerEstado().espaco.nos.find((n) => n.id === pi).arquivo
      L.definirNota(arquivo, '# TODOS\\n- [x] quadro e visual\\n- [ ] integrar terminais')
      const tx = L.adicionarNo({ tipo: 'texto' }, 760, 60)
      L.atualizarNo(tx, { texto: 'Terminais são legais!', cor: '#FF3B30', tamanhoFonte: 36, largura: 420, altura: 52 })
      L.editar(null)
      L.adicionarDesenho({ ferramenta: 'retangulo', pontos: [[1000, 1050], [1300, 1180]], cor: '#34C759', espessura: 2.5 })
      L.adicionarDesenho({ ferramenta: 'seta', pontos: [[1320, 1110], [1560, 990]], cor: '#007AFF', espessura: 2.5 })
      const onda = Array.from({ length: 40 }, (_, i) => [1050 + i * 12, 1300 + Math.sin(i / 3) * 30])
      L.adicionarDesenho({ ferramenta: 'lapis', pontos: onda, cor: '#AF52DE', espessura: 3 })
      L.definirCamera({ x: 40, y: 40, zoom: 0.5 })
      L.selecionar({ tipo: 'no', id: t2 })
      return { t1, t2, t3, pi, tx }
    })()`)
    // mouse num canto vazio, para nenhum nó aparecer "com o mouse em cima" no print
    tela.sendInputEvent({ type: 'mouseMove', x: 700, y: 950 })
    await esperar(300)
    const marcados = await js<string[]>(
      `[...document.querySelectorAll('.no.selecionado')].map((el) => el.getAttribute('data-no-id'))`
    )
    const contorno = await js<string>(
      `(() => { const el = document.querySelector('.no.selecionado'); return el ? getComputedStyle(el, '::after').borderTopStyle + ' ' + getComputedStyle(el, '::after').borderTopColor : 'nenhum' })()`
    )
    conferir('seleção aparece', marcados.length === 1 && marcados[0] === ids.t2, `${marcados.join(',')} · ${contorno}`)
    await print('escuro')

    await js(`window.__teste.loja.definirTema('claro')`)
    await print('claro')
    await js(`window.__teste.loja.definirTema('escuro')`)

    // arrastar o terminal 1 pelo cabeçalho: 100 px de tela = 200 no quadro (zoom 50%)
    const xAntes = await js<number>(`window.__teste.loja.lerEstado().espaco.nos.find((n) => n.id === '${ids.t1}').x`)
    const cabecalho = await centroDe(`[data-no-id="${ids.t1}"] .terminal-cabecalho`)
    if (!cabecalho) throw new Error('cabeçalho do terminal não está na tela')
    await arrastar(cabecalho, { x: cabecalho.x + 100, y: cabecalho.y })
    const xDepois = await js<number>(`window.__teste.loja.lerEstado().espaco.nos.find((n) => n.id === '${ids.t1}').x`)
    conferir('arrastar terminal', Math.abs(xDepois - xAntes - 200) <= 4, `x ${xAntes} → ${xDepois}`)

    // ligar o terminal 3 ao 1 arrastando da porta direita do 3 até o corpo do 1
    const porta = await centroDe(`[data-no-id="${ids.t3}"] .porta-direita`)
    const alvo = await centroDe(`[data-no-id="${ids.t1}"] .terminal-corpo`)
    if (!porta || !alvo) throw new Error('porta ou alvo fora da tela')
    await arrastar(porta, alvo)
    const cordas = await js<number>('window.__teste.loja.lerEstado().espaco.cordas.length')
    conferir('ligar pela porta', cordas === 2, `${cordas} cordas`)

    // recarregar: tudo tem que voltar do disco
    await js('window.__teste.loja.salvarAgora()')
    tela.reload()
    await new Promise<void>((r) => tela.once('did-finish-load', () => r()))
    await aguardarCarga()
    await esperar(300)
    const volta = await js<{ nos: number; cordas: number; desenhos: number; nota: string; tema: string }>(`(() => {
      const e = window.__teste.loja.lerEstado()
      const pi = e.espaco.nos.find((n) => n.id === '${ids.pi}')
      return { nos: e.espaco.nos.length, cordas: e.espaco.cordas.length, desenhos: e.espaco.desenhos.length,
        nota: pi ? e.notas[pi.arquivo] : '', tema: e.preferencias.tema }
    })()`)
    conferir(
      'salvar e reabrir',
      volta.nos === 6 && volta.cordas === 2 && volta.desenhos === 3 && volta.nota.startsWith('# TODOS'),
      JSON.stringify(volta)
    )
    const pastaNotas = join(PASTA_DADOS, 'espacos')
    const notasEmDisco = readdirSync(pastaNotas).flatMap((id) =>
      existsSync(join(pastaNotas, id, 'notas')) ? readdirSync(join(pastaNotas, id, 'notas')) : []
    )
    conferir('post-its viram .md', notasEmDisco.length === 2, notasEmDisco.join(', '))
    await print('reaberto')

    // desfazer e refazer pelo teclado: apagar o texto, Ctrl+Z traz de volta, Ctrl+Y apaga de novo
    const contar = (): Promise<number> => js<number>('window.__teste.loja.lerEstado().espaco.nos.length')
    await js(`window.__teste.loja.selecionar({ tipo: 'no', id: '${ids.tx}' }); window.__teste.loja.apagarSelecao()`)
    const depoisDeApagar = await contar()
    const tecla = async (letra: string): Promise<void> => {
      tela.sendInputEvent({ type: 'keyDown', keyCode: letra, modifiers: ['control'] })
      tela.sendInputEvent({ type: 'keyUp', keyCode: letra, modifiers: ['control'] })
      await esperar(150)
    }
    await tecla('Z')
    const depoisDeDesfazer = await contar()
    await tecla('Y')
    const depoisDeRefazer = await contar()
    conferir(
      'desfazer e refazer (Ctrl+Z, Ctrl+Y)',
      depoisDeApagar === 5 && depoisDeDesfazer === 6 && depoisDeRefazer === 5,
      `${depoisDeApagar} → ${depoisDeDesfazer} → ${depoisDeRefazer} nós`
    )

    // árvore de arquivos de uma pasta de teste e um portal, longe do resto
    const pastaTeste = join(tmpdir(), 'maestri-proprio-autoteste-arvore')
    rmSync(pastaTeste, { recursive: true, force: true })
    mkdirSync(join(pastaTeste, 'sub'), { recursive: true })
    for (const nome of ['a.md', 'b.txt']) writeFileSync(join(pastaTeste, nome), nome)
    // atalho de pasta (junction) que aponta para fora: não pode aparecer nem ser listado
    const fora = join(tmpdir(), 'maestri-proprio-autoteste-fora')
    mkdirSync(fora, { recursive: true })
    writeFileSync(join(fora, 'segredo.txt'), 'não pode vazar')
    symlinkSync(fora, join(pastaTeste, 'atalho-para-fora'), 'junction')
    await js(`(() => {
      const L = window.__teste.loja
      L.adicionarNo({ tipo: 'pasta', caminho: ${JSON.stringify(pastaTeste)} }, 2700, 500)
      L.adicionarNo({ tipo: 'portal', url: 'https://example.com/' }, 3400, 500)
      L.selecionar(null)
      L.definirCamera({ x: -1180, y: 120, zoom: 0.5 })
    })()`)
    let linhas = 0
    for (let i = 0; i < 30 && linhas < 3; i++) {
      await esperar(100)
      linhas = await js<number>(`document.querySelectorAll('.arvore-linha').length`)
    }
    conferir('árvore de arquivos', linhas === 3, `${linhas} linhas (sub, a.md, b.txt; o atalho para fora não aparece)`)
    const vazou = await js<string>(`window.mp.dados.listarPasta(${JSON.stringify(pastaTeste)}, ${JSON.stringify(
      join(pastaTeste, 'atalho-para-fora')
    )}).then((l) => 'LISTOU ' + l.map((e) => e.nome).join(','), (e) => 'bloqueado')`)
    conferir('atalho para fora da pasta é bloqueado', vazou === 'bloqueado', vazou)
    let endereco = ''
    for (let i = 0; i < 80 && !endereco.includes('example.com'); i++) {
      await esperar(100)
      endereco = await js<string>(`(() => { try { return document.querySelector('webview').getURL() } catch { return '' } })()`)
    }
    await esperar(800)
    conferir('portal abre um site', endereco.includes('example.com'), endereco || 'não carregou (sem internet?)')
    const transformacao = await js<string>(`document.querySelector('.mundo').style.transform`)
    conferir('câmera foi para a árvore e o portal', transformacao.includes('-1180px'), transformacao)
    await print('ferramentas')

    // fechar a janela logo depois de editar: a última edição tem que chegar ao disco
    const arquivoNota = await js<string>(
      `window.__teste.loja.lerEstado().espaco.nos.find((n) => n.id === '${ids.pi}').arquivo`
    )
    await js(`window.__teste.loja.definirNota('${arquivoNota}', '# TODOS\\nÚLTIMA EDIÇÃO ANTES DE FECHAR')`)
    const gravou = await pedirSalvamento(janela)
    const idEspaco = await js<string>('window.__teste.loja.lerEstado().espaco.id')
    const emDisco = readFileSync(join(PASTA_DADOS, 'espacos', idEspaco, 'notas', arquivoNota), 'utf8')
    conferir(
      'salvar ao fechar',
      gravou && emDisco.includes('ÚLTIMA EDIÇÃO ANTES DE FECHAR'),
      `${gravou ? 'janela confirmou' : 'janela disse que falhou'} · ${emDisco.split('\n')[1] ?? ''}`
    )

    passou = resultados.every(([, ok]) => ok)
  } catch (erro) {
    console.error('AUTOTESTE ERRO', erro)
  }
  for (const [nome, ok, detalhe] of resultados) console.log(`AUTOTESTE ${ok ? 'ok    ' : 'FALHOU'} ${nome} — ${detalhe}`)
  console.log(`AUTOTESTE ${passou ? 'PASSOU' : 'FALHOU'} — prints em ${pastaSaida}`)
  app.exit(passou ? 0 : 1)
}
