import { useState } from 'react'
import { FolderOpen, FolderPlus, Layers, PanelRight, RefreshCw, X } from 'lucide-react'
import { Arvore } from '../arquivos/Arvore'
import {
  adicionarRaizExplorador,
  alternarExplorador,
  alternarPastaExplorador,
  pastaDoPlano,
  planoAtual,
  removerRaizExplorador,
  usarLoja
} from '../estado/loja'
import { centroDaTela } from '../quadro/geometria'
import { abrirMenu } from './MenuContexto'
import { itensDoItemDoExplorador } from './menus'

// Explorador da direita: as pastas que o usuário está olhando. A pasta do espaço (ou do andar aberto) está
// sempre aí, porque é onde os agentes trabalham; as outras ele mesmo põe e tira.

const nomeCurto = (caminho: string): string => caminho.split(/[\\/]/).filter(Boolean).pop() ?? caminho

function Raiz({ caminho, rotulo, fixa }: { caminho: string; rotulo: string; fixa: boolean }) {
  const expandidas = usarLoja((e) => e.explorador.expandidas)
  const [versao, definirVersao] = useState(0)
  const aberta = expandidas.includes(caminho)

  return (
    <section className="explorador-raiz">
      <header className="explorador-raiz-topo" title={caminho} onClick={() => alternarPastaExplorador(caminho)}>
        {fixa ? <Layers size={13} /> : <FolderOpen size={13} />}
        <span className="explorador-raiz-nome">{rotulo}</span>
        <button
          className="botao-mini"
          title="Atualizar"
          onClick={(e) => {
            e.stopPropagation()
            definirVersao((v) => v + 1)
          }}
        >
          <RefreshCw size={11} />
        </button>
        {!fixa && (
          <button
            className="botao-mini"
            title="Tirar do explorador (a pasta no disco não é tocada)"
            onClick={(e) => {
              e.stopPropagation()
              removerRaizExplorador(caminho)
            }}
          >
            <X size={12} />
          </button>
        )}
      </header>
      {aberta && (
        <div className="explorador-arvore">
          <Arvore
            raiz={caminho}
            expandidas={expandidas}
            versao={versao}
            aoAlternar={alternarPastaExplorador}
            aoMenu={(evento, item) => {
              evento.preventDefault()
              const camera = planoAtual()?.camera
              const centro = camera ? centroDaTela(camera) : { x: 0, y: 0 }
              abrirMenu(evento.clientX, evento.clientY, itensDoItemDoExplorador(item, centro.x, centro.y))
            }}
          />
        </div>
      )}
    </section>
  )
}

export function BarraExplorador() {
  const aberto = usarLoja((e) => e.explorador.aberto)
  const raizes = usarLoja((e) => e.explorador.raizes)
  const doEspaco = usarLoja((e) => (e.espaco ? pastaDoPlano(e.espaco) : null))
  const nomeDoPlano = usarLoja((e) =>
    e.espaco ? e.espaco.andares.find((a) => a.id === e.espaco!.andarAtivo)?.nome ?? e.espaco.nome : ''
  )
  if (!aberto) return null

  // a pasta do andar aberto é outra (worktree): a raiz fixa acompanha o que está à mostra
  const extras = raizes.filter((r) => r !== doEspaco)

  return (
    <aside className="explorador">
      <div className="explorador-topo">
        <h2 className="explorador-titulo">Arquivos</h2>
        <button
          className="botao-icone"
          title="Abrir uma pasta aqui"
          onClick={async () => {
            const pasta = await window.mp.dados.escolherPasta()
            if (pasta) await adicionarRaizExplorador(pasta)
          }}
        >
          <FolderPlus size={17} />
        </button>
        <button className="botao-icone" title="Esconder os arquivos (Ctrl+Shift+E)" onClick={alternarExplorador}>
          <PanelRight size={17} />
        </button>
      </div>
      <div className="explorador-lista">
        {doEspaco && <Raiz caminho={doEspaco} rotulo={nomeDoPlano} fixa />}
        {extras.map((r) => (
          <Raiz key={r} caminho={r} rotulo={nomeCurto(r)} fixa={false} />
        ))}
        {!doEspaco && !extras.length && <p className="explorador-vazio">Abra uma pasta para ver os arquivos.</p>}
      </div>
    </aside>
  )
}
