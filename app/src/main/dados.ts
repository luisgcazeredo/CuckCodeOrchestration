import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import {
  PRESETS_PADRAO,
  type Espaco,
  type EspacoCarregado,
  type EstadoJanela,
  type Preferencias,
  type ResumoEspaco
} from '../shared/modelo'
import { CANAIS_DADOS } from '../shared/api'

// Tudo do app mora numa pasta só, em JSON e markdown legíveis. O autoteste usa uma pasta temporária limpa.
const AUTOTESTE = process.argv.includes('--autoteste')
const RAIZ = AUTOTESTE ? join(tmpdir(), 'maestri-proprio-autoteste') : process.env.MP_DADOS || join(homedir(), '.maestri-proprio')
export const PASTA_DADOS = RAIZ
const PASTA_ESPACOS = join(RAIZ, 'espacos')

const ID_VALIDO = /^[0-9a-f-]{36}$/
const NOTA_VALIDA = /^[\w-]{1,80}\.md$/

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

function resumo(espaco: Espaco): ResumoEspaco {
  const { id, nome, cor, icone, pasta } = espaco
  return { id, nome, cor, icone, pasta, terminais: espaco.nos.filter((n) => n.tipo === 'terminal').length }
}

function lerEspaco(id: string): Espaco | null {
  const caminho = join(pastaDoEspaco(id), 'espaco.json')
  return existsSync(caminho) ? lerJson<Espaco | null>(caminho, null) : null
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
    desenhos: []
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

const TIPOS_DE_NO = new Set(['terminal', 'postit', 'texto', 'arquivo'])
const LIMITE_JSON = 20 * 1024 * 1024

/** O que vem da janela só é gravado se tiver a forma de um espaço que já existe. */
function validarParaSalvar(carregado: EspacoCarregado): EspacoCarregado {
  const espaco = carregado?.espaco
  const notas = carregado?.notas
  const ok =
    espaco?.versao === 1 &&
    typeof espaco.id === 'string' &&
    lerManifesto().includes(espaco.id) &&
    Array.isArray(espaco.nos) &&
    Array.isArray(espaco.cordas) &&
    Array.isArray(espaco.desenhos) &&
    espaco.nos.every(
      (n) =>
        TIPOS_DE_NO.has(n?.tipo) &&
        typeof n.id === 'string' &&
        [n.x, n.y, n.largura, n.altura, n.z].every(Number.isFinite) &&
        (n.tipo !== 'postit' || NOTA_VALIDA.test(n.arquivo))
    ) &&
    typeof notas === 'object' &&
    notas !== null &&
    JSON.stringify(carregado).length < LIMITE_JSON
  if (!ok) throw new Error('espaço inválido: nada foi gravado')
  return carregado
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
    const pastaNotas = join(pastaDoEspaco(id), 'notas')
    const notas: Record<string, string> = {}
    for (const no of espaco.nos) {
      if (no.tipo !== 'postit' || !NOTA_VALIDA.test(no.arquivo)) continue
      const caminho = join(pastaNotas, no.arquivo)
      notas[no.arquivo] = existsSync(caminho) ? readFileSync(caminho, 'utf8') : ''
    }
    return { espaco, notas }
  })

  ipcMain.handle(CANAIS_DADOS.salvarEspaco, (_e, carregado: EspacoCarregado): ResumoEspaco => {
    const { espaco, notas } = validarParaSalvar(carregado)
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
    const emUso = new Set(espaco.nos.flatMap((n) => (n.tipo === 'postit' ? [n.arquivo] : [])))
    for (const arquivo of readdirSync(pastaNotas)) {
      if (NOTA_VALIDA.test(arquivo) && !emUso.has(arquivo)) rmSync(join(pastaNotas, arquivo))
    }
    return resumo(espaco)
  })

  ipcMain.handle(CANAIS_DADOS.criarEspaco, (_e, nome: string, pasta: string): ResumoEspaco => {
    const valida = typeof pasta === 'string' && existsSync(pasta) && statSync(pasta).isDirectory()
    return resumo(criarEspaco(String(nome ?? ''), valida ? pasta : homedir()))
  })

  ipcMain.handle(CANAIS_DADOS.carregarPreferencias, (): Preferencias =>
    lerJson<Preferencias>(join(RAIZ, 'preferencias.json'), {
      versao: 1,
      tema: 'escuro',
      presets: PRESETS_PADRAO,
      corPostItPadrao: 'amarelo'
    })
  )

  ipcMain.handle(CANAIS_DADOS.salvarPreferencias, (_e, preferencias: Preferencias) =>
    gravarJson(join(RAIZ, 'preferencias.json'), preferencias)
  )

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

  // só abre arquivo que está num quadro (anexado pelo diálogo), nunca um caminho qualquer
  ipcMain.handle(CANAIS_DADOS.abrirArquivo, (_e, caminho: string) => {
    const anexado = lerManifesto().some((id) =>
      lerEspaco(id)?.nos.some((n) => n.tipo === 'arquivo' && n.caminho === caminho)
    )
    if (!anexado) return 'arquivo não está anexado a nenhum quadro'
    if (!existsSync(caminho)) return 'arquivo não encontrado'
    return shell.openPath(caminho)
  })
}
