import { memo, useEffect, useRef } from 'react'
import type { NoTexto } from '../../../shared/modelo'
import { apagarSelecao, atualizarNo, editar, selecionar } from '../estado/loja'
import { MolduraNo } from '../quadro/MolduraNo'

interface Props {
  no: NoTexto
  selecionado: boolean
  editando: boolean
}

export const Texto = memo(function Texto({ no, selecionado, editando }: Props) {
  const campo = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editando) campo.current?.focus()
  }, [editando])

  const estilo = {
    fontSize: no.tamanhoFonte,
    color: no.cor,
    fontFamily: no.mono ? "'Cascadia Mono', Consolas, monospace" : undefined
  }

  function sair(): void {
    // texto que ficou vazio não vira lixo no quadro
    if (!no.texto.trim()) {
      selecionar({ tipo: 'no', id: no.id })
      apagarSelecao()
    } else editar(null)
  }

  return (
    <MolduraNo no={no} selecionado={selecionado} aoClicarDuasVezes={() => editar(no.id)}>
      {editando ? (
        <textarea
          ref={campo}
          className="texto-campo"
          style={estilo}
          value={no.texto}
          placeholder="Texto"
          spellCheck={false}
          onChange={(e) => atualizarNo(no.id, { texto: e.target.value })}
          onBlur={sair}
          onKeyDown={(e) => e.key === 'Escape' && sair()}
        />
      ) : (
        <div className="texto" style={estilo} data-arrasta>
          {no.texto}
        </div>
      )}
    </MolduraNo>
  )
})
