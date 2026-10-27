import { memo, useEffect, useLayoutEffect, useRef } from 'react'
import type { NoTexto } from '../../../shared/modelo'
import { apagar, atualizarNo, editar } from '../estado/loja'
import { MolduraNo, type Marca } from '../quadro/MolduraNo'

interface Props {
  no: NoTexto
  selecionado: Marca
  editando: boolean
}

export const Texto = memo(function Texto({ no, selecionado, editando }: Props) {
  const campo = useRef<HTMLTextAreaElement>(null)

  // foco no próximo ciclo: o clique que criou a caixa ainda está terminando
  useEffect(() => {
    if (!editando) return
    const t = setTimeout(() => campo.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [editando])

  // a caixa cresce na altura junto com o texto
  useLayoutEffect(() => {
    const el = campo.current
    if (!el) return
    // mede o texto, não a caixa: altura zero por um instante e lê quanto o conteúdo pede
    const anterior = el.style.height
    el.style.height = '0px'
    const conteudo = el.scrollHeight
    el.style.height = anterior
    const altura = Math.max(no.tamanhoFonte * 1.6, conteudo + 4)
    if (Math.abs(altura - no.altura) > 1) atualizarNo(no.id, { altura: Math.round(altura) }, false)
  }, [no.texto, no.tamanhoFonte, no.altura, no.id, editando])

  const estilo = {
    fontSize: no.tamanhoFonte,
    color: no.cor,
    fontFamily: no.mono ? "'Cascadia Mono', Consolas, monospace" : undefined
  }

  function sair(): void {
    // texto que ficou vazio não vira lixo no quadro
    if (!no.texto.trim()) apagar({ tipo: 'no', id: no.id })
    else editar(null)
  }

  return (
    <MolduraNo no={no} selecionado={selecionado} aoClicarDuasVezes={() => editar(no.id)}>
      {editando ? (
        <textarea
          ref={campo}
          autoFocus
          className="texto-campo"
          style={estilo}
          value={no.texto}
          placeholder="Digite aqui"
          spellCheck={false}
          onChange={(e) => atualizarNo(no.id, { texto: e.target.value }, `texto:${no.id}`)}
          onBlur={sair}
          onKeyDown={(e) => e.key === 'Escape' && e.currentTarget.blur()}
        />
      ) : (
        <div className="texto" style={estilo} data-arrasta>
          {no.texto}
        </div>
      )}
    </MolduraNo>
  )
})
