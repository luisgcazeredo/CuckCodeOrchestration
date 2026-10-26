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

function mudarEspaco(mudar: (espaco: Espaco) => Espaco): void {
  if (!estado.espaco) return
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
    mudarEspaco((e) => ({ ...e, nome: limpo }))
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
  mudarEspaco((e) => ({ ...e, camera: { ...camera, zoom } }))
}

// ---------- nós ----------

const novoId = (): string => crypto.randomUUID()
const agora = (): string => new Date().toISOString()

function proximoZ(espaco: Espaco): number {
  return Math.max(0, ...espaco.nos.map((n) => n.z), ...espaco.desenhos.map((d) => d.z)) + 1
}

type NovoNo =
  | { tipo: 'terminal'; preset: PresetAgente }
  | { tipo: 'postit' }
  | { tipo: 'texto' }
  | { tipo: 'arquivo'; caminho: string; nome: string }

/** Cria um nó com o centro em (x, y) do quadro e já o seleciona. */
export function adicionarNo(novo: NovoNo, x: number, y: number): string {
  const espaco = estado.espaco
  if (!espaco) return ''
  const base = { id: novoId(), z: proximoZ(espaco), criadoEm: agora() }
  let no: No
  if (novo.tipo === 'terminal') {
    const mesmos = espaco.nos.filter((n) => n.tipo === 'terminal' && n.agente === novo.preset.agente).length
    no = {
      ...base,
      tipo: 'terminal',
      nome: mesmos ? `${novo.preset.nome} ${mesmos + 1}` : novo.preset.nome,
      agente: novo.preset.agente,
      comando: novo.preset.comando,
      x: x - 400,
      y: y - 250,
      largura: 800,
      altura: 500
    }
  } else if (novo.tipo === 'postit') {
    no = {
      ...base,
      tipo: 'postit',
      arquivo: `${base.id}.md`,
      cor: estado.preferencias.corPostItPadrao,
      x: x - 130,
      y: y - 80,
      largura: 260,
      altura: 160
    }
    definir({ notas: { ...estado.notas, [no.arquivo]: '' } })
  } else if (novo.tipo === 'texto') {
    no = { ...base, tipo: 'texto', texto: '', tamanhoFonte: 24, mono: false, x: x - 60, y: y - 20, largura: 240, altura: 48 }
  } else {
    no = { ...base, tipo: 'arquivo', caminho: novo.caminho, nomeExibido: novo.nome, x: x - 90, y: y - 70, largura: 180, altura: 140 }
  }
  mudarEspaco((e) => ({ ...e, nos: [...e.nos, no] }))
  definir({
    selecao: { tipo: 'no', id: no.id },
    editando: no.tipo === 'postit' || no.tipo === 'texto' ? no.id : null,
    ferramenta: 'selecionar'
  })
  return no.id
}

export function atualizarNo(id: string, parcial: Partial<No>): void {
  mudarEspaco((e) => ({ ...e, nos: e.nos.map((n) => (n.id === id ? ({ ...n, ...parcial } as No) : n)) }))
}

export function trazerParaFrente(id: string): void {
  const espaco = estado.espaco
  const no = espaco?.nos.find((n) => n.id === id)
  if (!espaco || !no) return
  const z = proximoZ(espaco)
  if (no.z < z - 1) atualizarNo(id, { z })
}

export function definirNota(arquivo: string, texto: string): void {
  definir({ notas: { ...estado.notas, [arquivo]: texto } })
  agendarSalvar()
}

export function apagarSelecao(): void {
  const { selecao, espaco } = estado
  if (!selecao || !espaco) return
  if (selecao.tipo === 'no') {
    const no = espaco.nos.find((n) => n.id === selecao.id)
    mudarEspaco((e) => ({
      ...e,
      nos: e.nos.filter((n) => n.id !== selecao.id),
      cordas: e.cordas.filter((c) => c.de !== selecao.id && c.para !== selecao.id)
    }))
    if (no?.tipo === 'postit') {
      const notas = { ...estado.notas }
      delete notas[(no as NoPostIt).arquivo]
      definir({ notas })
    }
  } else if (selecao.tipo === 'corda') {
    mudarEspaco((e) => ({ ...e, cordas: e.cordas.filter((c) => c.id !== selecao.id) }))
  } else {
    mudarEspaco((e) => ({ ...e, desenhos: e.desenhos.filter((d) => d.id !== selecao.id) }))
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
