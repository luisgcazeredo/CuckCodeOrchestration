import { useEffect, useRef, useState } from 'react'
import { Terminal, type ITheme } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import type { Tema } from '../../../shared/modelo'
import { planoDe, usarLoja } from '../estado/loja'

// O corpo de um cartão de terminal: um xterm ligado ao processo, que mora no processo principal. Montar liga
// (o processo manda o retrato da tela e passa a mandar a saída); desmontar só desliga, o processo continua.
//
// Texto nítido com zoom: o quadro amplia com CSS, e o xterm desenha num canvas, que borraria. Quando o zoom para,
// o xterm é redesenhado no tamanho real (fonte × zoom) dentro de uma caixa que desfaz a escala do quadro; durante
// o gesto, fica a imagem ampliada. As colunas e linhas não mudam com o zoom (o agente não redesenha a tela).

const FONTE = 13
const ESCALA_MIN = 0.5
const ESCALA_MAX = 2

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

const escalaPara = (zoom: number): number => Math.round(Math.min(ESCALA_MAX, Math.max(ESCALA_MIN, zoom)) * 100) / 100

interface Props {
  id: string
  /** Selecionado sozinho: recebe o foco do teclado. */
  ativo: boolean
}

export function CorpoXterm({ id, ativo }: Props) {
  const caixaRef = useRef<HTMLDivElement>(null)
  const areaRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<{ terminal: Terminal; ajuste: FitAddon; ajustar: (refazerColunas: boolean) => void } | null>(null)
  const zoom = usarLoja((e) => (e.espaco ? planoDe(e.espaco).camera.zoom : 1))
  const tema = usarLoja((e) => e.preferencias.tema)
  const [escala, setEscala] = useState(() => escalaPara(zoom))
  const escalaRef = useRef(escala)
  const [saiu, setSaiu] = useState<number | null>(null)

  // o zoom parou: redesenha no tamanho real
  useEffect(() => {
    const t = setTimeout(() => setEscala(escalaPara(zoom)), 180)
    return () => clearTimeout(t)
  }, [zoom])

  useEffect(() => {
    const caixa = caixaRef.current!
    const area = areaRef.current!
    const terminal = new Terminal({
      fontFamily: "'Cascadia Mono', Consolas, 'DejaVu Sans Mono', monospace",
      fontSize: FONTE * escalaRef.current,
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
      window.mp.terminal.aoReceber(id, (dados) => (ligado ? terminal.write(dados) : fila.push(dados))),
      window.mp.terminal.aoSair(id, (codigo) => setSaiu(codigo))
    ]
    const digitado = terminal.onData((dados) => window.mp.terminal.escrever(id, dados))
    const redimensionado = terminal.onResize(({ cols, rows }) => window.mp.terminal.redimensionar(id, cols, rows))

    /**
     * Caixa do tamanho do cartão × escala, desfeita por um scale(1/escala): na tela, 1 pixel do canvas = 1 pixel.
     * `refazerColunas`: o cartão mudou de tamanho (colunas e linhas novas); senão (só o zoom), mantém as que tem.
     */
    const ajustar = (refazerColunas: boolean): void => {
      const e = escalaRef.current
      area.style.width = `${caixa.clientWidth * e}px`
      area.style.height = `${caixa.clientHeight * e}px`
      area.style.transform = `scale(${1 / e})`
      if (terminal.options.fontSize !== FONTE * e) terminal.options.fontSize = FONTE * e
      const proposta = ajuste.proposeDimensions()
      if (!proposta || !ligado) return
      if (refazerColunas) {
        if (proposta.cols !== terminal.cols || proposta.rows !== terminal.rows) terminal.resize(proposta.cols, proposta.rows)
        return
      }
      // só o zoom: o arredondamento da fonte pode não caber; diminui um fio antes de mudar colunas e linhas
      for (let fonte = FONTE * e, i = 0; i < 6; i++) {
        const p = ajuste.proposeDimensions()
        if (!p || (p.cols >= terminal.cols && p.rows >= terminal.rows)) return
        fonte *= 0.98
        terminal.options.fontSize = fonte
      }
      const p = ajuste.proposeDimensions()
      if (p) terminal.resize(p.cols, p.rows)
    }
    termRef.current = { terminal, ajuste, ajustar }
    ajustar(false)
    // o autoteste lê o que o cartão mostra (com WebGL o texto não está no DOM)
    const doTeste = window.mp.autoteste ? (((window as unknown as { __terminais?: Record<string, Terminal> }).__terminais ??= {})) : null
    if (doTeste) doTeste[id] = terminal

    window.mp.terminal.ligar(id).then((r) => {
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
      window.mp.terminal.desligar(id)
      termRef.current = null
      if (doTeste?.[id] === terminal) delete doTeste[id]
      terminal.dispose()
    }
    // o tema e a escala iniciais entram pelas refs; mudanças depois têm efeitos próprios
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    escalaRef.current = escala
    termRef.current?.ajustar(false)
  }, [escala])

  useEffect(() => {
    if (termRef.current) termRef.current.terminal.options.theme = TEMAS[tema]
  }, [tema])

  useEffect(() => {
    if (ativo) termRef.current?.terminal.focus()
    else termRef.current?.terminal.blur()
  }, [ativo])

  return (
    <div className="terminal-caixa" ref={caixaRef} data-escala={escala}>
      <div className="terminal-xterm" ref={areaRef} />
      {saiu !== null && (
        <div className="terminal-saiu" data-sem-arrasto>
          <span>Processo encerrado (código {saiu}).</span>
          <button onClick={() => void window.mp.terminal.reiniciar(id).then(() => setSaiu(null))}>Abrir de novo</button>
        </div>
      )}
    </div>
  )
}
