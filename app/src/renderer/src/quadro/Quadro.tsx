import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react'
import type { Desenho, No } from '../../../shared/modelo'
import {
  acharNo,
  adicionarDesenho,
  adicionarNo,
  apagarDesenhosPerto,
  definirCamera,
  estaSelecionado,
  ligar,
  pastaDoPlano,
  planoAtual,
  planoDe,
  lerEstado,
  quantosSelecionados,
  selecionar,
  selecionarVarios,
  usarLoja,
  ZOOM_MAX,
  ZOOM_MIN,
  type Alvo
} from '../estado/loja'
import { Arquivo } from '../nos/Arquivo'
import { Imagem } from '../nos/Imagem'
import { ArvorePasta } from '../nos/ArvorePasta'
import { PecaTerminal } from '../nos/PecaTerminal'
import { Portal } from '../nos/Portal'
import { PostIt } from '../nos/PostIt'
import { Texto } from '../nos/Texto'
import { abrirMenu } from '../ui/MenuContexto'
import { itensDaCorda, itensDaSelecao, itensDoDesenho, itensDoFundo, itensDoNo } from '../ui/menus'
import { CamadaCordas, CamadaDesenhos, CamadaGuias, CamadaSelecao, FormaDesenho } from './Camadas'
import { marcarGesto, type Marca } from './MolduraNo'
import { caixaDoDesenho, caixaDoNo, caixaEntre, definirMouse, definirViewport, seTocam, telaParaQuadro, zoomEm, type Ponto } from './geometria'

const GRADE = 24
/** Raio da borracha na tela, em px (no quadro ele é dividido pelo zoom). */
const RAIO_BORRACHA = 12

type Gesto =
  | { tipo: 'arrastar'; ultimo: Ponto }
  | { tipo: 'desenhar'; desenho: Omit<Desenho, 'id' | 'z'> }
  | { tipo: 'apagar'; chave: string }
  | { tipo: 'ligar'; de: No; ate: Ponto }
  /** Retângulo de seleção (Shift + arrastar no vazio), em pontos da tela. */
  | { tipo: 'laco'; inicio: Ponto; atual: Ponto }

export function Quadro() {
  const plano = usarLoja((e) => (e.espaco ? planoDe(e.espaco) : null))!
  const pasta = usarLoja((e) => (e.espaco ? pastaDoPlano(e.espaco) : ''))
  const notas = usarLoja((e) => e.notas)
  const selecao = usarLoja((e) => e.selecao)
  const editando = usarLoja((e) => e.editando)
  const ferramenta = usarLoja((e) => e.ferramenta)
  const estilo = usarLoja((e) => e.estiloDesenho)
  const area = useRef<HTMLDivElement>(null)
  const [gesto, setGesto] = useState<Gesto | null>(null)
  const [espacoApertado, setEspacoApertado] = useState(false)
  const [borracha, setBorracha] = useState<Ponto | null>(null)
  // post-it ou texto criado neste clique: o mousedown que vem logo depois não pode tirar o foco da caixa nova
  const criouAgora = useRef(false)
  const { camera } = plano
  const emGesto = gesto !== null || espacoApertado
  const usandoBorracha = ferramenta === 'desenho' && estilo.ferramenta === 'borracha'

  // arrastando, desenhando ou ligando: portais não podem pegar o mouse no caminho
  useEffect(() => marcarGesto(emGesto), [emGesto])

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
      const alvo = e.target as HTMLElement
      // campos e listas com rolagem própria rolam o próprio conteúdo (sem Ctrl)
      if (!e.ctrlKey && alvo.closest('.postit-campo, .texto-campo, .rolavel')) return
      e.preventDefault()
      const cam = planoAtual()!.camera
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
    // trocou de janela no meio de um gesto ou com o espaço apertado: solta tudo
    const soltarTudo = (): void => {
      setEspacoApertado(false)
      setGesto(null)
    }
    window.addEventListener('keydown', baixo)
    window.addEventListener('keyup', cima)
    window.addEventListener('blur', soltarTudo)
    // Esc no meio de um desenho, retângulo de seleção ou ligação: descarta
    window.addEventListener('mp:cancelar-gesto', soltarTudo)
    return () => {
      window.removeEventListener('keydown', baixo)
      window.removeEventListener('keyup', cima)
      window.removeEventListener('blur', soltarTudo)
      window.removeEventListener('mp:cancelar-gesto', soltarTudo)
    }
  }, [])

  function pontoDaTela(e: { clientX: number; clientY: number }): Ponto {
    const caixa = area.current!.getBoundingClientRect()
    return { x: e.clientX - caixa.left, y: e.clientY - caixa.top }
  }

  function apagarNoPonto(tela: Ponto, chave: string): void {
    const p = telaParaQuadro(tela, planoAtual()!.camera)
    apagarDesenhosPerto(p.x, p.y, RAIO_BORRACHA / planoAtual()!.camera.zoom, chave)
  }

  function aoApertar(e: PointerEvent<HTMLDivElement>): void {
    const alvo = e.target as HTMLElement
    const tela = pontoDaTela(e)
    const noQuadro = telaParaQuadro(tela, camera)

    const porta = alvo.closest<HTMLElement>('[data-porta]')
    if (porta && e.button === 0 && !espacoApertado) {
      const de = plano.nos.find((n) => n.id === porta.dataset.porta)
      if (de) {
        e.stopPropagation()
        area.current!.setPointerCapture(e.pointerId)
        setGesto({ tipo: 'ligar', de, ate: noQuadro })
      }
      return
    }

    const noFundo = !alvo.closest('.no, .toque, .corda-toque')
    if (e.button === 0 && noFundo && e.shiftKey && ferramenta === 'selecionar' && !espacoApertado) {
      e.preventDefault()
      area.current!.setPointerCapture(e.pointerId)
      setGesto({ tipo: 'laco', inicio: tela, atual: tela })
      return
    }
    const arrastar = e.button === 1 || espacoApertado || (e.button === 0 && noFundo && ferramenta === 'selecionar')
    if (arrastar) {
      e.preventDefault()
      area.current!.setPointerCapture(e.pointerId)
      setGesto({ tipo: 'arrastar', ultimo: tela })
      if (noFundo && e.button === 0) selecionar(null)
      return
    }
    if (e.button !== 0 || !noFundo) return

    if (ferramenta === 'postit' || ferramenta === 'texto') {
      criouAgora.current = true
      adicionarNo({ tipo: ferramenta }, noQuadro.x, noQuadro.y)
    } else if (ferramenta === 'desenho' && estilo.ferramenta === 'borracha') {
      area.current!.setPointerCapture(e.pointerId)
      const chave = `borracha:${crypto.randomUUID()}`
      setGesto({ tipo: 'apagar', chave })
      apagarNoPonto(tela, chave)
    } else if (ferramenta === 'desenho') {
      area.current!.setPointerCapture(e.pointerId)
      const forma = estilo.ferramenta === 'borracha' ? 'lapis' : estilo.ferramenta
      const ponto: [number, number] = [noQuadro.x, noQuadro.y]
      setGesto({
        tipo: 'desenhar',
        desenho: {
          ferramenta: forma,
          cor: estilo.cor,
          espessura: forma === 'lapis' ? 3 : 2.5,
          pontos: forma === 'lapis' ? [ponto] : [ponto, ponto]
        }
      })
    }
  }

  function aoMover(e: PointerEvent<HTMLDivElement>): void {
    const tela = pontoDaTela(e)
    definirMouse(tela)
    if (usandoBorracha) setBorracha(tela)
    if (!gesto) return
    if (gesto.tipo === 'arrastar') {
      const cam = planoAtual()!.camera
      definirCamera({ ...cam, x: cam.x + tela.x - gesto.ultimo.x, y: cam.y + tela.y - gesto.ultimo.y })
      setGesto({ ...gesto, ultimo: tela })
    } else if (gesto.tipo === 'laco') {
      setGesto({ ...gesto, atual: tela })
    } else if (gesto.tipo === 'apagar') {
      apagarNoPonto(tela, gesto.chave)
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
    } else if (gesto?.tipo === 'laco') {
      // pega o que o retângulo toca (somando à seleção, como o Shift pede)
      const caixa = caixaEntre(telaParaQuadro(gesto.inicio, camera), telaParaQuadro(gesto.atual, camera))
      if (caixa.largura * camera.zoom > 3 || caixa.altura * camera.zoom > 3) {
        selecionarVarios(
          plano.nos.filter((n) => seTocam(caixa, caixaDoNo(n))).map((n) => n.id),
          plano.desenhos.filter((d) => seTocam(caixa, caixaDoDesenho(d))).map((d) => d.id),
          true
        )
      }
    } else if (gesto?.tipo === 'ligar') {
      const sob = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-no-id]')
      if (sob?.dataset.noId) ligar(gesto.de.id, sob.dataset.noId)
    }
    setGesto(null)
  }

  /** Botão direito: o menu do que estiver embaixo do mouse (cartão, ligação, desenho ou o próprio quadro). */
  function aoMenu(e: MouseEvent<HTMLDivElement>): void {
    const alvo = e.target as HTMLElement
    if (alvo.closest('input, textarea')) return // o campo de texto tem o menu dele (copiar, colar)
    e.preventDefault()
    const noEl = alvo.closest<HTMLElement>('[data-no-id]')
    const cordaEl = alvo.closest<SVGElement>('[data-corda-id]')
    const desenhoEl = alvo.closest<SVGElement>('[data-desenho-id]')
    const menuDoItem = (item: Alvo): void => {
      // clicou fora do que estava selecionado: passa a ser ele (com o grupo)
      if (!estaSelecionado(item)) selecionar(item)
      const s = lerEstado().selecao
      if (s.nos.length + s.desenhos.length > 1) return abrirMenu(e.clientX, e.clientY, itensDaSelecao())
      if (item.tipo === 'no') {
        const no = acharNo(item.id)
        if (no) abrirMenu(e.clientX, e.clientY, itensDoNo(no))
      } else {
        const d = planoAtual()?.desenhos.find((x) => x.id === item.id)
        if (d) abrirMenu(e.clientX, e.clientY, itensDoDesenho(d))
      }
    }
    if (noEl?.dataset.noId) {
      menuDoItem({ tipo: 'no', id: noEl.dataset.noId })
    } else if (cordaEl?.dataset.cordaId) {
      selecionar({ tipo: 'corda', id: cordaEl.dataset.cordaId })
      abrirMenu(e.clientX, e.clientY, itensDaCorda(cordaEl.dataset.cordaId))
    } else if (desenhoEl?.dataset.desenhoId) {
      menuDoItem({ tipo: 'desenho', id: desenhoEl.dataset.desenhoId })
    } else {
      const p = telaParaQuadro(pontoDaTela(e), camera)
      abrirMenu(e.clientX, e.clientY, itensDoFundo(p.x, p.y))
    }
  }

  const tamanhoGrade = GRADE * camera.zoom
  const cursor =
    gesto?.tipo === 'arrastar'
      ? 'grabbing'
      : espacoApertado
        ? 'grab'
        : usandoBorracha
          ? 'none'
          : ferramenta === 'selecionar'
            ? 'default'
            : 'crosshair'
  let indiceTerminal = 0
  const sozinho = quantosSelecionados(selecao) === 1
  const marca = (id: string): Marca => (selecao.nos.includes(id) ? (sozinho ? 'sozinho' : 'junto') : false)

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
      onMouseDown={(e) => {
        if (criouAgora.current) e.preventDefault()
        criouAgora.current = false
      }}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={() => setGesto(null)}
      onLostPointerCapture={() => setGesto(null)}
      onPointerLeave={() => {
        definirMouse(null)
        setBorracha(null)
      }}
      onContextMenu={aoMenu}
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
        <CamadaDesenhos desenhos={plano.desenhos} selecao={selecao} />
        <CamadaCordas
          cordas={plano.cordas}
          nos={plano.nos}
          selecao={selecao}
          provisoria={gesto?.tipo === 'ligar' ? { de: gesto.de, ate: gesto.ate } : null}
        />
        {plano.nos.map((no) => {
          const marcado = marca(no.id)
          switch (no.tipo) {
            case 'terminal':
              return <PecaTerminal key={no.id} no={no} selecionado={marcado} pastaDoEspaco={pasta} indice={++indiceTerminal} />
            case 'postit':
              return (
                <PostIt key={no.id} no={no} texto={notas[no.arquivo] ?? ''} selecionado={marcado} editando={editando === no.id} />
              )
            case 'texto':
              return <Texto key={no.id} no={no} selecionado={marcado} editando={editando === no.id} />
            case 'arquivo':
              return <Arquivo key={no.id} no={no} selecionado={marcado} />
            case 'pasta':
              return <ArvorePasta key={no.id} no={no} selecionado={marcado} />
            case 'portal':
              return <Portal key={no.id} no={no} selecionado={marcado} />
            case 'imagem':
              return <Imagem key={no.id} no={no} selecionado={marcado} />
          }
        })}
        <CamadaSelecao plano={plano} selecao={selecao} />
        <CamadaGuias />
        {gesto?.tipo === 'desenhar' && (
          <svg className="camada-svg camada-provisoria">
            <FormaDesenho desenho={gesto.desenho} />
          </svg>
        )}
      </div>
      {gesto?.tipo === 'laco' && (
        <div
          className="laco"
          style={{
            left: Math.min(gesto.inicio.x, gesto.atual.x),
            top: Math.min(gesto.inicio.y, gesto.atual.y),
            width: Math.abs(gesto.atual.x - gesto.inicio.x),
            height: Math.abs(gesto.atual.y - gesto.inicio.y)
          }}
        />
      )}
      {usandoBorracha && borracha && (
        <div
          className="borracha-cursor"
          style={{ left: borracha.x - RAIO_BORRACHA, top: borracha.y - RAIO_BORRACHA, width: RAIO_BORRACHA * 2, height: RAIO_BORRACHA * 2 }}
        />
      )}
    </div>
  )
}
