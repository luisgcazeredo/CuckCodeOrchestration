import { useEffect, useRef, useState } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import type { Tema } from '../../../shared/modelo'
import { usarLoja } from '../estado/loja'

// O corpo de um cartão de terminal: um xterm ligado ao processo, que mora no processo principal. Montar liga
// (o processo manda o retrato da tela e passa a mandar a saída); desmontar só desliga, o processo continua.
//
// Texto nítido com zoom: o quadro amplia com CSS, e o xterm desenha num canvas, que borraria. Em vez de
// redesenhar a cada zoom (o texto dançava na tela toda vez que você mexia na roda), o xterm desenha **sempre**
// com o dobro da resolução, dentro de uma caixa que desfaz essa escala: fica nítido em qualquer zoom até 200%,
// e abaixo de 100% a imagem só diminui, que é quando canvas fica melhor. Quem redesenha é o tamanho do cartão.

const FONTE = 13
/** O xterm desenha com este tanto de resolução a mais. 2 = nítido até 200% de zoom, sem redesenhar nunca. */
const QUALIDADE = 2

const TEMAS: Record<Tema, ITheme> = {
  escuro: { background: '#1A1A1E', foreground: '#E6E6E6', cursor: '#E6E6E6', cursorAccent: '#1A1A1E', selectionBackground: '#264F78' },
  claro: {
    background: '#FFFFFF',
    foreground: '#2A2A2E',
    cursor: '#2A2A2E',
    cursorAccent: '#FFFFFF',
    selectionBackground: '#ADD6FF',
    // as cores claras do padrão somem no fundo branco
    white: '#6E6E73',
    brightWhite: '#3A3A3C',
    yellow: '#A16C00',
    brightYellow: '#8A5A00'
  }
}

interface Props {
  id: string
  /** Selecionado sozinho: recebe o foco do teclado. */
  ativo: boolean
}

export function CorpoXterm({ id, ativo }: Props) {
  const caixaRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<{ terminal: Terminal; ajuste: FitAddon; ajustar: (refazerColunas: boolean) => void } | null>(null)
  const tema = usarLoja((e) => e.preferencias.tema)
  const [saiu, setSaiu] = useState<number | null>(null)

  useEffect(() => {
    const caixa = caixaRef.current!
    const area = areaRef.current!
    const terminal = new Terminal({
      fontFamily: "'Cascadia Mono', Consolas, 'DejaVu Sans Mono', monospace",
      fontSize: FONTE * QUALIDADE,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 5000,
      theme: TEMAS[tema]
    })
    const ajuste = new FitAddon()
    terminal.loadAddon(ajuste)
    terminal.open(area)
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      terminal.loadAddon(webgl)
    } catch {
      // sem WebGL (ou contextos demais na página) o xterm desenha pelo DOM: mais lento, mas funciona
    }

    // Ctrl+C copia quando há seleção (sem seleção, vai para o programa); Ctrl+V deixa o navegador colar
    terminal.attachCustomKeyEventHandler((e) => {
      if (e.type !== 'keydown' || !e.ctrlKey || e.altKey || e.metaKey) return true
      const tecla = e.key.toLowerCase()
      if (tecla === 'c' && (terminal.hasSelection() || e.shiftKey)) {
        if (terminal.hasSelection()) void navigator.clipboard.writeText(terminal.getSelection())
        terminal.clearSelection()
        return false
      }
      return tecla !== 'v'
    })

    let ligado = false
    let cancelado = false
    const fila: string[] = []
    const desligar = [
      window.ork.terminal.aoReceber(id, (dados) => (ligado ? terminal.write(dados) : fila.push(dados))),
      window.ork.terminal.aoSair(id, (codigo) => setSaiu(codigo))
    ]
    const digitado = terminal.onData((dados) => window.ork.terminal.escrever(id, dados))
    const redimensionado = terminal.onResize(({ cols, rows }) => window.ork.terminal.redimensionar(id, cols, rows))

    /**
     * Caixa do tamanho do cartão × QUALIDADE, desfeita por um scale(1/QUALIDADE). O zoom do quadro não entra
     * nesta conta: mexer na roda não mexe no xterm, só amplia o que já está desenhado.
     */
    const ajustar = (refazerColunas: boolean): void => {
      area.style.width = `${caixa.clientWidth * QUALIDADE}px`
      area.style.height = `${caixa.clientHeight * QUALIDADE}px`
      area.style.transform = `scale(${1 / QUALIDADE})`
      const proposta = ajuste.proposeDimensions()
      if (!proposta || !ligado || !refazerColunas) return
      if (proposta.cols !== terminal.cols || proposta.rows !== terminal.rows) terminal.resize(proposta.cols, proposta.rows)
    }
    termRef.current = { terminal, ajuste, ajustar }
    ajustar(false)
    // o autoteste lê o que o cartão mostra (com WebGL o texto não está no DOM)
    const doTeste = window.ork.autoteste ? (((window as unknown as { __terminais?: Record<string, Terminal> }).__terminais ??= {})) : null
    if (doTeste) doTeste[id] = terminal

    window.ork.terminal.ligar(id).then((r) => {
      if (cancelado) return
      if (!r) {
        terminal.write('\x1b[2mo processo deste terminal não está disponível\x1b[0m\r\n')
        return
      }
      // o retrato foi tirado no tamanho do processo; depois ajusta ao cartão
      terminal.resize(r.colunas, r.linhas)
      terminal.write(r.retrato)
      fila.splice(0).forEach((d) => terminal.write(d))
      ligado = true
      setSaiu(r.saiu)
      ajustar(true)
    })

    const observador = new ResizeObserver(() => termRef.current?.ajustar(true))
    observador.observe(caixa)

    return () => {
      cancelado = true
      observador.disconnect()
      desligar.forEach((f) => f())
      digitado.dispose()
      redimensionado.dispose()
      window.ork.terminal.desligar(id)
      termRef.current = null
      if (doTeste?.[id] === terminal) delete doTeste[id]
      terminal.dispose()
    }
    // o tema inicial entra pela ref; mudanças depois têm efeito próprio
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    if (termRef.current) termRef.current.terminal.options.theme = TEMAS[tema]
  }, [tema])

  // Ativo, o cartão é dono do teclado. Focar uma só vez não basta: no mesmo clique que o selecionou, o
  // navegador ainda vai entregar um mousedown que mexe no foco, então foca de novo no quadro seguinte.
  useEffect(() => {
    const terminal = termRef.current?.terminal
    if (!terminal) return
    if (!ativo) {
      terminal.blur()
      return
    }
    terminal.focus()
    const quadro = requestAnimationFrame(() => terminal.focus())
    return () => cancelAnimationFrame(quadro)
  }, [ativo])

  return (
    <div
      className="terminal-caixa"
      ref={caixaRef}
      data-escala={QUALIDADE}
      // clique na folga em volta do desenho do xterm: o teclado continua sendo do terminal
      onPointerDown={(e) => {
        if (!ativo || e.target !== e.currentTarget) return
        e.preventDefault()
        termRef.current?.terminal.focus()
      }}
    >
      <div className="terminal-xterm" ref={areaRef} />
      {saiu !== null && (
        <div className="terminal-saiu" data-sem-arrasto>
          <span>Processo encerrado (código {saiu}).</span>
          <button onClick={() => void window.ork.terminal.reiniciar(id).then(() => setSaiu(null))}>Abrir de novo</button>
        </div>
      )}
    </div>
  )
}
