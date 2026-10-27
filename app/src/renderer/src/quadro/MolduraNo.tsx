import { type CSSProperties, type PointerEvent, type ReactNode } from 'react'
import type { No } from '../../../shared/modelo'
import { Lock } from 'lucide-react'
import { estaSelecionado, focarItem, selecionar, selecionarPeloClique } from '../estado/loja'
import { comecarArrasto } from './arrasto'

export { marcarGesto } from './arrasto'

/** Como o cartão está selecionado: sozinho (alça de tamanho, conteúdo ativo) ou junto com outros. */
export type Marca = false | 'sozinho' | 'junto'

/** Onde o clique é do conteúdo e nunca vira arrasto: campos de texto e botões. */
const SO_CONTEUDO = 'input, textarea, button, select, [data-sem-arrasto], [data-porta], .alca-redimensionar'

interface Props {
  no: No
  selecionado: Marca
  children: ReactNode
  aoClicarDuasVezes?: () => void
  className?: string
}

/**
 * Posição, arrasto, redimensionamento e seleção, iguais para todo tipo de nó. Arrasta de qualquer ponto do
 * cartão e leva junto tudo o que estiver selecionado (ver quadro/arrasto.ts).
 */
export function MolduraNo({ no, selecionado, children, aoClicarDuasVezes, className = '' }: Props) {
  function aoApertar(e: PointerEvent<HTMLDivElement>): void {
    const alvo = e.target as HTMLElement
    // a porta é do quadro (ligar terminais); o botão do meio arrasta o quadro; o direito abre o menu
    if (alvo.closest('[data-porta]') || e.button !== 0) return
    e.stopPropagation()
    const item = { tipo: 'no', id: no.id } as const
    if (e.shiftKey || e.ctrlKey || e.metaKey) return selecionar(item, { somar: true })
    const jaEstava = estaSelecionado(item)
    selecionarPeloClique(item)
    // travado: seleciona e usa o conteúdo, mas não sai do lugar
    if (no.travado || alvo.closest(SO_CONTEUDO)) return
    comecarArrasto(e, e.currentTarget, { tipo: 'mover' }, { aoClicar: jaEstava ? () => focarItem(item) : undefined })
  }

  return (
    <div
      className={`no no-${no.tipo} ${selecionado ? `selecionado ${selecionado}` : ''} ${no.cor && no.tipo !== 'postit' ? 'com-cor' : ''} ${className}`}
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
      onDoubleClick={aoClicarDuasVezes}
    >
      {children}
      {no.travado && (
        <span className="selo-trava" title="Travado: não move nem apaga (botão direito → Destravar)">
          <Lock size={11} />
        </span>
      )}
      {selecionado === 'sozinho' && !no.travado && (
        <div
          className="alca-redimensionar"
          onPointerDown={(e) => {
            if (e.button !== 0) return
            e.stopPropagation()
            comecarArrasto(e, e.currentTarget, { tipo: 'redimensionar', no }, { imediato: true })
          }}
        />
      )}
    </div>
  )
}
