import { useState, useSyncExternalStore } from 'react'
import { Dialogo } from './Dialogo'

// Perguntas do app (nome de algo, confirmação de ação que mexe em arquivos ou no git), no lugar dos
// diálogos nativos. Cada função devolve uma Promise com a resposta.

interface BotaoPergunta {
  rotulo: string
  valor: string
  perigo?: boolean
  primario?: boolean
}

type Pergunta =
  | { tipo: 'texto'; titulo: string; rotulo: string; valor: string; confirmar: string; responder: (r: string | null) => void }
  | {
      tipo: 'confirmar'
      titulo: string
      mensagem: string
      detalhes?: string[]
      botoes: BotaoPergunta[]
      opcao?: { rotulo: string; marcada: boolean }
      responder: (r: { botao: string | null; opcao: boolean }) => void
    }

let atual: Pergunta | null = null
const ouvintes = new Set<() => void>()
const mostrar = (p: Pergunta | null): void => {
  atual = p
  ouvintes.forEach((o) => o())
}

export function perguntarTexto(titulo: string, rotulo: string, valor = '', confirmar = 'OK'): Promise<string | null> {
  return new Promise((resolver) =>
    mostrar({ tipo: 'texto', titulo, rotulo, valor, confirmar, responder: (r) => (mostrar(null), resolver(r)) })
  )
}

export function confirmar(opcoes: {
  titulo: string
  mensagem: string
  detalhes?: string[]
  botoes: BotaoPergunta[]
  opcao?: { rotulo: string; marcada: boolean }
}): Promise<{ botao: string | null; opcao: boolean }> {
  return new Promise((resolver) =>
    mostrar({ tipo: 'confirmar', ...opcoes, responder: (r) => (mostrar(null), resolver(r)) })
  )
}

/** Só um aviso, com um botão. */
export function avisar(titulo: string, mensagem: string, detalhes?: string[]): Promise<void> {
  return confirmar({ titulo, mensagem, detalhes, botoes: [{ rotulo: 'OK', valor: 'ok', primario: true }] }).then(() => undefined)
}

function PerguntaTexto({ p }: { p: Extract<Pergunta, { tipo: 'texto' }> }) {
  const [valor, setValor] = useState(p.valor)
  const enviar = (): void => p.responder(valor.trim() ? valor.trim() : null)
  return (
    <Dialogo titulo={p.titulo} aoFechar={() => p.responder(null)}>
      <label className="campo">
        <span>{p.rotulo}</span>
        <input
          autoFocus
          value={valor}
          onFocus={(e) => e.currentTarget.select()}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && enviar()}
        />
      </label>
      <div className="dialogo-acoes">
        <button onClick={() => p.responder(null)}>Cancelar</button>
        <button className="primario" disabled={!valor.trim()} onClick={enviar}>
          {p.confirmar}
        </button>
      </div>
    </Dialogo>
  )
}

function PerguntaConfirmar({ p }: { p: Extract<Pergunta, { tipo: 'confirmar' }> }) {
  const [opcao, setOpcao] = useState(p.opcao?.marcada ?? false)
  return (
    <Dialogo titulo={p.titulo} aoFechar={() => p.responder({ botao: null, opcao })}>
      <p className="dialogo-texto">{p.mensagem}</p>
      {p.detalhes && p.detalhes.length > 0 && (
        <ul className="dialogo-detalhes">
          {p.detalhes.slice(0, 12).map((d) => (
            <li key={d}>{d}</li>
          ))}
          {p.detalhes.length > 12 && <li>… e mais {p.detalhes.length - 12}</li>}
        </ul>
      )}
      {p.opcao && (
        <label className="dialogo-opcao">
          <input type="checkbox" checked={opcao} onChange={(e) => setOpcao(e.target.checked)} />
          {p.opcao.rotulo}
        </label>
      )}
      <div className="dialogo-acoes">
        {p.botoes.map((b) => (
          <button
            key={b.valor}
            className={`${b.primario ? 'primario' : ''} ${b.perigo ? 'perigo' : ''}`}
            autoFocus={b.primario}
            onClick={() => p.responder({ botao: b.valor, opcao })}
          >
            {b.rotulo}
          </button>
        ))}
      </div>
    </Dialogo>
  )
}

export function Perguntas() {
  const p = useSyncExternalStore(
    (o) => {
      ouvintes.add(o)
      return () => ouvintes.delete(o)
    },
    () => atual
  )
  if (!p) return null
  return p.tipo === 'texto' ? <PerguntaTexto key={p.titulo} p={p} /> : <PerguntaConfirmar key={p.titulo} p={p} />
}
