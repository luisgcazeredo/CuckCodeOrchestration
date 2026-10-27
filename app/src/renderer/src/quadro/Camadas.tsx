import { memo } from 'react'
import type { Corda, Desenho, No, Plano } from '../../../shared/modelo'
import { estaSelecionado, focarItem, selecionar, selecionarPeloClique, type Selecao } from '../estado/loja'
import { comecarArrasto, usarGuias } from './arrasto'
import { caixaDoDesenho, caixaDoNo, curvaEntre, pontasDaCorda, uniao, type Caixa, type Ponto } from './geometria'

/** Caminho suave pelos pontos do lápis (quadráticas pelos pontos médios). */
function caminhoLapis(pontos: Array<[number, number]>): string {
  if (pontos.length < 2) return pontos.length ? `M ${pontos[0][0]} ${pontos[0][1]} l 0.1 0` : ''
  let d = `M ${pontos[0][0]} ${pontos[0][1]}`
  for (let i = 1; i < pontos.length - 1; i++) {
    const [x, y] = pontos[i]
    const [nx, ny] = pontos[i + 1]
    d += ` Q ${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`
  }
  const [ux, uy] = pontos[pontos.length - 1]
  return `${d} L ${ux} ${uy}`
}

function caminhoSeta([[x1, y1], [x2, y2]]: Array<[number, number]>, espessura: number): string {
  const angulo = Math.atan2(y2 - y1, x2 - x1)
  const ponta = 10 + espessura * 2
  const a1 = angulo + Math.PI * 0.85
  const a2 = angulo - Math.PI * 0.85
  return (
    `M ${x1} ${y1} L ${x2} ${y2} ` +
    `M ${x2 + Math.cos(a1) * ponta} ${y2 + Math.sin(a1) * ponta} L ${x2} ${y2} L ${x2 + Math.cos(a2) * ponta} ${y2 + Math.sin(a2) * ponta}`
  )
}

export function FormaDesenho({ desenho }: { desenho: Omit<Desenho, 'id' | 'z'> }) {
  const comum = {
    stroke: desenho.cor,
    strokeWidth: desenho.espessura,
    fill: 'none',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  }
  if (desenho.ferramenta === 'retangulo' && desenho.pontos.length === 2) {
    const [[x1, y1], [x2, y2]] = desenho.pontos
    return (
      <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} rx={5} {...comum} />
    )
  }
  if (desenho.ferramenta === 'seta' && desenho.pontos.length === 2) {
    return <path d={caminhoSeta(desenho.pontos, desenho.espessura)} {...comum} />
  }
  return <path d={caminhoLapis(desenho.pontos)} {...comum} />
}

export const CamadaDesenhos = memo(function CamadaDesenhos({ desenhos, selecao }: { desenhos: Desenho[]; selecao: Selecao }) {
  return (
    <svg className="camada-svg">
      {[...desenhos]
        .sort((a, b) => a.z - b.z)
        .map((d) => {
          const marcado = selecao.desenhos.includes(d.id)
          const caixa = caixaDoDesenho(d)
          return (
            <g key={d.id} data-desenho-id={d.id}>
              <FormaDesenho desenho={d} />
              {/* área de clique mais larga que o traço; arrastar leva a seleção junto, como nos cartões */}
              <g
                className="toque"
                onPointerDown={(e) => {
                  if (e.button !== 0) return
                  e.stopPropagation()
                  const item = { tipo: 'desenho', id: d.id } as const
                  if (e.shiftKey || e.ctrlKey || e.metaKey) return selecionar(item, { somar: true })
                  const jaEstava = estaSelecionado(item)
                  selecionarPeloClique(item)
                  comecarArrasto(e, e.currentTarget, { tipo: 'mover' }, { aoClicar: jaEstava ? () => focarItem(item) : undefined })
                }}
              >
                <FormaDesenho desenho={{ ...d, cor: 'transparent', espessura: Math.max(14, d.espessura + 10) }} />
              </g>
              {marcado && (
                <rect
                  className="contorno-selecao"
                  x={caixa.x - 6}
                  y={caixa.y - 6}
                  width={caixa.largura + 12}
                  height={caixa.altura + 12}
                  rx={6}
                />
              )}
            </g>
          )
        })}
    </svg>
  )
})

export const CamadaCordas = memo(function CamadaCordas({
  cordas,
  nos,
  selecao,
  provisoria
}: {
  cordas: Corda[]
  nos: No[]
  selecao: Selecao
  provisoria: { de: No; ate: Ponto } | null
}) {
  const porId = new Map(nos.map((n) => [n.id, n]))
  return (
    <svg className="camada-svg camada-cordas">
      {cordas.map((c) => {
        const a = porId.get(c.de)
        const b = porId.get(c.para)
        if (!a || !b) return null
        const d = curvaEntre(a, b)
        const [p1, p2] = pontasDaCorda(a, b)
        const marcada = selecao.corda === c.id
        return (
          <g key={c.id} className={`corda ${marcada ? 'marcada' : ''}`} data-corda-id={c.id}>
            <path d={d} className="corda-linha" />
            <path
              d={d}
              className="corda-toque"
              onPointerDown={(e) => {
                e.stopPropagation()
                selecionar({ tipo: 'corda', id: c.id })
              }}
            />
            <circle cx={p1.x} cy={p1.y} r={3.5} className="corda-ponta" />
            <circle cx={p2.x} cy={p2.y} r={3.5} className="corda-ponta" />
          </g>
        )
      })}
      {provisoria && (
        <path
          className="corda-linha provisoria"
          d={curvaEntre(provisoria.de, { ...provisoria.de, x: provisoria.ate.x, y: provisoria.ate.y, largura: 0, altura: 0 })}
        />
      )}
    </svg>
  )
})

/**
 * Por cima de tudo: a caixa em volta da seleção (com mais de um item) e, quando só parte de um grupo está
 * selecionada (você "entrou" no grupo), o contorno pontilhado do grupo inteiro.
 */
export function CamadaSelecao({ plano, selecao }: { plano: Plano; selecao: Selecao }) {
  const folga = 8 / plano.camera.zoom
  const caixas: Caixa[] = []
  const grupos = new Map<string, { caixas: Caixa[]; todos: boolean; algum: boolean }>()
  const anotar = (grupo: string | undefined, caixa: Caixa, marcado: boolean): void => {
    if (!grupo) return
    const g = grupos.get(grupo) ?? { caixas: [], todos: true, algum: false }
    g.caixas.push(caixa)
    g.todos &&= marcado
    g.algum ||= marcado
    grupos.set(grupo, g)
  }
  for (const n of plano.nos) {
    const marcado = selecao.nos.includes(n.id)
    if (marcado) caixas.push(caixaDoNo(n))
    anotar(n.grupo, caixaDoNo(n), marcado)
  }
  for (const d of plano.desenhos) {
    const marcado = selecao.desenhos.includes(d.id)
    if (marcado) caixas.push(caixaDoDesenho(d))
    anotar(d.grupo, caixaDoDesenho(d), marcado)
  }
  const tudo = caixas.length > 1 ? uniao(caixas) : null
  const tocados = [...grupos.values()].filter((g) => g.algum && !g.todos && g.caixas.length > 1)
  const ret = (c: Caixa, f: number) => ({ x: c.x - f, y: c.y - f, width: c.largura + f * 2, height: c.altura + f * 2 })
  if (!tudo && !tocados.length) return null
  return (
    <svg className="camada-svg camada-selecao">
      {tocados.map((g, i) => (
        <rect key={i} {...ret(uniao(g.caixas)!, folga * 1.6)} rx={10 / plano.camera.zoom} className="contorno-grupo" />
      ))}
      {tudo && <rect {...ret(tudo, folga)} rx={8 / plano.camera.zoom} className="contorno-conjunto" />}
    </svg>
  )
}

/** Linhas-guia de alinhamento enquanto arrasta. */
export function CamadaGuias() {
  const guias = usarGuias()
  if (!guias.length) return null
  return (
    <svg className="camada-svg camada-guias">
      {guias.map((g, i) =>
        g.eixo === 'x' ? (
          <line key={i} className="guia" x1={g.valor} x2={g.valor} y1={g.de} y2={g.ate} />
        ) : (
          <line key={i} className="guia" x1={g.de} x2={g.ate} y1={g.valor} y2={g.valor} />
        )
      )}
    </svg>
  )
}
