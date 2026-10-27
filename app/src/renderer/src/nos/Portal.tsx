import { createElement, memo, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, Globe, RotateCw } from 'lucide-react'
import type { NoPortal } from '../../../shared/modelo'
import { atualizarNo } from '../estado/loja'
import { normalizarEndereco } from './endereco'
import { PortalChrome } from './PortalChrome'
import { MolduraNo, type Marca } from '../quadro/MolduraNo'

interface WebView extends HTMLElement {
  loadURL(url: string): Promise<void>
  goBack(): void
  goForward(): void
  reload(): void
  canGoBack(): boolean
  canGoForward(): boolean
}

/**
 * Navegador embutido (reserva para quando o PC não tem Chrome nem Edge). Roda isolado (sem acesso ao app,
 * sessão própria `persist:portal` para logins ficarem salvos); o processo principal confere cada portal.
 */
const PortalEmbutido = memo(function PortalEmbutido({ no, selecionado }: { no: NoPortal; selecionado: Marca }) {
  const visor = useRef<WebView>(null)
  const [endereco, setEndereco] = useState(no.url)
  const [srcInicial] = useState(no.url)
  const [carregando, setCarregando] = useState(true)
  const [navegacao, setNavegacao] = useState({ voltar: false, avancar: false })

  useEffect(() => {
    const v = visor.current!
    const aoNavegar = (e: Event): void => {
      const url = (e as Event & { url: string }).url
      if (!/^https?:\/\//.test(url)) return
      setEndereco(url)
      setNavegacao({ voltar: v.canGoBack(), avancar: v.canGoForward() })
      atualizarNo(no.id, { url }, false)
    }
    const inicio = (): void => setCarregando(true)
    const fim = (): void => setCarregando(false)
    v.addEventListener('did-navigate', aoNavegar)
    v.addEventListener('did-navigate-in-page', aoNavegar)
    v.addEventListener('did-start-loading', inicio)
    v.addEventListener('did-stop-loading', fim)
    return () => {
      v.removeEventListener('did-navigate', aoNavegar)
      v.removeEventListener('did-navigate-in-page', aoNavegar)
      v.removeEventListener('did-start-loading', inicio)
      v.removeEventListener('did-stop-loading', fim)
    }
  }, [no.id])

  const parar = { onPointerDown: (e: PointerEvent) => e.stopPropagation() }

  return (
    <MolduraNo no={no} selecionado={selecionado}>
      <div className="cartao-ferramenta">
        <header className="cartao-ferramenta-cabecalho portal-barra" data-arrasta>
          <Globe size={13} className={carregando ? 'girando' : ''} />
          <button className="botao-mini" title="Voltar" disabled={!navegacao.voltar} {...parar} onClick={() => visor.current?.goBack()}>
            <ArrowLeft size={13} />
          </button>
          <button className="botao-mini" title="Avançar" disabled={!navegacao.avancar} {...parar} onClick={() => visor.current?.goForward()}>
            <ArrowRight size={13} />
          </button>
          <button className="botao-mini" title="Recarregar" {...parar} onClick={() => visor.current?.reload()}>
            <RotateCw size={12} />
          </button>
          <input
            className="portal-endereco"
            value={endereco}
            spellCheck={false}
            {...parar}
            onChange={(e) => setEndereco(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return
              const url = normalizarEndereco(endereco)
              setEndereco(url)
              void visor.current?.loadURL(url).catch(() => undefined)
              e.currentTarget.blur()
            }}
          />
          <button
            className="botao-mini"
            title="Abrir no navegador do sistema"
            {...parar}
            onClick={() => window.open(endereco)}
          >
            <ExternalLink size={12} />
          </button>
        </header>
        {createElement('webview', {
          ref: visor,
          className: 'portal-visor',
          src: srcInicial,
          // sem `allowpopups`: janelas novas do site são negadas pelo processo principal
          partition: 'persist:portal'
        })}
        {/* sem estar selecionado, a página não pega o mouse: dá para arrastar o cartão de qualquer ponto */}
        {selecionado !== 'sozinho' && (
          <div className="portal-escudo">
            <span>Clique para usar a página</span>
          </div>
        )}
      </div>
    </MolduraNo>
  )
})

// ---------- qual portal usar ----------

let temChrome: boolean | null = null
const ouvintesChrome = new Set<() => void>()
void window.mp.portal.disponivel().then((sim) => {
  temChrome = sim
  ouvintesChrome.forEach((o) => o())
})

/** Navegador no quadro: o Chrome do app quando há Chrome no PC; senão, o embutido. */
export const Portal = memo(function Portal({ no, selecionado }: { no: NoPortal; selecionado: Marca }) {
  const chrome = useSyncExternalStore(
    (o) => {
      ouvintesChrome.add(o)
      return () => ouvintesChrome.delete(o)
    },
    () => temChrome
  )
  if (chrome === null) return <MolduraNo no={no} selecionado={selecionado}><div className="cartao-ferramenta" /></MolduraNo>
  return chrome ? <PortalChrome no={no} selecionado={selecionado} /> : <PortalEmbutido no={no} selecionado={selecionado} />
})
