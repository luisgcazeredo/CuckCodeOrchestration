import { useSyncExternalStore } from 'react'
import type { Camera, No } from '../../../shared/modelo'
import { atualizarNo, definirCamera, moverItens, planoAtual, posicoesDaSelecao, type Posicoes } from '../estado/loja'
import { caixaDoDesenho, caixaDoNo, imantar, uniao, type Caixa, type Guia } from './geometria'

// Arrastar o que está selecionado (cartões e traços juntos) e redimensionar um cartão. Um clique parado
// continua sendo clique no conteúdo; andou uns pixels, vira arrasto. Perto da borda da tela o quadro anda
// junto, e as bordas e os centros grudam nos dos outros cartões (Alt solta o ímã).

const MINIMO = {
  terminal: { largura: 320, altura: 200 },
  postit: { largura: 140, altura: 90 },
  texto: { largura: 60, altura: 32 },
  arquivo: { largura: 120, altura: 100 },
  pasta: { largura: 200, altura: 160 },
  portal: { largura: 320, altura: 220 },
  imagem: { largura: 40, altura: 40 }
} as const

/** Quanto o mouse anda antes de um clique virar arrasto. */
const LIMIAR_ARRASTO = 4
/** Faixa perto da borda da tela que faz o quadro andar junto, e a velocidade máxima (px por quadro de tela). */
const BORDA = 64
const VELOCIDADE_MAXIMA = 16
/** Distância (na tela) em que a borda gruda na do vizinho. */
const IMA = 6

// ---------- linhas-guia à mostra ----------

let guias: Guia[] = []
const ouvintesGuias = new Set<() => void>()

function mostrarGuias(novas: Guia[]): void {
  if (novas.length === 0 && guias.length === 0) return
  guias = novas
  ouvintesGuias.forEach((o) => o())
}

export function usarGuias(): Guia[] {
  return useSyncExternalStore(
    (o) => {
      ouvintesGuias.add(o)
      return () => ouvintesGuias.delete(o)
    },
    () => guias
  )
}

// ---------- gesto ----------

/** Durante um gesto, portais (navegador) não podem roubar o mouse. */
export function marcarGesto(ativo: boolean): void {
  document.body.classList.toggle('em-gesto', ativo)
}

/** Depois de um arrasto, o clique que o navegador dispara ao soltar não pode abrir pasta nem marcar tarefa. */
function engolirProximoClique(): void {
  const engolir = (e: MouseEvent): void => {
    e.stopPropagation()
    e.preventDefault()
  }
  window.addEventListener('click', engolir, { capture: true, once: true })
  setTimeout(() => window.removeEventListener('click', engolir, { capture: true }), 0)
}

function pontoNoQuadro(clienteX: number, clienteY: number, area: DOMRect, camera: Camera): { x: number; y: number } {
  return { x: (clienteX - area.left - camera.x) / camera.zoom, y: (clienteY - area.top - camera.y) / camera.zoom }
}

/** Velocidade de rolagem quando o mouse está a `distancia` px da borda (0 fora da faixa; acelera perto da borda). */
function velocidadeNaBorda(distancia: number): number {
  if (distancia >= BORDA) return 0
  const t = 1 - Math.max(0, distancia) / BORDA
  return VELOCIDADE_MAXIMA * t * t
}

type Modo = { tipo: 'mover' } | { tipo: 'redimensionar'; no: No }

interface Gesto {
  modo: Modo
  arrastando: boolean
  pointerId: number
  elemento: Element
  inicioTela: { x: number; y: number }
  inicioQuadro: { x: number; y: number }
  mouse: { x: number; y: number }
  semIma: boolean
  area: DOMRect
  /** Uma chave por gesto: dois arrastos seguidos são dois passos de desfazer. */
  chave: string
  quadro: number
  originais: Posicoes
  /** Caixa do que se move, na posição original. */
  caixa: Caixa | null
  /** Caixas dos cartões parados, para o ímã. */
  vizinhos: Caixa[]
  aoClicar?: () => void
  soltar: (cancelar?: boolean) => void
}

let atual: Gesto | null = null

function caixaDasPosicoes(p: Posicoes): Caixa | null {
  const plano = planoAtual()
  if (!plano) return null
  const nos = new Set(p.nos.map((n) => n.id))
  const desenhos = new Set(p.desenhos.map((d) => d.id))
  return uniao([
    ...plano.nos.filter((n) => nos.has(n.id)).map(caixaDoNo),
    ...plano.desenhos.filter((d) => desenhos.has(d.id)).map(caixaDoDesenho)
  ])
}

/** Um quadro de tela: rola perto da borda e põe o que se move embaixo do mouse. */
function passo(): void {
  const g = atual
  if (!g || !g.arrastando) return
  let camera = planoAtual()!.camera
  const { area, mouse } = g
  const vx = velocidadeNaBorda(area.right - mouse.x) - velocidadeNaBorda(mouse.x - area.left)
  const vy = velocidadeNaBorda(area.bottom - mouse.y) - velocidadeNaBorda(mouse.y - area.top)
  if (vx || vy) {
    camera = { ...camera, x: camera.x - vx, y: camera.y - vy }
    definirCamera(camera)
  }
  const agora = pontoNoQuadro(mouse.x, mouse.y, area, camera)
  let dx = agora.x - g.inicioQuadro.x
  let dy = agora.y - g.inicioQuadro.y
  if (g.modo.tipo === 'mover') {
    if (g.caixa && !g.semIma) {
      const ima = imantar({ ...g.caixa, x: g.caixa.x + dx, y: g.caixa.y + dy }, g.vizinhos, IMA / camera.zoom)
      dx += ima.dx
      dy += ima.dy
      mostrarGuias(ima.guias)
    } else mostrarGuias([])
    moverItens(g.originais, dx, dy, g.chave)
  } else {
    const no = g.modo.no
    const minimo = MINIMO[no.tipo]
    const mudanca = {
      largura: Math.round(Math.max(minimo.largura, no.largura + dx)),
      altura: Math.round(Math.max(minimo.altura, no.altura + dy))
    }
    // imagem não deforma: a altura acompanha a largura
    if (no.tipo === 'imagem') mudanca.altura = Math.round((mudanca.largura * no.altura) / no.largura)
    const agoraNo = planoAtual()?.nos.find((n) => n.id === no.id)
    if (agoraNo && (agoraNo.largura !== mudanca.largura || agoraNo.altura !== mudanca.altura)) atualizarNo(no.id, mudanca, g.chave)
  }
  g.quadro = requestAnimationFrame(passo)
}

function virarArrasto(g: Gesto): void {
  g.arrastando = true
  try {
    g.elemento.setPointerCapture(g.pointerId)
  } catch {
    // o elemento saiu da tela no meio do clique: segue sem captura
  }
  marcarGesto(true)
  if (g.modo.tipo === 'mover') {
    g.originais = posicoesDaSelecao()
    g.caixa = caixaDasPosicoes(g.originais)
    const movendo = new Set(g.originais.nos.map((n) => n.id))
    // ímã só nos cartões (traços soltos não puxam), e só nos que não estão sendo arrastados
    g.vizinhos = (planoAtual()?.nos ?? []).filter((n) => !movendo.has(n.id)).map(caixaDoNo)
  }
  g.quadro = requestAnimationFrame(passo)
}

/**
 * Começa um gesto sobre a seleção (mover) ou sobre um cartão (redimensionar). `aoClicar`: o que fazer se
 * o mouse soltar sem ter andado. `imediato`: já começa arrastando (a alça de redimensionar).
 */
export function comecarArrasto(
  e: { clientX: number; clientY: number; pointerId: number; altKey: boolean },
  elemento: Element,
  modo: Modo,
  opcoes: { aoClicar?: () => void; imediato?: boolean } = {}
): void {
  atual?.soltar()
  const area = document.querySelector('.quadro')!.getBoundingClientRect()
  const camera = planoAtual()!.camera

  const mover = (ev: PointerEvent): void => {
    const g = atual
    if (!g || ev.pointerId !== g.pointerId) return
    g.mouse = { x: ev.clientX, y: ev.clientY }
    g.semIma = ev.altKey
    if (!g.arrastando && Math.hypot(ev.clientX - g.inicioTela.x, ev.clientY - g.inicioTela.y) >= LIMIAR_ARRASTO) virarArrasto(g)
  }
  const soltarPeloMouse = (ev: PointerEvent): void => {
    if (atual && ev.pointerId === atual.pointerId) soltar()
  }
  const aoEsconder = (): void => {
    if (document.hidden) soltar()
  }
  const soltarSemCancelar = (): void => soltar()
  // soltar fora da janela, trocar de janela (Alt+Tab) ou perder a captura: o gesto termina, nada fica preso.
  // `cancelar` (Esc): o que se movia volta para onde estava e o clique não conta.
  function soltar(cancelar = false): void {
    const g = atual
    if (!g) return
    atual = null
    if (cancelar && g.arrastando) {
      if (g.modo.tipo === 'mover') moverItens(g.originais, 0, 0, g.chave)
      else atualizarNo(g.modo.no.id, { largura: g.modo.no.largura, altura: g.modo.no.altura }, g.chave)
    }
    window.removeEventListener('pointermove', mover, true)
    window.removeEventListener('pointerup', soltarPeloMouse, true)
    window.removeEventListener('pointercancel', soltarPeloMouse, true)
    window.removeEventListener('blur', soltarSemCancelar)
    document.removeEventListener('visibilitychange', aoEsconder)
    elemento.removeEventListener('lostpointercapture', soltarSemCancelar)
    if (!g.arrastando) {
      if (!cancelar) g.aoClicar?.()
      return
    }
    cancelAnimationFrame(g.quadro)
    mostrarGuias([])
    marcarGesto(false)
    engolirProximoClique()
  }

  atual = {
    modo,
    arrastando: false,
    pointerId: e.pointerId,
    elemento,
    inicioTela: { x: e.clientX, y: e.clientY },
    inicioQuadro: pontoNoQuadro(e.clientX, e.clientY, area, camera),
    mouse: { x: e.clientX, y: e.clientY },
    semIma: e.altKey,
    area,
    chave: `gesto:${crypto.randomUUID()}`,
    quadro: 0,
    originais: { nos: [], desenhos: [] },
    caixa: null,
    vizinhos: [],
    aoClicar: opcoes.aoClicar,
    soltar
  }
  window.addEventListener('pointermove', mover, true)
  window.addEventListener('pointerup', soltarPeloMouse, true)
  window.addEventListener('pointercancel', soltarPeloMouse, true)
  window.addEventListener('blur', soltarSemCancelar)
  document.addEventListener('visibilitychange', aoEsconder)
  elemento.addEventListener('lostpointercapture', soltarSemCancelar)
  if (opcoes.imediato) virarArrasto(atual)
}

/**
 * Esc ou um atalho no meio de um gesto: o arrasto em andamento volta atrás, e o quadro descarta o gesto
 * dele (desenho, retângulo de seleção, ligação), para nada continuar mexendo no quadro depois.
 */
export function cancelarGestos(): void {
  atual?.soltar(true)
  window.dispatchEvent(new Event('mp:cancelar-gesto'))
}

/** Há um gesto em andamento (arrastando cartão, desenhando, ligando, segurando espaço). */
export const emGesto = (): boolean => atual?.arrastando === true || document.body.classList.contains('em-gesto')
