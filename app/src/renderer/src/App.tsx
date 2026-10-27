import { useEffect } from 'react'
import * as loja from './estado/loja'
import {
  agrupar,
  apagarSelecao,
  definirEstiloDesenho,
  desagrupar,
  desfazer,
  duplicarSelecao,
  editar,
  empurrarSelecao,
  escolherFerramenta,
  iniciar,
  refazer,
  salvarParaFechar,
  selecionar,
  selecionarTudo,
  usarLoja
} from './estado/loja'
import { Quadro } from './quadro/Quadro'
import { DialogoNovoAndar, VistaAndares } from './ui/Andares'
import { abrirAtalhos, Atalhos } from './ui/Atalhos'
import { BarraSelecao } from './ui/BarraSelecao'
import { BarraFerramentas } from './ui/BarraFerramentas'
import { BarraLateral } from './ui/BarraLateral'
import { BotaoLateral, CantoInferior, CantoSuperior, enquadrarTudo, zoomPeloCentro } from './ui/Controles'
import { MenuContexto, menuAberto } from './ui/MenuContexto'
import { Perguntas } from './ui/Perguntas'

function digitando(): boolean {
  return !!document.activeElement?.closest('input, textarea, [contenteditable]')
}

function atalhos(e: KeyboardEvent): void {
  // escrevendo num post-it, texto ou campo, com um menu ou uma janela de confirmação aberta: o teclado é deles
  if (digitando() || menuAberto() || document.querySelector('.dialogo-fundo')) return
  const ctrl = e.ctrlKey || e.metaKey
  const tecla = e.key.toLowerCase()
  if (ctrl && (e.key === '=' || e.key === '+')) return (e.preventDefault(), zoomPeloCentro(1.2))
  if (ctrl && e.key === '-') return (e.preventDefault(), zoomPeloCentro(1 / 1.2))
  if (ctrl && e.key === '0') return (e.preventDefault(), zoomPeloCentro('inicial'))
  if (ctrl && e.key === '1') return (e.preventDefault(), enquadrarTudo())
  if (ctrl && tecla === 'z') return (e.preventDefault(), e.shiftKey ? refazer() : desfazer())
  if (ctrl && tecla === 'y') return (e.preventDefault(), refazer())
  if (ctrl && tecla === 'd') return (e.preventDefault(), duplicarSelecao())
  if (ctrl && tecla === 'a') return (e.preventDefault(), selecionarTudo())
  if (ctrl && tecla === 'g') return (e.preventDefault(), e.shiftKey ? desagrupar() : agrupar())
  if (ctrl || e.altKey) return
  const seta: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }
  if (seta[e.key]) {
    e.preventDefault()
    const passo = e.shiftKey ? 10 : 1
    return empurrarSelecao(seta[e.key][0] * passo, seta[e.key][1] * passo)
  }
  if (e.key === '?') return abrirAtalhos()
  if (e.key === 'Delete' || e.key === 'Backspace') return apagarSelecao()
  if (e.key === 'Escape') {
    selecionar(null)
    editar(null)
    loja.abrirVistaAndares(false)
    return escolherFerramenta('selecionar')
  }
  if (tecla === 'e') return definirEstiloDesenho({ ferramenta: 'borracha' })
  const porTecla: Record<string, loja.Ferramenta> = { v: 'selecionar', n: 'postit', t: 'texto', d: 'desenho' }
  const ferramenta = porTecla[tecla]
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
        {temEspaco && <VistaAndares />}
        <BotaoLateral />
        <BarraFerramentas />
        <CantoSuperior />
        {temEspaco && <CantoInferior />}
        {carregado && temEspaco && <BarraSelecao />}
        {erroAoSalvar && (
          <div className="pilula aviso-erro" title={erroAoSalvar}>
            Não consegui salvar. Tento de novo na próxima mudança.
          </div>
        )}
      </main>
      <MenuContexto />
      <DialogoNovoAndar />
      <Perguntas />
      <Atalhos />
    </div>
  )
}
