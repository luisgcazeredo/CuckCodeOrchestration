import { memo, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { AppWindow, ArrowLeft, ArrowRight, ExternalLink, Globe, RotateCw } from 'lucide-react'
import type { AvisoPortal, EntradaPortal, EstadoPortal } from '../../../shared/api'
import type { NoPortal } from '../../../shared/modelo'
import { adicionarNo, apagar, atualizarNo, lerEstado, planoDe, usarLoja } from '../estado/loja'
import { MolduraNo, type Marca } from '../quadro/MolduraNo'
import { avisar, confirmar, perguntarTexto } from '../ui/Perguntas'
import { normalizarEndereco } from './endereco'

// Portal com o Chrome do app (ver main/navegador.ts): o cartão mostra a aba em imagens e repassa mouse,
// roda e teclado para a página.

/** Janelas que uma página abriu, esperando o cartão novo montar: cartão → aba. */
const alvosPendentes = new Map<string, string>()
/** Cartões que nasceram de uma janela aberta pela página: se a página se fechar (fim do login), o cartão sai. */
const nascidosDePopup = new Set<string>()

const ehWeb = (url: string): boolean => /^https?:\/\//i.test(url)

const modificadores = (e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): number =>
  (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0)

const BOTOES = ['left', 'middle', 'right'] as const
const botaoSegurado = (botoes: number): 'none' | 'left' | 'middle' | 'right' =>
  botoes & 1 ? 'left' : botoes & 4 ? 'middle' : botoes & 2 ? 'right' : 'none'

/** Ctrl + letra que vira comando de edição na página (copiar, colar...). */
const COMANDOS: Record<string, string> = { a: 'selectAll', c: 'copy', x: 'cut', v: 'paste', z: 'undo', y: 'redo' }

/** Nitidez da imagem: acompanha o zoom do quadro em degraus (cada mudança recomeça a transmissão). */
function nitidezPara(zoom: number): number {
  const degrau = zoom > 1.4 ? 2 : zoom > 1.05 ? 1.5 : zoom < 0.45 ? 0.5 : 1
  return Math.min(3, (window.devicePixelRatio || 1) * degrau)
}

function existeNoEspaco(id: string): boolean {
  const e = lerEstado().espaco
  return !!e && [e, ...e.andares].some((p) => p.nos.some((n) => n.id === id))
}

export const PortalChrome = memo(function PortalChrome({ no, selecionado }: { no: NoPortal; selecionado: Marca }) {
  const tela = useRef<HTMLDivElement>(null)
  const imagem = useRef<HTMLImageElement>(null)
  const [estado, setEstado] = useState<EstadoPortal>({ url: no.url, titulo: '', carregando: true, voltar: false, avancar: false, naTela: false })
  const [endereco, setEndereco] = useState(no.url)
  const [fechada, setFechada] = useState<null | 'pagina' | 'chrome'>(null)
  const [erro, setErro] = useState('')
  const [tentativa, setTentativa] = useState(0)
  const [temImagem, setTemImagem] = useState(false)
  const escala = nitidezPara(usarLoja((e) => (e.espaco ? planoDe(e.espaco).camera.zoom : 1)))
  const digitandoEndereco = useRef(false)
  const pronta = useRef(false)
  // o cartão muda de lugar a cada arrasto: os avisos leem a versão mais nova por aqui
  const atual = useRef(no)
  atual.current = no

  function enviarTamanho(): void {
    const el = tela.current
    if (el && pronta.current) window.mp.portal.tamanho(no.id, el.clientWidth, el.clientHeight, escala)
  }

  // liga o cartão a uma aba do Chrome do app e ouve o que vem dela
  useEffect(() => {
    let vivo = true
    pronta.current = false
    setFechada(null)
    setErro('')
    const sair = window.mp.portal.aoAvisar(no.id, (aviso: AvisoPortal) => {
      switch (aviso.tipo) {
        case 'quadro':
          if (imagem.current) imagem.current.src = `data:image/jpeg;base64,${aviso.jpeg}`
          setTemImagem(true)
          return
        case 'estado':
          setEstado(aviso.estado)
          if (!digitandoEndereco.current) setEndereco(aviso.estado.url)
          if (ehWeb(aviso.estado.url) && aviso.estado.url !== atual.current.url) atualizarNo(no.id, { url: aviso.estado.url }, false)
          return
        case 'janelaNova': {
          const origem = atual.current
          const id = adicionarNo({ tipo: 'portal', url: aviso.url }, origem.x + origem.largura * 1.5 + 60, origem.y + origem.altura / 2)
          alvosPendentes.set(id, aviso.alvo)
          nascidosDePopup.add(id)
          return
        }
        case 'fechou':
          if (aviso.pelaPagina && nascidosDePopup.has(no.id)) {
            nascidosDePopup.delete(no.id)
            apagar({ tipo: 'no', id: no.id })
          } else setFechada(aviso.pelaPagina ? 'pagina' : 'chrome')
          return
        case 'dialogo':
          void responderDialogo(aviso.tipoDialogo, aviso.mensagem, aviso.padrao)
      }
    })
    const alvo = alvosPendentes.get(no.id)
    alvosPendentes.delete(no.id)
    window.mp.portal.abrir(no.id, atual.current.url, alvo).then(
      (ok) => {
        // o cartão foi apagado enquanto a aba abria: ela não pode ficar sobrando
        if (!vivo) return void (ok && !existeNoEspaco(no.id) && window.mp.portal.fechar(no.id))
        if (!ok) return setErro('Endereço inválido: o portal só abre páginas http e https.')
        pronta.current = true
        enviarTamanho()
      },
      (e) => vivo && setErro(String(e).replace(/^Error: (Error invoking remote method '[^']+': )?(Error: )?/, ''))
    )
    return () => {
      vivo = false
      sair()
      window.mp.portal.visivel(no.id, false)
      // o cartão saiu do espaço (apagado): a aba fecha; só trocou de andar: a aba fica esperando
      setTimeout(() => !existeNoEspaco(no.id) && window.mp.portal.fechar(no.id), 0)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [no.id, tentativa])

  async function responderDialogo(tipo: string, mensagem: string, padrao: string): Promise<void> {
    if (tipo === 'alert') {
      await avisar('A página diz', mensagem)
      return window.mp.portal.responderDialogo(no.id, true)
    }
    if (tipo === 'prompt') {
      const r = await perguntarTexto('A página pergunta', mensagem, padrao, 'OK')
      return window.mp.portal.responderDialogo(no.id, r !== null, r ?? undefined)
    }
    const r = await confirmar({
      titulo: tipo === 'beforeunload' ? 'Sair da página?' : 'A página pergunta',
      mensagem: mensagem || 'O que você preencheu pode se perder.',
      botoes: [
        { rotulo: 'Cancelar', valor: 'nao' },
        { rotulo: 'OK', valor: 'sim', primario: true }
      ]
    })
    window.mp.portal.responderDialogo(no.id, r.botao === 'sim')
  }

  // tamanho da página = tamanho do cartão (em pixels do quadro, sem o zoom); a nitidez acompanha o zoom
  useEffect(() => {
    const el = tela.current!
    let espera: ReturnType<typeof setTimeout> | undefined
    const observador = new ResizeObserver(() => {
      clearTimeout(espera)
      espera = setTimeout(enviarTamanho, 120)
    })
    observador.observe(el)
    enviarTamanho()
    return () => {
      clearTimeout(espera)
      observador.disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [no.id, escala])

  // fora da tela, a transmissão para
  useEffect(() => {
    const observador = new IntersectionObserver(([e]) => pronta.current && window.mp.portal.visivel(no.id, e.isIntersecting))
    observador.observe(tela.current!)
    return () => observador.disconnect()
  }, [no.id])

  // roda do mouse vai para a página (Ctrl + roda continua sendo o zoom do quadro)
  useEffect(() => {
    const el = tela.current!
    const rodar = (e: WheelEvent): void => {
      if (e.ctrlKey || el.closest('.no')?.querySelector('.portal-escudo')) return
      e.preventDefault()
      const p = pontoNaPagina(e)
      const fator = e.deltaMode === 1 ? 16 : 1
      window.mp.portal.entrada(no.id, { tipo: 'roda', ...p, dx: e.deltaX * fator, dy: e.deltaY * fator, modificadores: modificadores(e) })
    }
    el.addEventListener('wheel', rodar, { passive: false })
    return () => el.removeEventListener('wheel', rodar)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [no.id])

  function pontoNaPagina(e: { clientX: number; clientY: number }): { x: number; y: number } {
    const el = tela.current!
    const r = el.getBoundingClientRect()
    return {
      x: Math.round(((e.clientX - r.left) * el.clientWidth) / Math.max(r.width, 1)),
      y: Math.round(((e.clientY - r.top) * el.clientHeight) / Math.max(r.height, 1))
    }
  }

  const mouse = (evento: 'mousePressed' | 'mouseReleased' | 'mouseMoved', e: PointerEvent<HTMLDivElement>): void => {
    const entrada: EntradaPortal = {
      tipo: 'mouse',
      evento,
      ...pontoNaPagina(e),
      botao: evento === 'mouseMoved' ? botaoSegurado(e.buttons) : (BOTOES[e.button] ?? 'none'),
      botoes: e.buttons,
      cliques: evento === 'mouseMoved' ? 0 : Math.max(1, e.detail),
      modificadores: modificadores(e)
    }
    window.mp.portal.entrada(no.id, entrada)
  }

  function tecla(e: KeyboardEvent<HTMLDivElement>, solta: boolean): void {
    // a tecla é da página: nem o quadro nem o navegador do app fazem nada com ela
    e.preventDefault()
    e.stopPropagation()
    if (e.key === 'Dead' || e.key === 'Process' || e.key === 'Unidentified') return
    const ctrlSozinho = (e.ctrlKey && !e.altKey) || e.metaKey
    const texto = e.key === 'Enter' ? '\r' : e.key.length === 1 && !ctrlSozinho ? e.key : undefined
    const comando = ctrlSozinho && !solta ? COMANDOS[e.key.toLowerCase()] : undefined
    window.mp.portal.entrada(no.id, {
      tipo: 'tecla',
      evento: solta ? 'keyUp' : texto ? 'keyDown' : 'rawKeyDown',
      key: e.key,
      code: e.code,
      texto: solta ? undefined : texto,
      codigoTecla: e.keyCode,
      modificadores: modificadores(e),
      comandos: comando ? [comando] : undefined
    })
  }

  const parar = { onPointerDown: (e: PointerEvent) => e.stopPropagation() }
  const navegar = (n: Parameters<typeof window.mp.portal.navegar>[1]): void => window.mp.portal.navegar(no.id, n)

  return (
    <MolduraNo no={no} selecionado={selecionado}>
      <div className="cartao-ferramenta">
        <header className="cartao-ferramenta-cabecalho portal-barra" data-arrasta>
          <Globe size={13} className={estado.carregando ? 'girando' : ''} />
          <button className="botao-mini" title="Voltar" disabled={!estado.voltar} {...parar} onClick={() => navegar({ tipo: 'voltar' })}>
            <ArrowLeft size={13} />
          </button>
          <button className="botao-mini" title="Avançar" disabled={!estado.avancar} {...parar} onClick={() => navegar({ tipo: 'avancar' })}>
            <ArrowRight size={13} />
          </button>
          <button className="botao-mini" title="Recarregar" {...parar} onClick={() => navegar({ tipo: 'recarregar' })}>
            <RotateCw size={12} />
          </button>
          <input
            className="portal-endereco"
            value={endereco}
            spellCheck={false}
            title={estado.titulo}
            {...parar}
            onFocus={() => (digitandoEndereco.current = true)}
            onBlur={() => {
              digitandoEndereco.current = false
              setEndereco(estado.url)
            }}
            onChange={(e) => setEndereco(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              const url = normalizarEndereco(endereco)
              navegar({ tipo: 'ir', url })
              setEndereco(url)
              e.currentTarget.blur()
            }}
          />
          <button
            className={`botao-mini ${estado.naTela ? 'ativo' : ''}`}
            title={estado.naTela ? 'Trazer a página de volta para o quadro' : 'Abrir esta aba na janela do Chrome (para logar com passkey, usar extensão...)'}
            {...parar}
            onClick={() => window.mp.portal.alternarJanela(no.id)}
          >
            <AppWindow size={12} />
          </button>
          <button className="botao-mini" title="Abrir no seu navegador de sempre" {...parar} onClick={() => window.open(estado.url)}>
            <ExternalLink size={12} />
          </button>
        </header>
        <div
          ref={tela}
          className="portal-tela rolavel"
          tabIndex={0}
          data-teclado
          data-sem-arrasto
          onPointerDown={(e) => {
            if (selecionado !== 'sozinho') return
            e.currentTarget.focus({ preventScroll: true })
            e.currentTarget.setPointerCapture(e.pointerId)
            mouse('mousePressed', e)
          }}
          onPointerMove={(e) => selecionado === 'sozinho' && mouse('mouseMoved', e)}
          onPointerUp={(e) => selecionado === 'sozinho' && mouse('mouseReleased', e)}
          onContextMenu={(e) => {
            if (selecionado !== 'sozinho') return
            e.preventDefault()
            e.stopPropagation()
          }}
          onKeyDown={(e) => tecla(e, false)}
          onKeyUp={(e) => tecla(e, true)}
        >
          <img ref={imagem} className="portal-imagem" alt="" draggable={false} />
          {!temImagem && !erro && !fechada && <div className="portal-aviso">Abrindo no Chrome do app…</div>}
        </div>
        {estado.naTela && (
          <div className="portal-aviso cobrindo">
            <span>A página está na janela do Chrome.</span>
            <button {...parar} onClick={() => window.mp.portal.alternarJanela(no.id)}>
              Trazer de volta para o quadro
            </button>
          </div>
        )}
        {(fechada || erro) && (
          <div className="portal-aviso cobrindo">
            <span>{erro || (fechada === 'chrome' ? 'O Chrome do app foi fechado.' : 'A página foi fechada.')}</span>
            <button {...parar} onClick={() => setTentativa((t) => t + 1)}>
              Abrir de novo
            </button>
          </div>
        )}
        {/* sem estar selecionado sozinho, a página não pega o mouse: dá para arrastar o cartão de qualquer ponto */}
        {selecionado !== 'sozinho' && !estado.naTela && !fechada && !erro && (
          <div className="portal-escudo">
            <span>Clique para usar a página</span>
          </div>
        )}
      </div>
    </MolduraNo>
  )
})
