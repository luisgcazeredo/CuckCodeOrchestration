// O que o cartão de código precisa do sistema de arquivos: vigiar a pasta de um agente, dizer o que ele
// mexeu por último, ler o texto e perguntar ao git o que mudou.
//
// Por que vigiar a pasta em vez de ler a tela do agente: a tela é interface de terceiro e muda sem aviso (foi
// o que aconteceu com o rodapé de contexto do Claude Code). O sistema de arquivos não mente e serve para
// qualquer agente. O preço: dois cartões na mesma pasta veem as mesmas mudanças — um andar separa as pastas.
import { execFile } from 'node:child_process'
import { closeSync, existsSync, openSync, readSync, readdirSync, statSync, watch, type Dirent, type FSWatcher } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { ipcMain, webContents } from 'electron'
import { CANAIS_CODIGO, type DiffArquivo, type MudancaArquivo, type TextoArquivo } from '../shared/api'
import { PASTAS_IGNORADAS, temCaraDeSegredo, valeSeguir } from '../shared/arquivos'
import { dentroDeUmaRaiz, raizesDoQuadro } from './dados'

/** Uma gravação costuma chegar em rajada (temporário, troca de nome, arquivo final): espera e junta. */
const ESPERA = 250
const QUANTOS_RECENTES = 30
/** Arquivo maior que isto entra cortado: o cartão é para olhar código, não para abrir banco de dados. */
const LIMITE_BYTES = 400 * 1024
const LIMITE_PATCH = 200 * 1024
/** Varredura da primeira vez: para aqui mesmo que a pasta seja enorme. */
const LIMITE_VARREDURA = 20_000
const VALIDADE_VARREDURA = 5000

interface Assinatura {
  /** Caminho exatamente como a janela escreveu: é a chave com que o preload entrega o aviso. */
  rotulo: string
  janela: number
}

interface Vigia {
  pasta: string
  observador: FSWatcher | null
  assinaturas: Assinatura[]
  recentes: MudancaArquivo[]
  pendentes: Set<string>
  relogio: NodeJS.Timeout | null
  /** Última varredura da pasta, para quando ninguém gravou nada ainda. */
  varredura: { em: number; lista: MudancaArquivo[] } | null
}

const vigias = new Map<string, Vigia>()

const chaveDa = (pasta: string): string => resolve(pasta).toLowerCase()

function pastaPermitida(pasta: string): boolean {
  if (typeof pasta !== 'string' || !pasta) return false
  const alvo = resolve(pasta)
  return raizesDoQuadro().some((raiz) => resolve(raiz) === alvo)
}

function anotar(vigia: Vigia, caminho: string): void {
  const semEste = vigia.recentes.filter((m) => m.caminho !== caminho)
  vigia.recentes = [{ pasta: vigia.pasta, caminho, em: Date.now() }, ...semEste].slice(0, QUANTOS_RECENTES)
}

function entregar(vigia: Vigia, mudanca: MudancaArquivo): void {
  for (const { rotulo, janela } of vigia.assinaturas) {
    webContents.fromId(janela)?.send(CANAIS_CODIGO.aviso, rotulo, { ...mudanca, pasta: rotulo })
  }
}

function descarregar(vigia: Vigia): void {
  vigia.relogio = null
  const caminhos = [...vigia.pendentes]
  vigia.pendentes.clear()
  for (const caminho of caminhos) {
    let tamanho = 0
    try {
      const info = statSync(caminho)
      if (!info.isFile()) continue
      tamanho = info.size
    } catch {
      continue // apagado ou com outro nome no meio da rajada
    }
    if (tamanho === 0) continue
    anotar(vigia, caminho)
    entregar(vigia, { pasta: vigia.pasta, caminho, em: Date.now() })
  }
}

function fecharObservador(vigia: Vigia): void {
  vigia.observador?.close()
  vigia.observador = null
  if (vigia.relogio) clearTimeout(vigia.relogio)
  vigia.relogio = null
}

function abrirObservador(vigia: Vigia): void {
  try {
    vigia.observador = watch(vigia.pasta, { recursive: true }, (_tipo, nome) => {
      if (!nome || !valeSeguir(String(nome))) return
      vigia.pendentes.add(join(vigia.pasta, String(nome)))
      if (!vigia.relogio) vigia.relogio = setTimeout(() => descarregar(vigia), ESPERA)
    })
    vigia.observador.on('error', () => fecharObservador(vigia))
  } catch {
    vigia.observador = null // pasta que não existe: o cartão segue vivo, só não recebe aviso
  }
}

/** Janela fechada: as vigias dela saem, senão o app fica observando pasta que ninguém olha. */
function soltarJanela(janela: number): void {
  for (const [chave, vigia] of [...vigias]) {
    vigia.assinaturas = vigia.assinaturas.filter((a) => a.janela !== janela)
    if (!vigia.assinaturas.length) {
      fecharObservador(vigia)
      vigias.delete(chave)
    }
  }
}

function vigiar(janela: number, pasta: string): void {
  if (!pastaPermitida(pasta)) return
  const chave = chaveDa(pasta)
  let vigia = vigias.get(chave)
  if (!vigia) {
    vigia = { pasta, observador: null, assinaturas: [], recentes: [], pendentes: new Set(), relogio: null, varredura: null }
    vigias.set(chave, vigia)
    abrirObservador(vigia)
  }
  vigia.assinaturas.push({ rotulo: pasta, janela })
  webContents.fromId(janela)?.once('destroyed', () => soltarJanela(janela))
}

function pararDeVigiar(janela: number, pasta: string): void {
  const chave = chaveDa(pasta)
  const vigia = vigias.get(chave)
  if (!vigia) return
  const i = vigia.assinaturas.findIndex((a) => a.janela === janela && a.rotulo === pasta)
  if (i >= 0) vigia.assinaturas.splice(i, 1)
  if (!vigia.assinaturas.length) {
    fecharObservador(vigia)
    vigias.delete(chave)
  }
}

/**
 * Primeira vez: ninguém gravou nada desde que o cartão abriu, mas o agente já trabalhou antes. Varre a pasta
 * pela data de modificação para o cartão ter o que mostrar na hora.
 */
function varrer(pasta: string): MudancaArquivo[] {
  const achados: MudancaArquivo[] = []
  let vistos = 0
  const fila = [pasta]
  while (fila.length && vistos < LIMITE_VARREDURA) {
    const atual = fila.shift()!
    let entradas: Dirent[]
    try {
      entradas = readdirSync(atual, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entrada of entradas) {
      if (++vistos > LIMITE_VARREDURA) break
      const caminho = join(atual, entrada.name)
      if (entrada.isDirectory()) {
        if (!PASTAS_IGNORADAS.includes(entrada.name.toLowerCase())) fila.push(caminho)
        continue
      }
      if (!entrada.isFile()) continue
      if (!valeSeguir(caminho.slice(pasta.length + 1))) continue
      try {
        const info = statSync(caminho)
        if (info.size > 0) achados.push({ pasta, caminho, em: info.mtimeMs })
      } catch {
        // arquivo sumiu entre listar e medir
      }
    }
  }
  return achados.sort((a, b) => b.em - a.em).slice(0, QUANTOS_RECENTES)
}

function recentes(pasta: string): MudancaArquivo[] {
  if (!pastaPermitida(pasta)) return []
  const vigia = vigias.get(chaveDa(pasta))
  const gravados = vigia?.recentes ?? []
  const agora = Date.now()
  if (vigia && (!vigia.varredura || agora - vigia.varredura.em > VALIDADE_VARREDURA)) {
    vigia.varredura = { em: agora, lista: varrer(pasta) }
  }
  const varridos = vigia?.varredura?.lista ?? varrer(pasta)
  const novos = varridos.filter((v) => !gravados.some((g) => g.caminho === v.caminho)).map((m) => ({ ...m, pasta }))
  return [...gravados, ...novos].sort((a, b) => b.em - a.em).slice(0, QUANTOS_RECENTES)
}

/** Lê o começo do arquivo. Binário e segredo não passam. */
function ler(caminho: string): TextoArquivo {
  const vazio = { caminho, conteudo: '', truncado: false }
  if (typeof caminho !== 'string' || !caminho) return { ...vazio, erro: 'caminho inválido' }
  if (!dentroDeUmaRaiz(caminho)) return { ...vazio, erro: 'esse arquivo não está em pasta do quadro' }
  // vale para arquivo preso à mão também: segredo não vai para a tela nem por pedido
  if (temCaraDeSegredo(caminho)) return { ...vazio, erro: 'arquivo com cara de segredo: não mostro o conteúdo' }
  if (!existsSync(caminho)) return { ...vazio, erro: 'arquivo não encontrado' }
  let descritor: number | null = null
  try {
    const info = statSync(caminho)
    if (!info.isFile()) return { ...vazio, erro: 'isso é uma pasta' }
    descritor = openSync(caminho, 'r')
    const quanto = Math.min(info.size, LIMITE_BYTES)
    const buffer = Buffer.alloc(quanto)
    const lidos = readSync(descritor, buffer, 0, quanto, 0)
    const pedaco = buffer.subarray(0, lidos)
    // byte zero no começo é a marca prática de binário
    if (pedaco.subarray(0, 4096).includes(0)) return { ...vazio, erro: 'arquivo binário' }
    // arquivo gravado pelo PowerShell começa com BOM, que apareceria como lixo na primeira linha
    return { caminho, conteudo: pedaco.toString('utf8').replace(/^﻿/, ''), truncado: info.size > quanto }
  } catch (erro) {
    return { ...vazio, erro: erro instanceof Error ? erro.message : 'não consegui ler' }
  } finally {
    if (descritor !== null) closeSync(descritor)
  }
}

function git(pasta: string, argumentos: string[]): Promise<{ ok: boolean; saida: string }> {
  return new Promise((pronto) => {
    execFile(
      'git',
      argumentos,
      { cwd: pasta, timeout: 5000, windowsHide: true, maxBuffer: LIMITE_PATCH * 2 },
      (erro, saida) => pronto({ ok: !erro, saida: String(saida ?? '') })
    )
  })
}

/** O que mudou desde o último commit. Sem git, sem mudança ou arquivo novo, não há patch — e isso é dito. */
async function diff(caminho: string): Promise<DiffArquivo> {
  const vazio = { caminho, patch: null, novo: false }
  if (typeof caminho !== 'string' || !dentroDeUmaRaiz(caminho)) {
    return { ...vazio, erro: 'esse arquivo não está em pasta do quadro' }
  }
  if (temCaraDeSegredo(caminho)) return { ...vazio, erro: 'arquivo com cara de segredo: não mostro o conteúdo' }
  if (!existsSync(caminho)) return { ...vazio, erro: 'arquivo não encontrado' }
  const pasta = dirname(caminho)
  const raiz = await git(pasta, ['rev-parse', '--show-toplevel'])
  if (!raiz.ok) return { ...vazio, semGit: true }
  const conhecido = await git(pasta, ['ls-files', '--error-unmatch', '--', caminho])
  if (!conhecido.ok) return { ...vazio, novo: true }
  // HEAD pega junto o que já foi para a área de preparo: quem olha quer ver o trabalho, não o estágio dele
  const patch = await git(pasta, ['diff', 'HEAD', '--no-color', '-U3', '--', caminho])
  if (!patch.ok) return { ...vazio, erro: 'o git não respondeu' }
  const texto = patch.saida.slice(0, LIMITE_PATCH)
  return { caminho, patch: texto.trim() ? texto : null, novo: false }
}

export function registrarCodigo(): void {
  ipcMain.on(CANAIS_CODIGO.vigiar, (evento, pasta: string) => vigiar(evento.sender.id, pasta))
  ipcMain.on(CANAIS_CODIGO.pararDeVigiar, (evento, pasta: string) => pararDeVigiar(evento.sender.id, pasta))
  ipcMain.handle(CANAIS_CODIGO.recentes, (_e, pasta: string): MudancaArquivo[] => recentes(pasta))
  ipcMain.handle(CANAIS_CODIGO.ler, (_e, caminho: string): TextoArquivo => ler(caminho))
  ipcMain.handle(CANAIS_CODIGO.diff, (_e, caminho: string): Promise<DiffArquivo> => diff(caminho))
}
