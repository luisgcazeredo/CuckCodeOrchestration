import { useSyncExternalStore } from 'react'
import {
  PRESETS_PADRAO,
  type Andar,
  type Camera,
  type CorPostIt,
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
import type { AvisoJanelas } from '../../../shared/api'
import { caixaDoDesenho, caixaDoNo, distanciaAoDesenho, uniao, type Caixa } from '../quadro/geometria'

export type Ferramenta = 'selecionar' | 'postit' | 'texto' | 'desenho'

/** Um item do quadro. */
export interface Alvo {
  tipo: 'no' | 'corda' | 'desenho'
  id: string
}

/** O que está selecionado: cartões e traços (vários de uma vez) ou uma ligação. */
export interface Selecao {
  nos: string[]
  desenhos: string[]
  corda: string | null
}

export const NADA: Selecao = { nos: [], desenhos: [], corda: null }

export const quantosSelecionados = (s: Selecao): number => s.nos.length + s.desenhos.length + (s.corda ? 1 : 0)

export interface EstadoUI {
  carregado: boolean
  espacos: ResumoEspaco[]
  espaco: Espaco | null
  notas: Record<string, string>
  preferencias: Preferencias
  lateralAberta: boolean
  ferramenta: Ferramenta
  estiloDesenho: { ferramenta: PincelDesenho; cor: string }
  selecao: Selecao
  /** Nó em edição de texto (post-it ou texto). */
  editando: string | null
  miniMapa: boolean
  erroAoSalvar: string | null
  /** Vista de andares (a pilha em perspectiva) aberta. */
  vistaAndares: boolean
  /** Espaços abertos em outras janelas (esta não pode abrir: traz a outra para a frente). */
  emOutrasJanelas: string[]
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
  selecao: NADA,
  editando: null,
  miniMapa: false,
  erroAoSalvar: null,
  vistaAndares: false,
  emOutrasJanelas: []
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
  definir({ espaco: comPlano(estado.espaco!, plano), notas, selecao: NADA, editando: null })
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
  window.mp.janelas.aoAvisar(receberAviso)
  const [preferencias, janela, espacos, inicio] = await Promise.all([
    window.mp.dados.carregarPreferencias(),
    window.mp.dados.carregarEstado(),
    window.mp.dados.listarEspacos(),
    window.mp.janelas.inicio()
  ])
  definir({ preferencias, espacos, lateralAberta: janela.lateralAberta, emOutrasJanelas: inicio.abertosEmOutras })
  // o espaço pedido para esta janela; senão o último usado, se estiver livre; senão o primeiro livre
  const livre = (id: string | null): boolean => !!id && espacos.some((e) => e.id === id) && !inicio.abertosEmOutras.includes(id)
  const ativo = [inicio.espacoId, janela.espacoAtivo, ...espacos.map((e) => e.id)].find(livre)
  if (ativo) await abrirEspaco(ativo)
  definir({ carregado: true })
}

/** O que as outras janelas (pelo processo principal) avisam. */
function receberAviso(aviso: AvisoJanelas): void {
  switch (aviso.tipo) {
    case 'lista':
      void window.mp.dados.listarEspacos().then((espacos) => definir({ espacos }))
      return
    case 'resumo':
      definir({ espacos: estado.espacos.map((r) => (r.id === aviso.resumo.id ? aviso.resumo : r)) })
      return
    case 'abertos':
      definir({ emOutrasJanelas: aviso.ids })
      return
    case 'renomear':
      if (estado.espaco?.id === aviso.espacoId) void renomearEspaco(aviso.espacoId, aviso.nome)
      return
    case 'preferencias':
      void window.mp.dados.carregarPreferencias().then((preferencias) => definir({ preferencias }))
  }
}

/** Abre uma janela nova (com o espaço pedido, ou com o primeiro livre). */
export function abrirNovaJanela(espacoId: string | null = null): void {
  void window.mp.janelas.nova(espacoId)
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
  // aberto em outra janela: ela vem para a frente e esta fica como está
  if (pedido !== pedidoDeAbertura || !(await window.mp.janelas.reservar(id))) return
  const carregado = await window.mp.dados.carregarEspaco(id)
  if (!carregado || pedido !== pedidoDeAbertura) return
  zerarHistorico()
  definir({
    espaco: carregado.espaco,
    notas: carregado.notas,
    selecao: NADA,
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
  // aberto em outra janela ou fechado: o processo principal cuida (e avisa todas as janelas)
  await window.mp.dados.renomearEspaco(id, limpo)
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
    definir({ espaco: null, notas: {}, espacos, selecao: NADA, editando: null })
    zerarHistorico()
    // o próximo livre (os abertos em outras janelas são delas)
    const livre = espacos.find((e) => !estado.emOutrasJanelas.includes(e.id))
    if (livre) await abrirEspaco(livre.id)
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
  definir({ selecao: NADA, editando: null, ferramenta: 'selecionar' })
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
  definir({ selecao: NADA, editando: null })
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

function contem(s: Selecao, alvo: Alvo): boolean {
  if (alvo.tipo === 'corda') return s.corda === alvo.id
  return (alvo.tipo === 'no' ? s.nos : s.desenhos).includes(alvo.id)
}

export function estaSelecionado(alvo: Alvo): boolean {
  return contem(estado.selecao, alvo)
}

function grupoDo(plano: Plano, alvo: Alvo): string | undefined {
  if (alvo.tipo === 'no') return plano.nos.find((n) => n.id === alvo.id)?.grupo
  if (alvo.tipo === 'desenho') return plano.desenhos.find((d) => d.id === alvo.id)?.grupo
  return undefined
}

/** Grupos que têm algum item na seleção. */
function gruposDa(plano: Plano, s: Selecao): Set<string> {
  const itens = [...plano.nos.filter((n) => s.nos.includes(n.id)), ...plano.desenhos.filter((d) => s.desenhos.includes(d.id))]
  return new Set(itens.flatMap((i) => (i.grupo ? [i.grupo] : [])))
}

/** A seleção mais os outros itens dos grupos que ela toca. */
function comGrupos(plano: Plano, s: Selecao): Selecao {
  const grupos = gruposDa(plano, s)
  if (!grupos.size) return s
  const entra = (i: { id: string; grupo?: string }, ids: string[]): boolean => ids.includes(i.id) || (!!i.grupo && grupos.has(i.grupo))
  return {
    nos: plano.nos.filter((n) => entra(n, s.nos)).map((n) => n.id),
    desenhos: plano.desenhos.filter((d) => entra(d, s.desenhos)).map((d) => d.id),
    corda: null
  }
}

const juntar = (a: Selecao, b: Selecao): Selecao => ({
  nos: [...new Set([...a.nos, ...b.nos])],
  desenhos: [...new Set([...a.desenhos, ...b.desenhos])],
  corda: null
})

function definirSelecao(selecao: Selecao, paraFrente = false): void {
  if (paraFrente) trazerParaFrente(selecao.nos)
  definir({ selecao, editando: estado.editando && selecao.nos.includes(estado.editando) ? estado.editando : null })
}

/**
 * Muda a seleção. Um item de grupo traz o grupo inteiro, a não ser com `sozinho`.
 * `somar` (Shift ou Ctrl): põe o item (com o grupo) na seleção, ou tira se já estava.
 */
export function selecionar(alvo: Alvo | null, opcoes: { somar?: boolean; sozinho?: boolean } = {}): void {
  const plano = planoAtual()
  if (!alvo || !plano) return definirSelecao(NADA)
  if (alvo.tipo === 'corda') return definirSelecao({ ...NADA, corda: alvo.id })
  const item: Selecao = alvo.tipo === 'no' ? { ...NADA, nos: [alvo.id] } : { ...NADA, desenhos: [alvo.id] }
  const novos = opcoes.sozinho ? item : comGrupos(plano, item)
  if (!opcoes.somar) return definirSelecao(novos, true)
  const atual = estado.selecao
  if (!contem(atual, alvo)) return definirSelecao(juntar(atual, novos))
  definirSelecao({
    nos: atual.nos.filter((id) => !novos.nos.includes(id)),
    desenhos: atual.desenhos.filter((id) => !novos.desenhos.includes(id)),
    corda: null
  })
}

/** Vários de uma vez (retângulo de seleção), sempre com os grupos inteiros. */
export function selecionarVarios(nos: string[], desenhos: string[], somar = false): void {
  const plano = planoAtual()
  if (!plano) return
  const novos = comGrupos(plano, { nos, desenhos, corda: null })
  definirSelecao(somar ? juntar(estado.selecao, novos) : novos)
}

export function selecionarTudo(): void {
  const plano = planoAtual()
  if (plano) definirSelecao({ nos: plano.nos.map((n) => n.id), desenhos: plano.desenhos.map((d) => d.id), corda: null })
}

/** O item, se a seleção é exatamente um cartão ou um traço. */
function itemUnico(s: Selecao): Alvo | null {
  if (s.corda || s.nos.length + s.desenhos.length !== 1) return null
  return s.nos.length ? { tipo: 'no', id: s.nos[0] } : { tipo: 'desenho', id: s.desenhos[0] }
}

/**
 * Clique sem Shift num item, como no Canva: seleciona o grupo inteiro; quem já está "dentro" do grupo
 * (com um item dele selecionado) pega o item clicado. Item já selecionado não muda nada: arrastar leva todos.
 */
export function selecionarPeloClique(alvo: Alvo): void {
  const plano = planoAtual()
  if (!plano || estaSelecionado(alvo)) return
  const grupo = grupoDo(plano, alvo)
  const unico = itemUnico(estado.selecao)
  selecionar(alvo, { sozinho: !!grupo && !!unico && grupoDo(plano, unico) === grupo })
}

/** Soltou sem arrastar num item que estava selecionado junto com outros: fica só ele (entra no grupo). */
export function focarItem(alvo: Alvo): void {
  const s = estado.selecao
  if (s.nos.length + s.desenhos.length > 1 && contem(s, alvo)) selecionar(alvo, { sozinho: true })
}

export interface InfoSelecao {
  nos: No[]
  desenhos: Desenho[]
  itens: number
  /** A seleção é exatamente um grupo inteiro. */
  umGrupo: boolean
  /** Algum item selecionado está num grupo. */
  temGrupo: boolean
  /** Peças para alinhar e distribuir: cada grupo conta como uma. */
  pecas: number
  /** Todos os cartões selecionados estão travados. */
  travados: boolean
}

export function infoDaSelecao(): InfoSelecao {
  const plano = planoAtual()
  const s = estado.selecao
  const nos = plano?.nos.filter((n) => s.nos.includes(n.id)) ?? []
  const desenhos = plano?.desenhos.filter((d) => s.desenhos.includes(d.id)) ?? []
  const itens = [...nos, ...desenhos]
  const grupos = new Set(itens.map((i) => i.grupo ?? `solto:${i.id}`))
  return {
    nos,
    desenhos,
    itens: itens.length,
    umGrupo: itens.length > 1 && grupos.size === 1 && !!itens[0].grupo,
    temGrupo: itens.some((i) => i.grupo),
    pecas: grupos.size,
    travados: nos.length > 0 && nos.every((n) => n.travado)
  }
}

export function editar(id: string | null): void {
  definir({ editando: id, selecao: id ? { ...NADA, nos: [id] } : estado.selecao })
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
  /** `texto`: já nasce escrito (colado); sem ele, abre para digitar. */
  | { tipo: 'postit'; texto?: string }
  | { tipo: 'texto'; texto?: string }
  | { tipo: 'arquivo'; caminho: string; nome: string }
  | { tipo: 'pasta'; caminho: string }
  | { tipo: 'portal'; url: string }
  /** Imagem já gravada em `imagens/` do espaço; largura e altura em pixels da imagem. */
  | { tipo: 'imagem'; arquivo: string; largura: number; altura: number }

/** Tamanho com que uma imagem colada entra no quadro: inteira até 640 de largura (ou 480 de altura). */
function tamanhoDaImagem(largura: number, altura: number): { largura: number; altura: number } {
  const escala = Math.min(1, 640 / Math.max(largura, 1), 480 / Math.max(altura, 1))
  return { largura: Math.max(40, Math.round(largura * escala)), altura: Math.max(40, Math.round(altura * escala)) }
}

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
      definir({ notas: { ...estado.notas, [no.arquivo]: novo.texto ?? '' } })
      break
    case 'texto':
      no = { ...base, ...centrado(novo.texto ? 420 : 240, 48), tipo: 'texto', texto: novo.texto ?? '', tamanhoFonte: 24, mono: false }
      break
    case 'imagem': {
      const { largura, altura } = tamanhoDaImagem(novo.largura, novo.altura)
      no = { ...base, ...centrado(largura, altura), tipo: 'imagem', arquivo: novo.arquivo }
      break
    }
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
    selecao: { ...NADA, nos: [no.id] },
    editando: (novo.tipo === 'postit' || novo.tipo === 'texto') && !novo.texto ? no.id : null,
    ferramenta: 'selecionar'
  })
  return no.id
}

/** `chave`: mudanças seguidas com a mesma chave viram um passo de desfazer; `false`: fora do histórico. */
export function atualizarNo(id: string, parcial: Partial<No>, chave?: string | false): void {
  mudarPlano((p) => ({ ...p, nos: p.nos.map((n) => (n.id === id ? ({ ...n, ...parcial } as No) : n)) }), chave)
}

/** Põe os cartões por cima de todo o resto, na mesma ordem entre eles. Fora do desfazer. */
export function trazerParaFrente(ids: string | string[]): void {
  const plano = planoAtual()
  const lista = new Set(typeof ids === 'string' ? [ids] : ids)
  if (!plano || !lista.size) return
  const escolhidos = plano.nos.filter((n) => lista.has(n.id)).sort((a, b) => a.z - b.z)
  const topo = Math.max(0, ...plano.nos.filter((n) => !lista.has(n.id)).map((n) => n.z), ...plano.desenhos.map((d) => d.z))
  if (escolhidos.every((n) => n.z > topo)) return
  const novoZ = new Map(escolhidos.map((n, i) => [n.id, topo + 1 + i]))
  mudarPlano((p) => ({ ...p, nos: p.nos.map((n) => (novoZ.has(n.id) ? { ...n, z: novoZ.get(n.id)! } : n)) }), false)
}

/** Põe os cartões selecionados por baixo de todo o resto. */
export function enviarParaTras(): void {
  const plano = planoAtual()
  const lista = new Set(estado.selecao.nos)
  if (!plano || !lista.size) return
  const escolhidos = plano.nos.filter((n) => lista.has(n.id)).sort((a, b) => a.z - b.z)
  const fundo = Math.min(0, ...plano.nos.filter((n) => !lista.has(n.id)).map((n) => n.z), ...plano.desenhos.map((d) => d.z))
  const novoZ = new Map(escolhidos.map((n, i) => [n.id, fundo - escolhidos.length + i]))
  mudarPlano((p) => ({ ...p, nos: p.nos.map((n) => (novoZ.has(n.id) ? { ...n, z: novoZ.get(n.id)! } : n)) }))
}

export function definirCorNo(id: string, cor: string | undefined): void {
  atualizarNo(id, { cor } as Partial<No>)
}

/** Tom de post-it que corresponde a cada cor de cartão (as que não têm tom deixam o post-it como está). */
const TOM_DO_POSTIT: Record<string, CorPostIt> = {
  '#007AFF': 'azul',
  '#AF52DE': 'roxo',
  '#FF2D55': 'rosa',
  '#FF3B30': 'rosa',
  '#FF9500': 'amarelo',
  '#FFCC00': 'amarelo',
  '#34C759': 'verde'
}

/** Pinta a seleção inteira: cartões, textos e traços. Post-it ganha o tom pastel correspondente. */
export function definirCorSelecao(cor: string | null): void {
  const s = estado.selecao
  mudarPlano((p) => ({
    ...p,
    nos: p.nos.map((n) => {
      if (!s.nos.includes(n.id)) return n
      if (n.tipo === 'postit') return cor && TOM_DO_POSTIT[cor] ? { ...n, cor: TOM_DO_POSTIT[cor] } : n
      return { ...n, cor: cor ?? undefined }
    }),
    desenhos: cor ? p.desenhos.map((d) => (s.desenhos.includes(d.id) ? { ...d, cor } : d)) : p.desenhos
  }))
}

/** Só post-its selecionados: o tom pastel. */
export function definirTomPostIts(cor: CorPostIt): void {
  const s = estado.selecao
  mudarPlano((p) => ({ ...p, nos: p.nos.map((n) => (n.tipo === 'postit' && s.nos.includes(n.id) ? { ...n, cor } : n)) }))
}

/** Trava todos (se algum estava solto) ou destrava todos. */
export function alternarTravaSelecao(): void {
  const s = estado.selecao
  const nos = planoAtual()?.nos.filter((n) => s.nos.includes(n.id)) ?? []
  if (!nos.length) return
  const travar = nos.some((n) => !n.travado)
  mudarPlano((p) => ({ ...p, nos: p.nos.map((n) => (s.nos.includes(n.id) ? { ...n, travado: travar } : n)) }))
}

// ---------- copiar, colar e duplicar ----------

/** Pedaço do quadro: cartões, traços, as ligações entre eles e o texto dos post-its. */
export interface Fragmento {
  nos: No[]
  desenhos: Desenho[]
  cordas: Corda[]
  notas: Record<string, string>
}

export function fragmentoDaSelecao(): Fragmento | null {
  const plano = planoAtual()
  const s = estado.selecao
  if (!plano) return null
  const nos = plano.nos.filter((n) => s.nos.includes(n.id))
  const desenhos = plano.desenhos.filter((d) => s.desenhos.includes(d.id))
  if (!nos.length && !desenhos.length) return null
  const ids = new Set(nos.map((n) => n.id))
  const notas: Record<string, string> = {}
  for (const n of nos) if (n.tipo === 'postit') notas[n.arquivo] = estado.notas[n.arquivo] ?? ''
  return { nos, desenhos, cordas: plano.cordas.filter((c) => ids.has(c.de) && ids.has(c.para)), notas }
}

/**
 * Põe uma cópia do fragmento no quadro, deslocada de (dx, dy), por cima de tudo, e a seleciona.
 * Ids, grupos e arquivos de post-it são novos; a cópia nasce destravada.
 */
export function colarFragmento(f: Fragmento, dx: number, dy: number, sufixoTerminal = ''): void {
  const plano = planoAtual()
  if (!plano) return
  registrarHistorico()
  const ids = new Map<string, string>()
  // só vira grupo na cópia o grupo que veio com dois itens ou mais (um item de dentro de um grupo vem solto)
  const membros = new Map<string, number>()
  for (const i of [...f.nos, ...f.desenhos]) if (i.grupo) membros.set(i.grupo, (membros.get(i.grupo) ?? 0) + 1)
  const grupos = new Map<string, string>()
  const grupoNovo = (g?: string): string | undefined => {
    if (!g || (membros.get(g) ?? 0) < 2) return undefined
    if (!grupos.has(g)) grupos.set(g, novoId())
    return grupos.get(g)
  }
  let z = proximoZ(plano)
  const notas = { ...estado.notas }
  const nos = [...f.nos]
    .sort((a, b) => a.z - b.z)
    .map((n) => {
      const id = novoId()
      ids.set(n.id, id)
      const copia = { ...n, id, x: n.x + dx, y: n.y + dy, z: z++, criadoEm: agora(), travado: false, grupo: grupoNovo(n.grupo) } as No
      if (copia.tipo === 'postit') {
        copia.arquivo = `${id}.md`
        notas[copia.arquivo] = f.notas[(n as NoPostIt).arquivo] ?? ''
      }
      if (copia.tipo === 'terminal') copia.nome += sufixoTerminal
      return copia
    })
  const desenhos: Desenho[] = f.desenhos.map((d) => ({
    ...d,
    id: novoId(),
    z: z++,
    grupo: grupoNovo(d.grupo),
    pontos: d.pontos.map(([x, y]) => [x + dx, y + dy] as [number, number])
  }))
  const cordas: Corda[] = f.cordas
    .filter((c) => ids.has(c.de) && ids.has(c.para))
    .map((c) => ({ ...c, id: novoId(), de: ids.get(c.de)!, para: ids.get(c.para)!, criadoEm: agora() }))
  definir({ notas })
  mudarPlano((p) => ({ ...p, nos: [...p.nos, ...nos], desenhos: [...p.desenhos, ...desenhos], cordas: [...p.cordas, ...cordas] }), false)
  definir({ selecao: { nos: nos.map((n) => n.id), desenhos: desenhos.map((d) => d.id), corda: null }, editando: null })
}

/** Cópia da seleção ao lado do original (Ctrl+D). */
export function duplicarSelecao(): void {
  const f = fragmentoDaSelecao()
  if (f) colarFragmento(f, 40, 40, ' (cópia)')
}

export function definirNota(arquivo: string, texto: string): void {
  registrarHistorico(`nota:${arquivo}`)
  definir({ notas: { ...estado.notas, [arquivo]: texto } })
  agendarSalvar()
}

// ---------- mover, apagar, agrupar e alinhar a seleção ----------

/** Onde cada item estava quando o arrasto começou. */
export interface Posicoes {
  nos: Array<{ id: string; x: number; y: number }>
  desenhos: Array<{ id: string; pontos: Array<[number, number]> }>
}

/** Posições da seleção; cartões travados ficam fora (não saem do lugar). */
export function posicoesDaSelecao(): Posicoes {
  const plano = planoAtual()
  const s = estado.selecao
  if (!plano) return { nos: [], desenhos: [] }
  return {
    nos: plano.nos.filter((n) => s.nos.includes(n.id) && !n.travado).map(({ id, x, y }) => ({ id, x, y })),
    desenhos: plano.desenhos.filter((d) => s.desenhos.includes(d.id)).map(({ id, pontos }) => ({ id, pontos }))
  }
}

/** Põe cada item na posição original + (dx, dy). Mudanças com a mesma `chave` (um arrasto) são um passo de desfazer. */
export function moverItens(originais: Posicoes, dx: number, dy: number, chave: string): void {
  const plano = planoAtual()
  if (!plano) return
  dx = Math.round(dx)
  dy = Math.round(dy)
  const nos = new Map(originais.nos.map((o) => [o.id, o]))
  const desenhos = new Map(originais.desenhos.map((o) => [o.id, o]))
  const parado =
    plano.nos.every((n) => {
      const o = nos.get(n.id)
      return !o || (n.x === o.x + dx && n.y === o.y + dy)
    }) &&
    plano.desenhos.every((d) => {
      const o = desenhos.get(d.id)
      return !o || (d.pontos[0]?.[0] === o.pontos[0]?.[0] + dx && d.pontos[0]?.[1] === o.pontos[0]?.[1] + dy)
    })
  if (parado) return
  mudarPlano(
    (p) => ({
      ...p,
      nos: p.nos.map((n) => {
        const o = nos.get(n.id)
        return o ? { ...n, x: o.x + dx, y: o.y + dy } : n
      }),
      desenhos: p.desenhos.map((d) => {
        const o = desenhos.get(d.id)
        return o ? { ...d, pontos: o.pontos.map(([x, y]) => [x + dx, y + dy] as [number, number]) } : d
      })
    }),
    chave
  )
}

/** Setas do teclado: empurra a seleção. Toques seguidos viram um passo de desfazer. */
export function empurrarSelecao(dx: number, dy: number): void {
  moverItens(posicoesDaSelecao(), dx, dy, 'setas')
}

/** Apaga o que está selecionado. Cartão travado não sai (destrave antes) e continua selecionado. */
export function apagarSelecao(): void {
  const { selecao } = estado
  const plano = planoAtual()
  if (!plano) return
  const nos = new Set(plano.nos.filter((n) => selecao.nos.includes(n.id) && !n.travado).map((n) => n.id))
  const desenhos = new Set(selecao.desenhos)
  if (!nos.size && !desenhos.size && !selecao.corda) return
  registrarHistorico()
  mudarPlano(
    (p) =>
      semGruposSozinhos({
        ...p,
        nos: p.nos.filter((n) => !nos.has(n.id)),
        cordas: p.cordas.filter((c) => c.id !== selecao.corda && !nos.has(c.de) && !nos.has(c.para)),
        desenhos: p.desenhos.filter((d) => !desenhos.has(d.id))
      }),
    false
  )
  const notas = { ...estado.notas }
  for (const n of plano.nos) if (n.tipo === 'postit' && nos.has(n.id)) delete notas[n.arquivo]
  definir({ notas, selecao: { ...NADA, nos: selecao.nos.filter((id) => !nos.has(id)) }, editando: null })
}

export function apagar(alvo: Alvo): void {
  selecionar(alvo, { sozinho: true })
  apagarSelecao()
}

const semGrupo = <T extends { grupo?: string }>(item: T): T => ({ ...item, grupo: undefined })

/** Grupo com um item só deixa de ser grupo (depois de apagar, tirar ou reagrupar parte dele). */
function semGruposSozinhos(p: Plano): Plano {
  const contagem = new Map<string, number>()
  for (const i of [...p.nos, ...p.desenhos]) if (i.grupo) contagem.set(i.grupo, (contagem.get(i.grupo) ?? 0) + 1)
  const sozinho = (i: { grupo?: string }): boolean => !!i.grupo && contagem.get(i.grupo)! < 2
  if (![...p.nos, ...p.desenhos].some(sozinho)) return p
  return { ...p, nos: p.nos.map((n) => (sozinho(n) ? semGrupo(n) : n)), desenhos: p.desenhos.map((d) => (sozinho(d) ? semGrupo(d) : d)) }
}

/** Agrupa a seleção (2 itens ou mais): passam a ser selecionados e movidos juntos. */
export function agrupar(): void {
  const s = estado.selecao
  if (s.nos.length + s.desenhos.length < 2) return
  const grupo = novoId()
  mudarPlano((p) =>
    semGruposSozinhos({
      ...p,
      nos: p.nos.map((n) => (s.nos.includes(n.id) ? { ...n, grupo } : n)),
      desenhos: p.desenhos.map((d) => (s.desenhos.includes(d.id) ? { ...d, grupo } : d))
    })
  )
}

/** Desfaz os grupos que a seleção toca: cada item volta a ser solto (e continua selecionado). */
export function desagrupar(): void {
  const plano = planoAtual()
  if (!plano) return
  const grupos = gruposDa(plano, estado.selecao)
  if (!grupos.size) return
  const sai = (i: { grupo?: string }): boolean => !!i.grupo && grupos.has(i.grupo)
  mudarPlano((p) => ({
    ...p,
    nos: p.nos.map((n) => (sai(n) ? semGrupo(n) : n)),
    desenhos: p.desenhos.map((d) => (sai(d) ? semGrupo(d) : d))
  }))
}

/** Tira só os itens selecionados do grupo deles. Grupo que sobra com um item só deixa de existir. */
export function tirarDoGrupo(): void {
  const s = estado.selecao
  mudarPlano((p) =>
    semGruposSozinhos({
      ...p,
      nos: p.nos.map((n) => (s.nos.includes(n.id) ? semGrupo(n) : n)),
      desenhos: p.desenhos.map((d) => (s.desenhos.includes(d.id) ? semGrupo(d) : d))
    })
  )
}

/** Peças da seleção para alinhar: cada grupo é uma peça só (não se desmancha), cada item solto é uma. */
function pecasDaSelecao(): Array<{ caixa: Caixa; nos: string[]; desenhos: string[] }> {
  const plano = planoAtual()
  const s = estado.selecao
  if (!plano) return []
  const pecas = new Map<string, { caixas: Caixa[]; nos: string[]; desenhos: string[] }>()
  const peca = (chave: string): { caixas: Caixa[]; nos: string[]; desenhos: string[] } => {
    if (!pecas.has(chave)) pecas.set(chave, { caixas: [], nos: [], desenhos: [] })
    return pecas.get(chave)!
  }
  for (const n of plano.nos) {
    if (!s.nos.includes(n.id) || n.travado) continue
    const p = peca(n.grupo ?? n.id)
    p.caixas.push(caixaDoNo(n))
    p.nos.push(n.id)
  }
  for (const d of plano.desenhos) {
    if (!s.desenhos.includes(d.id)) continue
    const p = peca(d.grupo ?? d.id)
    p.caixas.push(caixaDoDesenho(d))
    p.desenhos.push(d.id)
  }
  return [...pecas.values()].map((p) => ({ caixa: uniao(p.caixas)!, nos: p.nos, desenhos: p.desenhos }))
}

function deslocarPecas(deslocamentos: Array<{ nos: string[]; desenhos: string[]; dx: number; dy: number }>): void {
  const porNo = new Map<string, [number, number]>()
  const porDesenho = new Map<string, [number, number]>()
  for (const d of deslocamentos) {
    const dx = Math.round(d.dx)
    const dy = Math.round(d.dy)
    d.nos.forEach((id) => porNo.set(id, [dx, dy]))
    d.desenhos.forEach((id) => porDesenho.set(id, [dx, dy]))
  }
  mudarPlano((p) => ({
    ...p,
    nos: p.nos.map((n) => {
      const d = porNo.get(n.id)
      return d ? { ...n, x: n.x + d[0], y: n.y + d[1] } : n
    }),
    desenhos: p.desenhos.map((desenho) => {
      const d = porDesenho.get(desenho.id)
      return d ? { ...desenho, pontos: desenho.pontos.map(([x, y]) => [x + d[0], y + d[1]] as [number, number]) } : desenho
    })
  }))
}

export type Alinhamento = 'esquerda' | 'centro' | 'direita' | 'topo' | 'meio' | 'base'

export function alinhar(como: Alinhamento): void {
  const pecas = pecasDaSelecao()
  if (pecas.length < 2) return
  const t = uniao(pecas.map((p) => p.caixa))!
  deslocarPecas(
    pecas.map(({ caixa: c, nos, desenhos }) => {
      const alvoX = { esquerda: t.x, centro: t.x + (t.largura - c.largura) / 2, direita: t.x + t.largura - c.largura }
      const alvoY = { topo: t.y, meio: t.y + (t.altura - c.altura) / 2, base: t.y + t.altura - c.altura }
      const dx = como in alvoX ? alvoX[como as keyof typeof alvoX] - c.x : 0
      const dy = como in alvoY ? alvoY[como as keyof typeof alvoY] - c.y : 0
      return { nos, desenhos, dx, dy }
    })
  )
}

/** Espaço igual entre as peças, da primeira à última (as pontas ficam onde estão). */
export function distribuir(eixo: 'x' | 'y'): void {
  const pecas = pecasDaSelecao()
  if (pecas.length < 3) return
  const inicio = (c: Caixa): number => (eixo === 'x' ? c.x : c.y)
  const tamanho = (c: Caixa): number => (eixo === 'x' ? c.largura : c.altura)
  pecas.sort((a, b) => inicio(a.caixa) - inicio(b.caixa))
  const primeira = pecas[0].caixa
  const fim = Math.max(...pecas.map((p) => inicio(p.caixa) + tamanho(p.caixa)))
  const vao = (fim - inicio(primeira) - pecas.reduce((t, p) => t + tamanho(p.caixa), 0)) / (pecas.length - 1)
  let cursor = inicio(primeira)
  deslocarPecas(
    pecas.map(({ caixa, nos, desenhos }) => {
      const delta = cursor - inicio(caixa)
      cursor += tamanho(caixa) + vao
      return { nos, desenhos, dx: eixo === 'x' ? delta : 0, dy: eixo === 'y' ? delta : 0 }
    })
  )
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
  mudarPlano((p) => semGruposSozinhos({ ...p, desenhos: p.desenhos.filter((d) => !fora.has(d.id)) }), chaveDoGesto)
  return tocados.length
}
