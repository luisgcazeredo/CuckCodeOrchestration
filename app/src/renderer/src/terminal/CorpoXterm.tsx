import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'

// Pronto para a etapa de integração (ainda não é montado): o corpo de um cartão de terminal ligado
// a um processo de verdade. O processo principal já aceita vários terminais por janela.
// Falta resolver na integração: texto nítido com zoom do quadro, tema claro, retomar sessão do agente.

const TEMA_ESCURO = {
  background: '#1A1A1E',
  foreground: '#E6E6E6',
  cursor: '#E6E6E6',
  selectionBackground: '#264F78'
}

interface Props {
  pasta: string
  /** Linha digitada quando o shell abre (ex.: `claude`); vazia = só o shell. */
  comando: string
  aoEncerrar?: () => void
}

export function CorpoXterm({ pasta, comando, aoEncerrar }: Props) {
  const areaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const area = areaRef.current!
    const terminal = new Terminal({
      fontFamily: "'Cascadia Mono', Consolas, 'DejaVu Sans Mono', monospace",
      fontSize: 13,
      cursorBlink: true,
      allowProposedApi: true,
      theme: TEMA_ESCURO
    })
    const ajuste = new FitAddon()
    terminal.loadAddon(ajuste)
    terminal.open(area)
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => webgl.dispose())
      terminal.loadAddon(webgl)
    } catch {
      // sem WebGL o xterm desenha pelo DOM, mais lento mas funciona
    }
    ajuste.fit()

    let id: string | null = null
    let cancelado = false
    const desligar: Array<() => void> = []

    window.mp.terminal.criar({ colunas: terminal.cols, linhas: terminal.rows, pasta }).then((novoId) => {
      if (cancelado) {
        window.mp.terminal.encerrar(novoId)
        return
      }
      id = novoId
      desligar.push(
        window.mp.terminal.aoReceber(novoId, (dados) => terminal.write(dados)),
        window.mp.terminal.aoSair(novoId, () => aoEncerrar?.())
      )
      const digitado = terminal.onData((dados) => window.mp.terminal.escrever(novoId, dados))
      const redimensionado = terminal.onResize(({ cols, rows }) => window.mp.terminal.redimensionar(novoId, cols, rows))
      desligar.push(() => digitado.dispose(), () => redimensionado.dispose())
      if (comando) window.mp.terminal.escrever(novoId, `${comando}\r`)
    })

    const observador = new ResizeObserver(() => ajuste.fit())
    observador.observe(area)

    return () => {
      cancelado = true
      observador.disconnect()
      desligar.forEach((f) => f())
      if (id) window.mp.terminal.encerrar(id)
      terminal.dispose()
    }
  }, [pasta, comando, aoEncerrar])

  return <div className="terminal-xterm" ref={areaRef} />
}
