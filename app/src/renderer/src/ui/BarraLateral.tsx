import { useState } from 'react'
import { AppWindow, Folder, FolderOpen, GitBranch, Layers, Plus, Search, SquareTerminal } from 'lucide-react'
import type { ResumoEspaco } from '../../../shared/modelo'
import { abrirEspaco, abrirNovaJanela, criarEspaco, lerEstado, renomearEspaco, usarLoja } from '../estado/loja'
import { COR_ESTADO } from './Andares'
import { Dialogo } from './Dialogo'
import { abrirMenu } from './MenuContexto'
import { itensDoAndar, itensDoEspaco } from './menus'

function NovoEspaco({ aoFechar }: { aoFechar: () => void }) {
  const [nome, setNome] = useState('')
  const [pasta, setPasta] = useState<string | null>(null)

  async function criar(): Promise<void> {
    if (!nome.trim() || !pasta) return
    await criarEspaco(nome, pasta)
    aoFechar()
  }

  return (
    <Dialogo titulo="Novo espaço de trabalho" aoFechar={aoFechar}>
      <label className="campo">
        <span>Nome</span>
        <input autoFocus value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && criar()} />
      </label>
      <label className="campo">
        <span>Pasta do projeto (onde os terminais abrem)</span>
        <button className="botao-pasta" onClick={async () => setPasta((await window.mp.dados.escolherPasta()) ?? pasta)}>
          <FolderOpen size={14} />
          <span>{pasta ?? 'Escolher pasta…'}</span>
        </button>
      </label>
      <div className="dialogo-acoes">
        <button onClick={aoFechar}>Cancelar</button>
        <button className="primario" disabled={!nome.trim() || !pasta} onClick={criar}>
          Criar
        </button>
      </div>
    </Dialogo>
  )
}

export function BarraLateral() {
  const espacos = usarLoja((e) => e.espacos)
  const espacoAberto = usarLoja((e) => e.espaco)
  const emOutras = usarLoja((e) => e.emOutrasJanelas)
  const [filtro, setFiltro] = useState('')
  const [criando, setCriando] = useState(false)
  const [renomeando, setRenomeando] = useState<string | null>(null)

  // o espaço aberto conta e lista na hora (terminais de todos os andares); os outros, pelo que está salvo
  const comAberto = (r: ResumoEspaco): ResumoEspaco => {
    if (r.id !== espacoAberto?.id) return r
    const planos = [espacoAberto, ...espacoAberto.andares]
    return {
      ...r,
      terminais: planos.reduce((t, p) => t + p.nos.filter((n) => n.tipo === 'terminal').length, 0),
      andares: espacoAberto.andares.map((a) => ({ id: a.id, nome: a.nome, ramo: a.git?.ramo ?? null, estado: a.status?.estado }))
    }
  }
  const visiveis = espacos.filter((e) => e.nome.toLowerCase().includes(filtro.trim().toLowerCase())).map(comAberto)

  return (
    <aside className="lateral">
      <div className="lateral-topo">
        <div className="filtro">
          <Search size={15} />
          <input placeholder="Filtrar" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        </div>
        <button className="botao-icone" title="Nova janela, para outro espaço ao mesmo tempo (Ctrl+Shift+N)" onClick={() => abrirNovaJanela()}>
          <AppWindow size={17} />
        </button>
        <button className="botao-icone" title="Novo espaço de trabalho" onClick={() => setCriando(true)}>
          <Plus size={18} />
        </button>
      </div>
      <h2 className="lateral-titulo">Espaços de trabalho</h2>
      <ul className="lista-espacos">
        {visiveis.map((e) => {
          const ativo = e.id === espacoAberto?.id
          const fora = emOutras.includes(e.id)
          return (
            <li key={e.id} className="grupo-espaco">
              <div
                className={`linha-espaco ${ativo && !espacoAberto?.andarAtivo ? 'ativo' : ''} ${ativo ? 'aberto' : ''} ${fora ? 'em-outra-janela' : ''}`}
                title={fora ? `${e.pasta}
Aberto em outra janela: clique para ir até ela` : e.pasta}
                onClick={() => void abrirEspaco(e.id, null)}
                onDoubleClick={() => setRenomeando(e.id)}
                onContextMenu={(ev) => {
                  ev.preventDefault()
                  abrirMenu(ev.clientX, ev.clientY, itensDoEspaco(e))
                }}
              >
                <Folder size={16} color={e.cor} fill={ativo ? e.cor : 'none'} fillOpacity={0.25} />
                {renomeando === e.id ? (
                  <input
                    className="renomear"
                    autoFocus
                    defaultValue={e.nome}
                    onClick={(ev) => ev.stopPropagation()}
                    onBlur={(ev) => {
                      void renomearEspaco(e.id, ev.target.value)
                      setRenomeando(null)
                    }}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Enter') ev.currentTarget.blur()
                      if (ev.key === 'Escape') setRenomeando(null)
                    }}
                  />
                ) : (
                  <span className="espaco-nome">{e.nome}</span>
                )}
                {fora && <AppWindow size={13} className="selo-janela" />}
                {e.terminais > 0 && (
                  <span className="selo" title={`${e.terminais} terminais`}>
                    <SquareTerminal size={12} />
                    {e.terminais}
                  </span>
                )}
              </div>
              {e.andares.length > 0 && (
                <ul className="lista-andares">
                  {e.andares.map((a) => (
                    <li
                      key={a.id}
                      className={`linha-andar ${ativo && espacoAberto?.andarAtivo === a.id ? 'ativo' : ''}`}
                      title={a.ramo ? `ramo ${a.ramo}` : 'andar sem git'}
                      onClick={() => void abrirEspaco(e.id, a.id)}
                      onContextMenu={async (ev) => {
                        ev.preventDefault()
                        const { clientX, clientY } = ev
                        if (!ativo) await abrirEspaco(e.id, a.id)
                        const andar = lerEstado().espaco?.andares.find((x) => x.id === a.id)
                        if (andar) abrirMenu(clientX, clientY, itensDoAndar(andar))
                      }}
                    >
                      <Layers size={13} />
                      <span className="andar-nome">{a.nome}</span>
                      {a.ramo && <GitBranch size={11} className="andar-git" />}
                      {a.estado && <span className="ponto-estado" style={{ background: COR_ESTADO[a.estado] }} />}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          )
        })}
      </ul>
      {criando && <NovoEspaco aoFechar={() => setCriando(false)} />}
    </aside>
  )
}
