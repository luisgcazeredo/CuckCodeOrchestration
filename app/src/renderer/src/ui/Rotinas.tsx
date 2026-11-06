import { useState, useSyncExternalStore } from 'react'
import { Pause, Play, Plus, Trash2, Zap } from 'lucide-react'
import type { QuandoDaRotina, Rotina } from '../../../shared/modelo'
import { MAX_MINUTOS, MIN_MINUTOS, descricaoDe, textoDoResultado } from '../../../shared/rotinas'
import {
  alternarPausaDaRotina,
  apagarRotina,
  criarRotina,
  planoAtual,
  rotinasDoEspaco,
  testarRotina,
  usarLoja
} from '../estado/loja'
import { Dialogo } from './Dialogo'
import { avisar } from './Perguntas'

// Rotinas: o app digita um pedido num cartão de hora em hora, todo dia ou toda semana — e **pula a vez**
// quando o terminal está ocupado, numa pergunta ou encerrado. É a única coisa aqui que uma tarefa do
// Windows não faria: ela escreveria no meio do trabalho do agente.

let aberto: { cartao: string } | null = null
const ouvintes = new Set<() => void>()
const avisarOuvintes = (): void => ouvintes.forEach((o) => o())

/** Abre as rotinas do espaço, já com este cartão escolhido no formulário. */
export function abrirRotinas(cartao = ''): void {
  aberto = { cartao }
  avisarOuvintes()
}

function fechar(): void {
  aberto = null
  avisarOuvintes()
}

const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

const hora = (iso: string): string => {
  const d = new Date(iso)
  const hoje = new Date()
  const mesmoDia = d.toDateString() === hoje.toDateString()
  return mesmoDia
    ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function Editor({ cartaoInicial }: { cartaoInicial: string }) {
  const rotinas = usarLoja(() => rotinasDoEspaco())
  const plano = planoAtual()
  const agentes = (plano?.nos ?? []).flatMap((n) => (n.tipo === 'terminal' ? [{ id: n.id, nome: n.nome }] : []))
  const [cartao, setCartao] = useState(cartaoInicial || agentes[0]?.id || '')
  const [nome, setNome] = useState('')
  const [texto, setTexto] = useState('')
  const [tipo, setTipo] = useState<QuandoDaRotina['tipo']>('cada')
  const [minutos, setMinutos] = useState(30)
  const [horaDoDia, setHoraDoDia] = useState('09:00')
  const [dia, setDia] = useState(1)

  function quando(): QuandoDaRotina {
    const [h, m] = horaDoDia.split(':').map((n) => Number(n) || 0)
    if (tipo === 'cada') return { tipo: 'cada', minutos }
    if (tipo === 'diario') return { tipo: 'diario', hora: h, minuto: m }
    return { tipo: 'semanal', dia, hora: h, minuto: m }
  }

  async function criar(): Promise<void> {
    const erro = criarRotina({ nome, terminal: cartao, texto, quando: quando() })
    if (erro) return void avisar('Rotinas', erro)
    setNome('')
    setTexto('')
  }

  async function testar(r: Rotina): Promise<void> {
    const resultado = await testarRotina(r.id)
    if (resultado !== 'rodou') await avisar('Rotinas', `Não digitei agora: ${textoDoResultado(resultado)}.`)
  }

  const nomeDoCartao = (id: string): string => agentes.find((a) => a.id === id)?.nome ?? 'cartão que saiu do quadro'

  return (
    <Dialogo titulo="Rotinas" aoFechar={fechar}>
      <p className="dialogo-texto suave">
        O app digita o pedido no cartão na hora marcada. Se o terminal estiver <b>ocupado</b>, parado numa
        pergunta ou encerrado, ele <b>pula a vez</b> em vez de escrever no meio do trabalho. As rotinas correm
        enquanto este espaço está aberto numa janela.
      </p>

      <div className="rotinas">
        {rotinas.map((r) => (
          <div key={r.id} className={`rotina-linha ${r.pausada ? 'pausada' : ''}`} data-rotina={r.id}>
            <div className="rotina-dados">
              <span className="rotina-nome">{r.nome}</span>
              <span className="rotina-detalhe suave">
                {nomeDoCartao(r.terminal)} · {descricaoDe(r.quando)} ·{' '}
                {r.pausada ? 'pausada' : `próxima às ${hora(r.proxima)}`}
                {r.ultima ? ` · última ${hora(r.ultima.em)}: ${textoDoResultado(r.ultima.resultado)}` : ''}
                {r.vezes ? ` · ${r.vezes}×` : ''}
              </span>
            </div>
            <button className="preset-apagar" title="Digitar agora (testar)" onClick={() => void testar(r)}>
              <Zap size={14} />
            </button>
            <button
              className="preset-apagar"
              title={r.pausada ? 'Voltar a rodar' : 'Pausar'}
              onClick={() => alternarPausaDaRotina(r.id)}
            >
              {r.pausada ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button className="preset-apagar" title="Apagar rotina" onClick={() => apagarRotina(r.id)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!rotinas.length && <p className="dialogo-texto suave">Nenhuma rotina neste espaço ainda.</p>}
      </div>

      <div className="rotina-nova">
        <div className="rotina-campos">
          <input className="rotina-campo-nome" value={nome} placeholder="Nome (ex.: Relatório do dia)" onChange={(e) => setNome(e.target.value)} />
          <select value={cartao} onChange={(e) => setCartao(e.target.value)}>
            {agentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
            {!agentes.length && <option value="">nenhum agente no andar à mostra</option>}
          </select>
        </div>
        <textarea
          className="rotina-texto"
          value={texto}
          rows={3}
          placeholder="O que digitar no cartão (um pedido ao agente, ou um comando no shell)"
          onChange={(e) => setTexto(e.target.value)}
        />
        <div className="rotina-campos">
          <select value={tipo} onChange={(e) => setTipo(e.target.value as QuandoDaRotina['tipo'])}>
            <option value="cada">a cada…</option>
            <option value="diario">todo dia às…</option>
            <option value="semanal">toda semana…</option>
          </select>
          {tipo === 'cada' && (
            <label className="rotina-minutos">
              <input
                type="number"
                min={MIN_MINUTOS}
                max={MAX_MINUTOS}
                value={minutos}
                onChange={(e) => setMinutos(Number(e.target.value) || MIN_MINUTOS)}
              />
              <span className="suave">minutos</span>
            </label>
          )}
          {tipo === 'semanal' && (
            <select value={dia} onChange={(e) => setDia(Number(e.target.value))}>
              {DIAS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          )}
          {tipo !== 'cada' && <input type="time" value={horaDoDia} onChange={(e) => setHoraDoDia(e.target.value)} />}
          <span className="espaco-flex" />
          <button className="preset-novo" disabled={!agentes.length} onClick={() => void criar()}>
            <Plus size={14} /> Criar rotina
          </button>
        </div>
      </div>

      <div className="dialogo-acoes">
        <span className="espaco-flex" />
        <button className="primario" onClick={fechar}>
          Fechar
        </button>
      </div>
    </Dialogo>
  )
}

export function Rotinas() {
  const estado = useSyncExternalStore(
    (o) => {
      ouvintes.add(o)
      return () => ouvintes.delete(o)
    },
    () => aberto
  )
  return estado ? <Editor cartaoInicial={estado.cartao} /> : null
}
