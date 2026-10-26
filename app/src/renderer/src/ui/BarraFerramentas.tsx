import { useState } from 'react'
import {
  FolderTree,
  Globe,
  MousePointer2,
  MoveUpRight,
  Paperclip,
  Pencil,
  Square,
  SquareTerminal,
  StickyNote,
  Type,
  type LucideIcon
} from 'lucide-react'
import type { FerramentaDesenho } from '../../../shared/modelo'
import { adicionarNo, definirEstiloDesenho, escolherFerramenta, lerEstado, usarLoja, type Ferramenta } from '../estado/loja'
import { centroDaTela } from '../quadro/geometria'
import { COR_AGENTE, ICONE_AGENTE } from '../nos/icones'

const CORES_DESENHO = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#8E8E93']
const FORMAS: Array<[FerramentaDesenho, LucideIcon, string]> = [
  ['lapis', Pencil, 'Lápis'],
  ['retangulo', Square, 'Retângulo'],
  ['seta', MoveUpRight, 'Seta']
]

function Botao({
  icone: Icone,
  titulo,
  ativo,
  desligado,
  aoClicar
}: {
  icone: LucideIcon
  titulo: string
  ativo?: boolean
  desligado?: boolean
  aoClicar?: () => void
}) {
  return (
    <button
      className={`ferramenta ${ativo ? 'ativa' : ''}`}
      title={titulo}
      aria-label={titulo}
      disabled={desligado}
      onClick={aoClicar}
    >
      <Icone size={20} strokeWidth={1.7} />
    </button>
  )
}

export function BarraFerramentas() {
  const ferramenta = usarLoja((e) => e.ferramenta)
  const estilo = usarLoja((e) => e.estiloDesenho)
  const presets = usarLoja((e) => e.preferencias.presets)
  const [menuTerminal, setMenuTerminal] = useState(false)

  const escolher = (f: Ferramenta) => () => {
    setMenuTerminal(false)
    escolherFerramenta(ferramenta === f && f !== 'selecionar' ? 'selecionar' : f)
  }

  function noCentro(): { x: number; y: number } {
    return centroDaTela(lerEstado().espaco!.camera)
  }

  async function anexar(): Promise<void> {
    setMenuTerminal(false)
    const arquivo = await window.mp.dados.escolherArquivo()
    if (!arquivo) return
    const { x, y } = noCentro()
    adicionarNo({ tipo: 'arquivo', caminho: arquivo.caminho, nome: arquivo.nome }, x, y)
  }

  async function arvore(): Promise<void> {
    setMenuTerminal(false)
    const pasta = await window.mp.dados.escolherPasta()
    if (!pasta) return
    const { x, y } = noCentro()
    adicionarNo({ tipo: 'pasta', caminho: pasta }, x, y)
  }

  function portal(): void {
    setMenuTerminal(false)
    const { x, y } = noCentro()
    adicionarNo({ tipo: 'portal', url: 'https://www.google.com' }, x, y)
  }

  return (
    <div className="barra-ferramentas-pos">
      <div className="pilula barra-ferramentas">
        <Botao icone={MousePointer2} titulo="Selecionar (V)" ativo={ferramenta === 'selecionar'} aoClicar={escolher('selecionar')} />
        <Botao icone={SquareTerminal} titulo="Terminal" ativo={menuTerminal} aoClicar={() => setMenuTerminal(!menuTerminal)} />
        <Botao icone={StickyNote} titulo="Post-it (N)" ativo={ferramenta === 'postit'} aoClicar={escolher('postit')} />
        <Botao icone={Paperclip} titulo="Anexar arquivo" aoClicar={() => void anexar()} />
        <Botao icone={FolderTree} titulo="Árvore de arquivos de uma pasta" aoClicar={() => void arvore()} />
        <Botao icone={Globe} titulo="Portal: navegador no quadro" aoClicar={portal} />
        <Botao icone={Type} titulo="Texto (T)" ativo={ferramenta === 'texto'} aoClicar={escolher('texto')} />
        <Botao icone={Pencil} titulo="Desenhar (D)" ativo={ferramenta === 'desenho'} aoClicar={escolher('desenho')} />
      </div>

      {menuTerminal && (
        <div className="pilula menu-terminal">
          {presets.map((p) => {
            const Icone = ICONE_AGENTE[p.agente]
            return (
              <button
                key={p.id}
                onClick={() => {
                  setMenuTerminal(false)
                  const { x, y } = noCentro()
                  adicionarNo({ tipo: 'terminal', preset: p }, x, y)
                }}
              >
                <Icone size={15} color={COR_AGENTE[p.agente]} />
                {p.nome}
              </button>
            )
          })}
        </div>
      )}

      {ferramenta === 'desenho' && (
        <div className="pilula barra-desenho">
          {FORMAS.map(([forma, Icone, titulo]) => (
            <button
              key={forma}
              className={`ferramenta pequena ${estilo.ferramenta === forma ? 'ativa' : ''}`}
              title={titulo}
              onClick={() => definirEstiloDesenho({ ferramenta: forma })}
            >
              <Icone size={16} />
            </button>
          ))}
          <span className="divisoria" />
          {CORES_DESENHO.map((cor) => (
            <button
              key={cor}
              className={`amostra ${estilo.cor === cor ? 'ativa' : ''}`}
              style={{ background: cor }}
              title={cor}
              onClick={() => definirEstiloDesenho({ cor })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
