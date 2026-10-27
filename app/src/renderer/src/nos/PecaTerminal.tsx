import { memo } from 'react'
import { Folder, PanelBottom } from 'lucide-react'
import type { NoTerminal } from '../../../shared/modelo'
import { MolduraNo, type Marca } from '../quadro/MolduraNo'
import { COR_AGENTE, ICONE_AGENTE } from './icones'

function pastaCurta(pasta: string): string {
  const partes = pasta.split(/[\\/]/).filter(Boolean)
  return partes.length > 2 ? `…\\${partes.slice(-2).join('\\')}` : pasta
}

interface Props {
  no: NoTerminal
  selecionado: Marca
  pastaDoEspaco: string
  indice: number
}

/**
 * O cartão do terminal no quadro. Por enquanto sem processo: o corpo mostra o que vai rodar.
 * Na integração, o corpo vira o xterm (terminal/CorpoXterm.tsx), ligado ao processo do nó.
 */
export const PecaTerminal = memo(function PecaTerminal({ no, selecionado, pastaDoEspaco, indice }: Props) {
  const Icone = ICONE_AGENTE[no.agente]
  const pasta = no.pasta || pastaDoEspaco
  return (
    <MolduraNo no={no} selecionado={selecionado}>
      <header className="terminal-cabecalho" data-arrasta>
        <Icone size={13} color={COR_AGENTE[no.agente]} strokeWidth={2.2} />
        <span className="terminal-nome">{no.nome}</span>
        <span className="terminal-indice">{indice}</span>
      </header>
      <div className="terminal-corpo">
        <div className="terminal-espera">
          <span className="prompt">{'>'}</span> {no.comando || 'powershell'}
          <span className="cursor" />
        </div>
        <div className="terminal-aviso">o processo liga na etapa de integração</div>
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
