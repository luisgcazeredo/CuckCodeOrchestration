import { memo, useEffect, useRef, useState } from 'react'
import { Folder, PanelBottom } from 'lucide-react'
import type { NoTerminal } from '../../../shared/modelo'
import { MolduraNo, type Marca } from '../quadro/MolduraNo'
import { CorpoXterm } from '../terminal/CorpoXterm'
import { COR_AGENTE, ICONE_AGENTE } from './icones'

/** Fora da tela por este tempo, o cartão para de desenhar (o processo segue rodando). */
const DESCARREGAR_DEPOIS = window.mp.autoteste ? 1500 : 20_000

function pastaCurta(pasta: string): string {
  const partes = pasta.split(/[\\/]/).filter(Boolean)
  return partes.length > 2 ? `…\\${partes.slice(-2).join('\\')}` : pasta
}

/** Visível no quadro (com uma margem); ficou fora por um tempo, deixa de estar "montado". */
function usarMontado(alvo: React.RefObject<HTMLDivElement | null>): boolean {
  const [montado, setMontado] = useState(true)
  useEffect(() => {
    const el = alvo.current
    const quadro = el?.closest('.quadro')
    if (!el || !quadro) return
    let tempo: ReturnType<typeof setTimeout> | null = null
    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (tempo) clearTimeout(tempo)
        tempo = null
        if (entrada.isIntersecting) setMontado(true)
        else tempo = setTimeout(() => setMontado(false), DESCARREGAR_DEPOIS)
      },
      { root: quadro, rootMargin: '300px' }
    )
    observador.observe(el)
    return () => {
      observador.disconnect()
      if (tempo) clearTimeout(tempo)
    }
  }, [alvo])
  return montado
}

interface Props {
  no: NoTerminal
  selecionado: Marca
  pastaDoEspaco: string
  indice: number
}

/** O cartão do terminal no quadro: cabeçalho, o terminal de verdade e o rodapé com a pasta. */
export const PecaTerminal = memo(function PecaTerminal({ no, selecionado, pastaDoEspaco, indice }: Props) {
  const Icone = ICONE_AGENTE[no.agente]
  const pasta = no.pasta || pastaDoEspaco
  const corpo = useRef<HTMLDivElement>(null)
  const montado = usarMontado(corpo)
  const ativo = selecionado === 'sozinho'
  return (
    <MolduraNo no={no} selecionado={selecionado}>
      <header className="terminal-cabecalho" data-arrasta>
        <Icone size={13} color={COR_AGENTE[no.agente]} strokeWidth={2.2} />
        <span className="terminal-nome">{no.nome}</span>
        <span className="terminal-indice">{indice}</span>
        {no.criadoPor && <span className="terminal-selo" title="Aberto por um agente pelo mpro">agente</span>}
      </header>
      <div className={`terminal-corpo ${ativo ? 'rolavel' : ''}`} ref={corpo} data-sem-arrasto={ativo ? '' : undefined}>
        {montado ? <CorpoXterm id={no.id} ativo={ativo} /> : <div className="terminal-descarregado">fora da tela · o processo continua</div>}
        {/* sem estar selecionado, o terminal não pega o mouse: arrasta o cartão de qualquer ponto e a roda move o quadro */}
        {!ativo && <div className="terminal-escudo" />}
      </div>
      <footer className="terminal-rodape" data-arrasta>
        <Folder size={11} />
        <span title={pasta}>{pastaCurta(pasta)}</span>
        <PanelBottom size={12} className="terminal-alternar" />
      </footer>
      <span className="porta porta-esquerda" data-porta={no.id} title="Arraste até outro terminal para ligar" />
      <span className="porta porta-direita" data-porta={no.id} title="Arraste até outro terminal para ligar" />
    </MolduraNo>
  )
})
