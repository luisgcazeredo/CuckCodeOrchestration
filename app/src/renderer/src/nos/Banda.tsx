import { memo } from 'react'
import { Users } from 'lucide-react'
import type { NoBanda } from '../../../shared/modelo'
import { MolduraNo, type Marca } from '../quadro/MolduraNo'

/**
 * Banda: a moldura de um grupo de agentes. Quem está dentro dela fala com todos os outros de dentro, e a
 * corda desenhada na banda vale para cada um deles.
 *
 * O miolo da moldura não pega o mouse (é CSS): clicar no meio dela é clicar no quadro, e o laço de seleção
 * continua funcionando por cima do time. Quem pega são a barra do nome (arrasta a banda e o time junto), a
 * borda e a porta da corda. A conta de agentes vem de fora, calculada pelo quadro — a moldura não guarda
 * lista de membros, quem está dentro é quem está dentro.
 */
export const Banda = memo(function Banda({ no, selecionado, membros }: { no: NoBanda; selecionado: Marca; membros: number }) {
  return (
    <MolduraNo no={no} selecionado={selecionado}>
      <div className="banda-titulo">
        <Users size={13} />
        <span className="banda-nome">{no.nome}</span>
        <span className="banda-conta">
          {membros ? `${membros} ${membros === 1 ? 'agente' : 'agentes'} · todos se falam` : 'vazia: arraste agentes para dentro'}
        </span>
      </div>
      <span className="porta porta-banda" data-porta={no.id} title="Arraste até um agente para ligar a banda inteira a ele" />
    </MolduraNo>
  )
})
