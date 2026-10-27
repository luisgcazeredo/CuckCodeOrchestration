import type { MouseEvent } from 'react'
import { Copy, Ellipsis, Group, Lock, Paintbrush, Trash2, Ungroup, Unlock } from 'lucide-react'
import {
  agrupar,
  alternarTravaSelecao,
  apagarSelecao,
  desagrupar,
  duplicarSelecao,
  infoDaSelecao,
  planoDe,
  tirarDoGrupo,
  usarLoja
} from '../estado/loja'
import { caixaDoDesenho, caixaDoNo, lerViewport, uniao } from '../quadro/geometria'
import { abrirMenu, type ItemMenu } from './MenuContexto'
import { itensDaSelecao, itensDoDesenho, itensDoNo, linhaDeCoresDaSelecao } from './menus'

function menuNoBotao(e: MouseEvent<HTMLButtonElement>, itens: ItemMenu[]): void {
  const r = e.currentTarget.getBoundingClientRect()
  abrirMenu(r.left, r.bottom + 6, itens)
}

/** Barrinha flutuante em cima do que está selecionado: cor, duplicar, agrupar, travar, apagar e o resto do menu. */
export function BarraSelecao() {
  const selecao = usarLoja((e) => e.selecao)
  const plano = usarLoja((e) => (e.espaco ? planoDe(e.espaco) : null))
  const editando = usarLoja((e) => e.editando)
  const ferramenta = usarLoja((e) => e.ferramenta)
  const vista = usarLoja((e) => e.vistaAndares)
  if (!plano || editando || ferramenta !== 'selecionar' || vista) return null
  if (!selecao.nos.length && !selecao.desenhos.length) return null
  const info = infoDaSelecao()
  const caixa = uniao([...info.nos.map(caixaDoNo), ...info.desenhos.map(caixaDoDesenho)])
  if (!caixa) return null

  // posição na tela: centrada em cima da seleção; sem espaço em cima, embaixo; sem espaço nenhum, no topo
  const { camera: cam } = plano
  const { largura, altura } = lerViewport()
  const topo = cam.y + caixa.y * cam.zoom
  const base = topo + caixa.altura * cam.zoom
  const centro = Math.min(largura - 170, Math.max(170, cam.x + (caixa.x + caixa.largura / 2) * cam.zoom))
  const y = topo - 58 >= 64 ? topo - 58 : base + 16 <= altura - 110 ? base + 16 : 64
  const unico = info.itens === 1
  const grupoDoUnico = unico && (info.nos[0]?.grupo ?? info.desenhos[0]?.grupo)
  const maisItens = (): ItemMenu[] =>
    !unico ? itensDaSelecao() : info.nos[0] ? itensDoNo(info.nos[0]) : itensDoDesenho(info.desenhos[0])

  return (
    <div className="pilula barra-selecao" style={{ left: centro, top: y }} onPointerDown={(e) => e.stopPropagation()}>
      <button className="ferramenta pequena" title="Cor" onClick={(e) => menuNoBotao(e, [linhaDeCoresDaSelecao()])}>
        <Paintbrush size={15} />
      </button>
      <button className="ferramenta pequena" title="Duplicar (Ctrl+D)" onClick={duplicarSelecao}>
        <Copy size={15} />
      </button>
      {!unico &&
        (info.umGrupo ? (
          <button className="ferramenta pequena" title="Desagrupar (Ctrl+Shift+G)" onClick={desagrupar}>
            <Ungroup size={15} />
          </button>
        ) : (
          <button className="ferramenta pequena" title="Agrupar (Ctrl+G)" onClick={agrupar}>
            <Group size={15} />
          </button>
        ))}
      {grupoDoUnico && (
        <button className="ferramenta pequena" title="Tirar do grupo" onClick={tirarDoGrupo}>
          <Ungroup size={15} />
        </button>
      )}
      {info.nos.length > 0 && (
        <button
          className={`ferramenta pequena ${info.travados ? 'ativa' : ''}`}
          title={info.travados ? 'Destravar' : 'Travar (não move nem apaga)'}
          onClick={alternarTravaSelecao}
        >
          {info.travados ? <Lock size={15} /> : <Unlock size={15} />}
        </button>
      )}
      <span className="divisoria" />
      <button className="ferramenta pequena perigo" title="Apagar (Delete)" onClick={apagarSelecao}>
        <Trash2 size={15} />
      </button>
      <button className="ferramenta pequena" title="Mais opções" onClick={(e) => menuNoBotao(e, maisItens())}>
        <Ellipsis size={15} />
      </button>
      {!unico && <span className="barra-selecao-conta">{info.itens}</span>}
    </div>
  )
}
