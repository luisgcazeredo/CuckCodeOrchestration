import { BrowserWindow, dialog, ipcMain, shell, webContents } from 'electron'
import { randomUUID } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import {
  PRESETS_PADRAO,
  type Andar,
  type Plano,
  type EntradaPasta,
  type No,
  type Espaco,
  type EspacoCarregado,
  type EstadoJanela,
  type Preferencias,
  type ResumoEspaco
} from '../shared/modelo'
import { CANAIS_DADOS } from '../shared/api'
import { avisar, avisarTodas, donoDe, esquecerEspaco, exigirDono } from './janelas'

// Tudo do app mora numa pasta só, em JSON e markdown legíveis. O autoteste usa uma pasta temporária limpa.
const AUTOTESTE = process.argv.includes('--autoteste')
const RAIZ = AUTOTESTE ? join(tmpdir(), 'maestri-proprio-autoteste') : process.env.MP_DADOS || join(homedir(), '.maestri-proprio')
export const PASTA_DADOS = RAIZ
const PASTA_ESPACOS = join(RAIZ, 'espacos')

const ID_VALIDO = /^[0-9a-f-]{36}$/
const NOTA_VALIDA = /^[\w-]{1,80}\.md$/
export const IMAGEM_VALIDA = /^[0-9a-f-]{36}\.png$/

function lerJson<T>(caminho: string, padrao: T): T {
  try {
    return JSON.parse(readFileSync(caminho, 'utf8')) as T
  } catch {
    return padrao
  }
}

/** Grava num arquivo temporário e troca de nome: um desligamento no meio não corrompe o arquivo. */
function gravar(caminho: string, conteudo: string): void {
  const temporario = `${caminho}.${process.pid}.tmp`
  writeFileSync(temporario, conteudo, 'utf8')
  renameSync(temporario, caminho)
}

function gravarJson(caminho: string, valor: unknown): void {
  gravar(caminho, JSON.stringify(valor, null, 2))
}

function pastaDoEspaco(id: string): string {
  if (!ID_VALIDO.test(id)) throw new Error('id de espaço inválido')
  return join(PASTA_ESPACOS, id)
}

/** Prints colados no quadro (`mp-imagem://`), um .png por imagem. */
export function pastaImagens(espacoId: string): string {
  return join(pastaDoEspaco(espacoId), 'imagens')
}

/** Apaga as imagens que nenhum cartão (do térreo ou de andar) usa mais. Roda ao abrir o espaço. */
function limparImagens(espaco: Espaco): void {
  const pasta = pastaImagens(espaco.id)
  if (!existsSync(pasta)) return
  const usadas = new Set(planos(espaco).flatMap((p) => p.nos.flatMap((n) => (n.tipo === 'imagem' ? [n.arquivo] : []))))
  for (const arquivo of readdirSync(pasta)) {
    if (IMAGEM_VALIDA.test(arquivo) && !usadas.has(arquivo)) rmSync(join(pasta, arquivo), { force: true })
  }
}

/** Todos os planos do espaço: o térreo e cada andar. */
function planos(espaco: Espaco): Plano[] {
  return [espaco, ...espaco.andares]
}

function resumo(espaco: Espaco): ResumoEspaco {
  const { id, nome, cor, icone, pasta } = espaco
  return {
    id,
    nome,
    cor,
    icone,
    pasta,
    terminais: planos(espaco).reduce((t, p) => t + p.nos.filter((n) => n.tipo === 'terminal').length, 0),
    andares: espaco.andares.map((a) => ({ id: a.id, nome: a.nome, ramo: a.git?.ramo ?? null, estado: a.status?.estado }))
  }
}

/** Espaço salvo por versões antigas ganha os campos novos (andares) com valor vazio. */
function completar(espaco: Espaco): Espaco {
  return { ...espaco, andares: Array.isArray(espaco.andares) ? espaco.andares : [], andarAtivo: espaco.andarAtivo ?? null }
}

function lerEspaco(id: string): Espaco | null {
  const caminho = join(pastaDoEspaco(id), 'espaco.json')
  const espaco = existsSync(caminho) ? lerJson<Espaco | null>(caminho, null) : null
  return espaco ? completar(espaco) : null
}

/** Ids dos espaços, na ordem da lista. */
export function idsDosEspacos(): string[] {
  return lerManifesto()
}

/** O espaço como está em disco (os andares usam isto para achar ramo e pasta sem confiar na janela). */
export function lerEspacoSalvo(id: string): Espaco | null {
  return ID_VALIDO.test(String(id)) ? lerEspaco(id) : null
}

function lerManifesto(): string[] {
  return lerJson<{ espacos: string[] }>(join(RAIZ, 'manifesto.json'), { espacos: [] }).espacos
}

function gravarManifesto(ids: string[]): void {
  gravarJson(join(RAIZ, 'manifesto.json'), { versao: 1, espacos: ids })
}

function novoEspaco(nome: string, pasta: string): Espaco {
  const agora = new Date().toISOString()
  return {
    versao: 1,
    id: randomUUID(),
    nome,
    pasta,
    cor: '#007AFF',
    icone: 'folder',
    criadoEm: agora,
    abertoEm: agora,
    camera: { x: 0, y: 0, zoom: 1 },
    nos: [],
    cordas: [],
    desenhos: [],
    andares: [],
    andarAtivo: null
  }
}

function criarEspaco(nome: string, pasta: string): Espaco {
  const espaco = novoEspaco(nome.trim() || 'Sem nome', pasta)
  mkdirSync(join(pastaDoEspaco(espaco.id), 'notas'), { recursive: true })
  gravarJson(join(pastaDoEspaco(espaco.id), 'espaco.json'), espaco)
  gravarManifesto([...lerManifesto(), espaco.id])
  return espaco
}

/** Primeira vez: um espaço com um post-it explicando o básico. */
function garantirInicio(): void {
  if (AUTOTESTE) rmSync(RAIZ, { recursive: true, force: true })
  mkdirSync(PASTA_ESPACOS, { recursive: true })
  if (lerManifesto().length > 0) return
  const espaco = criarEspaco('Workspace', homedir())
  const arquivo = `${randomUUID()}.md`
  espaco.nos.push({
    tipo: 'postit',
    id: randomUUID(),
    x: 80,
    y: 80,
    largura: 280,
    altura: 200,
    z: 1,
    criadoEm: espaco.criadoEm,
    arquivo,
    cor: 'amarelo'
  })
  gravar(
    join(pastaDoEspaco(espaco.id), 'notas', arquivo),
    '# Bem-vindo\n- [x] abrir o Maestri Próprio\n- [ ] pôr um terminal no quadro\n- [ ] ligar dois agentes'
  )
  gravarJson(join(pastaDoEspaco(espaco.id), 'espaco.json'), espaco)
}

function todosOsEspacos(): Espaco[] {
  return lerManifesto().flatMap((id) => {
    const e = ID_VALIDO.test(id) ? lerEspaco(id) : null
    return e ? [e] : []
  })
}

/** Nós de todos os espaços e de todos os andares. */
function todosOsNos(): No[] {
  return todosOsEspacos().flatMap((e) => planos(e).flatMap((p) => p.nos))
}

function estaDentro(raiz: string, caminho: string): boolean {
  const r = relative(raiz, caminho)
  return r === '' || (!r.startsWith('..') && !isAbsolute(r))
}

/** Caminho real, com atalhos e links simbólicos resolvidos; null se não existir. */
function real(caminho: string): string | null {
  try {
    return realpathSync.native(caminho)
  } catch {
    return null
  }
}

/** Compara caminhos reais: um link dentro da pasta que aponta para fora dela não passa. */
function dentroDeUmaArvore(caminho: string): boolean {
  const alvo = real(caminho)
  if (!alvo) return false
  return todosOsNos().some((n) => {
    const raiz = n.tipo === 'pasta' ? real(n.caminho) : null
    return raiz !== null && estaDentro(raiz, alvo)
  })
}

const TIPOS_DE_NO = new Set(['terminal', 'postit', 'texto', 'arquivo', 'pasta', 'portal', 'imagem'])
const LIMITE_JSON = 20 * 1024 * 1024

function planoValido(p: Plano): boolean {
  return (
    Array.isArray(p?.nos) &&
    Array.isArray(p.cordas) &&
    Array.isArray(p.desenhos) &&
    [p.camera?.x, p.camera?.y, p.camera?.zoom].every(Number.isFinite) &&
    p.nos.every(
      (n) =>
        TIPOS_DE_NO.has(n?.tipo) &&
        typeof n.id === 'string' &&
        [n.x, n.y, n.largura, n.altura, n.z].every(Number.isFinite) &&
        (n.tipo !== 'postit' || NOTA_VALIDA.test(n.arquivo)) &&
        (n.tipo !== 'imagem' || IMAGEM_VALIDA.test(n.arquivo)) &&
        (n.tipo !== 'pasta' || typeof n.caminho === 'string') &&
        (n.tipo !== 'portal' || /^https?:\/\//.test(n.url))
    )
  )
}

/** Andar com git só aponta para um worktree nosso (em ~/.maestri-proprio/andares/<espaço>) e para um ramo andar/. */
function andarValido(a: Andar, espacoId: string): boolean {
  if (typeof a?.id !== 'string' || typeof a.nome !== 'string' || !planoValido(a)) return false
  if (a.git === null) return true
  return (
    typeof a.git?.ramo === 'string' &&
    a.git.ramo.startsWith('andar/') &&
    typeof a.git.pasta === 'string' &&
    estaDentro(join(RAIZ, 'andares', espacoId), resolve(a.git.pasta))
  )
}

/** O que vem da janela só é gravado se tiver a forma de um espaço que já existe. */
function validarParaSalvar(carregado: EspacoCarregado): EspacoCarregado {
  const espaco = carregado?.espaco
  const notas = carregado?.notas
  const ok =
    espaco?.versao === 1 &&
    typeof espaco.id === 'string' &&
    lerManifesto().includes(espaco.id) &&
    planoValido(espaco) &&
    Array.isArray(espaco.andares) &&
    espaco.andares.every((a) => andarValido(a, espaco.id)) &&
    // cada andar com o seu ramo e a sua pasta: dois andares nunca apontam para o mesmo worktree
    new Set(espaco.andares.flatMap((a) => (a.git ? [a.git.ramo] : []))).size === espaco.andares.filter((a) => a.git).length &&
    new Set(espaco.andares.flatMap((a) => (a.git ? [resolve(a.git.pasta).toLowerCase()] : []))).size ===
      espaco.andares.filter((a) => a.git).length &&
    (espaco.andarAtivo === null || espaco.andares.some((a) => a.id === espaco.andarAtivo)) &&
    typeof notas === 'object' &&
    notas !== null &&
    JSON.stringify(carregado).length < LIMITE_JSON
  if (!ok) throw new Error('espaço inválido: nada foi gravado')
  return carregado
}

const AGENTES = new Set(['claude', 'codex', 'shell'])

/** Presets: o comando é digitado no PowerShell quando o terminal abre, então é uma linha só e curta. */
function preferenciasValidas(p: Preferencias): boolean {
  return (
    p?.versao === 1 &&
    (p.tema === 'escuro' || p.tema === 'claro') &&
    typeof p.corPostItPadrao === 'string' &&
    Array.isArray(p.presets) &&
    p.presets.length > 0 &&
    p.presets.length <= 50 &&
    p.presets.every(
      (x) =>
        typeof x?.id === 'string' &&
        typeof x.nome === 'string' &&
        x.nome.trim().length > 0 &&
        x.nome.length <= 80 &&
        AGENTES.has(x.agente) &&
        typeof x.comando === 'string' &&
        x.comando.length <= 500 &&
        !/[\r\n]/.test(x.comando)
    )
  )
}

let aoApagarEspaco: (id: string) => void = () => {}

/** Quem precisa saber que um espaço foi apagado (os terminais dele morrem junto). */
export function quandoApagarEspaco(fazer: (id: string) => void): void {
  aoApagarEspaco = fazer
}

export function registrarDados(): void {
  garantirInicio()

  ipcMain.handle(CANAIS_DADOS.listarEspacos, (): ResumoEspaco[] =>
    lerManifesto()
      .map((id) => (ID_VALIDO.test(id) ? lerEspaco(id) : null))
      .filter((e): e is Espaco => e !== null)
      .map(resumo)
  )

  ipcMain.handle(CANAIS_DADOS.carregarEspaco, (_e, id: string): EspacoCarregado | null => {
    const espaco = lerEspaco(id)
    if (!espaco) return null
    limparImagens(espaco)
    const pastaNotas = join(pastaDoEspaco(id), 'notas')
    const notas: Record<string, string> = {}
    for (const no of planos(espaco).flatMap((p) => p.nos)) {
      if (no.tipo !== 'postit' || !NOTA_VALIDA.test(no.arquivo)) continue
      const caminho = join(pastaNotas, no.arquivo)
      notas[no.arquivo] = existsSync(caminho) ? readFileSync(caminho, 'utf8') : ''
    }
    return { espaco, notas }
  })

  ipcMain.handle(CANAIS_DADOS.salvarEspaco, (evento, carregado: EspacoCarregado): ResumoEspaco => {
    const { espaco, notas } = validarParaSalvar(carregado)
    exigirDono(evento, espaco.id)
    const pasta = pastaDoEspaco(espaco.id)
    const pastaNotas = join(pasta, 'notas')
    mkdirSync(pastaNotas, { recursive: true })
    for (const [arquivo, texto] of Object.entries(notas)) {
      if (NOTA_VALIDA.test(arquivo) && typeof texto === 'string') {
        const caminho = join(pastaNotas, arquivo)
        if (!existsSync(caminho) || readFileSync(caminho, 'utf8') !== texto) gravar(caminho, texto)
      }
    }
    // o quadro é gravado antes da limpeza: se algo cair no meio, sobra uma nota órfã, nunca um post-it sem texto
    gravarJson(join(pasta, 'espaco.json'), espaco)
    const emUso = new Set(planos(espaco).flatMap((p) => p.nos.flatMap((n) => (n.tipo === 'postit' ? [n.arquivo] : []))))
    for (const arquivo of readdirSync(pastaNotas)) {
      if (NOTA_VALIDA.test(arquivo) && !emUso.has(arquivo)) rmSync(join(pastaNotas, arquivo))
    }
    const r = resumo(espaco)
    avisarTodas({ tipo: 'resumo', resumo: r }, evento.sender)
    return r
  })

  // espaço aberto em outra janela: ela é que renomeia (e grava); fechado: renomeia direto no disco
  ipcMain.handle(CANAIS_DADOS.renomearEspaco, (_e, id: string, nome: string) => {
    const limpo = String(nome ?? '').trim().slice(0, 120)
    if (!limpo || !lerManifesto().includes(id)) return
    const janela = donoDe(id)
    const conteudo = janela !== undefined ? webContents.fromId(janela) : undefined
    if (conteudo) return avisar(conteudo, { tipo: 'renomear', espacoId: id, nome: limpo })
    const espaco = lerEspaco(id)
    if (!espaco) return
    espaco.nome = limpo
    gravarJson(join(pastaDoEspaco(id), 'espaco.json'), espaco)
    avisarTodas({ tipo: 'resumo', resumo: resumo(espaco) })
  })

  // apaga só o espaço do app (quadro, post-its); a pasta do projeto e os ramos do git ficam
  ipcMain.handle(CANAIS_DADOS.apagarEspaco, (evento, id: string) => {
    if (!lerManifesto().includes(id)) throw new Error('espaço não encontrado')
    const janela = donoDe(id)
    if (janela !== undefined && janela !== evento.sender.id) throw new Error('este espaço está aberto em outra janela; feche-a antes')
    gravarManifesto(lerManifesto().filter((outro) => outro !== id))
    rmSync(pastaDoEspaco(id), { recursive: true, force: true })
    esquecerEspaco(id)
    aoApagarEspaco(id)
    avisarTodas({ tipo: 'lista' }, evento.sender)
  })

  ipcMain.handle(CANAIS_DADOS.mostrarNoExplorer, (_e, caminho: string) => {
    if (typeof caminho !== 'string') return 'caminho inválido'
    const conhecido = todosOsEspacos().some(
      (e) =>
        e.pasta === caminho ||
        e.andares.some((a) => a.git?.pasta === caminho) ||
        planos(e).some((p) => p.nos.some((n) => (n.tipo === 'arquivo' || n.tipo === 'pasta') && n.caminho === caminho))
    )
    if (!conhecido && !dentroDeUmaArvore(caminho)) return 'isso não está no quadro'
    if (!existsSync(caminho)) return 'não encontrado'
    shell.showItemInFolder(caminho)
    return ''
  })

  ipcMain.handle(CANAIS_DADOS.criarEspaco, (evento, nome: string, pasta: string): ResumoEspaco => {
    const valida = typeof pasta === 'string' && existsSync(pasta) && statSync(pasta).isDirectory()
    const novo = resumo(criarEspaco(String(nome ?? ''), valida ? pasta : homedir()))
    avisarTodas({ tipo: 'lista' }, evento.sender)
    return novo
  })

  ipcMain.handle(CANAIS_DADOS.carregarPreferencias, (): Preferencias =>
    lerJson<Preferencias>(join(RAIZ, 'preferencias.json'), {
      versao: 1,
      tema: 'escuro',
      presets: PRESETS_PADRAO,
      corPostItPadrao: 'amarelo'
    })
  )

  ipcMain.handle(CANAIS_DADOS.salvarPreferencias, (evento, preferencias: Preferencias) => {
    if (!preferenciasValidas(preferencias)) throw new Error('preferências inválidas: nada foi gravado')
    gravarJson(join(RAIZ, 'preferencias.json'), preferencias)
    avisarTodas({ tipo: 'preferencias' }, evento.sender)
  })

  ipcMain.handle(CANAIS_DADOS.carregarEstado, (): EstadoJanela =>
    lerJson<EstadoJanela>(join(RAIZ, 'estado.json'), { versao: 1, espacoAtivo: null, lateralAberta: true })
  )

  ipcMain.handle(CANAIS_DADOS.salvarEstado, (_e, estado: EstadoJanela) => gravarJson(join(RAIZ, 'estado.json'), estado))

  ipcMain.handle(CANAIS_DADOS.escolherPasta, async (evento): Promise<string | null> => {
    const janela = BrowserWindow.fromWebContents(evento.sender)
    const r = await dialog.showOpenDialog(janela!, { properties: ['openDirectory'] })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle(CANAIS_DADOS.escolherArquivo, async (evento): Promise<{ caminho: string; nome: string } | null> => {
    const janela = BrowserWindow.fromWebContents(evento.sender)
    const r = await dialog.showOpenDialog(janela!, { properties: ['openFile'] })
    return r.canceled ? null : { caminho: r.filePaths[0], nome: basename(r.filePaths[0]) }
  })

  // só abre arquivo que está num quadro (anexado pelo diálogo ou dentro de uma árvore), nunca um caminho qualquer
  ipcMain.handle(CANAIS_DADOS.abrirArquivo, (_e, caminho: string) => {
    if (typeof caminho !== 'string') return 'caminho inválido'
    const anexado = todosOsNos().some((n) => n.tipo === 'arquivo' && n.caminho === caminho)
    if (!anexado && !dentroDeUmaArvore(caminho)) return 'arquivo não está no quadro'
    if (!existsSync(caminho)) return 'arquivo não encontrado'
    return shell.openPath(caminho)
  })

  ipcMain.handle(CANAIS_DADOS.listarPasta, (_e, raiz: string, caminho: string): EntradaPasta[] => {
    const raizes = todosOsNos().flatMap((n) => (n.tipo === 'pasta' ? [resolve(n.caminho)] : []))
    if (typeof raiz !== 'string' || typeof caminho !== 'string' || !raizes.includes(resolve(raiz))) {
      throw new Error('pasta não está no quadro')
    }
    const raizReal = real(raiz)
    const alvoReal = real(caminho)
    if (!raizReal || !alvoReal || !estaDentro(raizReal, alvoReal)) throw new Error('caminho fora da pasta da árvore')
    // links simbólicos e atalhos de pasta não aparecem (isDirectory/isFile são falsos para eles)
    return readdirSync(caminho, { withFileTypes: true })
      .filter((d) => d.isDirectory() || d.isFile())
      .map((d) => ({ nome: d.name, caminho: join(caminho, d.name), ehPasta: d.isDirectory() }))
      .sort((a, b) => Number(b.ehPasta) - Number(a.ehPasta) || a.nome.localeCompare(b.nome, 'pt-BR'))
      .slice(0, 1000)
  })
}
