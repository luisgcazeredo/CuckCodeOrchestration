import { app, BrowserWindow, clipboard, ClipboardItem } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PASTA_DADOS } from './dados'
import { encerrarNavegador } from './navegador'

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
    // o portal abre no Chrome do app: a página chega em imagens dentro do cartão
    let paginaNaTela = 0
    for (let i = 0; i < 150 && !paginaNaTela; i++) {
      await esperar(100)
      paginaNaTela = await js<number>(`document.querySelector('.no-portal .portal-imagem')?.naturalWidth ?? 0`)
    }
    const endereco = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'portal')?.url ?? ''`)
    await esperar(500)
    conferir('portal abre um site no Chrome do app', paginaNaTela > 0 && endereco.includes('example.com'), `${endereco} · imagem ${paginaNaTela} px`)
    // os dois cartões novos estão na tela (independe de o zoom ter mudado no meio do teste)
    const naTela = await js<boolean>(`(() => { const q = document.querySelector('.quadro').getBoundingClientRect();
      return ['.no-pasta', '.no-portal'].every((s) => { const r = document.querySelector(s).getBoundingClientRect();
        return r.right > q.left && r.left < q.right && r.bottom > q.top && r.top < q.bottom }) })()`)
    conferir('árvore e portal aparecem na tela', naTela)
    await print('ferramentas')

    // ---- uso real com mouse e teclado ----
    const quadro = await js<{ esquerda: number; topo: number; direita: number; base: number }>(
      `(() => { const r = document.querySelector('.quadro').getBoundingClientRect();
        return { esquerda: Math.round(r.left), topo: Math.round(r.top), direita: Math.round(r.right), base: Math.round(r.bottom) } })()`
    )
    const teclar = async (tecla: string): Promise<void> => {
      tela.sendInputEvent({ type: 'keyDown', keyCode: tecla })
      tela.sendInputEvent({ type: 'keyUp', keyCode: tecla })
      await esperar(120)
    }
    const digitar = async (texto: string): Promise<void> => {
      for (const letra of texto) tela.sendInputEvent({ type: 'char', keyCode: letra })
      await esperar(200)
    }
    const clicar = async (p: { x: number; y: number }): Promise<void> => {
      tela.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y })
      tela.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1 })
      tela.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1 })
      await esperar(250)
    }
    const nos = (): Promise<Array<Record<string, unknown>>> => js('window.__teste.loja.lerEstado().espaco.nos')

    // texto: T, clica num lugar vazio, digita, Esc
    await teclar('T')
    await clicar({ x: quadro.esquerda + 120, y: quadro.base - 140 })
    await digitar('Olá, quadro')
    await teclar('Escape')
    const textos = (await nos()).filter((n) => n.tipo === 'texto').map((n) => n.texto)
    conferir('ferramenta de texto (T, clicar, digitar)', textos.includes('Olá, quadro'), JSON.stringify(textos))

    // post-it: N, clica, digita, Esc
    await teclar('N')
    await clicar({ x: quadro.esquerda + 420, y: quadro.base - 140 })
    await digitar('lembrete rápido')
    await teclar('Escape')
    const notasAgora = await js<string[]>('Object.values(window.__teste.loja.lerEstado().notas)')
    conferir('post-it (N, clicar, digitar)', notasAgora.includes('lembrete rápido'), JSON.stringify(notasAgora.filter((t) => !t.startsWith('#'))))

    // arrastar a árvore segurando numa pasta da lista: o cartão anda e a pasta não abre
    await js('window.__teste.loja.selecionar(null)')
    const zoomAgora = (): Promise<number> => js<number>('window.__teste.loja.lerEstado().espaco.camera.zoom')
    const perto = (a: number, b: number): boolean => Math.abs(a - b) <= 2
    const arvoreAntes = (await nos()).find((n) => n.tipo === 'pasta')!
    const zoomArvore = await zoomAgora()
    const linhaSub = await centroDe('.no-pasta .arvore-linha')
    if (!linhaSub) throw new Error('linha da árvore fora da tela')
    await arrastar(linhaSub, { x: linhaSub.x + 60, y: linhaSub.y + 40 })
    const arvoreDepois = (await nos()).find((n) => n.tipo === 'pasta')!
    conferir(
      'arrastar cartão pelo conteúdo, sem abrir a pasta',
      perto((arvoreDepois.x as number) - (arvoreAntes.x as number), 60 / zoomArvore) &&
        (arvoreDepois.expandidas as string[]).length === 0,
      `x ${arvoreAntes.x} → ${arvoreDepois.x}, pastas abertas: ${(arvoreDepois.expandidas as string[]).length}`
    )

    // portal sem seleção: a película deixa arrastar pelo meio da página
    await js('window.__teste.loja.selecionar(null)')
    const portalAntes = (await nos()).find((n) => n.tipo === 'portal')!
    const zoomPortal = await zoomAgora()
    const escudo = await centroDe('.no-portal .portal-escudo')
    if (!escudo) throw new Error('película do portal não apareceu')
    await arrastar(escudo, { x: escudo.x - 50, y: escudo.y + 30 })
    const portalDepois = (await nos()).find((n) => n.tipo === 'portal')!
    conferir(
      'arrastar portal pela página',
      perto((portalDepois.x as number) - (portalAntes.x as number), -50 / zoomPortal),
      `x ${portalAntes.x} → ${portalDepois.x}`
    )

    // levar o cartão até a borda direita: a tela anda junto enquanto o mouse fica lá
    const camAntes = await js<{ x: number }>('window.__teste.loja.lerEstado().espaco.camera')
    const cabecalhoArvore = await centroDe('.no-pasta .cartao-ferramenta-cabecalho')
    if (!cabecalhoArvore) throw new Error('cabeçalho da árvore fora da tela')
    const naBorda = { x: quadro.direita - 6, y: cabecalhoArvore.y }
    tela.sendInputEvent({ type: 'mouseMove', x: cabecalhoArvore.x, y: cabecalhoArvore.y })
    tela.sendInputEvent({ type: 'mouseDown', x: cabecalhoArvore.x, y: cabecalhoArvore.y, button: 'left', clickCount: 1 })
    for (let i = 1; i <= 10; i++) {
      const x = Math.round(cabecalhoArvore.x + ((naBorda.x - cabecalhoArvore.x) * i) / 10)
      tela.sendInputEvent({ type: 'mouseMove', x, y: naBorda.y, button: 'left', modifiers: ['leftbuttondown'] })
      await esperar(16)
    }
    await esperar(700)
    tela.sendInputEvent({ type: 'mouseUp', x: naBorda.x, y: naBorda.y, button: 'left', clickCount: 1 })
    await esperar(200)
    const camDepois = await js<{ x: number }>('window.__teste.loja.lerEstado().espaco.camera')
    const andou = Math.round(camAntes.x - camDepois.x)
    conferir('tela anda junto na borda', andou > 80, `a tela andou ${andou} px para a direita`)
    await print('uso-real')

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

    // ---- borracha: E, passar o mouse por cima de um traço ----
    await js(`(() => { const L = window.__teste.loja
      L.definirCamera({ x: 0, y: 0, zoom: 1 })
      L.adicionarDesenho({ ferramenta: 'lapis', pontos: [[200, 300], [500, 300]], cor: '#FF9500', espessura: 3 })
      L.selecionar(null) })()`)
    const tracosAntes = await js<number>('window.__teste.loja.planoAtual().desenhos.length')
    // um clique no quadro vazio tira o foco de onde estiver (o portal pega o teclado quando tem foco)
    await clicar({ x: quadro.esquerda + 700, y: quadro.topo + 120 })
    await teclar('E')
    const pincel = await js<string>('window.__teste.loja.lerEstado().estiloDesenho.ferramenta')
    await arrastar({ x: quadro.esquerda + 350, y: quadro.topo + 240 }, { x: quadro.esquerda + 350, y: quadro.topo + 360 })
    const tracosDepois = await js<number>('window.__teste.loja.planoAtual().desenhos.length')
    await teclar('Escape')
    conferir('borracha apaga o traço', tracosDepois === tracosAntes - 1, `pincel: ${pincel} · ${tracosAntes} → ${tracosDepois} traços`)

    // ---- botão direito num cartão: Duplicar, e Cor → Verde ----
    const clicarDireito = async (p: { x: number; y: number }): Promise<void> => {
      tela.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y })
      tela.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'right', clickCount: 1 })
      tela.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'right', clickCount: 1 })
      await esperar(250)
    }
    const itemDoMenu = (rotulo: string): Promise<{ x: number; y: number } | null> =>
      js(`(() => { const b = [...document.querySelectorAll('.menu-item')].find((el) => el.querySelector('.menu-rotulo')?.textContent === ${JSON.stringify(rotulo)});
        if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)
    await js(`(() => { const L = window.__teste.loja; L.definirCamera({ x: 0, y: 0, zoom: 1 })
      window.__alvoMenu = L.adicionarNo({ tipo: 'postit' }, 420, 520); L.editar(null); L.selecionar(null) })()`)
    const alvoMenu = await js<string>('window.__alvoMenu')
    const postitNaTela = await centroDe(`[data-no-id="${alvoMenu}"]`)
    if (!postitNaTela) throw new Error('post-it do teste de menu fora da tela')
    const contarPlano = (): Promise<number> => js<number>('window.__teste.loja.planoAtual().nos.length')
    const antesDeDuplicar = await contarPlano()
    await clicarDireito(postitNaTela)
    const duplicar = await itemDoMenu('Duplicar')
    if (duplicar) await clicar(duplicar)
    conferir('botão direito → Duplicar', !!duplicar && (await contarPlano()) === antesDeDuplicar + 1, duplicar ? '' : 'menu não abriu')
    await clicarDireito(postitNaTela)
    const cor = await itemDoMenu('Cor')
    if (cor) tela.sendInputEvent({ type: 'mouseMove', x: cor.x, y: cor.y })
    await esperar(250)
    // o clique direito selecionou o cartão de cima (a cópia, que nasceu por cima): é ele que tem que ficar verde
    const clicado = await js<string>('window.__teste.loja.lerEstado().selecao.nos[0] ?? ""')
    const verde = await centroDe('.menu-amostra[title="Verde"]')
    if (verde) await clicar(verde)
    const corDoPostit = await js<string>(`window.__teste.loja.acharNo('${clicado}')?.cor`)
    conferir('botão direito → Cor → Verde', corDoPostit === 'verde', `cor: ${corDoPostit}`)

    // ---- seleção de vários, grupos, ímã e barrinha (num andar limpo, longe do resto) ----
    await js(`window.__teste.loja.criarAndar('Seleção', false)`)
    const ab = await js<Record<string, string>>(`(() => { const L = window.__teste.loja
      L.definirCamera({ x: 0, y: 0, zoom: 1 })
      const a = L.adicionarNo({ tipo: 'postit' }, 300, 300)
      const b = L.adicionarNo({ tipo: 'postit' }, 700, 300)
      const c = L.adicionarNo({ tipo: 'postit' }, 300, 650)
      L.editar(null); L.selecionar(null)
      return { a, b, c } })()`)
    const tela2 = (x: number, y: number): { x: number; y: number } => ({ x: quadro.esquerda + x, y: quadro.topo + y })
    const comTecla = async (p: { x: number; y: number }, modifiers: Array<'shift' | 'control'>): Promise<void> => {
      tela.sendInputEvent({ type: 'mouseMove', x: p.x, y: p.y, modifiers })
      tela.sendInputEvent({ type: 'mouseDown', x: p.x, y: p.y, button: 'left', clickCount: 1, modifiers })
      tela.sendInputEvent({ type: 'mouseUp', x: p.x, y: p.y, button: 'left', clickCount: 1, modifiers })
      await esperar(250)
    }
    const no = (id: string): Promise<{ x: number; y: number; grupo?: string } | undefined> =>
      js(`window.__teste.loja.acharNo('${id}')`)
    const selecionados = (): Promise<string[]> => js('window.__teste.loja.lerEstado().selecao.nos')
    const vazio = tela2(60, 160)
    await clicar(vazio)
    await clicar(tela2(300, 320))
    await comTecla(tela2(700, 320), ['shift'])
    conferir('Shift+clique seleciona dois', (await selecionados()).length === 2, `${(await selecionados()).length} selecionados`)
    const barra = await js<boolean>(`!!document.querySelector('.barra-selecao')`)
    await print('selecao-barrinha')
    const [a0, b0] = [await no(ab.a), await no(ab.b)]
    await arrastar(tela2(300, 320), tela2(350, 350))
    const [a1, b1] = [await no(ab.a), await no(ab.b)]
    conferir(
      'arrastar leva a seleção inteira',
      a1!.x - a0!.x === 50 && b1!.x - b0!.x === 50 && a1!.y - a0!.y === 30 && b1!.y - b0!.y === 30,
      `A +${a1!.x - a0!.x},+${a1!.y - a0!.y} · B +${b1!.x - b0!.x},+${b1!.y - b0!.y} · barrinha ${barra ? 'apareceu' : 'NÃO apareceu'}`
    )
    await tecla('G')
    const grupoA = (await no(ab.a))?.grupo
    await clicar(vazio)
    await clicar(tela2(350, 350))
    const peloGrupo = (await selecionados()).length
    await clicar(tela2(350, 350))
    const dentro = await selecionados()
    await arrastar(tela2(350, 350), tela2(350, 390))
    const [a2, b2] = [await no(ab.a), await no(ab.b)]
    conferir(
      'agrupar (Ctrl+G): clique pega o grupo, outro clique pega só um',
      !!grupoA && grupoA === b2?.grupo && peloGrupo === 2 && dentro.length === 1 && dentro[0] === ab.a && a2!.y - a1!.y === 40 && b2!.y === b1!.y,
      `grupo ${grupoA ? 'ok' : 'não'} · 1º clique ${peloGrupo} · 2º clique ${dentro.length} · A desceu ${a2!.y - a1!.y}, B ${b2!.y - b1!.y}`
    )
    await clicar(vazio)
    await clicar(tela2(750, 350))
    tela.sendInputEvent({ type: 'keyDown', keyCode: 'G', modifiers: ['control', 'shift'] })
    tela.sendInputEvent({ type: 'keyUp', keyCode: 'G', modifiers: ['control', 'shift'] })
    await esperar(150)
    conferir('desagrupar (Ctrl+Shift+G)', !(await no(ab.a))?.grupo && !(await no(ab.b))?.grupo)
    // retângulo de seleção: Shift + arrastar no vazio pega os três
    await clicar(vazio)
    const de = tela2(60, 150)
    const ate = tela2(900, 800)
    tela.sendInputEvent({ type: 'mouseMove', x: de.x, y: de.y, modifiers: ['shift'] })
    tela.sendInputEvent({ type: 'mouseDown', x: de.x, y: de.y, button: 'left', clickCount: 1, modifiers: ['shift'] })
    for (let i = 1; i <= 8; i++) {
      tela.sendInputEvent({ type: 'mouseMove', x: Math.round(de.x + ((ate.x - de.x) * i) / 8), y: Math.round(de.y + ((ate.y - de.y) * i) / 8), modifiers: ['shift', 'leftbuttondown'] })
      await esperar(16)
    }
    tela.sendInputEvent({ type: 'mouseUp', x: ate.x, y: ate.y, button: 'left', clickCount: 1, modifiers: ['shift'] })
    await esperar(200)
    conferir('retângulo de seleção (Shift + arrastar)', (await selecionados()).length === 3, `${(await selecionados()).length} selecionados`)
    // ímã: C chega a 3 px de alinhar com A e gruda; a guia aparece no meio do arrasto
    await clicar(vazio)
    const c0 = (await no(ab.c))!
    const aAgora = (await no(ab.a))!
    const desloca = aAgora.x - c0.x - 3
    const pegaC = tela2(c0.x + 130, c0.y + 100)
    tela.sendInputEvent({ type: 'mouseMove', x: pegaC.x, y: pegaC.y })
    tela.sendInputEvent({ type: 'mouseDown', x: pegaC.x, y: pegaC.y, button: 'left', clickCount: 1 })
    for (let i = 1; i <= 8; i++) {
      tela.sendInputEvent({ type: 'mouseMove', x: Math.round(pegaC.x + (desloca * i) / 8), y: pegaC.y, button: 'left', modifiers: ['leftbuttondown'] })
      await esperar(20)
    }
    await esperar(120)
    const guias = await js<number>(`document.querySelectorAll('.guia').length`)
    tela.sendInputEvent({ type: 'mouseUp', x: pegaC.x + desloca, y: pegaC.y, button: 'left', clickCount: 1 })
    await esperar(200)
    const c1 = (await no(ab.c))!
    conferir('ímã de alinhamento com guia', c1.x === aAgora.x && guias > 0, `C x ${c0.x} → ${c1.x} (A em ${aAgora.x}) · ${guias} guias`)
    // barrinha: a lixeira apaga o que está selecionado
    const lixeira = await centroDe('.barra-selecao button[title^="Apagar"]')
    if (lixeira) await clicar(lixeira)
    conferir('barrinha da seleção → Apagar', !!lixeira && !(await no(ab.c)), lixeira ? '' : 'barrinha não apareceu')
    // Esc no meio do arrasto: o cartão volta; Ctrl+Z no meio não desfaz nada (quebraria o histórico)
    await clicar(vazio)
    const aAntes = (await no(ab.a))!
    const pegaA = tela2(aAntes.x + 130, aAntes.y + 80)
    const passosAte = async (dx: number): Promise<void> => {
      for (let i = 1; i <= 5; i++) {
        tela.sendInputEvent({ type: 'mouseMove', x: pegaA.x + Math.round((dx * i) / 5), y: pegaA.y, button: 'left', modifiers: ['leftbuttondown'] })
        await esperar(20)
      }
    }
    tela.sendInputEvent({ type: 'mouseMove', x: pegaA.x, y: pegaA.y })
    tela.sendInputEvent({ type: 'mouseDown', x: pegaA.x, y: pegaA.y, button: 'left', clickCount: 1 })
    await passosAte(60)
    const nosAntesDoZ = (await js<unknown[]>('window.__teste.loja.planoAtual().nos')).length
    await tecla('Z')
    const nosDepoisDoZ = (await js<unknown[]>('window.__teste.loja.planoAtual().nos')).length
    tela.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    tela.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await esperar(80)
    await passosAte(90)
    tela.sendInputEvent({ type: 'mouseUp', x: pegaA.x + 90, y: pegaA.y, button: 'left', clickCount: 1 })
    await esperar(200)
    const aDepois = (await no(ab.a))!
    conferir(
      'Esc no meio do arrasto devolve o cartão (e Ctrl+Z ali não faz nada)',
      aDepois.x === aAntes.x && aDepois.y === aAntes.y && nosAntesDoZ === nosDepoisDoZ,
      `x ${aAntes.x} → ${aDepois.x} · cartões ${nosAntesDoZ} → ${nosDepoisDoZ}`
    )
    // duplicar um item de dentro de um grupo: a cópia sai solta (sem "grupo de um")
    await clicar(vazio)
    await clicar(tela2(aAntes.x + 130, aAntes.y + 80))
    await comTecla(tela2(750, 330), ['shift'])
    await tecla('G')
    await clicar(vazio)
    await clicar(tela2(aAntes.x + 130, aAntes.y + 80))
    await clicar(tela2(aAntes.x + 130, aAntes.y + 80))
    await tecla('D')
    const copiaId = await js<string>('window.__teste.loja.lerEstado().selecao.nos[0] ?? ""')
    const copia = await no(copiaId)
    const grupoDoPar = (await no(ab.a))?.grupo
    conferir(
      'duplicar item de dentro do grupo sai solto',
      copiaId !== ab.a && !!copia && !copia.grupo && !!grupoDoPar && grupoDoPar === (await no(ab.b))?.grupo,
      `cópia ${copia?.grupo ? 'COM grupo' : 'solta'} · par ${grupoDoPar ? 'continua agrupado' : 'perdeu o grupo'}`
    )
    await js('window.__teste.loja.apagarSelecao()')

    // ? abre a folha de atalhos
    await clicar(vazio)
    tela.sendInputEvent({ type: 'char', keyCode: '?' })
    tela.sendInputEvent({ type: 'keyDown', keyCode: '?' })
    tela.sendInputEvent({ type: 'keyUp', keyCode: '?' })
    await esperar(200)
    const folha = await js<boolean>(`!!document.querySelector('.atalhos')`)
    await print('selecao-atalhos')
    await teclar('Escape')
    conferir('tecla ? abre os atalhos', folha)

    // ---- copiar e colar (Ctrl+C / Ctrl+V), print, texto e marca falsa ----
    const guardada = await clipboard.read().catch(() => [])
    try {
      const plano = (): Promise<{ nos: Array<{ id: string; tipo: string; arquivo?: string; texto?: string }> }> =>
        js('window.__teste.loja.planoAtual()')
      const notaDe = (arquivo: string): Promise<string> => js(`window.__teste.loja.lerEstado().notas[${JSON.stringify(arquivo)}] ?? ''`)
      const original = await js<string>(`(() => { const L = window.__teste.loja
        const id = L.adicionarNo({ tipo: 'postit', texto: 'cartão copiado' }, 300, 1000); L.selecionar(null); return id })()`)
      await clicar(vazio)
      await js(`window.__teste.loja.definirCamera({ x: 0, y: -700, zoom: 1 })`)
      await clicar(tela2(300, 300))
      await tecla('C')
      await esperar(200)
      tela.sendInputEvent({ type: 'mouseMove', x: quadro.esquerda + 700, y: quadro.topo + 300 })
      await esperar(100)
      const antesDeColar = (await plano()).nos.length
      await tecla('V')
      await esperar(400)
      const depois = await plano()
      const colado = depois.nos.find((n) => n.tipo === 'postit' && n.id !== original && !Object.values(ab).includes(n.id))
      const textoColado = colado?.arquivo ? await notaDe(colado.arquivo) : ''
      const arquivoOriginal = depois.nos.find((n) => n.id === original)?.arquivo
      conferir(
        'copiar e colar cartão (Ctrl+C, Ctrl+V)',
        depois.nos.length === antesDeColar + 1 && textoColado === 'cartão copiado' && colado?.arquivo !== arquivoOriginal,
        `${antesDeColar} → ${depois.nos.length} · "${textoColado}"`
      )
      // print: a imagem vira cartão e aparece de verdade (esquema mp-imagem e CSP)
      const print = (await tela.capturePage({ x: 0, y: 0, width: 240, height: 140 })).toPNG()
      await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(print)], { type: 'image/png' }) })])
      await tecla('V')
      let imagem: { id: string; arquivo: string } | null = null
      let carregou = 0
      for (let i = 0; i < 30 && !carregou; i++) {
        await esperar(100)
        imagem = await js(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'imagem') ?? null`)
        carregou = imagem ? await js<number>(`document.querySelector('[data-no-id="${imagem.id}"] img')?.naturalWidth ?? 0`) : 0
      }
      const espacoAtual = await js<string>('window.__teste.loja.lerEstado().espaco.id')
      const arquivoImagem = imagem ? join(PASTA_DADOS, 'espacos', espacoAtual, 'imagens', imagem.arquivo) : ''
      conferir('colar print vira imagem no quadro', !!imagem && existsSync(arquivoImagem) && carregou > 0, imagem ? `${carregou} px de largura` : 'não colou')
      // texto comum vira texto no quadro
      await clipboard.writeText('texto colado')
      await tecla('V')
      await esperar(300)
      conferir('colar texto vira cartão de texto', (await plano()).nos.some((n) => n.tipo === 'texto' && n.texto === 'texto colado'))
      // marca do app com assinatura errada (o que um site poderia tentar): vira texto, nunca cartão
      const falsa = Buffer.from(JSON.stringify({ espacoOrigem: espacoAtual, json: '{"nos":[],"desenhos":[],"cordas":[],"notas":{}}' })).toString('base64')
      await clipboard.write([
        new ClipboardItem({ 'text/plain': 'marca falsa', 'text/html': `<span data-maestri-proprio="${falsa}.${'0'.repeat(64)}"></span>` })
      ])
      await tecla('V')
      await esperar(300)
      conferir('cópia sem a assinatura do app vira só texto', (await plano()).nos.some((n) => n.tipo === 'texto' && n.texto === 'marca falsa'))
      // imagem apagada some do disco quando o espaço é aberto de novo
      if (imagem) {
        // copiada antes de apagar: a cópia guardada tem que sobreviver à limpeza
        await js(`window.__teste.loja.selecionar({ tipo: 'no', id: '${imagem.id}' })`)
        await tecla('C')
        await esperar(200)
        await js(`(() => { const L = window.__teste.loja; L.apagar({ tipo: 'no', id: '${imagem.id}' }) })()`)
        await js('window.__teste.loja.salvarAgora()')
        const outro = await js<string>(`(async () => { const L = window.__teste.loja; const atual = L.lerEstado().espaco.id
          await L.criarEspaco('Outro espaço', ${JSON.stringify(tmpdir())}); const outro = L.lerEstado().espaco.id
          await L.abrirEspaco(atual); return outro })()`)
        conferir('imagem apagada sai do disco ao reabrir', !existsSync(arquivoImagem), arquivoImagem.split(/[\\/]/).pop() ?? '')
        await clicar(vazio)
        await tecla('V')
        let voltou = 0
        for (let i = 0; i < 30 && !voltou; i++) {
          await esperar(100)
          voltou = await js<number>(`(() => { const n = window.__teste.loja.planoAtual().nos.find((x) => x.tipo === 'imagem');
            return n ? document.querySelector('[data-no-id="' + n.id + '"] img')?.naturalWidth ?? 0 : 0 })()`)
        }
        conferir('imagem copiada cola mesmo depois de apagada e limpa', voltou > 0, `${voltou} px`)
        // e colar em outro espaço: o cartão chega com o texto
        await js(`(() => { const L = window.__teste.loja; L.selecionar({ tipo: 'no', id: '${original}' }) })()`)
        await tecla('C')
        await esperar(200)
        await js(`window.__teste.loja.abrirEspaco('${outro}')`)
        await esperar(300)
        await clicar(vazio)
        await tecla('V')
        await esperar(400)
        const noOutro = await plano()
        const chegou = noOutro.nos.find((n) => n.tipo === 'postit')
        conferir('colar em outro espaço', !!chegou?.arquivo && (await notaDe(chegou.arquivo)) === 'cartão copiado', `${noOutro.nos.length} cartões lá`)
        await js(`window.__teste.loja.abrirEspaco('${espacoAtual}')`)
        await esperar(300)
      }
    } finally {
      if (guardada.length) await clipboard.write(guardada).catch(() => undefined)
    }

    // ---- Ctrl+K: achar o cartão pelo nome e ir até ele ----
    await js(`(() => { const L = window.__teste.loja; L.irParaAndar(L.lerEstado().espaco.andares.find((a) => a.nome === 'Seleção').id)
      const id = L.adicionarNo({ tipo: 'postit', texto: '# Plano de lançamento' }, 5000, 5000); window.__alvoBusca = id
      L.selecionar(null); L.definirCamera({ x: 0, y: 0, zoom: 1 }) })()`)
    await clicar(vazio)
    await tecla('K')
    const paleta = await js<boolean>(`!!document.querySelector('.paleta')`)
    await digitar('lancamento')
    await teclar('Enter')
    await esperar(200)
    const alvoBusca = await js<string>('window.__alvoBusca')
    const achou = await js<{ sel: string[]; naTela: boolean }>(`(() => { const L = window.__teste.loja
      const r = document.querySelector('[data-no-id="${alvoBusca}"]')?.getBoundingClientRect(); const q = document.querySelector('.quadro').getBoundingClientRect()
      return { sel: L.lerEstado().selecao.nos, naTela: !!r && r.left >= q.left && r.right <= q.right && r.top >= q.top && r.bottom <= q.bottom } })()`)
    conferir('Ctrl+K acha o cartão e vai até ele', paleta && achou.sel[0] === alvoBusca && achou.naTela, `paleta ${paleta ? 'abriu' : 'NÃO abriu'} · na tela: ${achou.naTela}`)
    await js('window.__teste.loja.irParaAndar(null)')

    // ---- portal de verdade: digitar, abrir janela da página (vira cartão e sai quando ela fecha), clicar em link ----
    const servidor = createServer((pedido, resposta) => {
      const paginas: Record<string, string> = {
        '/': `<!doctype html><title>inicio</title><body style="margin:0;font:16px sans-serif">
          <input id="campo" style="position:absolute;left:20px;top:20px;width:300px;height:40px" oninput="history.replaceState(null, '', '/digitou/' + this.value)">
          <button style="position:absolute;left:20px;top:90px;width:200px;height:50px" onclick="window.open('/popup','pop','width=420,height=320')">popup</button>
          <a href="/segunda" style="position:absolute;left:20px;top:170px;font-size:30px">segunda página</a></body>`,
        '/popup': '<!doctype html><title>popup</title><p>login</p><script>setTimeout(() => window.close(), 2500)</script>',
        '/segunda': '<!doctype html><title>segunda</title><p>chegou</p>'
      }
      resposta.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      resposta.end(paginas[pedido.url ?? '/'] ?? 'nada')
    })
    await new Promise<void>((r) => servidor.listen(0, '127.0.0.1', () => r()))
    const base = `http://127.0.0.1:${(servidor.address() as { port: number }).port}`
    try {
      const portal = await js<string>(`(() => { const L = window.__teste.loja; L.irParaAndar(L.lerEstado().espaco.andares.find((a) => a.nome === 'Seleção').id)
        L.definirCamera({ x: 0, y: 0, zoom: 1 }); const id = L.adicionarNo({ tipo: 'portal', url: '${base}/' }, 600, 420); L.selecionar(null); return id })()`)
      const cartao = `[data-no-id="${portal}"]`
      let pronto = 0
      for (let i = 0; i < 150 && !pronto; i++) {
        await esperar(100)
        pronto = await js<number>(`document.querySelector('${cartao} .portal-imagem')?.naturalWidth ?? 0`)
      }
      // seleciona o cartão (a película sai) e usa a página
      await js(`window.__teste.loja.selecionar({ tipo: 'no', id: '${portal}' }, { sozinho: true })`)
      await esperar(200)
      const naPagina = async (x: number, y: number): Promise<{ x: number; y: number }> =>
        js(`(() => { const t = document.querySelector('${cartao} .portal-tela'); const r = t.getBoundingClientRect();
          return { x: Math.round(r.left + ${x} * r.width / t.clientWidth), y: Math.round(r.top + ${y} * r.height / t.clientHeight) } })()`)
      await clicar(await naPagina(150, 40))
      for (const letra of 'OLA') {
        tela.sendInputEvent({ type: 'keyDown', keyCode: letra })
        tela.sendInputEvent({ type: 'keyUp', keyCode: letra })
        await esperar(60)
      }
      let digitado = ''
      for (let i = 0; i < 30 && !digitado.toLowerCase().endsWith('/digitou/ola'); i++) {
        await esperar(100)
        digitado = await js<string>(`window.__teste.loja.acharNo('${portal}')?.url ?? ''`)
      }
      conferir('portal: clicar e digitar na página', pronto > 0 && digitado.toLowerCase().endsWith('/digitou/ola'), digitado)
      const portais = (): Promise<number> => js<number>(`window.__teste.loja.planoAtual().nos.filter((n) => n.tipo === 'portal').length`)
      const antesDoPopup = await portais()
      await clicar(await naPagina(120, 115))
      let comPopup = antesDoPopup
      for (let i = 0; i < 40 && comPopup === antesDoPopup; i++) {
        await esperar(100)
        comPopup = await portais()
      }
      let depoisDoPopup = comPopup
      for (let i = 0; i < 60 && depoisDoPopup !== antesDoPopup; i++) {
        await esperar(100)
        depoisDoPopup = await portais()
      }
      conferir(
        'portal: janela aberta pela página vira cartão e sai quando ela fecha',
        comPopup === antesDoPopup + 1 && depoisDoPopup === antesDoPopup,
        `${antesDoPopup} → ${comPopup} → ${depoisDoPopup} portais`
      )
      await js(`window.__teste.loja.selecionar({ tipo: 'no', id: '${portal}' }, { sozinho: true })`)
      await esperar(200)
      await clicar(await naPagina(60, 190))
      let foi = ''
      for (let i = 0; i < 40 && !foi.endsWith('/segunda'); i++) {
        await esperar(100)
        foi = await js<string>(`window.__teste.loja.acharNo('${portal}')?.url ?? ''`)
      }
      conferir('portal: clicar em link navega (e o endereço fica salvo)', foi.endsWith('/segunda'), foi)
      await print('portal-chrome')
      await js(`window.__teste.loja.apagar({ tipo: 'no', id: '${portal}' }); window.__teste.loja.irParaAndar(null)`)
    } finally {
      servidor.close()
    }

    // ---- várias janelas: outro espaço numa janela nova; um espaço nunca fica aberto em duas ----
    const meuEspaco = await js<string>('window.__teste.loja.lerEstado().espaco.id')
    const outroEspaco = await js<string | undefined>(
      `window.__teste.loja.lerEstado().espacos.find((e) => e.nome === 'Outro espaço')?.id`
    )
    if (!outroEspaco) throw new Error('o espaço "Outro espaço" do teste de colar não existe')
    await js(`window.mp.janelas.nova('${outroEspaco}')`)
    let segunda: BrowserWindow | undefined
    let segundaPronta = false
    for (let i = 0; i < 100 && !segundaPronta; i++) {
      await esperar(100)
      segunda = BrowserWindow.getAllWindows().find((j) => j !== janela && !j.isDestroyed())
      segundaPronta = !!segunda && !segunda.webContents.isLoading() &&
        (await segunda.webContents
          .executeJavaScript(`window.__teste?.loja.lerEstado().espaco?.id === '${outroEspaco}'`)
          .catch(() => false))
    }
    const tituloSegunda = segunda ? segunda.webContents.getTitle() : ''
    conferir('Ctrl+Shift+N: outro espaço numa janela nova', segundaPronta && tituloSegunda.startsWith('Outro espaço'), tituloSegunda || 'a janela não abriu')
    // a primeira janela não consegue abrir nem gravar o espaço que está na segunda
    await js(`window.__teste.loja.abrirEspaco('${outroEspaco}')`)
    const continuaNoMeu = (await js<string>('window.__teste.loja.lerEstado().espaco.id')) === meuEspaco
    const sabeDaOutra = await js<boolean>(`window.__teste.loja.lerEstado().emOutrasJanelas.includes('${outroEspaco}')`)
    const gravacao = await js<string>(`window.mp.dados.carregarEspaco('${outroEspaco}')
      .then((c) => window.mp.dados.salvarEspaco(c)).then(() => 'GRAVOU', () => 'recusado')`)
    conferir(
      'espaço aberto em outra janela fica com ela',
      continuaNoMeu && sabeDaOutra && gravacao === 'recusado',
      `continua no seu: ${continuaNoMeu} · sabe da outra: ${sabeDaOutra} · gravar de fora: ${gravacao}`
    )
    // fechou a segunda: o espaço fica livre para a primeira
    if (segunda) {
      segunda.close()
      for (let i = 0; i < 50 && !segunda.isDestroyed(); i++) await esperar(100)
    }
    await esperar(200)
    await js(`window.__teste.loja.abrirEspaco('${outroEspaco}')`)
    const abriuDepois = (await js<string>('window.__teste.loja.lerEstado().espaco.id')) === outroEspaco
    conferir('fechar a janela solta o espaço', abriuDepois)
    await js(`window.__teste.loja.abrirEspaco('${meuEspaco}')`)
    janela.focus()

    // ---- andar sem git: quadro separado do térreo ----
    const noTerreo = await contarPlano()
    await js(`window.__teste.loja.criarAndar('Rascunho', false)`)
    await js(`(() => { const L = window.__teste.loja; L.adicionarNo({ tipo: 'texto' }, 300, 300)
      L.atualizarNo(L.planoAtual().nos[0].id, { texto: 'só no andar' }); L.editar(null) })()`)
    const noAndar = await contarPlano()
    await js('window.__teste.loja.irParaAndar(null)')
    const terreoDeNovo = await contarPlano()
    conferir('andar sem git tem quadro próprio', noAndar === 1 && terreoDeNovo === noTerreo, `andar ${noAndar} nó, térreo ${terreoDeNovo} (era ${noTerreo})`)
    // Ctrl+Z no andar desfaz só o andar: o térreo fica como está
    const rascunho = await js<string>('window.__teste.loja.lerEstado().espaco.andares.find((a) => a.nome === "Rascunho").id')
    await js(`window.__teste.loja.irParaAndar('${rascunho}')`)
    await clicar({ x: quadro.esquerda + 700, y: quadro.topo + 120 })
    await tecla('Z')
    await tecla('Z')
    const andarDepoisDoZ = await contarPlano()
    await js('window.__teste.loja.irParaAndar(null)')
    const terreoDepoisDoZ = await contarPlano()
    conferir('Ctrl+Z no andar não mexe no térreo', andarDepoisDoZ === 0 && terreoDepoisDoZ === noTerreo, `andar ${andarDepoisDoZ}, térreo ${terreoDepoisDoZ} (era ${noTerreo})`)

    // ---- andar com git: worktree num ramo, commit nele, juntar ao principal ----
    // pasta nova a cada rodada: os objetos do git ficam somente leitura e o Windows não deixa apagar de primeira
    const repo = join(tmpdir(), `maestri-proprio-autoteste-repo-${Date.now()}`)
    mkdirSync(repo, { recursive: true })
    const gitEm = (pasta: string, ...args: string[]): string =>
      execFileSync('git', ['-c', 'user.name=Autoteste', '-c', 'user.email=autoteste@local', ...args], { cwd: pasta, encoding: 'utf8' }).trim()
    gitEm(repo, 'init', '-q', '-b', 'main')
    // como nos repositórios do Luís: autor na configuração local (o app assina o commit de junção com ela)
    gitEm(repo, 'config', 'user.name', 'Autoteste')
    gitEm(repo, 'config', 'user.email', 'autoteste@local')
    writeFileSync(join(repo, 'leia.md'), 'projeto de teste\n')
    gitEm(repo, 'add', '.')
    gitEm(repo, 'commit', '-q', '-m', 'início')
    await js(`window.__teste.loja.criarEspaco('Repo de teste', ${JSON.stringify(repo)})`)
    await js(`window.__teste.loja.criarAndar('Arrumar login', true)`)
    const andarGit = await js<{ id: string; git: { ramo: string; pasta: string } | null } | null>(
      `(() => { const e = window.__teste.loja.lerEstado().espaco; return e.andares.find((a) => a.id === e.andarAtivo) ?? null })()`
    )
    const worktreeOk = !!andarGit?.git && existsSync(andarGit.git.pasta) && gitEm(andarGit.git.pasta, 'rev-parse', '--abbrev-ref', 'HEAD') === andarGit.git.ramo
    conferir('andar com git cria ramo e pasta isolada', worktreeOk, andarGit?.git ? `${andarGit.git.ramo}` : 'sem git')
    await js(`(() => { const L = window.__teste.loja; L.adicionarNo({ tipo: 'postit' }, 200, 200); L.editar(null)
      L.abrirVistaAndares(true) })()`)
    await esperar(700)
    await print('andares-3d')
    await js('window.__teste.loja.abrirVistaAndares(false)')
    if (andarGit?.git) {
      writeFileSync(join(andarGit.git.pasta, 'login.ts'), 'export const login = true\n')
      gitEm(andarGit.git.pasta, 'add', '.')
      gitEm(andarGit.git.pasta, 'commit', '-q', '-m', 'login no andar')
      // a pílula do andar mostra os números do git ao vivo (lê a cada 5 s)
      let numeros = ''
      for (let i = 0; i < 70 && !numeros.includes('1 commit'); i++) {
        await esperar(100)
        numeros = await js<string>(`document.querySelector('.indicador-andar .andar-numeros')?.textContent ?? ''`)
      }
      conferir('andar mostra commits ao vivo', numeros.includes('1 commit'), numeros || 'nada apareceu')
      const r = await js<{ ok: boolean; mensagem: string }>(`window.__teste.loja.pousarAndar('${andarGit.id}', true, 'main')`)
      const ramos = gitEm(repo, 'branch', '--list')
      conferir(
        'juntar andar ao principal (merge, apaga ramo e pasta)',
        r.ok && existsSync(join(repo, 'login.ts')) && !ramos.includes('andar/') && !existsSync(andarGit.git.pasta),
        r.mensagem
      )
    }
    // e apagar um andar com git: a pasta do andar some, o principal fica como estava
    await js(`window.__teste.loja.criarAndar('Experimento', true)`)
    const outro = await js<{ id: string; git: { pasta: string } } | null>(
      `(() => { const e = window.__teste.loja.lerEstado().espaco; return e.andares.find((a) => a.id === e.andarAtivo) ?? null })()`
    )
    if (outro?.git) {
      const r = await js<{ ok: boolean; mensagem: string }>(`window.__teste.loja.apagarAndar('${outro.id}', true, false)`)
      const andaresRestantes = await js<number>('window.__teste.loja.lerEstado().espaco.andares.length')
      conferir('apagar andar com git', r.ok && !existsSync(outro.git.pasta) && andaresRestantes === 0, r.mensagem)
    }

    passou = resultados.every(([, ok]) => ok)
  } catch (erro) {
    console.error('AUTOTESTE ERRO', erro)
  }
  for (const [nome, ok, detalhe] of resultados) console.log(`AUTOTESTE ${ok ? 'ok    ' : 'FALHOU'} ${nome} — ${detalhe}`)
  console.log(`AUTOTESTE ${passou ? 'PASSOU' : 'FALHOU'} — prints em ${pastaSaida}`)
  await encerrarNavegador()
  app.exit(passou ? 0 : 1)
}
