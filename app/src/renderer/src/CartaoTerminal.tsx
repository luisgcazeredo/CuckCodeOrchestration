import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'

const TEMA_ESCURO = {
  background: '#1A1A1E',
  foreground: '#E6E6E6',
  cursor: '#E6E6E6',
  selectionBackground: '#264F78'
}

export function CartaoTerminal({ nome }: { nome: string }) {
  const areaRef = useRef<HTMLDivElement>(null)
  const [estado, setEstado] = useState<'abrindo' | 'rodando' | 'encerrado'>('abrindo')

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

    window.mp.terminal.criar({ colunas: terminal.cols, linhas: terminal.rows }).then((novoId) => {
      if (cancelado) {
        window.mp.terminal.encerrar(novoId)
        return
      }
      id = novoId
      setEstado('rodando')
      desligar.push(
        window.mp.terminal.aoReceber(novoId, (dados) => terminal.write(dados)),
        window.mp.terminal.aoSair(novoId, () => setEstado('encerrado'))
      )
      const digitado = terminal.onData((dados) => window.mp.terminal.escrever(novoId, dados))
      const redimensionado = terminal.onResize(({ cols, rows }) =>
        window.mp.terminal.redimensionar(novoId, cols, rows)
      )
      desligar.push(() => digitado.dispose(), () => redimensionado.dispose())
      terminal.focus()
    })

    const observador = new ResizeObserver(() => ajuste.fit())
    observador.observe(area)

    if (window.mp.autoteste) {
      window.__textoDoTerminal = () => {
        const buffer = terminal.buffer.active
        const linhas: string[] = []
        for (let i = 0; i < buffer.length; i++) linhas.push(buffer.getLine(i)?.translateToString(true) ?? '')
        return linhas.join('\n')
      }
    }

    return () => {
      cancelado = true
      observador.disconnect()
      desligar.forEach((f) => f())
      if (id) window.mp.terminal.encerrar(id)
      terminal.dispose()
    }
  }, [])

  return (
    <section className="cartao-terminal">
      <header className="cartao-cabecalho">
        <span className={`ponto ponto-${estado}`} />
        {nome}
      </header>
      <div className="cartao-corpo" ref={areaRef} />
      <footer className="cartao-rodape">{estado === 'encerrado' ? 'processo encerrado' : 'pasta do usuário'}</footer>
    </section>
  )
}
