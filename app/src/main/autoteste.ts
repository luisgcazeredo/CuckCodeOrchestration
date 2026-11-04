import { app, BrowserWindow, clipboard, ClipboardItem } from 'electron'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { extrairContextoRestante } from './comandos'
import { PASTA_DADOS } from './dados'
import { encerrarNavegador, janelasNaBarra } from './navegador'
import { encerrarTodos, linhaDeComando, sessaoPorId, telaDe } from './terminais'

type Resultado = [nome: string, ok: boolean, detalhe: string]

function criarDriver(janela: BrowserWindow, pastaSaida: string) {
  const tela = janela.webContents
  const resultados: Resultado[] = []
  const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  const js = <T>(codigo: string): Promise<T> => tela.executeJavaScript(codigo)
  const conferir = (nome: string, ok: boolean, detalhe = ''): void => {
    resultados.push([nome, ok, detalhe])
  }
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
  const tecla = async (letra: string): Promise<void> => {
    tela.sendInputEvent({ type: 'keyDown', keyCode: letra, modifiers: ['control'] })
    tela.sendInputEvent({ type: 'keyUp', keyCode: letra, modifiers: ['control'] })
    await esperar(150)
  }
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
  const clicarEm = async (seletor: string): Promise<boolean> => {
    const c = await centroDe(seletor)
    if (c) await clicar(c)
    return !!c
  }
  const telaNoApp = async (id: string): Promise<string> => {
    const s = sessaoPorId(id)
    return s ? telaDe(s, 300) : ''
  }
  const telaNoCartao = (id: string): Promise<string> =>
    js<string>(`(() => { const t = window.__terminais?.[${JSON.stringify(id)}]; if (!t) return ''
      const b = t.buffer.active; const linhas = []
      for (let y = 0; y < b.length; y++) linhas.push(b.getLine(y)?.translateToString(true) ?? '')
      return linhas.join('\\n') })()`)
  const aguardar = async (ler: () => Promise<string>, procurado: string | RegExp, ms = 20_000): Promise<string> => {
    let texto = ''
    for (const limite = Date.now() + ms; Date.now() < limite; await esperar(200)) {
      texto = await ler()
      if (typeof procurado === 'string' ? texto.includes(procurado) : procurado.test(texto)) break
    }
    return texto
  }
  const comando = async (id: string, linha: string): Promise<void> => {
    const longe = await js<boolean>(`(() => { const L = window.__teste.loja; L.selecionar({ tipo: 'no', id: ${JSON.stringify(id)} })
      if (document.querySelector('[data-no-id="${id}"] .terminal-xterm')) return false
      const n = L.planoAtual().nos.find((x) => x.id === ${JSON.stringify(id)})
      L.definirCamera({ x: -n.x + 40, y: -n.y + 40, zoom: 1 }); return true })()`)
    await esperar(longe ? 900 : 250)
    await digitar(linha)
    await teclar('Return')
  }
  const comandoAte = async (id: string, linha: string, procurado: string | RegExp, ms = 8_000): Promise<string> => {
    let texto = ''
    for (let tentativa = 0; tentativa < 3; tentativa++) {
      await comando(id, linha)
      texto = await aguardar(() => telaNoApp(id), procurado, ms)
      if (typeof procurado === 'string' ? texto.includes(procurado) : procurado.test(texto)) break
    }
    return texto
  }
  const ultimas = (texto: string, n = 2): string => texto.split('\n').filter((l) => l.trim()).slice(-n).join(' | ')
  return { janela, tela, resultados, esperar, js, conferir, print, aguardarCarga, centroDe, arrastar, tecla, teclar, digitar, clicar, clicarEm, telaNoApp, telaNoCartao, aguardar, comando, comandoAte, ultimas }
}

type Driver = ReturnType<typeof criarDriver>
type Cenario = { nome: string; depende?: string; rodar: (driver: Driver) => Promise<void> }

// `npm run autoteste`: monta um quadro de exemplo numa pasta de dados temporária, tira print nos dois
// temas, usa o mouse como um usuário (arrastar terminal, ligar dois terminais pela porta), recarrega e
// confere que tudo voltou do disco. Sai com 0 (passou) ou 1 (falhou).

export async function rodarAutoteste(
  janela: BrowserWindow,
  pedirSalvamento: (janela: BrowserWindow) => Promise<boolean>
): Promise<void> {
  const legadoTela = janela.webContents
  const legadoEsperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
  const legadoJs = <T>(codigo: string): Promise<T> => legadoTela.executeJavaScript(codigo)
  // no app instalado a pasta do app é somente leitura: os prints vão para a pasta temporária
  const pastaSaida = app.isPackaged ? join(tmpdir(), 'maestri-proprio-autoteste-prints') : join(app.getAppPath(), 'out')
  mkdirSync(pastaSaida, { recursive: true })
  const driver = criarDriver(janela, pastaSaida)
  const { resultados, tela, esperar, js } = driver
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
  void legadoTela
  void legadoEsperar
  void legadoJs
  void print
  void aguardarCarga
  void centroDe
  void arrastar
  let pastaTerminais = ''
  let chefe = ''
  let espacoTerminais = ''
  let presetShell = ''
  let ajudante: { id: string; criadoPor: string; corda: boolean } | null = null
  let solto = ''
  let frente2: BrowserWindow | undefined

  const cenarios: Cenario[] = [
    {
      nome: 'quadro-portal',
      rodar: async (d) => {
        const { tela, esperar, js, print, aguardarCarga, centroDe, arrastar, conferir } = d
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
    // os três terminais são processos de verdade: espera o PowerShell de cada um desenhar o prompt e sossegar
    // (com a máquina ocupada subindo os três, o arrasto logo abaixo perdia movimentos)
    for (const id of [ids.t1, ids.t2, ids.t3]) {
      for (let i = 0; i < 100; i++) {
        const s = sessaoPorId(id)
        if (s && /PS .*>/.test(await telaDe(s, 10)) && Date.now() - s.ultimaSaida > 800) break
        await esperar(100)
      }
    }
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
    // as janelas do Chrome do app (fora da tela) não podem aparecer na barra de tarefas
    let naTarefas = { total: -1, naBarra: -1 }
    for (let i = 0; i < 40 && !(naTarefas.total >= 2 && naTarefas.naBarra === 0); i++) {
      await esperar(250)
      naTarefas = await janelasNaBarra()
    }
    conferir(
      'Chrome do app fora da barra de tarefas',
      naTarefas.total >= 2 && naTarefas.naBarra === 0,
      `${naTarefas.total} janelas do Chrome do app, ${naTarefas.naBarra} ainda na barra`
    )
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
    // botão solto onde o app não vê (em cima da página de um portal): andar com o mouse depois não arrasta nada
    const aSolto = (await no(ab.a))!
    const pegaSolto = tela2(aSolto.x + 130, aSolto.y + 80)
    tela.sendInputEvent({ type: 'mouseMove', x: pegaSolto.x, y: pegaSolto.y })
    tela.sendInputEvent({ type: 'mouseDown', x: pegaSolto.x, y: pegaSolto.y, button: 'left', clickCount: 1 })
    for (let i = 1; i <= 6; i++) {
      tela.sendInputEvent({ type: 'mouseMove', x: pegaSolto.x + i * 20, y: pegaSolto.y + i * 10 })
      await esperar(30)
    }
    await esperar(150)
    const aDepoisSolto = (await no(ab.a))!
    tela.sendInputEvent({ type: 'mouseUp', x: pegaSolto.x + 120, y: pegaSolto.y + 60, button: 'left', clickCount: 1 })
    await esperar(150)
    conferir(
      'cartão não gruda no mouse quando o botão é solto fora do app',
      aDepoisSolto.x === aSolto.x && aDepoisSolto.y === aSolto.y,
      `x ${aSolto.x} → ${aDepoisSolto.x}, y ${aSolto.y} → ${aDepoisSolto.y}`
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

    // ---- terminais de verdade e o `mpro` (integração, 28/10/2026) ----
      },
    },
    {
      nome: 'mpro',
      rodar: async (d) => {
        const { esperar, js, print, centroDe, conferir, teclar, digitar, clicar } = d
    pastaTerminais = join(tmpdir(), `maestri-proprio-autoteste-terminais-${Date.now()}`)
    mkdirSync(pastaTerminais, { recursive: true })
    await js(`window.__teste.loja.criarEspaco('Terminais', ${JSON.stringify(pastaTerminais)})`)
    await esperar(300)
    espacoTerminais = await js<string>('window.__teste.loja.lerEstado().espaco.id')
    presetShell = `window.__teste.loja.lerEstado().preferencias.presets.find((p) => p.agente === 'shell')`
    chefe = await js<string>(`(() => { const L = window.__teste.loja; L.definirCamera({ x: 0, y: 0, zoom: 1 })
      return L.adicionarNo({ tipo: 'terminal', preset: ${presetShell} }, 560, 320) })()`)
    const telaNoApp = async (id: string): Promise<string> => {
      const s = sessaoPorId(id)
      return s ? telaDe(s, 300) : ''
    }
    const telaNoCartao = (id: string): Promise<string> =>
      js<string>(`(() => { const t = window.__terminais?.[${JSON.stringify(id)}]; if (!t) return ''
        const b = t.buffer.active; const linhas = []
        for (let y = 0; y < b.length; y++) linhas.push(b.getLine(y)?.translateToString(true) ?? '')
        return linhas.join('\\n') })()`)
    const aguardar = async (ler: () => Promise<string>, procurado: string | RegExp, ms = 20_000): Promise<string> => {
      let texto = ''
      for (const limite = Date.now() + ms; Date.now() < limite; await esperar(200)) {
        texto = await ler()
        if (typeof procurado === 'string' ? texto.includes(procurado) : procurado.test(texto)) break
      }
      return texto
    }
    // seleciona o cartão (o terminal pega o foco) e digita a linha pelo teclado
    // (cartão fora da tela por mais de 1,5 s descarrega e o teclado não chega: se ele não está à vista, a câmera vai até ele)
    const comando = async (id: string, linha: string): Promise<void> => {
      const longe = await js<boolean>(`(() => { const L = window.__teste.loja; L.selecionar({ tipo: 'no', id: ${JSON.stringify(id)} })
        if (document.querySelector('[data-no-id="${id}"] .terminal-xterm')) return false
        const n = L.planoAtual().nos.find((x) => x.id === ${JSON.stringify(id)})
        L.definirCamera({ x: -n.x + 40, y: -n.y + 40, zoom: 1 }); return true })()`)
      await esperar(longe ? 900 : 250)
      await digitar(linha)
      await teclar('Return')
    }
    // A entrada sintética pode se perder logo depois de aparecer um cartão; só repete enquanto o eco ainda não veio.
    const comandoAte = async (id: string, linha: string, procurado: string | RegExp, ms = 8_000): Promise<string> => {
      let tela = ''
      for (let tentativa = 0; tentativa < 3; tentativa++) {
        await comando(id, linha)
        tela = await aguardar(() => telaNoApp(id), procurado, ms)
        if (typeof procurado === 'string' ? tela.includes(procurado) : procurado.test(tela)) break
      }
      return tela
    }
    const ultimas = (texto: string, n = 2): string => texto.split('\n').filter((l) => l.trim()).slice(-n).join(' | ')
    void comandoAte

    await aguardar(() => telaNoApp(chefe), /PS .*>/)
    await comando(chefe, 'echo "MP-$(2+3)"')
    const eco = await aguardar(() => telaNoCartao(chefe), /^MP-5/m)
    conferir('terminal de verdade: digita no cartão e o PowerShell responde', /^MP-5/m.test(eco), ultimas(eco))

    // um clique de mouse só no corpo do cartão já deixa escrever (o teste acima seleciona pela loja, que não
    // passa pelo escudo nem pelo foco): era o defeito de 29/10/2026, em que a letra virava atalho do quadro
    await js(`window.__teste.loja.selecionar(null)`)
    await esperar(200)
    const corpoDoChefe = await centroDe(`[data-no-id="${chefe}"] .terminal-corpo`)
    if (!corpoDoChefe) throw new Error("corpo do terminal não está na tela")
    await clicar(corpoDoChefe)
    const focoNoTerminal = await js<boolean>(
      `!!document.activeElement?.closest('[data-no-id="${chefe}"] .xterm')`
    )
    const ferramentaAntes = await js<string>(`window.__teste.loja.lerEstado().ferramenta`)
    await digitar('echo "MP-UM-CLIQUE"')
    await teclar('Return')
    const umClique = await aguardar(() => telaNoCartao(chefe), /^MP-UM-CLIQUE/m)
    const ferramentaDepois = await js<string>(`window.__teste.loja.lerEstado().ferramenta`)
    conferir(
      'um clique no cartão e já escreve (a letra não vira atalho do quadro)',
      focoNoTerminal && /^MP-UM-CLIQUE/m.test(umClique) && ferramentaDepois === ferramentaAntes,
      `foco no terminal: ${focoNoTerminal} · ferramenta ${ferramentaAntes} → ${ferramentaDepois} · ${ultimas(umClique)}`
    )

    // zoom: depois de parar, o xterm é redesenhado com a fonte × zoom, e as colunas do processo ficam as mesmas
    const colunas = sessaoPorId(chefe)?.espelho.cols
    await js('window.__teste.loja.definirCamera({ x: -300, y: -150, zoom: 1.6 })')
    await esperar(900)
    const nitido = await js<{ escala: string; fonte: number }>(`(() => ({
      escala: document.querySelector('[data-no-id="${chefe}"] .terminal-caixa')?.dataset.escala ?? '',
      fonte: window.__terminais?.['${chefe}']?.options.fontSize ?? 0 }))()`)
    await print('terminal-zoom')
    conferir(
      'zoom redesenha o texto no tamanho real, sem mudar as colunas',
      nitido.escala === '1.6' && nitido.fonte > 19 && sessaoPorId(chefe)?.espelho.cols === colunas,
      `escala ${nitido.escala} · fonte ${nitido.fonte.toFixed(1)} · colunas ${colunas} → ${sessaoPorId(chefe)?.espelho.cols}`
    )
    await js('window.__teste.loja.definirCamera({ x: 0, y: 0, zoom: 1 })')

    // trocar de espaço não encerra o processo; ao voltar, o cartão se liga de novo e a tela volta
    const pid = sessaoPorId(chefe)?.processo?.pid
    const espacoVizinho = await js<string>(`(() => { const e = window.__teste.loja.lerEstado()
      return e.espacos.find((x) => x.id !== e.espaco.id && !e.emOutrasJanelas.includes(x.id)).id })()`)
    await js(`window.__teste.loja.abrirEspaco('${espacoVizinho}')`)
    await esperar(500)
    const vivoFora = sessaoPorId(chefe)?.processo?.pid === pid && sessaoPorId(chefe)?.vistas.size === 0
    await js(`window.__teste.loja.abrirEspaco('${espacoTerminais}')`)
    const deVolta = await aguardar(() => telaNoCartao(chefe), /^MP-5/m, 5000)
    conferir(
      'trocar de espaço e voltar: o processo segue e a tela volta',
      vivoFora && sessaoPorId(chefe)?.processo?.pid === pid && /^MP-5/m.test(deVolta),
      `pid ${pid} · vivo fora: ${vivoFora}`
    )

    // fora da tela por um tempo: o cartão para de desenhar (o processo segue) e volta igual
    await js('window.__teste.loja.definirCamera({ x: -40000, y: 0, zoom: 1 })')
    await esperar(2500)
    const descarregou =
      (await js<boolean>(`!!document.querySelector('[data-no-id="${chefe}"] .terminal-descarregado')`)) && sessaoPorId(chefe)?.vistas.size === 0
    await js('window.__teste.loja.definirCamera({ x: 0, y: 0, zoom: 1 })')
    const voltou = await aguardar(() => telaNoCartao(chefe), /^MP-5/m, 5000)
    conferir('fora da tela o cartão para de desenhar e volta igual', descarregou && /^MP-5/m.test(voltou), `descarregou: ${descarregou}`)

    // o `mpro` dentro do terminal: quem, abrir (com pedido e espera), ver, permissão pela corda, fechar
      },
    },
    {
      nome: 'mpro-conexoes',
      depende: 'mpro',
      rodar: async (d) => {
        const { esperar, js, conferir, aguardar, comando, telaNoApp, ultimas } = d
    await comando(chefe, 'mpro quem')
    const quem = await aguardar(() => telaNoApp(chefe), 'Você é "PowerShell"')
    conferir('mpro quem (o comando existe dentro do terminal)', quem.includes('Você é "PowerShell"'), ultimas(quem, 3))

    await comando(chefe, "mpro abrir shell --nome Ajudante --pedido 'echo AJUDANTE-$(3*3)' --esperar --tempo 40")
    const abriu = await aguardar(() => telaNoApp(chefe), /terminou\. Tela:[\s\S]*AJUDANTE-9/, 60_000)
    ajudante = await js<{ id: string; criadoPor: string; corda: boolean } | null>(`(() => {
      const p = window.__teste.loja.planoAtual()
      const n = p.nos.find((x) => x.tipo === 'terminal' && x.nome === 'Ajudante'); if (!n) return null
      return { id: n.id, criadoPor: n.criadoPor, corda: p.cordas.some((c) => c.de === '${chefe}' && c.para === n.id) } })()`)
    conferir(
      'mpro abrir: sessão nova ao lado, ligada, com o pedido feito',
      !!ajudante && ajudante.criadoPor === chefe && ajudante.corda && /AJUDANTE-9/.test(abriu),
      ajudante ? `corda: ${ajudante.corda} · ${ultimas(abriu)}` : `cartão não apareceu · ${ultimas(abriu, 4)}`
    )

    solto = await js<string>(`(() => { const L = window.__teste.loja
      const id = L.adicionarNo({ tipo: 'terminal', preset: ${presetShell} }, 560, 1100); L.atualizarNo(id, { nome: 'Solto' }); return id })()`)
    await aguardar(() => telaNoApp(solto), /PS .*>/)
    await comando(chefe, 'mpro pedir Solto "echo NAO-DEVIA"')
    const recusou = await aguardar(() => telaNoApp(chefe), 'ninguém ligado a você se chama "Solto"', 15_000)
    await comando(chefe, 'mpro ver Ajudante --linhas 20')
    const viu = await aguardar(() => telaNoApp(chefe), /"Ajudante" · livre[\s\S]*AJUDANTE-9/, 15_000)
    conferir(
      'mpro ver lê a tela do outro; sem corda, recusa',
      /"Ajudante" · livre/.test(viu) && recusou.includes('ninguém ligado') && !(await telaNoApp(solto)).includes('NAO-DEVIA'),
      `${ultimas(viu)} · fim do Ajudante: ${JSON.stringify((await telaNoApp(ajudante?.id ?? '')).split('\n').slice(-2))}`
    )

    // nada é digitado em quem está numa pergunta, nem com a tela ainda mexendo (o diálogo acabou de aparecer);
    // o cartão "Dialogo" é do tipo Claude, mas no autoteste roda só o PowerShell, que imita o rodapé de um diálogo
    const dialogo = await js<string>(`(() => { const L = window.__teste.loja
      const id = L.adicionarNo({ tipo: 'terminal', preset: L.lerEstado().preferencias.presets.find((p) => p.agente === 'claude') }, 1600, 1100)
      L.atualizarNo(id, { nome: 'Dialogo' }); L.ligar('${chefe}', id); return id })()`)
    await aguardar(() => telaNoApp(dialogo), /PS .*>/)
    await comando(dialogo, "while ($true) { Write-Host 'Enter to confirm - Esc to cancel'; Start-Sleep -Milliseconds 300 }")
    await esperar(1500)
    await comando(chefe, "mpro pedir Dialogo 'NAO-DIGITAR'; echo FIM-DIALOGO")
    const naPergunta = await aguardar(() => telaNoApp(chefe), /^FIM-DIALOGO/m, 20_000)
    await comando(chefe, 'mpro teclas Dialogo ctrl-c')
    // e um PowerShell rodando um comando quieto não está livre: o pedido não cai no meio dele
    await js(`window.__teste.loja.ligar('${chefe}', '${solto}')`)
    await comando(solto, 'Start-Sleep 20')
    await esperar(2000)
    await comando(chefe, "mpro pedir Solto 'echo NO-MEIO'; echo FIM-OCUPADO")
    const ocupado = await aguardar(() => telaNoApp(chefe), /^FIM-OCUPADO/m, 20_000)
    await comando(chefe, 'mpro teclas Solto ctrl-c')
    conferir(
      'mpro não digita em pergunta (nem com a tela mexendo) nem em shell ocupado',
      /parado\s+numa\s+pergunta/.test(naPergunta) &&
        !(await telaNoApp(dialogo)).includes('NAO-DIGITAR') &&
        /rodando\s+um\s+comando/.test(ocupado) &&
        !(await telaNoApp(solto)).includes('NO-MEIO'),
      `pergunta: ${/parado\s+numa\s+pergunta/.test(naPergunta)} · ocupado: ${/rodando\s+um\s+comando/.test(ocupado)}`
    )
    await js(`window.__teste.loja.apagar({ tipo: 'no', id: '${dialogo}' })`)

    const gitBash = [join(process.env.LOCALAPPDATA ?? '', 'Programs', 'Git', 'bin', 'bash.exe'), 'C:\\Program Files\\Git\\bin\\bash.exe'].find(
      (c) => existsSync(c)
    )
    if (gitBash) {
      // o Claude Code roda comandos pelo Git Bash: lá vale o script sh, não o .cmd
      await comando(chefe, `& '${gitBash}' -c 'mpro quem >/dev/null && echo BASH-MPRO-OK'`)
      const bash = await aguardar(() => telaNoApp(chefe), /^BASH-MPRO-OK/m, 60_000)
      conferir('mpro também funciona pelo Git Bash', /^BASH-MPRO-OK/m.test(bash), ultimas(bash))
    }

    await comando(chefe, 'mpro fechar Solto')
    await aguardar(() => telaNoApp(chefe), /mpro: ninguém ligado a você se chama "Solto"[\s\S]*mpro: ninguém ligado a você se chama "Solto"/, 15_000)
    await comando(chefe, 'mpro fechar Ajudante')
    await aguardar(() => telaNoApp(chefe), 'Fechei "Ajudante"', 15_000)
    await esperar(300)
    const sobrou = await js<string[]>(`window.__teste.loja.planoAtual().nos.filter((n) => n.tipo === 'terminal').map((n) => n.nome)`)
    conferir(
      'mpro fechar: só fecha o que ele abriu, e o cartão some',
      !sobrou.includes('Ajudante') && sobrou.includes('Solto') && !!ajudante && !sessaoPorId(ajudante.id),
      sobrou.join(', ')
    )

      },
    },
    {
      nome: 'mpro-espacos',
      depende: 'mpro-conexoes',
      rodar: async (d) => {
        const { tela, esperar, js, centroDe, clicar, conferir, aguardar, comando, telaNoApp, ultimas } = d
    await comando(chefe, 'mpro espacos')
    const espacosDoMpro = await aguardar(() => telaNoApp(chefe), '"Terminais"')
    conferir(
      'mpro espacos lista o espaço do agente e o marca',
      /\* "Terminais"[\s\S]*seu espaço/.test(espacosDoMpro),
      ultimas(espacosDoMpro, 5)
    )

    await comando(chefe, 'mpro janela --novo "Frente 2"')
    await aguardar(() => telaNoApp(chefe), 'Criei o espaço "Frente 2"')
    let frente2Pronta = false
    for (let i = 0; i < 100 && !frente2Pronta; i++) {
      await esperar(100)
      frente2 = BrowserWindow.getAllWindows().find((j) => j !== janela && !j.isDestroyed())
      frente2Pronta = !!frente2 &&
        (await frente2.webContents.executeJavaScript(`window.__teste?.loja.lerEstado().espaco?.nome === 'Frente 2'`).catch(() => false))
    }
    conferir('mpro janela --novo cria o espaço e abre a janela', frente2Pronta, frente2 ? frente2.webContents.getTitle() : 'sem janela')

    await comando(chefe, 'mpro abrir --espaco "Frente 2" shell --nome "Longe"')
    const abriuLonge = await aguardar(() => telaNoApp(chefe), 'Abri "Longe"')
    const longe = frente2
      ? await frente2.webContents.executeJavaScript(`(() => { const n = window.__teste.loja.planoAtual().nos
          .find((x) => x.tipo === 'terminal' && x.nome === 'Longe'); return n ? { id: n.id, criadoPor: n.criadoPor } : null })()`).catch(() => null)
      : null
    await comando(chefe, 'mpro ver Longe --linhas 5')
    const viuLonge = await aguardar(() => telaNoApp(chefe), '"Longe"')
    conferir(
      'mpro abrir --espaco cria longe e o dono ainda consegue ver sem corda',
      !!longe && longe.criadoPor === chefe && abriuLonge.includes('porque o abriu') && viuLonge.includes('"Longe"'),
      longe ? `criado por: ${longe.criadoPor}` : ultimas(abriuLonge, 4)
    )

    await comando(chefe, 'mpro orcamento')
    const orcamento = await aguardar(() => telaNoApp(chefe), /contexto: (\d+% restante|não deu para ler)/i)
    conferir('mpro orcamento responde mesmo sem contexto na tela', /contexto: (\d+% restante|não deu para ler)/i.test(orcamento), ultimas(orcamento))

    // painel: só consulta o espelho enquanto aberto; aqui basta haver um terminal conhecido, com estado e contexto.
    const botaoContexto = await centroDe('button[title="Contexto dos terminais"]')
    if (botaoContexto) await clicar(botaoContexto)
    await esperar(350)
    const painelContexto = await js<{ linhas: number; texto: string }>(`(() => ({
      linhas: document.querySelectorAll('.contexto-terminal').length,
      texto: document.querySelector('.painel-contexto')?.textContent ?? ''
    }))()`)
    tela.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    tela.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await esperar(150)
    const painelFechado = await js<boolean>('!document.querySelector(".painel-contexto")')
    conferir(
      'painel de contexto abre, mostra situação/contexto e fecha com Esc',
      painelContexto.linhas > 0 && /livre|trabalhando|pergunta|encerrado/.test(painelContexto.texto) && /%|—/.test(painelContexto.texto) && painelFechado,
      `${painelContexto.linhas} linhas · fechado: ${painelFechado}`
    )

    // a janela do "Frente 2" ficou com o foco do Windows, e teclado sintético vai para a janela focada:
    // sem isto, o que vem abaixo é digitado no vazio
    janela.focus()
    await esperar(400)

      },
    },
    {
      nome: 'mpro-heranca',
      depende: 'mpro-espacos',
      rodar: async (d) => {
        const { esperar, js, conferir, aguardar, comando, comandoAte, telaNoApp, ultimas } = d
    await comandoAte(chefe, 'mpro abrir shell --nome "Diálogo antigo"', 'Abri "Diálogo antigo"')
    const dialogoAntigo = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'terminal' && n.nome === 'Diálogo antigo')?.id ?? ''`)
    await aguardar(() => telaNoApp(dialogoAntigo), /PS .*>/)
    // As linhas em branco imitam a folga visual; as seguras contam como texto e empurram a citação para fora da janela.
    await comando(dialogoAntigo, 'Write-Output "[y/n]"; 1..6 | ForEach-Object { Write-Output ""; Write-Output "linha segura $_" }')
    await aguardar(() => telaNoApp(dialogoAntigo), 'linha segura 6')
    await esperar(1300)
    const pediuDepoisDoDialogo = await comandoAte(chefe, 'mpro pedir "Diálogo antigo" "echo MP-DIALOGO-ANTIGO"', 'MP-DIALOGO-ANTIGO')
    conferir(
      'diálogo citado fora das últimas seis linhas não bloqueia mpro pedir',
      pediuDepoisDoDialogo.includes('MP-DIALOGO-ANTIGO'),
      ultimas(pediuDepoisDoDialogo, 5)
    )
    await comandoAte(chefe, 'mpro fechar "Diálogo antigo"', 'Fechei "Diálogo antigo"')

    const heranca = await js<string>(`(() => { const L = window.__teste.loja
      const id = L.adicionarNo({ tipo: 'terminal', preset: ${presetShell} }, 2200, 1280); L.atualizarNo(id, { nome: 'Raiz herança' }); return id })()`)
    await aguardar(() => telaNoApp(heranca), /PS .*>/)
    await comandoAte(heranca, 'mpro abrir shell --nome "Filho herança"', 'Abri "Filho herança"')
    const filhoHeranca = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'terminal' && n.nome === 'Filho herança')?.id ?? ''`)
    await aguardar(() => telaNoApp(filhoHeranca), /PS .*>/)
    await comandoAte(filhoHeranca, 'mpro abrir shell --nome "Neto herança"', 'Abri "Neto herança"')
    const netoHeranca = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'terminal' && n.nome === 'Neto herança')?.id ?? ''`)
    const fechouFilho = await comandoAte(heranca, 'mpro fechar "Filho herança"', 'que ela tinha aberto agora')
    const viuNeto = await comandoAte(heranca, 'mpro ver "Neto herança"', '"Neto herança"')
    const fechouNeto = await comandoAte(heranca, 'mpro fechar "Neto herança"', 'Fechei "Neto herança"')
    conferir(
      'mpro fechar herda netos e o novo dono consegue ver e fechar',
      !!netoHeranca && fechouFilho.includes('que ela tinha aberto agora') && viuNeto.includes('"Neto herança"') && fechouNeto.includes('Fechei "Neto herança"') && !sessaoPorId(filhoHeranca) && !sessaoPorId(netoHeranca),
      `herança: ${fechouFilho.includes('que ela tinha aberto agora')} · viu: ${viuNeto.includes('"Neto herança"')} · fechou: ${fechouNeto.includes('Fechei "Neto herança"')}`
    )
    await js(`window.__teste.loja.apagar({ tipo: 'no', id: '${heranca}' })`)

    const aposentadoria = await js<{ antigo: string; sucessor: string }>(`(() => { const L = window.__teste.loja
      const preset = L.lerEstado().preferencias.presets.find((p) => p.agente === 'shell')
      const antigo = L.adicionarNo({ tipo: 'terminal', preset }, 2200, 300)
      const sucessor = L.adicionarNo({ tipo: 'terminal', preset }, 2200, 850)
      L.atualizarNo(antigo, { nome: 'Antigo' }); L.atualizarNo(sucessor, { nome: 'Sucessor' }); L.ligar(antigo, sucessor)
      return { antigo, sucessor } })()`)
    await aguardar(() => telaNoApp(aposentadoria.antigo), /PS .*>/)
    await aguardar(() => telaNoApp(aposentadoria.sucessor), /PS .*>/)
    await comando(aposentadoria.antigo, 'mpro abrir shell --nome Herdado')
    await aguardar(() => telaNoApp(aposentadoria.antigo), 'Abri "Herdado"')
    const herdado = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'terminal' && n.nome === 'Herdado')?.id ?? ''`)
    // entrada sintética às vezes se perde (o cartão acabou de ganhar um vizinho novo): tenta até o eco aparecer
    let recusouSair = ''
    for (let tentativa = 0; tentativa < 3 && !recusouSair.includes('mpro passar'); tentativa++) {
      await comando(aposentadoria.antigo, 'mpro sair')
      recusouSair = await aguardar(() => telaNoApp(aposentadoria.antigo), 'mpro passar', 8000)
    }
    await comando(aposentadoria.antigo, 'mpro passar Sucessor')
    const passouSessao = await aguardar(() => telaNoApp(aposentadoria.antigo), 'Passei 1 sessão para "Sucessor"')
    await comando(aposentadoria.antigo, 'mpro fechar Herdado')
    const antigoNaoFecha = await aguardar(() => telaNoApp(aposentadoria.antigo), 'ninguém ligado a você se chama "Herdado"')
    await comando(aposentadoria.sucessor, 'mpro fechar Herdado')
    const sucessorFecha = await aguardar(() => telaNoApp(aposentadoria.sucessor), 'Fechei "Herdado"')
    conferir(
      'mpro passar move a propriedade; antigo não fecha e sucessor fecha',
      !!herdado && recusouSair.includes('mpro passar') && passouSessao.includes('Passei 1') && antigoNaoFecha.includes('ninguém ligado') && sucessorFecha.includes('Fechei'),
      `herdado:${!!herdado} recusou:${recusouSair.includes('mpro passar')} passou:${passouSessao.includes('Passei 1')} ` +
        `antigoNaoFecha:${antigoNaoFecha.includes('ninguém ligado')} sucessorFecha:${sucessorFecha.includes('Fechei')} · APOS SAIR: ${ultimas(recusouSair, 4)}`
    )
    const respostaSair = join(tmpdir(), `maestri-proprio-sair-${randomUUID()}.txt`)
    await comando(aposentadoria.antigo, `mpro sair --motivo "fim do contexto" | Out-File -Encoding utf8 '${respostaSair}'`)
    for (let i = 0; i < 30 && sessaoPorId(aposentadoria.antigo); i++) await esperar(100)
    const antigoSaiu = !sessaoPorId(aposentadoria.antigo)
    const respostaAntesDeSair = existsSync(respostaSair) ? readFileSync(respostaSair, 'utf8') : ''
    rmSync(respostaSair, { force: true })
    conferir(
      'mpro sair responde antes de fechar o próprio cartão',
      // sem o acento: o PowerShell decodifica a saída de programa nativo pela página de código OEM, e
      // `ã` viraria lixo no arquivo (na tela do terminal aparece certo)
      antigoSaiu && /Vou fechar seu cart.{1,3}o./.test(respostaAntesDeSair),
      `cartão saiu: ${antigoSaiu} · resposta: ${JSON.stringify(respostaAntesDeSair.trim())}`
    )
    await js(`window.__teste.loja.apagar({ tipo: 'no', id: '${aposentadoria.sucessor}' })`)

    const sairComAsMinhas = await js<string>(`(() => { const L = window.__teste.loja
      const preset = L.lerEstado().preferencias.presets.find((p) => p.agente === 'shell')
      const id = L.adicionarNo({ tipo: 'terminal', preset }, 2900, 300); L.atualizarNo(id, { nome: 'Com as minhas' }); return id })()`)
    await aguardar(() => telaNoApp(sairComAsMinhas), /PS .*>/)
    await comandoAte(sairComAsMinhas, 'mpro abrir shell --nome Junto', 'Abri "Junto"')
    const junto = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'terminal' && n.nome === 'Junto')?.id ?? ''`)
    await aguardar(() => telaNoApp(junto), /PS .*>/)
    await comandoAte(junto, 'mpro abrir shell --nome "Neto junto"', 'Abri "Neto junto"')
    const netoJunto = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'terminal' && n.nome === 'Neto junto')?.id ?? ''`)
    await comando(sairComAsMinhas, 'mpro sair --com-as-minhas')
    for (let i = 0; i < 30 && (sessaoPorId(sairComAsMinhas) || sessaoPorId(junto) || sessaoPorId(netoJunto)); i++) await esperar(100)
    conferir(
      'mpro sair --com-as-minhas fecha a árvore inteira',
      !sessaoPorId(sairComAsMinhas) && !sessaoPorId(junto) && !sessaoPorId(netoJunto),
      `raiz: ${!!sessaoPorId(sairComAsMinhas)} · filho: ${!!sessaoPorId(junto)} · neto: ${!!sessaoPorId(netoJunto)}`
    )

    for (let i = 1; i <= 7; i++) {
      const nome = `Limite ${i}`
      await comando(chefe, `mpro abrir shell --nome "${nome}"`)
      await aguardar(() => telaNoApp(chefe), `Abri "${nome}"`, 20_000)
    }
    await comando(chefe, 'mpro abrir --espaco "Frente 2" shell --nome "Nono"')
    const nono = await aguardar(() => telaNoApp(chefe), 'o limite é 8', 20_000)
    conferir('mpro mantém o limite de 8 somando os dois espaços', nono.includes('o limite é 8'), ultimas(nono, 3))

    const limiteEmFolga = await js<string>(`(() => { const L = window.__teste.loja
      const n = L.planoAtual().nos.find((n) => n.tipo === 'terminal' && n.nome === 'Limite 1'); if (!n) return ''
      L.apagar({ tipo: 'no', id: n.id }); return n.id })()`)
    const recusouNaFolga = await comandoAte(chefe, 'mpro abrir shell --nome "Durante a folga"', 'o limite é 8')
    conferir(
      'limite de 8 inclui cartão apagado durante a folga do Ctrl+Z',
      !!limiteEmFolga && recusouNaFolga.includes('o limite é 8'),
      ultimas(recusouNaFolga, 3)
    )

    await js(`(() => { const L = window.__teste.loja
      for (const n of L.planoAtual().nos.filter((n) => n.tipo === 'terminal' && n.criadoPor === '${chefe}')) L.apagar({ tipo: 'no', id: n.id })
      return L.salvarAgora() })()`)
    if (frente2) {
      await frente2.webContents.executeJavaScript(`window.__teste.loja.apagarEspaco(window.__teste.loja.lerEstado().espaco.id)`).catch(() => undefined)
      await pedirSalvamento(frente2)
      frente2.close()
      for (let i = 0; i < 50 && !frente2.isDestroyed(); i++) await esperar(100)
    }

    // apagar o cartão: o processo espera a folga (o Ctrl+Z traz o cartão com ele vivo); depois encerra
    const pidSolto = sessaoPorId(solto)?.processo?.pid
    await js(`(() => { const L = window.__teste.loja; L.selecionar({ tipo: 'no', id: '${solto}' }); L.apagarSelecao(); L.desfazer() })()`)
    await esperar(2500)
    const continua = !!pidSolto && sessaoPorId(solto)?.processo?.pid === pidSolto
    await js(`(() => { const L = window.__teste.loja; L.selecionar({ tipo: 'no', id: '${solto}' }); L.apagarSelecao() })()`)
    await esperar(2500)
    conferir('apagar terminal: Ctrl+Z na folga mantém o processo; depois ele encerra', continua && !sessaoPorId(solto), `continuou: ${continua}`)

    // presets: criar "Claude Opus" (claude --model opus) pelo diálogo, com mouse e teclado, e abrir um terminal com ele
      },
    },
    {
      nome: 'mpro-presets',
      depende: 'mpro-heranca',
      rodar: async (d) => {
        const { esperar, js, print, centroDe, tecla, digitar, clicar, conferir } = d
    const clicarEm = async (seletor: string): Promise<boolean> => {
      const c = await centroDe(seletor)
      if (c) await clicar(c)
      return !!c
    }
    await clicarEm('.barra-ferramentas button[title="Terminal"]')
    const abriuEditor = (await clicarEm('.menu-terminal-editar')) && (await clicarEm('.preset-novo'))
    await clicarEm('.preset-linha:last-child .preset-nome')
    await tecla('A')
    await digitar('Claude Opus')
    await clicarEm('.preset-linha:last-child .preset-comando')
    await tecla('A')
    await digitar('claude --model opus')
    await print('presets')
    await clicarEm('.dialogo-acoes .primario')
    const opus = await js<string>(
      `window.__teste.loja.lerEstado().preferencias.presets.find((p) => p.nome === 'Claude Opus')?.comando ?? ''`
    )
    await clicarEm('.barra-ferramentas button[title="Terminal"]')
    const botaoOpus = await js<{ x: number; y: number } | null>(`(() => {
      const b = [...document.querySelectorAll('.menu-terminal button')].find((x) => x.textContent?.trim() === 'Claude Opus')
      const r = b?.getBoundingClientRect(); return r ? { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } : null })()`)
    if (botaoOpus) await clicar(botaoOpus)
    const noOpus = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'terminal' && n.nome === 'Claude Opus')?.id ?? ''`)
    await esperar(300)
    const linhaOpus = sessaoPorId(noOpus) ? linhaDeComando(sessaoPorId(noOpus)!.espec) : ''
    conferir(
      'preset novo "Claude Opus" pelo diálogo abre com o comando certo',
      abriuEditor && opus === 'claude --model opus' && /^claude --model opus --session-id [0-9a-f-]{36}$/.test(linhaOpus),
      `preset: ${opus || 'não gravou'} · linha: ${linhaOpus || 'sem processo'}`
    )
    await js(`window.__teste.loja.apagar({ tipo: 'no', id: '${noOpus}' })`)

    // retomar a conversa: o Claude nasce com o id escolhido e volta com --resume; o Codex volta com `codex resume`
    const pastaClaudeTeste = join(tmpdir(), `maestri-proprio-autoteste-claude-${Date.now()}`)
    process.env.CLAUDE_CONFIG_DIR = pastaClaudeTeste
    const conversa = randomUUID()
    const especClaude = { id: randomUUID(), nome: 'C', agente: 'claude' as const, comando: 'claude --model opus', pasta: pastaTerminais, sessao: conversa }
    const inicial = linhaDeComando(especClaude)
    mkdirSync(join(pastaClaudeTeste, 'projects', 'qualquer'), { recursive: true })
    writeFileSync(join(pastaClaudeTeste, 'projects', 'qualquer', `${conversa}.jsonl`), '{}\n')
    const retomada = linhaDeComando(especClaude)
    const codex = linhaDeComando({ ...especClaude, agente: 'codex', comando: 'codex --no-daemon' })
    delete process.env.CLAUDE_CONFIG_DIR
    const claudeNovo = await js<string>(`(() => { const L = window.__teste.loja
      const id = L.adicionarNo({ tipo: 'terminal', preset: L.lerEstado().preferencias.presets.find((p) => p.agente === 'claude') }, 1600, 300)
      return L.planoAtual().nos.find((n) => n.id === id).sessao ?? '' })()`)
    conferir(
      'retomar conversa: Claude --session-id e depois --resume; Codex resume',
      inicial === `claude --model opus --session-id ${conversa}` &&
        retomada === `claude --model opus --resume ${conversa}` &&
        codex === `codex resume ${conversa} --no-daemon` &&
        /^[0-9a-f-]{36}$/.test(claudeNovo),
      `${inicial} · ${retomada} · ${codex} · cartão novo: ${claudeNovo ? 'com id' : 'sem id'}`
    )

    // o leitor de contexto por fora: prova os formatos conhecidos sem gastar conta de agente. O rodapé de verdade
    // (Claude e Codex) só é exercitado no bloco opcional abaixo
    const exemplos: Array<[string, number | null]> = [
      ["Context left until auto-compact: 23%", 23],
      ["  ? for shortcuts                                    17% context left", 17],
      ["tokens remaining: 8%", 8],
      ["PS C:\Users\luisg> echo 50%", null],
      ["for shortcuts · context left", null]
    ]
    const erradas = exemplos.filter(([tela, esperado]) => extrairContextoRestante(tela) !== esperado)
    conferir(
      "leitor de contexto: lê os formatos conhecidos e não adivinha no resto",
      erradas.length === 0,
      erradas.map(([tela]) => `${tela} → ${extrairContextoRestante(tela)}`).join(" | ")
    )

    // opcional (gasta um pouco da conta): `MP_AGENTES_DE_VERDADE=1 npm run autoteste` abre um Claude e um Codex de
    // verdade pelo `mpro`, na pasta do app; a resposta (uma conta) não aparece no texto do pedido
      },
    },
    {
      nome: 'agentes',
      depende: 'mpro-presets',
      rodar: async (d) => {
        const { esperar, js, print, conferir, comando, aguardar, telaNoApp, ultimas } = d
    if (process.env.MP_AGENTES_DE_VERDADE) {
      const pastaApp = app.getAppPath()
      // `confiar`: as teclas que aceitam a pergunta de confiança na pasta, se ela aparecer (no Claude o cursor começa no "não")
      const casos = [
        { agente: 'claude', nome: 'Claudinho', pergunta: 'Quanto é 21 vezes 2? Responda só com o número seguido de -OK.', resposta: '42-OK', confiar: 'baixo enter' },
        { agente: 'codex', nome: 'Codexinho', pergunta: 'Quanto é 30 mais 7? Responda só com o número seguido de -OK.', resposta: '37-OK', confiar: 'enter' }
      ]
      for (const caso of casos) {
        // o cartão do chefe na tela: fora dela por mais de 1,5 s, ele descarrega e o teclado não chega
        await js('window.__teste.loja.definirCamera({ x: 0, y: 0, zoom: 1 })')
        await esperar(300)
        await comando(
          chefe,
          `mpro abrir ${caso.agente} --nome ${caso.nome} --pasta '${pastaApp}' --pedido '${caso.pergunta}' --esperar --tempo 150; echo FIM-ABRIR-${caso.nome}`
        )
        let saida = await aguardar(() => telaNoApp(chefe), new RegExp(`^FIM-ABRIR-${caso.nome}`, 'm'), 200_000)
        const id = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.nome === '${caso.nome}')?.id ?? ''`)
        // pasta nova para o agente: confiança, servidores MCP do projeto, aviso de atualização… O `mpro` não digita
        // em cima de pergunta; o teste responde pelo `mpro teclas` (a regra do agente é decidir ou perguntar ao usuário)
        for (let i = 0; i < 4 && !saida.includes(caso.resposta); i++) {
          const naTela = (await telaNoApp(id)).split('\n').slice(-25).join('\n')
          const teclas = /I trust this folder|Trust and continue/i.test(naTela)
            ? caso.confiar
            : /MCP servers/i.test(naTela)
              ? 'esc'
              : /update now/i.test(naTela)
                ? 'baixo enter'
                : null
          if (teclas) {
            await comando(chefe, `mpro teclas ${caso.nome} ${teclas}; echo FIM-T${i}-${caso.nome}`)
            await aguardar(() => telaNoApp(chefe), new RegExp(`^FIM-T${i}-${caso.nome}`, 'm'), 30_000)
            await esperar(5000)
          }
          await comando(chefe, `mpro pedir ${caso.nome} '${caso.pergunta}' --tempo 150; echo FIM-P${i}-${caso.nome}`)
          saida = await aguardar(() => telaNoApp(chefe), new RegExp(`^FIM-P${i}-${caso.nome}`, 'm'), 200_000)
        }
        // o Claude grava a conversa com o id que demos; o do Codex é descoberto pelo arquivo dele (a cada 5 s)
        let retomar = ''
        for (let i = 0; i < 40 && !/--resume|codex resume/.test(retomar); i++) {
          await esperar(500)
          const s = sessaoPorId(id)
          retomar = s ? linhaDeComando(s.espec) : ''
        }
        await js(`(() => { const L = window.__teste.loja; const n = L.planoAtual().nos.find((x) => x.id === '${id}')
          if (n) L.definirCamera({ x: -n.x + 60, y: -n.y + 60, zoom: 1 }) })()`)
        await esperar(800)
        await print(`agente-${caso.agente}`)
        conferir(
          `${caso.agente} de verdade: abre pelo mpro, responde e a conversa fica para retomar`,
          saida.includes(caso.resposta) && /--resume|codex resume/.test(retomar),
          `${saida.includes(caso.resposta) ? 'respondeu' : ultimas(saida, 6)} · ${retomar}`
        )
        await comando(chefe, `mpro fechar ${caso.nome}`)
        await aguardar(() => telaNoApp(chefe), `Fechei "${caso.nome}"`, 15_000)
      }
    }

      },
    },
    {
      nome: 'codigo-explorador',
      depende: 'mpro',
      rodar: async (d) => {
        const { esperar, js, conferir, comandoAte, aguardar, clicarEm, print, teclar, ultimas } = d
        // o cenário anterior pode ter deixado outro espaço à mostra; o shell "chefe" mora neste
        await js(`window.__teste.loja.abrirEspaco(${JSON.stringify(espacoTerminais)}, null)`)
        await esperar(700)
        const irPara = async (id: string): Promise<void> => {
          await js(`(() => { const L = window.__teste.loja; const n = L.planoAtual().nos.find((x) => x.id === ${JSON.stringify(id)})
            if (n) L.definirCamera({ x: -n.x + 60, y: -n.y + 60, zoom: 1 }) })()`)
          await esperar(500)
        }
        // Duas armadilhas do autoteste de uma vez: a marca é procurada no começo da linha (sem a âncora, a
        // espera casa com o eco da própria linha digitada, antes de o comando rodar) e o comando repete,
        // porque tecla sintética se perde — principalmente logo depois de clicar na interface.
        const gravar = async (nome: string, texto: string, marca: string): Promise<void> => {
          await comandoAte(chefe, `Set-Content -Encoding utf8 ${nome} '${texto}'; echo ${marca}`, new RegExp(`^${marca}`, 'm'), 15_000)
          await esperar(600) // a vigia junta a rajada de gravação antes de avisar
        }

        // o shell grava um arquivo na pasta do espaço: é o que um agente faria
        await gravar('exemplo.ts', 'const um = 1', 'FIM-GRAVOU1')
        // o cartão tem de nascer sozinho com a gravação: ninguém clicou em nada aqui
        const procurarCodigo = (): Promise<string> =>
          js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'codigo')?.id ?? ''`)
        let idCodigo = ''
        for (let i = 0; i < 40 && !idCodigo; i++) {
          idCodigo = await procurarCodigo()
          if (!idCodigo) await esperar(300)
        }
        conferir('o cartão de código nasce sozinho quando o agente grava', !!idCodigo, idCodigo || 'nenhum cartão apareceu')
        if (!idCodigo) throw new Error('sem cartão de código: o resto do cenário depende dele')
        const noCartao = (parte: string): Promise<string> =>
          js<string>(`document.querySelector('[data-no-id="${idCodigo}"] ${parte}')?.innerText ?? ''`)
        const corpo = (): Promise<string> => noCartao('.codigo-corpo')

        const visto = await aguardar(corpo, 'const um = 1', 15_000)
        conferir('cartão de código mostra o arquivo que o agente acabou de gravar', visto.includes('const um = 1'), ultimas(visto, 2))
        // pasta de teste não tem git: o cartão mostra o arquivo e diz por quê, em vez de só dar erro
        conferir('sem git, o cartão cai para o arquivo inteiro', visto.includes('pasta sem git'), ultimas(visto, 2))

        // realce de sintaxe: o corpo vem com as marcas do highlight.js, não texto cru
        const html = await js<string>(`document.querySelector('[data-no-id="${idCodigo}"] .codigo-linhas')?.innerHTML ?? ''`)
        conferir('o código aparece colorido (realce de sintaxe)', html.includes('class="hljs-'), html.slice(0, 80))

        // arquivo novo = cartão novo; o do arquivo anterior fica de bloquinho com o nome
        const cartoes = (): Promise<Array<{ id: string; caminho: string; recolhido: boolean; terminal: string }>> =>
          js(`window.__teste.loja.planoAtual().nos.filter((n) => n.tipo === 'codigo')
            .map((n) => ({ id: n.id, caminho: n.caminho ?? '', recolhido: !!n.recolhido, terminal: n.terminal ?? '' }))`)
        await gravar('outro.ts', 'const dois = 2', 'FIM-GRAVOU2')
        let lista = await cartoes()
        for (let i = 0; i < 40 && lista.length < 2; i++) {
          await esperar(300)
          lista = await cartoes()
        }
        const aberto = lista.find((c) => !c.recolhido)
        const bloquinho = lista.find((c) => c.recolhido)
        const resumo = (l: typeof lista): string => l.map((c) => `${c.caminho}${c.recolhido ? ' (bloquinho)' : ''}`).join(' | ')
        conferir(
          'arquivo novo abre cartão novo e o anterior vira bloquinho',
          lista.length === 2 && !!aberto?.caminho.endsWith('outro.ts') && !!bloquinho?.caminho.endsWith('exemplo.ts'),
          resumo(lista)
        )
        const dono = lista[0]?.terminal ?? ''

        // segredo não abre cartão, mesmo recém-gravado
        await gravar('.env', 'SENHA=1234', 'FIM-ENV')
        await esperar(1500)
        const comEnv = await cartoes()
        conferir(
          'arquivo com cara de segredo não abre cartão',
          comEnv.length === 2 && !comEnv.some((c) => c.caminho.endsWith('.env')),
          resumo(comEnv)
        )

        // recolher pelo botão do cartão: encolhe de verdade (era o pedido de não espalhar o quadro)
        const idAberto = await js<string>(`window.__teste.loja.planoAtual().nos.find((n) => n.tipo === 'codigo' && !n.recolhido)?.id ?? ''`)
        await irPara(idAberto)
        const recolheu = await clicarEm(`[data-no-id="${idAberto}"] button[title^="Recolher"]`)
        await esperar(400)
        const tamanho = await js<{ largura: number; altura: number }>(`(() => { const n = window.__teste.loja.acharNo('${idAberto}')
          return { largura: n.largura, altura: n.altura } })()`)
        conferir('recolher encolhe o cartão num bloquinho', recolheu && tamanho.altura === 30 && tamanho.largura === 300, JSON.stringify(tamanho))

        // o "node" do agente: recolher todos e abrir todos de uma vez
        await js(`window.__teste.loja.recolherCodigosDoTerminal('${dono}', true)`)
        await esperar(400)
        const todosBloquinho = (await cartoes()).every((c) => c.recolhido)
        await js(`window.__teste.loja.recolherCodigosDoTerminal('${dono}', false)`)
        await esperar(400)
        const todosAbertos = (await cartoes()).every((c) => !c.recolhido)
        conferir('recolher todos e abrir todos, pelo agente', todosBloquinho && todosAbertos, `recolheu ${todosBloquinho} · abriu ${todosAbertos}`)

        // com git, o cartão mostra o diff de verdade — é o caso principal, e sem repositório ele nunca roda
        // comandoAte repete: tecla sintética se perde de vez em quando, e esta linha vem depois de muito
        // clique na interface (é a armadilha conhecida do autoteste)
        const saidaGit = await comandoAte(
          chefe,
          'git init -q; git add -A; git -c user.email=t@teste -c user.name=Teste commit -qm base; ' +
            'if (Test-Path .git) { echo GIT-PRONTO } else { echo GIT-FALHOU }',
          /^GIT-(PRONTO|FALHOU)/m,
          40_000
        )
        conferir('o git do cenário foi preparado', /^GIT-PRONTO/m.test(saidaGit), ultimas(saidaGit, 3))
        const doExemplo = (await cartoes()).find((c) => c.caminho.endsWith('exemplo.ts'))?.id ?? ''
        await gravar('exemplo.ts', 'const um = 111', 'FIM-GRAVOU-DIFF')
        const comDiff = await aguardar(
          () => js<string>(`document.querySelector('[data-no-id="${doExemplo}"] .codigo-corpo')?.innerText ?? ''`),
          'const um = 111',
          15_000
        )
        const linhasDoDiff = await js<{ mais: number; menos: number }>(`(() => {
          const corpo = document.querySelector('[data-no-id="${doExemplo}"] .codigo-corpo')
          return { mais: corpo?.querySelectorAll('.codigo-linha.mais').length ?? 0, menos: corpo?.querySelectorAll('.codigo-linha.menos').length ?? 0 }
        })()`)
        conferir(
          'com git, o cartão mostra o diff: linha que entrou e linha que saiu',
          linhasDoDiff.mais === 1 && linhasDoDiff.menos === 1 && !comDiff.includes('pasta sem git'),
          `+${linhasDoDiff.mais} -${linhasDoDiff.menos} · ${ultimas(comDiff, 2)}`
        )
        await print('codigo-diff')

        // explorador da direita
        await js('window.__teste.loja.alternarExplorador()')
        await esperar(500)
        await clicarEm('.explorador-raiz-topo')
        const listado = await aguardar(() => js<string>(`document.querySelector('.explorador-arvore')?.innerText ?? ''`), 'exemplo.ts', 10_000)
        conferir(
          'explorador da direita lista os arquivos da pasta do espaço',
          listado.includes('exemplo.ts') && listado.includes('outro.ts'),
          listado.split('\n').filter(Boolean).slice(0, 6).join(' | ')
        )
        await print('codigo-explorador')

        // botão de anexo no cartão do terminal (o diálogo do sistema não dá para dirigir no teste)
        await irPara(chefe)
        const abriu = await clicarEm(`[data-no-id="${chefe}"] button[title^="Anexar"]`)
        const menu = await js<string>(`document.querySelector('.menu-contexto')?.innerText ?? ''`)
        conferir(
          'botão de anexo abre as opções no cartão do terminal',
          abriu && menu.includes('Arquivo') && menu.includes('Pasta'),
          menu.split('\n').filter(Boolean).join(' | ') || 'menu não abriu'
        )
        await teclar('Escape')
        await js('window.__teste.loja.alternarExplorador()')
        await esperar(300)

        // fechar um cartão só fecha aquele arquivo: o próximo que o agente mexer abre outro
        await js(`window.__teste.loja.apagar({ tipo: 'no', id: '${idCodigo}' })`)
        await esperar(300)
        await gravar('terceiro.ts', 'const tres = 3', 'FIM-GRAVOU3')
        await esperar(1500)
        const depoisDeFecharUm = await cartoes()
        conferir(
          'fechar um cartão não para o automático; o arquivo seguinte abre outro',
          depoisDeFecharUm.some((c) => c.caminho.endsWith('terceiro.ts')),
          resumo(depoisDeFecharUm)
        )

        // "fechar todos" é o gesto de parar: apaga a coluna e desliga o automático da pasta
        await js(`window.__teste.loja.fecharCodigosDoTerminal('${dono}')`)
        await esperar(400)
        const desligou = await js<boolean>(`window.__teste.loja.acharNo('${dono}')?.codigoSozinho === false`)
        await gravar('quarto.ts', 'const quatro = 4', 'FIM-GRAVOU4')
        await esperar(1500)
        const quantos = (await cartoes()).length
        conferir('fechar todos desliga o automático da pasta', desligou && quantos === 0, `desligou ${desligou} · cartões ${quantos}`)

        // religa o automático (o "fechar todos" acima desligou) para o resto do cenário
        await js(`window.__teste.loja.alternarCodigoSozinho('${dono}')`)
        await esperar(300)

        // cartão aberto à mão antes de haver arquivo (e o que sobrou da versão que trocava de conteúdo):
        // ele vira o cartão do primeiro arquivo gravado, em vez de trocar de conteúdo para sempre
        await js(`(() => { const L = window.__teste.loja
          return L.adicionarNo({ tipo: 'codigo', terminal: '${dono}' }, 3000, 300) })()`)
        await gravar('quinto.ts', 'const cinco = 5', 'FIM-GRAVOU5')
        await esperar(1500)
        const depoisDoVazio = await cartoes()
        conferir(
          'cartão sem arquivo vira o cartão do primeiro arquivo gravado',
          depoisDoVazio.length === 1 && depoisDoVazio[0].caminho.endsWith('quinto.ts'),
          resumo(depoisDoVazio) || 'nenhum cartão'
        )
        // e o app passa a tratá-lo como dele: o arquivo seguinte recolhe este num bloquinho
        await gravar('sexto.ts', 'const seis = 6', 'FIM-GRAVOU6')
        await esperar(1500)
        const depoisDoSexto = await cartoes()
        conferir(
          'cartão adotado entra na coluna e se recolhe quando chega o próximo arquivo',
          depoisDoSexto.length === 2 && depoisDoSexto.some((c) => c.caminho.endsWith('quinto.ts') && c.recolhido),
          resumo(depoisDoSexto)
        )

        // abrir um bloquinho para ler não é arrumar o quadro: o cartão continua na coluna, e o arquivo
        // seguinte recolhe só o que era o atual — não o que você abriu para ler
        const idQuinto = (await cartoes()).find((c) => c.caminho.endsWith('quinto.ts'))?.id ?? ''
        await irPara(idQuinto)
        const abriuBloquinho = await clicarEm(`[data-no-id="${idQuinto}"] button[title^="Abrir"]`)
        await esperar(400)
        await gravar('setimo.ts', 'const sete = 7', 'FIM-GRAVOU7')
        await esperar(1500)
        const tres = await cartoes()
        const quinto = tres.find((c) => c.caminho.endsWith('quinto.ts'))
        const sexto = tres.find((c) => c.caminho.endsWith('sexto.ts'))
        const setimo = tres.find((c) => c.caminho.endsWith('setimo.ts'))
        conferir(
          'bloquinho aberto para ler continua aberto; o próximo arquivo recolhe só o anterior',
          abriuBloquinho && !!quinto && !quinto.recolhido && !!sexto?.recolhido && !!setimo && !setimo.recolhido,
          resumo(tres)
        )

        // arquivo apagado: o cartão diz "não encontrado", não "não está em pasta do quadro". O alvo é o
        // cartão aberto (bloquinho não desenha corpo, então não teria aviso nenhum para ler)
        await comandoAte(chefe, 'Remove-Item setimo.ts; if (Test-Path setimo.ts) { echo AINDA } else { echo SUMIU }', /^SUMIU/m, 15_000)
        const doSetimo = (await cartoes()).find((c) => c.caminho.endsWith('setimo.ts'))?.id ?? ''
        const recado = await aguardar(
          () => js<string>(`document.querySelector('[data-no-id="${doSetimo}"] .codigo-aviso')?.innerText ?? ''`),
          /não encontrado|não está em pasta/,
          8000
        )
        conferir('arquivo apagado: o cartão diz que não encontrou, e não que está fora do quadro', recado.includes('não encontrado'), recado)
      }
    },
  ]
  const filtro = (process.env.MP_CENARIOS ?? '')
    .split(',')
    .map((nome) => nome.trim().toLocaleLowerCase())
    .filter(Boolean)
  const selecionados = cenarios.filter((cenario) => !filtro.length || filtro.some((nome) => cenario.nome.toLocaleLowerCase().includes(nome)))
  const situacao = new Map<string, 'passou' | 'falhou' | 'não rodou'>()
  const detalhesDeCenario = new Map<string, string>()
  for (const cenario of selecionados) {
    if (cenario.depende && situacao.get(cenario.depende) !== 'passou') {
      situacao.set(cenario.nome, 'não rodou')
      detalhesDeCenario.set(cenario.nome, `depende de ${cenario.depende}`)
      continue
    }
    try {
      await cenario.rodar(driver)
      situacao.set(cenario.nome, 'passou')
    } catch (erro) {
      const detalhe = erro instanceof Error ? erro.message : String(erro)
      situacao.set(cenario.nome, 'falhou')
      detalhesDeCenario.set(cenario.nome, detalhe)
      console.error(`AUTOTESTE ERRO ${cenario.nome}`, erro)
    }
  }
  const passou = resultados.every(([, ok]) => ok) && [...situacao.values()].every((estado) => estado === 'passou')
  for (const [nome, estado] of situacao) {
    if (estado !== 'passou') console.log(`AUTOTESTE ${estado === 'falhou' ? 'FALHOU' : 'NÃO RODOU'} ${nome} — ${detalhesDeCenario.get(nome) ?? ''}`)
  }
  const passouChecagens = resultados.filter(([, ok]) => ok).length
  const falhouChecagens = resultados.length - passouChecagens
  const passouCenarios = [...situacao.values()].filter((estado) => estado === 'passou').length
  const falhouCenarios = [...situacao.values()].filter((estado) => estado === 'falhou').length
  const naoRodouCenarios = [...situacao.values()].filter((estado) => estado === 'não rodou').length
  console.log(
    `AUTOTESTE resumo — ${resultados.length} checagens (${passouChecagens} ok, ${falhouChecagens} falhas) · ` +
      `${situacao.size} cenários (${passouCenarios} ok, ${falhouCenarios} falhas, ${naoRodouCenarios} não rodaram)`
  )
  for (const [nome, ok, detalhe] of resultados) console.log(`AUTOTESTE ${ok ? 'ok    ' : 'FALHOU'} ${nome} — ${detalhe}`)
  console.log(`AUTOTESTE ${passou ? 'PASSOU' : 'FALHOU'} — prints em ${pastaSaida}`)
  encerrarTodos()
  await encerrarNavegador()
  app.exit(passou ? 0 : 1)
}
