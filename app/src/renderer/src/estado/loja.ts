import { useSyncExternalStore } from 'react'
import {
  PRESETS_PADRAO,
  type Andar,
  type Camera,
  type Corda,
  type Desenho,
  type Espaco,
  type No,
  type NoPostIt,
  type PincelDesenho,
  type Plano,
  type PresetAgente,
  type Preferencias,
  type ResultadoGit,
  type ResumoEspaco,
  type Tema
} from '../../../shared/modelo'
import { distanciaAoDesenho } from '../quadro/geometria'

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
  estiloDesenho: { ferramenta: PincelDesenho; cor: string }
  selecao: Selecao | null
  /** Nó em edição de texto (post-it ou texto). */
  editando: string | null
  miniMapa: boolean
  erroAoSalvar: string | null
  /** Vista de andares (a pilha em perspectiva) aberta. */
  vistaAndares: boolean
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
  erroAoSalvar: null,
  vistaAndares: false
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

// ---------- plano à mostra (térreo ou andar) ----------

/** O plano à mostra: o próprio espaço (térreo) ou o andar ativo. Mesmo objeto enquanto não muda. */
export function planoDe(espaco: Espaco): Plano {
  return (espaco.andarAtivo && espaco.andares.find((a) => a.id === espaco.andarAtivo)) || espaco
}

export function planoAtual(): Plano | null {
  return estado.espaco ? planoDe(estado.espaco) : null
}

/** Andar à mostra, ou null no térreo. */
export function andarAtual(): Andar | null {
  const e = estado.espaco
  return (e?.andarAtivo && e.andares.find((a) => a.id === e.andarAtivo)) || null
}

/** Pasta onde os terminais do plano à mostra abrem: a do andar (worktree) ou a do projeto. */
export function pastaDoPlano(espaco: Espaco): string {
  const andar = espaco.andarAtivo ? espaco.andares.find((a) => a.id === espaco.andarAtivo) : null
  return andar?.git?.pasta ?? espaco.pasta
}

function comPlano(espaco: Espaco, plano: Plano): Espaco {
  if (!espaco.andarAtivo) return { ...espaco, ...plano }
  return { ...espaco, andares: espaco.andares.map((a) => (a.id === espaco.andarAtivo ? { ...a, ...plano } : a)) }
}

// ---------- salvar ----------

let temporizador: ReturnType<typeof setTimeout> | null = null
let salvando: Promise<void> = Promise.resolve()

function agendarSalvar(): void {
  if (temporizador) clearTimeout(temporizador)
  temporizador = setTimeout(() => void salvarAgora(), 600)
}

/** Salva o que estiver pendente. Diz se deu certo (false = o arquivo em disco ficou como estava). */
export function salvarAgora(): Promise<boolean> {
  if (temporizador) clearTimeout(temporizador)
  temporizador = null
  const { espaco, notas } = estado
  if (!espaco) return salvando.then(() => estado.erroAoSalvar === null)
  // a fila nunca fica presa: uma falha é registrada e o próximo salvamento tenta de novo
  salvando = salvando.then(async () => {
    try {
      const resumo = await window.mp.dados.salvarEspaco({ espaco, notas })
      definir({ erroAoSalvar: null, espacos: estado.espacos.map((e) => (e.id === resumo.id ? resumo : e)) })
    } catch (erro) {
      definir({ erroAoSalvar: String(erro) })
    }
  })
  return salvando.then(() => estado.erroAoSalvar === null)
}

/** Antes de fechar a janela: salva o pendente e diz se deu certo. */
export function salvarParaFechar(): Promise<boolean> {
  return salvarAgora()
}

// ---------- desfazer e refazer (um histórico por plano: térreo e cada andar) ----------

/** Só o conteúdo do plano e o texto dos post-its dele: desfazer num andar não mexe no térreo, e vice-versa. */
interface Instantaneo {
  plano: Plano
  notas: Record<string, string>
}

const LIMITE_HISTORICO = 100
const historicos = new Map<string, { desfazer: Instantaneo[]; refazer: Instantaneo[] }>()
let ultimaChave: string | null = null
let ultimoRegistro = 0

const idDoPlano = (espaco: Espaco): string => espaco.andarAtivo ?? 'terreo'

function pilhasDoPlano(): { desfazer: Instantaneo[]; refazer: Instantaneo[] } {
  const id = idDoPlano(estado.espaco!)
  let pilhas = historicos.get(id)
  if (!pilhas) historicos.set(id, (pilhas = { desfazer: [], refazer: [] }))
  return pilhas
}

function zerarHistorico(): void {
  historicos.clear()
  ultimaChave = null
}

function notasDoPlano(plano: Plano, notas: Record<string, string>): Record<string, string> {
  const doPlano: Record<string, string> = {}
  for (const n of plano.nos) if (n.tipo === 'postit') doPlano[n.arquivo] = notas[n.arquivo] ?? ''
  return doPlano
}

function instantaneoAtual(): Instantaneo {
  const { camera, nos, cordas, desenhos } = planoDe(estado.espaco!)
  const plano = { camera, nos, cordas, desenhos }
  return { plano, notas: notasDoPlano(plano, estado.notas) }
}

/**
 * Guarda o plano de antes de uma mudança. Mudanças seguidas com a mesma `chave` (arrastar, digitar,
 * redimensionar) viram um passo só; sem chave, cada mudança é um passo.
 */
function registrarHistorico(chave?: string): void {
  if (!estado.espaco) return
  const agora = Date.now()
  const chaveCompleta = chave ? `${idDoPlano(estado.espaco)}|${chave}` : null
  if (chaveCompleta && chaveCompleta === ultimaChave && agora - ultimoRegistro < 1000) {
    ultimoRegistro = agora
    return
  }
  const pilhas = pilhasDoPlano()
  pilhas.desfazer.push(instantaneoAtual())
  if (pilhas.desfazer.length > LIMITE_HISTORICO) pilhas.desfazer.shift()
  pilhas.refazer = []
  ultimaChave = chaveCompleta
  ultimoRegistro = agora
}

function aplicarInstantaneo(i: Instantaneo): void {
  // desfazer mexe no conteúdo, não na vista: câmera, página aberta no portal e pastas abertas ficam como estão
  const atual = planoDe(estado.espaco!)
  const vista = new Map(atual.nos.map((n) => [n.id, n] as const))
  const plano: Plano = {
    ...i.plano,
    camera: atual.camera,
    nos: i.plano.nos.map((n) => {
      const agoraNo = vista.get(n.id)
      if (n.tipo === 'portal' && agoraNo?.tipo === 'portal') return { ...n, url: agoraNo.url }
      if (n.tipo === 'pasta' && agoraNo?.tipo === 'pasta') return { ...n, expandidas: agoraNo.expandidas }
      return n
    })
  }
  // post-its deste plano voltam ao texto da época; post-its de outros planos não são tocados
  const notas = { ...estado.notas }
  for (const arquivo of Object.keys(notasDoPlano(atual, estado.notas))) if (!(arquivo in i.notas)) delete notas[arquivo]
  Object.assign(notas, i.notas)
  definir({ espaco: comPlano(estado.espaco!, plano), notas, selecao: null, editando: null })
  ultimaChave = null
  agendarSalvar()
}

export function desfazer(): void {
  if (!estado.espaco) return
  const pilhas = pilhasDoPlano()
  const anterior = pilhas.desfazer.pop()
  if (!anterior) return
  pilhas.refazer.push(instantaneoAtual())
  aplicarInstantaneo(anterior)
}

export function refazer(): void {
  if (!estado.espaco) return
  const pilhas = pilhasDoPlano()
  const proximo = pilhas.refazer.pop()
  if (!proximo) return
  pilhas.desfazer.push(instantaneoAtual())
  aplicarInstantaneo(proximo)
}

/** `chave`: agrupa no histórico (ver registrarHistorico); `false`: não entra no histórico (câmera, z, vista). */
function mudarEspaco(mudar: (espaco: Espaco) => Espaco, chave?: string | false): void {
  if (!estado.espaco) return
  if (chave !== false) registrarHistorico(chave)
  definir({ espaco: mudar(estado.espaco) })
  agendarSalvar()
}

/** Muda só o plano à mostra (térreo ou andar). */
function mudarPlano(mudar: (plano: Plano) => Plano, chave?: string | false): void {
  mudarEspaco((e) => comPlano(e, mudar(planoDe(e))), chave)
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

export async function abrirEspaco(id: string, andarId?: string | null): Promise<void> {
  if (estado.espaco?.id === id) {
    if (andarId !== undefined) irParaAndar(andarId)
    return
  }
  // cliques rápidos em vários espaços: vale só o último
  const pedido = ++pedidoDeAbertura
  // não salvou: fica onde está (o aviso de erro aparece) para a mudança não se perder
  if (!(await salvarAgora())) return
  const carregado = await window.mp.dados.carregarEspaco(id)
  if (!carregado || pedido !== pedidoDeAbertura) return
  zerarHistorico()
  definir({
    espaco: carregado.espaco,
    notas: carregado.notas,
    selecao: null,
    editando: null,
    ferramenta: 'selecionar',
    vistaAndares: false
  })
  if (andarId !== undefined) irParaAndar(andarId)
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

/** Apaga o espaço do app. Se era o aberto, abre outro (ou fica vazio). */
export async function apagarEspaco(id: string): Promise<void> {
  if (estado.espaco?.id === id) {
    if (temporizador) clearTimeout(temporizador)
    temporizador = null
    await salvando
  }
  await window.mp.dados.apagarEspaco(id)
  const espacos = estado.espacos.filter((e) => e.id !== id)
  if (estado.espaco?.id === id) {
    definir({ espaco: null, notas: {}, espacos, selecao: null, editando: null })
    zerarHistorico()
    if (espacos[0]) await abrirEspaco(espacos[0].id)
    else salvarJanela()
  } else definir({ espacos })
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

// ---------- andares ----------

export function abrirVistaAndares(aberta: boolean): void {
  definir({ vistaAndares: aberta })
}

/** Mostra outro andar (null = térreo). A troca de andar não entra no desfazer. */
export function irParaAndar(andarId: string | null): void {
  const e = estado.espaco
  if (!e) return
  const existe = andarId === null || e.andares.some((a) => a.id === andarId)
  if (!existe || e.andarAtivo === andarId) return
  mudarEspaco((esp) => ({ ...esp, andarAtivo: andarId }), false)
  definir({ selecao: null, editando: null, ferramenta: 'selecionar' })
}

/** Cria o andar (com git: ramo + worktree, feito pelo processo principal) e vai para ele. */
export async function criarAndar(nome: string, usarGit: boolean): Promise<void> {
  const e = estado.espaco
  if (!e) return
  if (!(await salvarAgora())) throw new Error('Não consegui salvar o quadro; o andar não foi criado.')
  const andar = await window.mp.andares.criar(e.id, nome, usarGit)
  // a câmera do andar novo começa onde o térreo está, para a transição ficar no mesmo lugar
  const novo: Andar = { ...andar, camera: planoDe(estado.espaco!).camera }
  mudarEspaco((esp) => ({ ...esp, andares: [...esp.andares, novo], andarAtivo: novo.id }), false)
  definir({ selecao: null, editando: null })
  await salvarAgora()
}

export function renomearAndar(andarId: string, nome: string): void {
  const limpo = nome.trim()
  if (!limpo) return
  mudarEspaco((e) => ({ ...e, andares: e.andares.map((a) => (a.id === andarId ? { ...a, nome: limpo } : a)) }), false)
}

export function definirStatusAndar(andarId: string, status: Andar['status']): void {
  mudarEspaco((e) => ({ ...e, andares: e.andares.map((a) => (a.id === andarId ? { ...a, status } : a)) }), false)
}

/** Tira o andar do espaço (depois de juntado ou apagado no git). Os post-its dele saem junto. */
function retirarAndar(andarId: string): void {
  const e = estado.espaco
  const andar = e?.andares.find((a) => a.id === andarId)
  if (!e || !andar) return
  const notas = { ...estado.notas }
  for (const n of andar.nos) if (n.tipo === 'postit') delete notas[n.arquivo]
  definir({ notas })
  mudarEspaco(
    (esp) => ({
      ...esp,
      andares: esp.andares.filter((a) => a.id !== andarId),
      andarAtivo: esp.andarAtivo === andarId ? null : esp.andarAtivo
    }),
    false
  )
  historicos.delete(andarId)
  ultimaChave = null
}

const NAO_SALVOU: ResultadoGit = { ok: false, mensagem: 'Não consegui salvar o quadro; nada foi feito no git.' }

export async function pousarAndar(andarId: string, apagarRamo: boolean, destino: string): Promise<ResultadoGit> {
  const e = estado.espaco
  if (!e) return { ok: false, mensagem: 'nenhum espaço aberto' }
  if (!(await salvarAgora())) return NAO_SALVOU
  const r = await window.mp.andares.pousar(e.id, andarId, apagarRamo, destino)
  if (r.ok) {
    retirarAndar(andarId)
    await salvarAgora()
  }
  return r
}

export async function apagarAndar(andarId: string, apagarRamo: boolean, forcar: boolean): Promise<ResultadoGit> {
  const e = estado.espaco
  if (!e) return { ok: false, mensagem: 'nenhum espaço aberto' }
  if (!(await salvarAgora())) return NAO_SALVOU
  const r = await window.mp.andares.apagar(e.id, andarId, apagarRamo, forcar)
  if (r.ok) {
    retirarAndar(andarId)
    await salvarAgora()
  }
  return r
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
  mudarPlano((p) => ({ ...p, camera: { ...camera, zoom } }), false)
}

// ---------- nós ----------

const novoId = (): string => crypto.randomUUID()
const agora = (): string => new Date().toISOString()

function proximoZ(plano: Plano): number {
  return Math.max(0, ...plano.nos.map((n) => n.z), ...plano.desenhos.map((d) => d.z)) + 1
}

export function acharNo(id: string): No | undefined {
  return planoAtual()?.nos.find((n) => n.id === id)
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
  const plano = planoAtual()
  if (!plano) return ''
  registrarHistorico()
  const base = { id: novoId(), z: proximoZ(plano), criadoEm: agora() }
  const centrado = (largura: number, altura: number) => ({ x: x - largura / 2, y: y - altura / 2, largura, altura })
  let no: No
  switch (novo.tipo) {
    case 'terminal': {
      const mesmos = plano.nos.filter((n) => n.tipo === 'terminal' && n.agente === novo.preset.agente).length
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
  mudarPlano((p) => ({ ...p, nos: [...p.nos, no] }), false)
  definir({
    selecao: { tipo: 'no', id: no.id },
    editando: no.tipo === 'postit' || no.tipo === 'texto' ? no.id : null,
    ferramenta: 'selecionar'
  })
  return no.id
}

/** `chave`: mudanças seguidas com a mesma chave viram um passo de desfazer; `false`: fora do histórico. */
export function atualizarNo(id: string, parcial: Partial<No>, chave?: string | false): void {
  mudarPlano((p) => ({ ...p, nos: p.nos.map((n) => (n.id === id ? ({ ...n, ...parcial } as No) : n)) }), chave)
}

export function trazerParaFrente(id: string): void {
  const plano = planoAtual()
  const no = plano?.nos.find((n) => n.id === id)
  if (!plano || !no) return
  const z = proximoZ(plano)
  if (no.z < z - 1) atualizarNo(id, { z }, false)
}

export function enviarParaTras(id: string): void {
  const plano = planoAtual()
  if (!plano) return
  const menor = Math.min(0, ...plano.nos.map((n) => n.z), ...plano.desenhos.map((d) => d.z))
  atualizarNo(id, { z: menor - 1 })
}

export function definirCorNo(id: string, cor: string | undefined): void {
  atualizarNo(id, { cor } as Partial<No>)
}

export function alternarTrava(id: string): void {
  const no = acharNo(id)
  if (no) atualizarNo(id, { travado: !no.travado })
}

/** Cópia ao lado do original; post-it ganha arquivo próprio com o mesmo texto. */
export function duplicarNo(id: string): string | null {
  const plano = planoAtual()
  const original = plano?.nos.find((n) => n.id === id)
  if (!plano || !original) return null
  registrarHistorico()
  const copia = { ...original, id: novoId(), x: original.x + 40, y: original.y + 40, z: proximoZ(plano), criadoEm: agora(), travado: false } as No
  if (copia.tipo === 'postit') {
    copia.arquivo = `${copia.id}.md`
    definir({ notas: { ...estado.notas, [copia.arquivo]: estado.notas[(original as NoPostIt).arquivo] ?? '' } })
  }
  if (copia.tipo === 'terminal') copia.nome = `${copia.nome} (cópia)`
  mudarPlano((p) => ({ ...p, nos: [...p.nos, copia] }), false)
  definir({ selecao: { tipo: 'no', id: copia.id } })
  return copia.id
}

export function definirNota(arquivo: string, texto: string): void {
  registrarHistorico(`nota:${arquivo}`)
  definir({ notas: { ...estado.notas, [arquivo]: texto } })
  agendarSalvar()
}

/** Apaga o que está selecionado. Cartão travado não sai (destrave antes). */
export function apagarSelecao(): void {
  const { selecao } = estado
  const plano = planoAtual()
  if (!selecao || !plano) return
  if (selecao.tipo === 'no') {
    const no = plano.nos.find((n) => n.id === selecao.id)
    if (!no || no.travado) return
    registrarHistorico()
    mudarPlano(
      (p) => ({
        ...p,
        nos: p.nos.filter((n) => n.id !== selecao.id),
        cordas: p.cordas.filter((c) => c.de !== selecao.id && c.para !== selecao.id)
      }),
      false
    )
    if (no.tipo === 'postit') {
      const notas = { ...estado.notas }
      delete notas[no.arquivo]
      definir({ notas })
    }
  } else if (selecao.tipo === 'corda') {
    mudarPlano((p) => ({ ...p, cordas: p.cordas.filter((c) => c.id !== selecao.id) }))
  } else {
    mudarPlano((p) => ({ ...p, desenhos: p.desenhos.filter((d) => d.id !== selecao.id) }))
  }
  definir({ selecao: null, editando: null })
}

export function apagar(selecao: Selecao): void {
  selecionar(selecao)
  apagarSelecao()
}

// ---------- cordas e desenhos ----------

/** Só terminal com terminal, sem repetir e sem ligar um terminal nele mesmo. */
export function ligar(de: string, para: string): boolean {
  const plano = planoAtual()
  if (!plano || de === para) return false
  const ehTerminal = (id: string): boolean => plano.nos.some((n) => n.id === id && n.tipo === 'terminal')
  if (!ehTerminal(de) || !ehTerminal(para)) return false
  const existe = plano.cordas.some((c) => (c.de === de && c.para === para) || (c.de === para && c.para === de))
  if (existe) return false
  const corda: Corda = { id: novoId(), de, para, criadoEm: agora() }
  mudarPlano((p) => ({ ...p, cordas: [...p.cordas, corda] }))
  return true
}

export function adicionarDesenho(desenho: Omit<Desenho, 'id' | 'z'>): void {
  const plano = planoAtual()
  if (!plano) return
  mudarPlano((p) => ({ ...p, desenhos: [...p.desenhos, { ...desenho, id: novoId(), z: proximoZ(plano) }] }))
}

export function definirCorDesenho(id: string, cor: string): void {
  mudarPlano((p) => ({ ...p, desenhos: p.desenhos.map((d) => (d.id === id ? { ...d, cor } : d)) }))
}

/** Borracha: apaga os traços a até `raio` (em unidades do quadro) do ponto. Um gesto = um passo de desfazer. */
export function apagarDesenhosPerto(x: number, y: number, raio: number, chaveDoGesto: string): number {
  const plano = planoAtual()
  if (!plano) return 0
  const tocados = plano.desenhos.filter((d) => distanciaAoDesenho(d, { x, y }) <= raio + d.espessura / 2)
  if (!tocados.length) return 0
  const fora = new Set(tocados.map((d) => d.id))
  mudarPlano((p) => ({ ...p, desenhos: p.desenhos.filter((d) => !fora.has(d.id)) }), chaveDoGesto)
  return tocados.length
}
