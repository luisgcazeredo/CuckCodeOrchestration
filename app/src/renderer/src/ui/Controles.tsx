import { useEffect, useRef, useState } from 'react'
import { Gauge, Map as IconeMapa, Minus, Moon, PanelLeft, PanelRight, Plus, Scan, Sun } from 'lucide-react'
import type { ResumoContextoTerminal } from '../../../shared/api'
import {
  alternarExplorador,
  alternarLateral,
  alternarMiniMapa,
  definirCamera,
  definirTema,
  enquadrarNo,
  planoAtual,
  planoDe,
  usarLoja
} from '../estado/loja'
import { COR_AGENTE, ICONE_AGENTE } from '../nos/icones'
import { BotaoAndares, IndicadorAndar } from './Andares'
import {
  caixaDoDesenho,
  caixaDoNo,
  enquadrar,
  lerViewport,
  telaParaQuadro,
  uniao,
  zoomEm,
  type Caixa
} from '../quadro/geometria'

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
  const explorador = usarLoja((e) => e.explorador.aberto)
  return (
    <div className="canto-superior">
      <button
        className={`botao-redondo ${explorador ? 'ativo' : ''}`}
        title="Arquivos e pastas (Ctrl+Shift+E)"
        onClick={alternarExplorador}
      >
        <PanelRight size={16} />
      </button>
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

function PainelContexto() {
  const espacoId = usarLoja((e) => e.espaco?.id)
  const [aberto, definirAberto] = useState(false)
  const [terminais, definirTerminais] = useState<ResumoContextoTerminal[]>([])
  const caixa = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!aberto || !espacoId) return
    let vivo = true
    const atualizar = (): void => {
      void window.mp.terminal.contextos(espacoId).then((lista) => vivo && definirTerminais(lista), () => vivo && definirTerminais([]))
    }
    atualizar()
    const relogio = window.setInterval(atualizar, 5000)
    return () => {
      vivo = false
      window.clearInterval(relogio)
    }
  }, [aberto, espacoId])

  useEffect(() => {
    if (!aberto) return
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        definirAberto(false)
        e.stopPropagation()
      }
    }
    const fora = (e: PointerEvent): void => {
      if (!caixa.current?.contains(e.target as Node)) definirAberto(false)
    }
    document.addEventListener('keydown', tecla)
    document.addEventListener('pointerdown', fora)
    return () => {
      document.removeEventListener('keydown', tecla)
      document.removeEventListener('pointerdown', fora)
    }
  }, [aberto])

  return (
    <div className="contexto-caixa" ref={caixa}>
      {aberto && (
        <section className="painel-contexto" aria-label="Contexto dos terminais">
          <header>Contexto deste espaço</header>
          {terminais.length ? (
            terminais.map((terminal) => {
              const Icone = ICONE_AGENTE[terminal.agente]
              const titulo = terminal.contexto === null ? 'O cliente não mostrou um rodapé de contexto legível.' : `${terminal.contexto}% restante`
              return (
                <button className="contexto-terminal" key={terminal.id} title={titulo} onClick={() => enquadrarNo(terminal.id)}>
                  <Icone size={15} style={{ color: COR_AGENTE[terminal.agente] }} />
                  <span className="contexto-nome">{terminal.nome}</span>
                  <span className={`contexto-situacao ${terminal.situacao}`}>{terminal.situacao}</span>
                  <span className="contexto-valor">{terminal.contexto === null ? '—' : `${terminal.contexto}%`}</span>
                  <span className="contexto-barra" aria-hidden="true">
                    <span style={{ width: `${terminal.contexto ?? 0}%` }} />
                  </span>
                </button>
              )
            })
          ) : (
            <p className="contexto-vazio">Nenhum terminal neste espaço.</p>
          )}
        </section>
      )}
      <button className={`botao-redondo ${aberto ? 'ativo' : ''}`} title="Contexto dos terminais" onClick={() => definirAberto((valor) => !valor)}>
        <Gauge size={17} />
      </button>
    </div>
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
        <PainelContexto />
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
