import { createElement, memo, useEffect, useRef, useState, type PointerEvent } from 'react'
import { ArrowLeft, ArrowRight, ExternalLink, Globe, RotateCw } from 'lucide-react'
import type { NoPortal } from '../../../shared/modelo'
import { atualizarNo } from '../estado/loja'
import { MolduraNo } from '../quadro/MolduraNo'

/** O que o usuário digitou vira endereço: com protocolo, como está; sem, https://; com espaço, busca. */
export function normalizarEndereco(texto: string): string {
  const t = texto.trim()
  if (/^https?:\/\//i.test(t)) return t
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t) || /^localhost(:\d+)?(\/.*)?$/.test(t)) {
    return `${t.startsWith('localhost') ? 'http' : 'https'}://${t}`
  }
  return `https://www.google.com/search?q=${encodeURIComponent(t)}`
}

interface WebView extends HTMLElement {
  loadURL(url: string): Promise<void>
  goBack(): void
  goForward(): void
  reload(): void
  canGoBack(): boolean
  canGoForward(): boolean
}

/**
 * Navegador no quadro. Roda isolado (sem acesso ao app, sessão própria `persist:portal` para logins
 * ficarem salvos); o processo principal confere cada portal antes de ele abrir.
 */
export const Portal = memo(function Portal({ no, selecionado }: { no: NoPortal; selecionado: boolean }) {
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
        {!selecionado && (
          <div className="portal-escudo">
            <span>Clique para usar a página</span>
          </div>
        )}
      </div>
    </MolduraNo>
  )
})
