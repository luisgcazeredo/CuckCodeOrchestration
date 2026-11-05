import { useState, useSyncExternalStore } from 'react'
import { FolderOpen, Plus, Trash2 } from 'lucide-react'
import type { Funcao } from '../../../shared/modelo'
import { definirFuncoes, lerEstado } from '../estado/loja'
import { Dialogo } from './Dialogo'

// Funções (papéis): o que um agente é, escrito uma vez e reaproveitado. O cartão nasce com o nome da função
// e recebe o prompt dela como primeiro pedido, em vez de nascer vazio esperando você explicar tudo de novo.
// Os agentes também usam, pelo `mpro abrir --funcao "Papel"` e `mpro funcoes`.

let aberto = false
const ouvintes = new Set<() => void>()
const avisar = (): void => ouvintes.forEach((o) => o())

export function abrirFuncoes(): void {
  aberto = true
  avisar()
}

function fechar(): void {
  aberto = false
  avisar()
}

function Editor() {
  const [lista, setLista] = useState<Funcao[]>(() => (lerEstado().preferencias.funcoes ?? []).map((f) => ({ ...f })))
  const mudar = (id: string, parcial: Partial<Funcao>): void =>
    setLista((l) => l.map((f) => (f.id === id ? { ...f, ...parcial } : f)))
  // nome repetido quebraria o `--funcao "Nome"`, que é como o agente fala dela
  const nomes = lista.map((f) => f.nome.trim().toLowerCase())
  const valida = lista.every((f) => f.nome.trim() && f.prompt.trim()) && new Set(nomes).size === nomes.length

  function salvar(): void {
    if (!valida) return
    definirFuncoes(lista.map((f) => ({ ...f, nome: f.nome.trim().slice(0, 80), prompt: f.prompt.trim() })))
    fechar()
  }

  async function escolherPasta(id: string): Promise<void> {
    const pasta = await window.mp.dados.escolherPasta()
    if (pasta) mudar(id, { pasta })
  }

  return (
    <Dialogo titulo="Funções" aoFechar={fechar}>
      <p className="dialogo-texto suave">
        O prompt vai como primeiro pedido assim que o agente fica pronto. A pasta é opcional: sem ela, vale a do
        espaço. Os agentes abrem uma função com <code>mpro abrir claude --funcao &quot;Nome&quot;</code>.
      </p>
      <div className="funcoes">
        {lista.map((f) => (
          <div key={f.id} className="funcao-linha" data-funcao={f.id}>
            <div className="funcao-topo">
              <input
                className="funcao-nome"
                value={f.nome}
                placeholder="Nome do papel (ex.: Revisor)"
                onChange={(e) => mudar(f.id, { nome: e.target.value })}
              />
              <button className="funcao-pasta" title="Pasta própria desta função" onClick={() => void escolherPasta(f.id)}>
                <FolderOpen size={14} />
                <span>{f.pasta ? f.pasta.split(/[/\\]/).filter(Boolean).slice(-1)[0] : 'pasta do espaço'}</span>
              </button>
              <button className="preset-apagar" title="Apagar função" onClick={() => setLista((l) => l.filter((x) => x.id !== f.id))}>
                <Trash2 size={14} />
              </button>
            </div>
            <textarea
              className="funcao-prompt"
              value={f.prompt}
              rows={4}
              placeholder="O que ele é, o que se espera dele, o que não fazer…"
              onChange={(e) => mudar(f.id, { prompt: e.target.value })}
            />
          </div>
        ))}
      </div>
      <button
        className="preset-novo"
        onClick={() => setLista((l) => [...l, { id: crypto.randomUUID(), nome: '', prompt: '' }])}
      >
        <Plus size={14} /> Nova função
      </button>
      <div className="dialogo-acoes">
        <span className="espaco-flex" />
        <button onClick={fechar}>Cancelar</button>
        <button className="primario" disabled={!valida} onClick={salvar}>
          Salvar
        </button>
      </div>
    </Dialogo>
  )
}

export function Funcoes() {
  const visivel = useSyncExternalStore(
    (o) => {
      ouvintes.add(o)
      return () => ouvintes.delete(o)
    },
    () => aberto
  )
  return visivel ? <Editor /> : null
}
