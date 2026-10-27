import { useSyncExternalStore } from 'react'
import { Dialogo } from './Dialogo'

// Folha de atalhos (tecla ?). Uma lista só, para não ter de decorar nada.

let aberta = false
const ouvintes = new Set<() => void>()
const avisar = (): void => ouvintes.forEach((o) => o())

export function abrirAtalhos(): void {
  aberta = true
  avisar()
}

function fechar(): void {
  aberta = false
  avisar()
}

const SECOES: Array<[string, Array<[string, string]>]> = [
  [
    'Ferramentas',
    [
      ['V', 'Selecionar e arrastar'],
      ['N', 'Post-it'],
      ['T', 'Texto'],
      ['D', 'Desenhar'],
      ['E', 'Borracha'],
      ['Esc', 'Volta a selecionar e solta tudo']
    ]
  ],
  [
    'Seleção',
    [
      ['Shift + clique', 'Põe ou tira um item da seleção'],
      ['Shift + arrastar no vazio', 'Retângulo de seleção'],
      ['Ctrl + A', 'Seleciona tudo'],
      ['Ctrl + G', 'Agrupa (move tudo junto)'],
      ['Ctrl + Shift + G', 'Desagrupa'],
      ['Clique de novo num grupo', 'Pega só aquele item, sem desagrupar'],
      ['Ctrl + D', 'Duplica'],
      ['Setas (Shift: 10 px)', 'Empurra a seleção'],
      ['Alt ao arrastar', 'Solta o ímã das guias'],
      ['Delete', 'Apaga']
    ]
  ],
  [
    'Quadro',
    [
      ['Ctrl + Z / Ctrl + Y', 'Desfaz / refaz (cada andar tem o seu)'],
      ['Espaço + arrastar', 'Move o quadro por cima de tudo'],
      ['Roda / Ctrl + roda', 'Rola / zoom'],
      ['Ctrl + − / + / 0', 'Zoom: menos, mais, 100%'],
      ['Ctrl + 1', 'Ver tudo'],
      ['?', 'Esta folha']
    ]
  ]
]

export function Atalhos() {
  const visivel = useSyncExternalStore(
    (o) => {
      ouvintes.add(o)
      return () => ouvintes.delete(o)
    },
    () => aberta
  )
  if (!visivel) return null
  return (
    <Dialogo titulo="Atalhos do teclado" aoFechar={fechar}>
      <div className="atalhos">
        {SECOES.map(([titulo, linhas]) => (
          <section key={titulo}>
            <h4>{titulo}</h4>
            {linhas.map(([tecla, oQue]) => (
              <div key={tecla} className="atalho-linha">
                <kbd>{tecla}</kbd>
                <span>{oQue}</span>
              </div>
            ))}
          </section>
        ))}
      </div>
      <div className="dialogo-acoes">
        <button className="primario" autoFocus onClick={fechar}>
          Fechar
        </button>
      </div>
    </Dialogo>
  )
}
