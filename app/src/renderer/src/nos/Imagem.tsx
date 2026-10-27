import { memo, useState } from 'react'
import { ImageOff } from 'lucide-react'
import type { NoImagem } from '../../../shared/modelo'
import { usarLoja } from '../estado/loja'
import { MolduraNo, type Marca } from '../quadro/MolduraNo'

/** Print colado no quadro. O arquivo vem de `imagens/` do espaço pelo esquema `mp-imagem://`. */
export const Imagem = memo(function Imagem({ no, selecionado }: { no: NoImagem; selecionado: Marca }) {
  const espacoId = usarLoja((e) => e.espaco?.id)
  const [falhou, setFalhou] = useState(false)
  return (
    <MolduraNo no={no} selecionado={selecionado}>
      {falhou ? (
        <div className="imagem-sumiu">
          <ImageOff size={28} strokeWidth={1.4} />
          <span>imagem não encontrada</span>
        </div>
      ) : (
        <img className="imagem" src={`mp-imagem://${espacoId}/${no.arquivo}`} alt="" draggable={false} onError={() => setFalhou(true)} />
      )}
    </MolduraNo>
  )
})
