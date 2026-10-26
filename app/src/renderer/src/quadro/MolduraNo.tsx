import { useRef, type PointerEvent, type ReactNode } from 'react'
import type { No } from '../../../shared/modelo'
import { atualizarNo, lerEstado, selecionar } from '../estado/loja'

const MINIMO = {
  terminal: { largura: 320, altura: 200 },
  postit: { largura: 140, altura: 90 },
  texto: { largura: 60, altura: 32 },
  arquivo: { largura: 120, altura: 100 }
} as const

interface Props {
  no: No
  selecionado: boolean
  children: ReactNode
  aoClicarDuasVezes?: () => void
  className?: string
}

/**
 * Posição, arrasto, redimensionamento e seleção, iguais para todo tipo de nó.
 * Arrasta por qualquer elemento com `data-arrasta`; redimensiona pela alça do canto.
 */
export function MolduraNo({ no, selecionado, children, aoClicarDuasVezes, className = '' }: Props) {
  const gesto = useRef<{ modo: 'mover' | 'redimensionar'; inicio: { x: number; y: number }; original: No } | null>(null)

  function comecar(modo: 'mover' | 'redimensionar', e: PointerEvent<HTMLElement>): void {
    if (e.button !== 0) return
    e.stopPropagation()
    selecionar({ tipo: 'no', id: no.id })
    gesto.current = { modo, inicio: { x: e.clientX, y: e.clientY }, original: no }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function mover(e: PointerEvent<HTMLElement>): void {
    const g = gesto.current
    if (!g) return
    const zoom = lerEstado().espaco?.camera.zoom ?? 1
    const dx = (e.clientX - g.inicio.x) / zoom
    const dy = (e.clientY - g.inicio.y) / zoom
    if (g.modo === 'mover') {
      atualizarNo(no.id, { x: Math.round(g.original.x + dx), y: Math.round(g.original.y + dy) })
    } else {
      const minimo = MINIMO[no.tipo]
      atualizarNo(no.id, {
        largura: Math.round(Math.max(minimo.largura, g.original.largura + dx)),
        altura: Math.round(Math.max(minimo.altura, g.original.altura + dy))
      })
    }
  }

  function terminar(): void {
    gesto.current = null
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
