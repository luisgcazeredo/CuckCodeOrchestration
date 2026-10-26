import { useState } from 'react'
import { Folder, FolderOpen, Plus, Search, SquareTerminal } from 'lucide-react'
import { abrirEspaco, criarEspaco, renomearEspaco, usarLoja } from '../estado/loja'
import { Dialogo } from './Dialogo'

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
  const ativo = usarLoja((e) => e.espaco?.id)
  // o espaço aberto conta na hora; os outros, pelo que está salvo
  const terminaisAtivo = usarLoja((e) => e.espaco?.nos.filter((n) => n.tipo === 'terminal').length ?? 0)
  const [filtro, setFiltro] = useState('')
  const [criando, setCriando] = useState(false)
  const [renomeando, setRenomeando] = useState<string | null>(null)

  const visiveis = espacos.filter((e) => e.nome.toLowerCase().includes(filtro.trim().toLowerCase()))

  return (
    <aside className="lateral">
      <div className="lateral-topo">
        <div className="filtro">
          <Search size={15} />
          <input placeholder="Filtrar" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        </div>
        <button className="botao-icone" title="Novo espaço de trabalho" onClick={() => setCriando(true)}>
          <Plus size={18} />
        </button>
      </div>
      <h2 className="lateral-titulo">Espaços de trabalho</h2>
      <ul className="lista-espacos">
        {visiveis.map((r) => ({ ...r, terminais: r.id === ativo ? terminaisAtivo : r.terminais })).map((e) => (
          <li
            key={e.id}
            className={e.id === ativo ? 'ativo' : ''}
            title={e.pasta}
            onClick={() => void abrirEspaco(e.id)}
            onDoubleClick={() => setRenomeando(e.id)}
          >
            <Folder size={16} color={e.cor} fill={e.id === ativo ? e.cor : 'none'} fillOpacity={0.25} />
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
            {e.terminais > 0 && (
              <span className="selo" title={`${e.terminais} terminais`}>
                <SquareTerminal size={12} />
                {e.terminais}
              </span>
            )}
          </li>
        ))}
      </ul>
      {criando && <NovoEspaco aoFechar={() => setCriando(false)} />}
    </aside>
  )
}
