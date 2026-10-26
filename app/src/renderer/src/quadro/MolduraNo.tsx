import { useEffect, useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import type { Camera, No } from '../../../shared/modelo'
import { Lock } from 'lucide-react'
import { atualizarNo, definirCamera, planoAtual, selecionar } from '../estado/loja'

const MINIMO = {
  terminal: { largura: 320, altura: 200 },
  postit: { largura: 140, altura: 90 },
  texto: { largura: 60, altura: 32 },
  arquivo: { largura: 120, altura: 100 },
  pasta: { largura: 200, altura: 160 },
  portal: { largura: 320, altura: 220 }
} as const

/** Quanto o mouse anda antes de um clique virar arrasto. */
const LIMIAR_ARRASTO = 4
/** Faixa perto da borda da tela que faz o quadro andar junto, e a velocidade máxima (px por quadro de tela). */
const BORDA = 64
const VELOCIDADE_MAXIMA = 16

/** Onde o clique é do conteúdo e nunca vira arrasto: campos de texto e botões. */
const SO_CONTEUDO = 'input, textarea, button, select, [data-sem-arrasto], [data-porta], .alca-redimensionar'

interface Props {
  no: No
  selecionado: boolean
  children: ReactNode
  aoClicarDuasVezes?: () => void
  className?: string
}

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

interface Gesto {
  modo: 'talvez' | 'mover' | 'redimensionar'
  inicioTela: { x: number; y: number }
  inicioQuadro: { x: number; y: number }
  mouse: { x: number; y: number }
  area: DOMRect
  original: No
  /** Uma chave por gesto: dois arrastos seguidos são dois passos de desfazer. */
  chave: string
  quadro: number
}

/**
 * Posição, arrasto, redimensionamento e seleção, iguais para todo tipo de nó.
 * Arrasta de qualquer ponto do cartão: clique parado continua sendo clique no conteúdo; andou uns pixels, vira
 * arrasto. Perto da borda da tela o quadro anda junto. Tudo aplicado uma vez por quadro de tela.
 */
export function MolduraNo({ no, selecionado, children, aoClicarDuasVezes, className = '' }: Props) {
  const gesto = useRef<Gesto | null>(null)

  function preparar(modo: Gesto['modo'], e: PointerEvent<HTMLElement>): void {
    const area = document.querySelector('.quadro')!.getBoundingClientRect()
    const camera = planoAtual()!.camera
    gesto.current = {
      modo,
      inicioTela: { x: e.clientX, y: e.clientY },
      inicioQuadro: pontoNoQuadro(e.clientX, e.clientY, area, camera),
      mouse: { x: e.clientX, y: e.clientY },
      area,
      original: no,
      chave: `gesto:${no.id}:${crypto.randomUUID()}`,
      quadro: 0
    }
  }

  function comecarDeVerdade(e: PointerEvent<HTMLElement>, elemento: HTMLElement): void {
    elemento.setPointerCapture(e.pointerId)
    marcarGesto(true)
    gesto.current!.quadro = requestAnimationFrame(passo)
  }

  /** Um quadro de tela: rola perto da borda e põe o nó embaixo do mouse. */
  function passo(): void {
    const g = gesto.current
    if (!g || g.modo === 'talvez') return
    let camera = planoAtual()!.camera
    const { area, mouse } = g
    const vx = velocidadeNaBorda(area.right - mouse.x) - velocidadeNaBorda(mouse.x - area.left)
    const vy = velocidadeNaBorda(area.bottom - mouse.y) - velocidadeNaBorda(mouse.y - area.top)
    if (vx || vy) {
      camera = { ...camera, x: camera.x - vx, y: camera.y - vy }
      definirCamera(camera)
    }
    const agora = pontoNoQuadro(mouse.x, mouse.y, area, camera)
    const dx = agora.x - g.inicioQuadro.x
    const dy = agora.y - g.inicioQuadro.y
    let mudanca: Partial<No>
    if (g.modo === 'mover') {
      mudanca = { x: Math.round(g.original.x + dx), y: Math.round(g.original.y + dy) }
    } else {
      const minimo = MINIMO[no.tipo]
      mudanca = {
        largura: Math.round(Math.max(minimo.largura, g.original.largura + dx)),
        altura: Math.round(Math.max(minimo.altura, g.original.altura + dy))
      }
    }
    const atual = planoAtual()?.nos.find((n) => n.id === no.id)
    if (atual && Object.entries(mudanca).some(([k, v]) => atual[k as keyof No] !== v)) {
      atualizarNo(no.id, mudanca, g.chave)
    }
    g.quadro = requestAnimationFrame(passo)
  }

  function aoApertar(e: PointerEvent<HTMLDivElement>): void {
    const alvo = e.target as HTMLElement
    if (alvo.closest('[data-porta]')) return // a porta é do quadro (ligar terminais)
    e.stopPropagation()
    selecionar({ tipo: 'no', id: no.id })
    // travado: seleciona e usa o conteúdo, mas não sai do lugar
    if (e.button !== 0 || no.travado || alvo.closest(SO_CONTEUDO)) return
    preparar('talvez', e)
  }

  function aoMover(e: PointerEvent<HTMLDivElement>): void {
    const g = gesto.current
    if (!g) return
    g.mouse = { x: e.clientX, y: e.clientY }
    if (g.modo === 'talvez') {
      if (Math.hypot(e.clientX - g.inicioTela.x, e.clientY - g.inicioTela.y) < LIMIAR_ARRASTO) return
      g.modo = 'mover'
      comecarDeVerdade(e, e.currentTarget)
    }
  }

  function aoSoltar(): void {
    const g = gesto.current
    if (!g) return
    gesto.current = null
    if (g.modo === 'talvez') return // foi só um clique: o conteúdo recebe normalmente
    cancelAnimationFrame(g.quadro)
    marcarGesto(false)
    engolirProximoClique()
  }

  // soltar fora da janela, trocar de janela (Alt+Tab) ou o cartão sumir: o gesto termina, nada fica preso
  const encerrar = useRef(aoSoltar)
  encerrar.current = aoSoltar
  useEffect(() => {
    const aoPerderFoco = (): void => encerrar.current()
    const aoEsconder = (): void => {
      if (document.hidden) encerrar.current()
    }
    window.addEventListener('blur', aoPerderFoco)
    document.addEventListener('visibilitychange', aoEsconder)
    return () => {
      window.removeEventListener('blur', aoPerderFoco)
      document.removeEventListener('visibilitychange', aoEsconder)
      encerrar.current()
    }
  }, [])

  return (
    <div
      className={`no no-${no.tipo} ${selecionado ? 'selecionado' : ''} ${no.cor && no.tipo !== 'postit' ? 'com-cor' : ''} ${className}`}
      data-no-id={no.id}
      style={
        {
          left: no.x,
          top: no.y,
          width: no.largura,
          height: no.altura,
          zIndex: no.z,
          ...(no.cor && no.tipo !== 'postit' ? { '--cor-no': no.cor } : {})
        } as CSSProperties
      }
      onPointerDown={aoApertar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      onLostPointerCapture={aoSoltar}
      onDoubleClick={aoClicarDuasVezes}
    >
      {children}
      {no.travado && (
        <span className="selo-trava" title="Travado: não move nem apaga (botão direito → Destravar)">
          <Lock size={11} />
        </span>
      )}
      {selecionado && !no.travado && (
        <div
          className="alca-redimensionar"
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.stopPropagation()
            preparar('redimensionar', e)
            // mover e soltar sobem até a moldura, que já trata os dois
            comecarDeVerdade(e, e.currentTarget.parentElement as HTMLElement)
          }}
        />
      )}
    </div>
  )
}
