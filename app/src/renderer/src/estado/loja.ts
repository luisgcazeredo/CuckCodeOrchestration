import { useSyncExternalStore } from 'react'
import {
  PRESETS_PADRAO,
  type Camera,
  type Corda,
  type Desenho,
  type Espaco,
  type FerramentaDesenho,
  type No,
  type NoPostIt,
  type PresetAgente,
  type Preferencias,
  type ResumoEspaco,
  type Tema
} from '../../../shared/modelo'

export type Ferramenta = 'selecionar' | 'postit' | 'texto' | 'desenho'

export interface Selecao {
  tipo: 'no' | 'corda' | 'desenho'
  id: string
}

export interface EstadoUI {
  carregado: boolean
  espacos: ResumoEspaco[]
  espaco: Espaco | null
  notas: Record<string, string>
  preferencias: Preferencias
  lateralAberta: boolean
  ferramenta: Ferramenta
  estiloDesenho: { ferramenta: FerramentaDesenho; cor: string }
  selecao: Selecao | null
  /** Nó em edição de texto (post-it ou texto). */
  editando: string | null
  miniMapa: boolean
  erroAoSalvar: string | null
}

let estado: EstadoUI = {
  carregado: false,
  espacos: [],
  espaco: null,
  notas: {},
  preferencias: { versao: 1, tema: 'escuro', presets: PRESETS_PADRAO, corPostItPadrao: 'amarelo' },
  lateralAberta: true,
  ferramenta: 'selecionar',
  estiloDesenho: { ferramenta: 'lapis', cor: '#FF3B30' },
  selecao: null,
  editando: null,
  miniMapa: false,
  erroAoSalvar: null
}

const ouvintes = new Set<() => void>()

function inscrever(ouvinte: () => void): () => void {
  ouvintes.add(ouvinte)
  return () => ouvintes.delete(ouvinte)
}

export function lerEstado(): EstadoUI {
  return estado
}

/** O seletor deve devolver um pedaço do estado (não um objeto novo a cada chamada). */
export function usarLoja<T>(seletor: (e: EstadoUI) => T): T {
  return useSyncExternalStore(inscrever, () => seletor(estado))
}

function definir(parcial: Partial<EstadoUI>): void {
  estado = { ...estado, ...parcial }
  ouvintes.forEach((o) => o())
}

// ---------- salvar ----------

let temporizador: ReturnType<typeof setTimeout> | null = null
let salvando: Promise<void> = Promise.resolve()

function agendarSalvar(): void {
  if (temporizador) clearTimeout(temporizador)
  temporizador = setTimeout(() => void salvarAgora(), 600)
}

export function salvarAgora(): Promise<void> {
  if (temporizador) clearTimeout(temporizador)
  temporizador = null
  const { espaco, notas } = estado
  if (!espaco) return salvando
  // a fila nunca fica presa: uma falha é registrada e o próximo salvamento tenta de novo
  salvando = salvando.then(async () => {
    try {
      const resumo = await window.mp.dados.salvarEspaco({ espaco, notas })
      definir({ erroAoSalvar: null, espacos: estado.espacos.map((e) => (e.id === resumo.id ? resumo : e)) })
    } catch (erro) {
      definir({ erroAoSalvar: String(erro) })
    }
  })
  return salvando
}

// ---------- desfazer e refazer ----------

interface Instantaneo {
  espaco: Espaco
  notas: Record<string, string>
}

const LIMITE_HISTORICO = 100
let pilhaDesfazer: Instantaneo[] = []
let pilhaRefazer: Instantaneo[] = []
let ultimaChave: string | null = null
let ultimoRegistro = 0

/**
 * Guarda o estado de antes de uma mudança. Mudanças seguidas com a mesma `chave` (arrastar, digitar,
 * redimensionar) viram um passo só; sem chave, cada mudança é um passo.
 */
function registrarHistorico(chave?: string): void {
  const { espaco, notas } = estado
  if (!espaco) return
  const agora = Date.now()
  if (chave && chave === ultimaChave && agora - ultimoRegistro < 1000) {
    ultimoRegistro = agora
    return
  }
  pilhaDesfazer.push({ espaco, notas })
  if (pilhaDesfazer.length > LIMITE_HISTORICO) pilhaDesfazer.shift()
  pilhaRefazer = []
  ultimaChave = chave ?? null
  ultimoRegistro = agora
}

function aplicarInstantaneo(i: Instantaneo): void {
  // desfazer mexe no conteúdo, não na vista: câmera, página aberta no portal e pastas abertas ficam como estão
  const atual = new Map(estado.espaco!.nos.map((n) => [n.id, n]))
  const nos = i.espaco.nos.map((n) => {
    const agoraNo = atual.get(n.id)
    if (n.tipo === 'portal' && agoraNo?.tipo === 'portal') return { ...n, url: agoraNo.url }
    if (n.tipo === 'pasta' && agoraNo?.tipo === 'pasta') return { ...n, expandidas: agoraNo.expandidas }
    return n
  })
  definir({ espaco: { ...i.espaco, nos, camera: estado.espaco!.camera }, notas: i.notas, selecao: null, editando: null })
  ultimaChave = null
  agendarSalvar()
}

export function desfazer(): void {
  const anterior = pilhaDesfazer.pop()
  if (!anterior || !estado.espaco) return
  pilhaRefazer.push({ espaco: estado.espaco, notas: estado.notas })
  aplicarInstantaneo(anterior)
}

export function refazer(): void {
  const proximo = pilhaRefazer.pop()
  if (!proximo || !estado.espaco) return
  pilhaDesfazer.push({ espaco: estado.espaco, notas: estado.notas })
  aplicarInstantaneo(proximo)
}

/** `chave`: agrupa no histórico (ver registrarHistorico); `false`: não entra no histórico (câmera, z). */
/** Antes de fechar a janela: salva o pendente e diz se deu certo. */
export async function salvarParaFechar(): Promise<boolean> {
  await salvarAgora()
  return estado.erroAoSalvar === null
}

function mudarEspaco(mudar: (espaco: Espaco) => Espaco, chave?: string | false): void {
  if (!estado.espaco) return
  if (chave !== false) registrarHistorico(chave)
  definir({ espaco: mudar(estado.espaco) })
  agendarSalvar()
}

// ---------- início e espaços ----------

export async function iniciar(): Promise<void> {
  const [preferencias, janela, espacos] = await Promise.all([
    window.mp.dados.carregarPreferencias(),
    window.mp.dados.carregarEstado(),
    window.mp.dados.listarEspacos()
  ])
  definir({ preferencias, espacos, lateralAberta: janela.lateralAberta })
  const ativo = espacos.find((e) => e.id === janela.espacoAtivo) ?? espacos[0]
  if (ativo) await abrirEspaco(ativo.id)
  definir({ carregado: true })
}

let pedidoDeAbertura = 0

export async function abrirEspaco(id: string): Promise<void> {
  if (estado.espaco?.id === id) return
  // cliques rápidos em vários espaços: vale só o último
  const pedido = ++pedidoDeAbertura
  await salvarAgora()
  const carregado = await window.mp.dados.carregarEspaco(id)
  if (!carregado || pedido !== pedidoDeAbertura) return
  pilhaDesfazer = []
  pilhaRefazer = []
  ultimaChave = null
  definir({ espaco: carregado.espaco, notas: carregado.notas, selecao: null, editando: null, ferramenta: 'selecionar' })
  salvarJanela()
}

export async function criarEspaco(nome: string, pasta: string): Promise<void> {
  const resumo = await window.mp.dados.criarEspaco(nome, pasta)
  definir({ espacos: [...estado.espacos, resumo] })
  await abrirEspaco(resumo.id)
}

export async function renomearEspaco(id: string, nome: string): Promise<void> {
  const limpo = nome.trim()
  if (!limpo) return
  if (estado.espaco?.id === id) {
    mudarEspaco((e) => ({ ...e, nome: limpo }), false)
    definir({ espacos: estado.espacos.map((r) => (r.id === id ? { ...r, nome: limpo } : r)) })
    return
  }
  const carregado = await window.mp.dados.carregarEspaco(id)
  if (!carregado) return
  const resumo = await window.mp.dados.salvarEspaco({ ...carregado, espaco: { ...carregado.espaco, nome: limpo } })
  definir({ espacos: estado.espacos.map((r) => (r.id === id ? resumo : r)) })
}

function salvarJanela(): void {
  void window.mp.dados.salvarEstado({
    versao: 1,
    espacoAtivo: estado.espaco?.id ?? null,
    lateralAberta: estado.lateralAberta
  })
}

export function alternarLateral(): void {
  definir({ lateralAberta: !estado.lateralAberta })
  salvarJanela()
}

export function definirTema(tema: Tema): void {
  const preferencias = { ...estado.preferencias, tema }
  definir({ preferencias })
  void window.mp.dados.salvarPreferencias(preferencias)
}

// ---------- ferramentas e seleção ----------

export function escolherFerramenta(ferramenta: Ferramenta): void {
  definir({ ferramenta, editando: null })
}

export function definirEstiloDesenho(estilo: Partial<EstadoUI['estiloDesenho']>): void {
  definir({ estiloDesenho: { ...estado.estiloDesenho, ...estilo }, ferramenta: 'desenho' })
}

export function selecionar(selecao: Selecao | null): void {
  if (selecao?.tipo === 'no') trazerParaFrente(selecao.id)
  definir({ selecao, editando: estado.editando === selecao?.id ? estado.editando : null })
}

export function editar(id: string | null): void {
  definir({ editando: id, selecao: id ? { tipo: 'no', id } : estado.selecao })
}

export function alternarMiniMapa(): void {
  definir({ miniMapa: !estado.miniMapa })
}

// ---------- câmera ----------

export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 2

export function definirCamera(camera: Camera): void {
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, camera.zoom))
  mudarEspaco((e) => ({ ...e, camera: { ...camera, zoom } }), false)
}

// ---------- nós ----------

const novoId = (): string => crypto.randomUUID()
const agora = (): string => new Date().toISOString()

function proximoZ(espaco: Espaco): number {
  return Math.max(0, ...espaco.nos.map((n) => n.z), ...espaco.desenhos.map((d) => d.z)) + 1
}

export type NovoNo =
  | { tipo: 'terminal'; preset: PresetAgente }
  | { tipo: 'postit' }
  | { tipo: 'texto' }
  | { tipo: 'arquivo'; caminho: string; nome: string }
  | { tipo: 'pasta'; caminho: string }
  | { tipo: 'portal'; url: string }

/** Cria um nó com o centro em (x, y) do quadro e já o seleciona. */
export function adicionarNo(novo: NovoNo, x: number, y: number): string {
  const espaco = estado.espaco
  if (!espaco) return ''
  registrarHistorico()
  const base = { id: novoId(), z: proximoZ(espaco), criadoEm: agora() }
  const centrado = (largura: number, altura: number) => ({ x: x - largura / 2, y: y - altura / 2, largura, altura })
  let no: No
  switch (novo.tipo) {
    case 'terminal': {
      const mesmos = espaco.nos.filter((n) => n.tipo === 'terminal' && n.agente === novo.preset.agente).length
      no = {
        ...base,
        ...centrado(800, 500),
        tipo: 'terminal',
        nome: mesmos ? `${novo.preset.nome} ${mesmos + 1}` : novo.preset.nome,
        agente: novo.preset.agente,
        comando: novo.preset.comando
      }
      break
    }
    case 'postit':
      no = { ...base, ...centrado(260, 160), tipo: 'postit', arquivo: `${base.id}.md`, cor: estado.preferencias.corPostItPadrao }
      definir({ notas: { ...estado.notas, [no.arquivo]: '' } })
      break
    case 'texto':
      no = { ...base, ...centrado(240, 48), tipo: 'texto', texto: '', tamanhoFonte: 24, mono: false }
      break
    case 'arquivo':
      no = { ...base, ...centrado(180, 140), tipo: 'arquivo', caminho: novo.caminho, nomeExibido: novo.nome }
      break
    case 'pasta':
      no = { ...base, ...centrado(300, 380), tipo: 'pasta', caminho: novo.caminho, expandidas: [] }
      break
    case 'portal':
      no = { ...base, ...centrado(900, 600), tipo: 'portal', url: novo.url }
      break
  }
  mudarEspaco((e) => ({ ...e, nos: [...e.nos, no] }), false)
  definir({
    selecao: { tipo: 'no', id: no.id },
    editando: no.tipo === 'postit' || no.tipo === 'texto' ? no.id : null,
    ferramenta: 'selecionar'
  })
  return no.id
}

/** `chave`: mudanças seguidas com a mesma chave viram um passo de desfazer; `false`: fora do histórico. */
export function atualizarNo(id: string, parcial: Partial<No>, chave?: string | false): void {
  mudarEspaco((e) => ({ ...e, nos: e.nos.map((n) => (n.id === id ? ({ ...n, ...parcial } as No) : n)) }), chave)
}

export function trazerParaFrente(id: string): void {
  const espaco = estado.espaco
  const no = espaco?.nos.find((n) => n.id === id)
  if (!espaco || !no) return
  const z = proximoZ(espaco)
  if (no.z < z - 1) atualizarNo(id, { z }, false)
}

export function definirNota(arquivo: string, texto: string): void {
  registrarHistorico(`nota:${arquivo}`)
  definir({ notas: { ...estado.notas, [arquivo]: texto } })
  agendarSalvar()
}

export function apagarSelecao(): void {
  const { selecao, espaco } = estado
  if (!selecao || !espaco) return
  registrarHistorico()
  if (selecao.tipo === 'no') {
    const no = espaco.nos.find((n) => n.id === selecao.id)
    mudarEspaco(
      (e) => ({
        ...e,
        nos: e.nos.filter((n) => n.id !== selecao.id),
        cordas: e.cordas.filter((c) => c.de !== selecao.id && c.para !== selecao.id)
      }),
      false
    )
    if (no?.tipo === 'postit') {
      const notas = { ...estado.notas }
      delete notas[(no as NoPostIt).arquivo]
      definir({ notas })
    }
  } else if (selecao.tipo === 'corda') {
    mudarEspaco((e) => ({ ...e, cordas: e.cordas.filter((c) => c.id !== selecao.id) }), false)
  } else {
    mudarEspaco((e) => ({ ...e, desenhos: e.desenhos.filter((d) => d.id !== selecao.id) }), false)
  }
  definir({ selecao: null, editando: null })
}

// ---------- cordas e desenhos ----------

/** Só terminal com terminal, sem repetir e sem ligar um terminal nele mesmo. */
export function ligar(de: string, para: string): boolean {
  const espaco = estado.espaco
  if (!espaco || de === para) return false
  const ehTerminal = (id: string): boolean => espaco.nos.some((n) => n.id === id && n.tipo === 'terminal')
  if (!ehTerminal(de) || !ehTerminal(para)) return false
  const existe = espaco.cordas.some((c) => (c.de === de && c.para === para) || (c.de === para && c.para === de))
  if (existe) return false
  const corda: Corda = { id: novoId(), de, para, criadoEm: agora() }
  mudarEspaco((e) => ({ ...e, cordas: [...e.cordas, corda] }))
  return true
}

export function adicionarDesenho(desenho: Omit<Desenho, 'id' | 'z'>): void {
  const espaco = estado.espaco
  if (!espaco) return
  mudarEspaco((e) => ({ ...e, desenhos: [...e.desenhos, { ...desenho, id: novoId(), z: proximoZ(espaco) }] }))
}
