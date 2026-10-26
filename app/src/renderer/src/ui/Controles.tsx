import { Map as IconeMapa, Minus, Moon, PanelLeft, Plus, Scan, Sun } from 'lucide-react'
import type { No } from '../../../shared/modelo'
import { alternarLateral, alternarMiniMapa, definirCamera, definirTema, planoAtual, planoDe, usarLoja } from '../estado/loja'
import { BotaoAndares, IndicadorAndar } from './Andares'
import {
  caixaDoDesenho,
  enquadrar,
  lerViewport,
  telaParaQuadro,
  uniao,
  zoomEm,
  type Caixa
} from '../quadro/geometria'

const caixaDoNo = (n: No): Caixa => ({ x: n.x, y: n.y, largura: n.largura, altura: n.altura })

function caixaDoConteudo(): Caixa | null {
  const plano = planoAtual()
  if (!plano) return null
  return uniao([...plano.nos.map(caixaDoNo), ...plano.desenhos.map(caixaDoDesenho)])
}

export function zoomPeloCentro(fator: number | 'inicial'): void {
  const cam = planoAtual()!.camera
  const { largura, altura } = lerViewport()
  const zoom = fator === 'inicial' ? 1 : cam.zoom * fator
  definirCamera(zoomEm(cam, zoom, { x: largura / 2, y: altura / 2 }))
}

export function enquadrarTudo(): void {
  const caixa = caixaDoConteudo()
  if (caixa) definirCamera(enquadrar(caixa))
}

export function BotaoLateral() {
  return (
    <div className="canto-esquerdo">
      <button className="botao-redondo" title="Mostrar ou esconder os espaços" onClick={alternarLateral}>
        <PanelLeft size={17} />
      </button>
      <IndicadorAndar />
    </div>
  )
}

export function CantoSuperior() {
  const tema = usarLoja((e) => e.preferencias.tema)
  return (
    <div className="canto-superior">
      <button className="botao-redondo" title="Ver tudo" onClick={enquadrarTudo}>
        <Scan size={16} />
      </button>
      <button
        className="botao-redondo"
        title={tema === 'escuro' ? 'Tema claro' : 'Tema escuro'}
        onClick={() => definirTema(tema === 'escuro' ? 'claro' : 'escuro')}
      >
        {tema === 'escuro' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </div>
  )
}

function MiniMapa() {
  const espaco = usarLoja((e) => (e.espaco ? planoDe(e.espaco) : null))!
  const { largura, altura } = lerViewport()
  const visivel: Caixa = (() => {
    const a = telaParaQuadro({ x: 0, y: 0 }, espaco.camera)
    return { x: a.x, y: a.y, largura: largura / espaco.camera.zoom, altura: altura / espaco.camera.zoom }
  })()
  const tudo = uniao([visivel, ...espaco.nos.map(caixaDoNo), ...espaco.desenhos.map(caixaDoDesenho)])!
  const L = 200
  const A = 130
  const escala = Math.min(L / tudo.largura, A / tudo.altura) * 0.9
  const ox = (L - tudo.largura * escala) / 2 - tudo.x * escala
  const oy = (A - tudo.altura * escala) / 2 - tudo.y * escala
  const ret = (c: Caixa) => ({ x: c.x * escala + ox, y: c.y * escala + oy, width: c.largura * escala, height: c.altura * escala })

  return (
    <svg
      className="mini-mapa"
      width={L}
      height={A}
      onPointerDown={(e) => {
        const caixa = e.currentTarget.getBoundingClientRect()
        const alvo = { x: (e.clientX - caixa.left - ox) / escala, y: (e.clientY - caixa.top - oy) / escala }
        const cam = espaco.camera
        definirCamera({ ...cam, x: largura / 2 - alvo.x * cam.zoom, y: altura / 2 - alvo.y * cam.zoom })
      }}
    >
      {espaco.nos.map((n) => (
        <rect key={n.id} {...ret(caixaDoNo(n))} rx={2} className={`mini-no mini-${n.tipo}`} />
      ))}
      <rect {...ret(visivel)} rx={3} className="mini-visivel" />
    </svg>
  )
}

export function CantoInferior() {
  const zoom = usarLoja((e) => (e.espaco ? planoDe(e.espaco).camera.zoom : 1))
  const aberto = usarLoja((e) => e.miniMapa)
  return (
    <div className="canto-inferior">
      {aberto && <MiniMapa />}
      <div className="canto-inferior-linha">
        <BotaoAndares />
        <button className={`botao-redondo ${aberto ? 'ativo' : ''}`} title="Mini-mapa" onClick={alternarMiniMapa}>
          <IconeMapa size={16} />
        </button>
        <div className="pilula zoom">
          <button title="Diminuir (Ctrl -)" onClick={() => zoomPeloCentro(1 / 1.2)}>
            <Minus size={16} />
          </button>
          <button className="zoom-valor" title="Voltar a 100% (Ctrl 0)" onClick={() => zoomPeloCentro('inicial')}>
            {Math.round(zoom * 100)}%
          </button>
          <button title="Aumentar (Ctrl +)" onClick={() => zoomPeloCentro(1.2)}>
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  )
}
