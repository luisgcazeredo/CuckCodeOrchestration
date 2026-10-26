import { memo } from 'react'
import type { Corda, Desenho, No } from '../../../shared/modelo'
import { selecionar, type Selecao } from '../estado/loja'
import { caixaDoDesenho, curvaEntre, pontasDaCorda, type Ponto } from './geometria'

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

export const CamadaDesenhos = memo(function CamadaDesenhos({
  desenhos,
  selecao
}: {
  desenhos: Desenho[]
  selecao: Selecao | null
}) {
  return (
    <svg className="camada-svg">
      {[...desenhos]
        .sort((a, b) => a.z - b.z)
        .map((d) => {
          const marcado = selecao?.tipo === 'desenho' && selecao.id === d.id
          const caixa = caixaDoDesenho(d)
          return (
            <g key={d.id}>
              <FormaDesenho desenho={d} />
              {/* área de clique mais larga que o traço */}
              <g
                className="toque"
                onPointerDown={(e) => {
                  e.stopPropagation()
                  selecionar({ tipo: 'desenho', id: d.id })
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
  selecao: Selecao | null
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
        const marcada = selecao?.tipo === 'corda' && selecao.id === c.id
        return (
          <g key={c.id} className={`corda ${marcada ? 'marcada' : ''}`}>
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
