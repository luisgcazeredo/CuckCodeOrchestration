import { memo, useEffect, useRef, useState } from 'react'
import { FileCode, Folder, PanelBottom, Paperclip } from 'lucide-react'
import type { NoTerminal } from '../../../shared/modelo'
import { MolduraNo, type Marca } from '../quadro/MolduraNo'
import { CorpoXterm } from '../terminal/CorpoXterm'
import { abrirMenu } from '../ui/MenuContexto'
import { anexarArquivosAoPrompt, anexarPastaAoPrompt } from '../ui/anexar'
import { itensDoCodigoDoTerminal } from '../ui/menus'
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
        {!ativo && <div className="terminal-escudo" data-escudo />}
      </div>
      <footer className="terminal-rodape" data-arrasta>
        <Folder size={11} />
        <span title={pasta}>{pastaCurta(pasta)}</span>
        <button
          className="botao-mini"
          title="Anexar arquivo ou pasta ao prompt (escreve o caminho na linha do agente)"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            const caixa = e.currentTarget.getBoundingClientRect()
            abrirMenu(caixa.left, caixa.top, [
              { rotulo: 'Arquivo…', acao: () => void anexarArquivosAoPrompt(no.id) },
              { rotulo: 'Pasta…', acao: () => void anexarPastaAoPrompt(no.id) }
            ])
          }}
        >
          <Paperclip size={12} />
        </button>
        <button
          className="botao-mini"
          title="Os cartões de código deste agente: abrir, recolher todos, fechar todos"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            const caixa = e.currentTarget.getBoundingClientRect()
            abrirMenu(caixa.left, caixa.top, itensDoCodigoDoTerminal(no))
          }}
        >
          <FileCode size={12} />
        </button>
        <PanelBottom size={12} className="terminal-alternar" />
      </footer>
      <span className="porta porta-esquerda" data-porta={no.id} title="Arraste até outro terminal para ligar" />
      <span className="porta porta-direita" data-porta={no.id} title="Arraste até outro terminal para ligar" />
    </MolduraNo>
  )
})
