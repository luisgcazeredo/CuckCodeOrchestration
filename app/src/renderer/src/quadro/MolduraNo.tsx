import { useRef, type PointerEvent, type ReactNode } from 'react'
import type { No } from '../../../shared/modelo'
import { atualizarNo, lerEstado, selecionar } from '../estado/loja'

const MINIMO = {
  terminal: { largura: 320, altura: 200 },
  postit: { largura: 140, altura: 90 },
  texto: { largura: 60, altura: 32 },
  arquivo: { largura: 120, altura: 100 },
  pasta: { largura: 200, altura: 160 },
  portal: { largura: 320, altura: 220 }
} as const

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

/**
 * Posição, arrasto, redimensionamento e seleção, iguais para todo tipo de nó.
 * Arrasta por qualquer elemento com `data-arrasta`; redimensiona pela alça do canto.
 * O movimento é aplicado no máximo uma vez por quadro de tela, e o gesto inteiro é um passo de desfazer.
 */
export function MolduraNo({ no, selecionado, children, aoClicarDuasVezes, className = '' }: Props) {
  const gesto = useRef<{
    modo: 'mover' | 'redimensionar'
    inicio: { x: number; y: number }
    original: No
    /** Uma chave por gesto: dois arrastos seguidos são dois passos de desfazer. */
    chave: string
  } | null>(null)
  const pendente = useRef<Partial<No> | null>(null)
  const quadro = useRef(0)

  function aplicarPendente(): void {
    quadro.current = 0
    if (pendente.current && gesto.current) atualizarNo(no.id, pendente.current, gesto.current.chave)
    pendente.current = null
  }

  function comecar(modo: 'mover' | 'redimensionar', e: PointerEvent<HTMLElement>): void {
    if (e.button !== 0) return
    e.stopPropagation()
    selecionar({ tipo: 'no', id: no.id })
    gesto.current = {
      modo,
      inicio: { x: e.clientX, y: e.clientY },
      original: no,
      chave: `gesto:${no.id}:${crypto.randomUUID()}`
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    marcarGesto(true)
  }

  function mover(e: PointerEvent<HTMLElement>): void {
    const g = gesto.current
    if (!g) return
    const zoom = lerEstado().espaco?.camera.zoom ?? 1
    const dx = (e.clientX - g.inicio.x) / zoom
    const dy = (e.clientY - g.inicio.y) / zoom
    if (g.modo === 'mover') {
      pendente.current = { x: Math.round(g.original.x + dx), y: Math.round(g.original.y + dy) }
    } else {
      const minimo = MINIMO[no.tipo]
      pendente.current = {
        largura: Math.round(Math.max(minimo.largura, g.original.largura + dx)),
        altura: Math.round(Math.max(minimo.altura, g.original.altura + dy))
      }
    }
    if (!quadro.current) quadro.current = requestAnimationFrame(aplicarPendente)
  }

  function terminar(): void {
    if (quadro.current) cancelAnimationFrame(quadro.current)
    aplicarPendente()
    gesto.current = null
    marcarGesto(false)
  }

  return (
    <div
      className={`no no-${no.tipo} ${selecionado ? 'selecionado' : ''} ${className}`}
      data-no-id={no.id}
      style={{ left: no.x, top: no.y, width: no.largura, height: no.altura, zIndex: no.z }}
      onPointerDown={(e) => {
        const alvo = e.target as HTMLElement
        if (alvo.closest('[data-arrasta]')) comecar('mover', e)
        else if (!alvo.closest('[data-porta]')) {
          e.stopPropagation()
          selecionar({ tipo: 'no', id: no.id })
        }
      }}
      onPointerMove={mover}
      onPointerUp={terminar}
      onPointerCancel={terminar}
      onDoubleClick={aoClicarDuasVezes}
    >
      {children}
      {selecionado && (
        // mover e soltar sobem até a moldura, que já trata os dois
        <div className="alca-redimensionar" onPointerDown={(e) => comecar('redimensionar', e)} />
      )}
    </div>
  )
}
