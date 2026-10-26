import { useEffect } from 'react'
import * as loja from './estado/loja'
import {
  apagarSelecao,
  desfazer,
  editar,
  escolherFerramenta,
  iniciar,
  refazer,
  salvarParaFechar,
  selecionar,
  usarLoja
} from './estado/loja'
import { Quadro } from './quadro/Quadro'
import { BarraFerramentas } from './ui/BarraFerramentas'
import { BarraLateral } from './ui/BarraLateral'
import { BotaoLateral, CantoInferior, CantoSuperior, enquadrarTudo, zoomPeloCentro } from './ui/Controles'

function digitando(): boolean {
  return !!document.activeElement?.closest('input, textarea, [contenteditable]')
}

function atalhos(e: KeyboardEvent): void {
  // escrevendo num post-it, texto ou campo: o teclado é do campo
  if (digitando()) return
  const ctrl = e.ctrlKey || e.metaKey
  if (ctrl && (e.key === '=' || e.key === '+')) return (e.preventDefault(), zoomPeloCentro(1.2))
  if (ctrl && e.key === '-') return (e.preventDefault(), zoomPeloCentro(1 / 1.2))
  if (ctrl && e.key === '0') return (e.preventDefault(), zoomPeloCentro('inicial'))
  if (ctrl && e.key === '1') return (e.preventDefault(), enquadrarTudo())
  if (ctrl && e.key.toLowerCase() === 'z') return (e.preventDefault(), e.shiftKey ? refazer() : desfazer())
  if (ctrl && e.key.toLowerCase() === 'y') return (e.preventDefault(), refazer())
  if (ctrl || e.altKey) return
  if (e.key === 'Delete' || e.key === 'Backspace') return apagarSelecao()
  if (e.key === 'Escape') {
    selecionar(null)
    editar(null)
    return escolherFerramenta('selecionar')
  }
  const porTecla: Record<string, loja.Ferramenta> = { v: 'selecionar', n: 'postit', t: 'texto', d: 'desenho' }
  const ferramenta = porTecla[e.key.toLowerCase()]
  if (ferramenta) escolherFerramenta(ferramenta)
}

export function App() {
  const carregado = usarLoja((e) => e.carregado)
  const temEspaco = usarLoja((e) => e.espaco !== null)
  const tema = usarLoja((e) => e.preferencias.tema)
  const lateralAberta = usarLoja((e) => e.lateralAberta)
  const ferramenta = usarLoja((e) => e.ferramenta)
  const erroAoSalvar = usarLoja((e) => e.erroAoSalvar)

  useEffect(() => {
    void iniciar()
    window.addEventListener('keydown', atalhos)
    window.mp.aoPedirFechar(salvarParaFechar)
    if (window.mp.autoteste) window.__teste = { loja }
    return () => window.removeEventListener('keydown', atalhos)
  }, [])

  return (
    <div className={`app tema-${tema} ${lateralAberta ? '' : 'sem-lateral'} ferramenta-${ferramenta}`}>
      {lateralAberta && <BarraLateral />}
      <main className="area">
        {carregado && temEspaco && <Quadro />}
        <BotaoLateral />
        <BarraFerramentas />
        <CantoSuperior />
        {temEspaco && <CantoInferior />}
        {erroAoSalvar && (
          <div className="pilula aviso-erro" title={erroAoSalvar}>
            Não consegui salvar. Tento de novo na próxima mudança.
          </div>
        )}
      </main>
    </div>
  )
}
