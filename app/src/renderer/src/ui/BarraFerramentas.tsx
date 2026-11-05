import { useState } from 'react'
import {
  Eraser,
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
  Users,
  type LucideIcon
} from 'lucide-react'
import type { PincelDesenho, Funcao, Partitura } from '../../../shared/modelo'
import { resumoDaPartitura } from '../../../shared/quadro/partituras'
import { adicionarNo, definirEstiloDesenho, escolherFerramenta, planoAtual, usarLoja, type Ferramenta } from '../estado/loja'
import { anexarArquivoEm, arvoreEm, portalEm } from './menus'
import { centroDaTela } from '../quadro/geometria'
import { COR_AGENTE, ICONE_AGENTE } from '../nos/icones'
import { abrirFuncoes } from './Funcoes'
import { abrirPresets } from './Presets'
import { abrirPartituras, subirPartituraNoCentro } from './Partituras'

const CORES_DESENHO = ['#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#8E8E93']
const FORMAS: Array<[PincelDesenho, LucideIcon, string]> = [
  ['lapis', Pencil, 'Lápis'],
  ['retangulo', Square, 'Retângulo'],
  ['seta', MoveUpRight, 'Seta'],
  ['borracha', Eraser, 'Borracha: passe por cima dos traços para apagar (E)']
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

/** Lista vazia constante: ver o comentário em `funcoes`. */
const SEM_FUNCOES: Funcao[] = []
const SEM_PARTITURAS: Partitura[] = []

export function BarraFerramentas() {
  const ferramenta = usarLoja((e) => e.ferramenta)
  const estilo = usarLoja((e) => e.estiloDesenho)
  const presets = usarLoja((e) => e.preferencias.presets)
  // sem o `?? []` aqui: um array novo a cada leitura faz o useSyncExternalStore repetir sem parar e a
  // janela fica em branco (custou uma rodada inteira do autoteste)
  const funcoes = usarLoja((e) => e.preferencias.funcoes) ?? SEM_FUNCOES
  const partituras = usarLoja((e) => e.preferencias.partituras) ?? SEM_PARTITURAS
  const [menuTerminal, setMenuTerminal] = useState(false)

  const escolher = (f: Ferramenta) => () => {
    setMenuTerminal(false)
    escolherFerramenta(ferramenta === f && f !== 'selecionar' ? 'selecionar' : f)
  }

  function noCentro(): { x: number; y: number } {
    return centroDaTela(planoAtual()!.camera)
  }

  async function anexar(): Promise<void> {
    setMenuTerminal(false)
    const { x, y } = noCentro()
    await anexarArquivoEm(x, y)
  }

  async function arvore(): Promise<void> {
    setMenuTerminal(false)
    const { x, y } = noCentro()
    await arvoreEm(x, y)
  }

  function portal(): void {
    setMenuTerminal(false)
    const { x, y } = noCentro()
    portalEm(x, y)
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
          {funcoes.length > 0 && <span className="divisoria" />}
          {funcoes.map((f) => {
            // a função abre com o preset preferido dela, ou com o primeiro da lista
            const preset = presets.find((p) => p.id === f.preset) ?? presets[0]
            const Icone = ICONE_AGENTE[preset.agente]
            return (
              <button
                key={f.id}
                className="menu-terminal-funcao"
                title={f.prompt.slice(0, 200)}
                onClick={() => {
                  setMenuTerminal(false)
                  const { x, y } = noCentro()
                  adicionarNo({ tipo: 'terminal', preset, funcao: f }, x, y)
                }}
              >
                <Icone size={15} color={COR_AGENTE[preset.agente]} />
                {f.nome}
              </button>
            )
          })}
          {partituras.length > 0 && <span className="divisoria" />}
          {partituras.map((p) => (
            <button
              key={p.id}
              className="menu-terminal-partitura"
              title={`Subir este time: ${resumoDaPartitura(p)}`}
              onClick={() => {
                setMenuTerminal(false)
                subirPartituraNoCentro(p)
              }}
            >
              <Users size={15} />
              {p.nome}
            </button>
          ))}
          <span className="divisoria" />
          <button
            className="menu-terminal-editar"
            onClick={() => {
              setMenuTerminal(false)
              abrirPresets()
            }}
          >
            Editar presets…
          </button>
          <button
            className="menu-terminal-funcoes"
            onClick={() => {
              setMenuTerminal(false)
              abrirFuncoes()
            }}
          >
            Editar funções…
          </button>
          <button
            className="menu-terminal-partituras"
            onClick={() => {
              setMenuTerminal(false)
              abrirPartituras()
            }}
          >
            Partituras…
          </button>
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
              // escolher cor com a borracha na mão volta para o lápis
              onClick={() => definirEstiloDesenho({ cor, ...(estilo.ferramenta === 'borracha' ? { ferramenta: 'lapis' as const } : {}) })}
            />
          ))}
        </div>
      )}
    </div>
  )
}
