import { useState, useSyncExternalStore } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { PRESETS_PADRAO, type Agente, type PresetAgente } from '../../../shared/modelo'
import { definirPresets, lerEstado } from '../estado/loja'
import { COR_AGENTE, ICONE_AGENTE } from '../nos/icones'
import { Dialogo } from './Dialogo'

// Presets de agente: o que aparece no botão de terminal. Cada um é um nome, o tipo de agente (ícone, retomar conversa)
// e a linha digitada no PowerShell quando o terminal abre (ex.: `claude --model opus`).

let aberto = false
const ouvintes = new Set<() => void>()
const avisar = (): void => ouvintes.forEach((o) => o())

export function abrirPresets(): void {
  aberto = true
  avisar()
}

function fechar(): void {
  aberto = false
  avisar()
}

const AGENTES: Array<[Agente, string]> = [
  ['claude', 'Claude Code'],
  ['codex', 'Codex'],
  ['shell', 'Só o PowerShell']
]

/** O comando vai digitado no shell: uma linha só. */
const comandoValido = (p: PresetAgente): boolean => !/[\r\n]/.test(p.comando) && p.comando.length <= 500

function Editor() {
  const [lista, setLista] = useState<PresetAgente[]>(() => lerEstado().preferencias.presets.map((p) => ({ ...p })))
  const mudar = (id: string, parcial: Partial<PresetAgente>): void => setLista((l) => l.map((p) => (p.id === id ? { ...p, ...parcial } : p)))
  const valida = lista.length > 0 && lista.every((p) => p.nome.trim() && comandoValido(p))

  function salvar(): void {
    if (!valida) return
    definirPresets(lista.map((p) => ({ ...p, nome: p.nome.trim().slice(0, 80), comando: p.comando.trim() })))
    fechar()
  }

  return (
    <Dialogo titulo="Presets de agente" aoFechar={fechar}>
      <p className="dialogo-texto suave">O comando é digitado no PowerShell quando o terminal abre, na pasta do espaço.</p>
      <div className="presets">
        {lista.map((p) => {
          const Icone = ICONE_AGENTE[p.agente]
          return (
            <div key={p.id} className="preset-linha" data-preset={p.id}>
              <Icone size={15} color={COR_AGENTE[p.agente]} />
              <input className="preset-nome" value={p.nome} placeholder="Nome" onChange={(e) => mudar(p.id, { nome: e.target.value })} />
              <select value={p.agente} onChange={(e) => mudar(p.id, { agente: e.target.value as Agente })} title="Tipo de agente">
                {AGENTES.map(([valor, rotulo]) => (
                  <option key={valor} value={valor}>
                    {rotulo}
                  </option>
                ))}
              </select>
              <input
                className="preset-comando"
                value={p.comando}
                placeholder={p.agente === 'shell' ? '(nada: só o shell)' : p.agente}
                spellCheck={false}
                onChange={(e) => mudar(p.id, { comando: e.target.value })}
              />
              <button
                className="preset-apagar"
                title="Apagar preset"
                disabled={lista.length === 1}
                onClick={() => setLista((l) => l.filter((x) => x.id !== p.id))}
              >
                <Trash2 size={14} />
              </button>
            </div>
          )
        })}
      </div>
      <button
        className="preset-novo"
        onClick={() => setLista((l) => [...l, { id: crypto.randomUUID(), nome: 'Novo agente', agente: 'claude', comando: 'claude' }])}
      >
        <Plus size={14} /> Novo preset
      </button>
      <div className="dialogo-acoes">
        <button onClick={() => setLista(PRESETS_PADRAO.map((p) => ({ ...p })))}>Restaurar padrão</button>
        <span className="espaco-flex" />
        <button onClick={fechar}>Cancelar</button>
        <button className="primario" disabled={!valida} onClick={salvar}>
          Salvar
        </button>
      </div>
    </Dialogo>
  )
}

export function Presets() {
  const visivel = useSyncExternalStore(
    (o) => {
      ouvintes.add(o)
      return () => ouvintes.delete(o)
    },
    () => aberto
  )
  return visivel ? <Editor /> : null
}
