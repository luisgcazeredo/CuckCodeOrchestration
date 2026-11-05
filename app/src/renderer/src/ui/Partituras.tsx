import { useSyncExternalStore } from 'react'
import { Pencil, Play, Trash2 } from 'lucide-react'
import type { Partitura } from '../../../shared/modelo'
import { resumoDaPartitura } from '../../../shared/quadro/partituras'
import { definirPartituras, planoAtual, subirPartitura, usarLoja } from '../estado/loja'
import { centroDaTela } from '../quadro/geometria'
import { Dialogo } from './Dialogo'
import { avisar as avisarRecado, confirmar, perguntarTexto } from './Perguntas'

// Partituras: times salvos. Guardar é com a seleção no quadro ("Salvar como partitura…"); aqui o time sobe
// de novo — com as funções de hoje, os comandos como estavam e as cordas entre os agentes.

let aberto = false
const ouvintes = new Set<() => void>()
const avisar = (): void => ouvintes.forEach((o) => o())

export function abrirPartituras(): void {
  aberto = true
  avisar()
}

function fechar(): void {
  aberto = false
  avisar()
}

/** Sobe a partitura no meio da tela (o arranjo desce sozinho se o lugar estiver ocupado). */
export function subirPartituraNoCentro(partitura: Partitura): void {
  const plano = planoAtual()
  if (!plano) return
  const centro = centroDaTela(plano.camera)
  const feito = subirPartitura(partitura, centro.x - partitura.largura / 2, centro.y - partitura.altura / 2)
  if ('erro' in feito) void avisarRecado('Partitura', feito.erro)
}

const SEM_PARTITURAS: Partitura[] = []

function Editor() {
  // sem o `?? []` dentro do seletor: array novo a cada leitura faz o useSyncExternalStore repetir sem parar
  const partituras = usarLoja((e) => e.preferencias.partituras) ?? SEM_PARTITURAS

  async function renomear(p: Partitura): Promise<void> {
    const nome = await perguntarTexto('Renomear partitura', 'Nome', p.nome, 'Renomear')
    if (!nome?.trim()) return
    definirPartituras(partituras.map((x) => (x.id === p.id ? { ...x, nome: nome.trim().slice(0, 80) } : x)))
  }

  async function apagar(p: Partitura): Promise<void> {
    const r = await confirmar({
      titulo: `Apagar a partitura "${p.nome}"?`,
      mensagem: 'Os cartões que já subiram dela ficam onde estão; só o time guardado sai.',
      botoes: [
        { rotulo: 'Cancelar', valor: 'cancelar', primario: true },
        { rotulo: 'Apagar', valor: 'apagar', perigo: true }
      ]
    })
    if (r.botao === 'apagar') definirPartituras(partituras.filter((x) => x.id !== p.id))
  }

  return (
    <Dialogo titulo="Partituras" aoFechar={fechar}>
      <p className="dialogo-texto suave">
        Um time salvo: os agentes com as funções e os comandos deles, os recados e as cordas entre eles. Para
        guardar um, selecione os cartões no quadro e use <b>Salvar como partitura…</b>. A pasta não é salva — cada
        cartão abre na pasta do espaço (ou na da função), e é por isso que o mesmo time serve em qualquer projeto.
      </p>
      <div className="partituras">
        {partituras.map((p) => (
          <div key={p.id} className="partitura-linha" data-partitura={p.id}>
            <div className="partitura-dados">
              <span className="partitura-nome">{p.nome}</span>
              <span className="partitura-resumo suave">{resumoDaPartitura(p)}</span>
            </div>
            <button
              className="partitura-subir"
              title="Subir este time no andar à mostra"
              onClick={() => {
                fechar()
                subirPartituraNoCentro(p)
              }}
            >
              <Play size={13} /> Subir
            </button>
            <button className="preset-apagar" title="Renomear" onClick={() => void renomear(p)}>
              <Pencil size={14} />
            </button>
            <button className="preset-apagar" title="Apagar partitura" onClick={() => void apagar(p)}>
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!partituras.length && <p className="dialogo-texto suave">Nenhuma partitura guardada ainda.</p>}
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

export function Partituras() {
  const visivel = useSyncExternalStore(
    (o) => {
      ouvintes.add(o)
      return () => ouvintes.delete(o)
    },
    () => aberto
  )
  return visivel ? <Editor /> : null
}
