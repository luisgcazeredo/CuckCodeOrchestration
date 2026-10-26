import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import type { Desenho, No } from '../../../shared/modelo'
import {
  adicionarDesenho,
  adicionarNo,
  definirCamera,
  lerEstado,
  ligar,
  selecionar,
  usarLoja,
  ZOOM_MAX,
  ZOOM_MIN
} from '../estado/loja'
import { Arquivo } from '../nos/Arquivo'
import { PecaTerminal } from '../nos/PecaTerminal'
import { PostIt } from '../nos/PostIt'
import { Texto } from '../nos/Texto'
import { CamadaCordas, CamadaDesenhos, FormaDesenho } from './Camadas'
import { definirViewport, telaParaQuadro, zoomEm, type Ponto } from './geometria'

const GRADE = 24

type Gesto =
  | { tipo: 'arrastar'; ultimo: Ponto }
  | { tipo: 'desenhar'; desenho: Omit<Desenho, 'id' | 'z'> }
  | { tipo: 'ligar'; de: No; ate: Ponto }

export function Quadro() {
  const espaco = usarLoja((e) => e.espaco)!
  const notas = usarLoja((e) => e.notas)
  const selecao = usarLoja((e) => e.selecao)
  const editando = usarLoja((e) => e.editando)
  const ferramenta = usarLoja((e) => e.ferramenta)
  const estilo = usarLoja((e) => e.estiloDesenho)
  const area = useRef<HTMLDivElement>(null)
  const [gesto, setGesto] = useState<Gesto | null>(null)
  const [espacoApertado, setEspacoApertado] = useState(false)
  const { camera } = espaco

  // tamanho da área, para zoom pelos botões e mini-mapa
  useLayoutEffect(() => {
    const el = area.current!
    const medir = (): void => definirViewport(el.clientWidth, el.clientHeight)
    medir()
    const observador = new ResizeObserver(medir)
    observador.observe(el)
    return () => observador.disconnect()
  }, [])

  // roda do mouse: rola o quadro; com Ctrl (ou pinça no touchpad), zoom no ponto do mouse
  useEffect(() => {
    const el = area.current!
    function rodar(e: WheelEvent): void {
      if ((e.target as HTMLElement).closest('.postit-campo, .texto-campo')) return
      e.preventDefault()
      const cam = lerEstado().espaco!.camera
      if (e.ctrlKey || e.metaKey) {
        const caixa = el.getBoundingClientRect()
        const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, cam.zoom * Math.exp(-e.deltaY * 0.0025)))
        definirCamera(zoomEm(cam, zoom, { x: e.clientX - caixa.left, y: e.clientY - caixa.top }))
      } else {
        const fator = e.deltaMode === 1 ? 16 : 1
        definirCamera({ ...cam, x: cam.x - e.deltaX * fator, y: cam.y - e.deltaY * fator })
      }
    }
    el.addEventListener('wheel', rodar, { passive: false })
    return () => el.removeEventListener('wheel', rodar)
  }, [])

  // barra de espaço segurada: arrasta o quadro por cima de qualquer coisa
  useEffect(() => {
    const digitando = (): boolean => !!document.activeElement?.closest('input, textarea, [contenteditable]')
    const baixo = (e: KeyboardEvent): void => {
      if (e.code === 'Space' && !digitando()) {
        e.preventDefault()
        setEspacoApertado(true)
      }
    }
    const cima = (e: KeyboardEvent): void => {
      if (e.code === 'Space') setEspacoApertado(false)
    }
    window.addEventListener('keydown', baixo)
    window.addEventListener('keyup', cima)
    return () => {
      window.removeEventListener('keydown', baixo)
      window.removeEventListener('keyup', cima)
    }
  }, [])

  function pontoDaTela(e: { clientX: number; clientY: number }): Ponto {
    const caixa = area.current!.getBoundingClientRect()
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top }
  }

  function aoApertar(e: PointerEvent<HTMLDivElement>): void {
    const alvo = e.target as HTMLElement
    const tela = pontoDaTela(e)
    const noQuadro = telaParaQuadro(tela, camera)

    const porta = alvo.closest<HTMLElement>('[data-porta]')
    if (porta && e.button === 0 && !espacoApertado) {
      const de = espaco.nos.find((n) => n.id === porta.dataset.porta)
      if (de) {
        e.stopPropagation()
        area.current!.setPointerCapture(e.pointerId)
        setGesto({ tipo: 'ligar', de, ate: noQuadro })
      }
      return
    }

    const noFundo = !alvo.closest('.no, .toque, .corda-toque')
    const arrastar = e.button === 1 || espacoApertado || (e.button === 0 && noFundo && ferramenta === 'selecionar')
    if (arrastar) {
      e.preventDefault()
      area.current!.setPointerCapture(e.pointerId)
      setGesto({ tipo: 'arrastar', ultimo: tela })
      if (noFundo && e.button === 0) selecionar(null)
      return
    }
    if (e.button !== 0 || !noFundo) return

    if (ferramenta === 'postit') adicionarNo({ tipo: 'postit' }, noQuadro.x, noQuadro.y)
    else if (ferramenta === 'texto') adicionarNo({ tipo: 'texto' }, noQuadro.x, noQuadro.y)
    else if (ferramenta === 'desenho') {
      area.current!.setPointerCapture(e.pointerId)
      const ponto: [number, number] = [noQuadro.x, noQuadro.y]
      setGesto({
        tipo: 'desenhar',
        desenho: {
          ferramenta: estilo.ferramenta,
          cor: estilo.cor,
          espessura: estilo.ferramenta === 'lapis' ? 3 : 2.5,
          pontos: estilo.ferramenta === 'lapis' ? [ponto] : [ponto, ponto]
        }
      })
    }
  }

  function aoMover(e: PointerEvent<HTMLDivElement>): void {
    if (!gesto) return
    const tela = pontoDaTela(e)
    if (gesto.tipo === 'arrastar') {
      const cam = lerEstado().espaco!.camera
      definirCamera({ ...cam, x: cam.x + tela.x - gesto.ultimo.x, y: cam.y + tela.y - gesto.ultimo.y })
      setGesto({ ...gesto, ultimo: tela })
    } else if (gesto.tipo === 'desenhar') {
      const p = telaParaQuadro(tela, camera)
      const ponto: [number, number] = [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]
      const { desenho } = gesto
      if (desenho.ferramenta === 'lapis') {
        const [ux, uy] = desenho.pontos[desenho.pontos.length - 1]
        if (Math.hypot(ponto[0] - ux, ponto[1] - uy) * camera.zoom < 2) return
        setGesto({ ...gesto, desenho: { ...desenho, pontos: [...desenho.pontos, ponto] } })
      } else {
        setGesto({ ...gesto, desenho: { ...desenho, pontos: [desenho.pontos[0], ponto] } })
      }
    } else {
      setGesto({ ...gesto, ate: telaParaQuadro(tela, camera) })
    }
  }

  function aoSoltar(e: PointerEvent<HTMLDivElement>): void {
    if (gesto?.tipo === 'desenhar') {
      const [a, b] = [gesto.desenho.pontos[0], gesto.desenho.pontos[gesto.desenho.pontos.length - 1]]
      const tamanho = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (gesto.desenho.ferramenta === 'lapis' || tamanho > 4) adicionarDesenho(gesto.desenho)
    } else if (gesto?.tipo === 'ligar') {
      const sob = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-no-id]')
      if (sob?.dataset.noId) ligar(gesto.de.id, sob.dataset.noId)
    }
    setGesto(null)
  }

  const tamanhoGrade = GRADE * camera.zoom
  const cursor =
    gesto?.tipo === 'arrastar' ? 'grabbing' : espacoApertado ? 'grab' : ferramenta === 'selecionar' ? 'default' : 'crosshair'
  let indiceTerminal = 0

  return (
    <div
      ref={area}
      className="quadro"
      style={{
        backgroundSize: `${tamanhoGrade}px ${tamanhoGrade}px`,
        backgroundPosition: `${camera.x}px ${camera.y}px`,
        cursor
      }}
      onPointerDown={aoApertar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={() => setGesto(null)}
    >
      <div
        className={`mundo ${espacoApertado ? 'so-arrastar' : ''}`}
        style={
          {
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
            '--zoom': camera.zoom
          } as CSSProperties
        }
      >
        <CamadaDesenhos desenhos={espaco.desenhos} selecao={selecao} />
        <CamadaCordas
          cordas={espaco.cordas}
          nos={espaco.nos}
          selecao={selecao}
          provisoria={gesto?.tipo === 'ligar' ? { de: gesto.de, ate: gesto.ate } : null}
        />
        {espaco.nos.map((no) => {
          const marcado = selecao?.tipo === 'no' && selecao.id === no.id
          switch (no.tipo) {
            case 'terminal':
              return (
                <PecaTerminal
                  key={no.id}
                  no={no}
                  selecionado={marcado}
                  pastaDoEspaco={espaco.pasta}
                  indice={++indiceTerminal}
                />
              )
            case 'postit':
              return (
                <PostIt key={no.id} no={no} texto={notas[no.arquivo] ?? ''} selecionado={marcado} editando={editando === no.id} />
              )
            case 'texto':
              return <Texto key={no.id} no={no} selecionado={marcado} editando={editando === no.id} />
            case 'arquivo':
              return <Arquivo key={no.id} no={no} selecionado={marcado} />
          }
        })}
        {gesto?.tipo === 'desenhar' && (
          <svg className="camada-svg camada-provisoria">
            <FormaDesenho desenho={gesto.desenho} />
          </svg>
        )}
      </div>
    </div>
  )
}
