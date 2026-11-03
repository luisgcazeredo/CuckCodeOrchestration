import { memo, useState } from 'react'
import { FolderTree, RefreshCw } from 'lucide-react'
import type { NoPasta } from '../../../shared/modelo'
import { Arvore } from '../arquivos/Arvore'
import { atualizarNo } from '../estado/loja'
import { MolduraNo, type Marca } from '../quadro/MolduraNo'

function nomeDaPasta(caminho: string): string {
  return caminho.split(/[\\/]/).filter(Boolean).pop() ?? caminho
}

export const ArvorePasta = memo(function ArvorePasta({ no, selecionado }: { no: NoPasta; selecionado: Marca }) {
  const [versao, definirVersao] = useState(0)

  return (
    <MolduraNo no={no} selecionado={selecionado}>
      <div className="cartao-ferramenta">
        <header className="cartao-ferramenta-cabecalho" data-arrasta>
          <FolderTree size={13} />
          <span className="cartao-ferramenta-titulo" title={no.caminho}>
            {nomeDaPasta(no.caminho)}
          </span>
          <button className="botao-mini" title="Atualizar" onPointerDown={(e) => e.stopPropagation()} onClick={() => definirVersao((v) => v + 1)}>
            <RefreshCw size={12} />
          </button>
        </header>
        <div className="arvore rolavel">
          <Arvore
            raiz={no.caminho}
            expandidas={no.expandidas}
            versao={versao}
            // abrir e fechar pasta é vista, não conteúdo: fica fora do desfazer
            aoAlternar={(caminho) =>
              atualizarNo(
                no.id,
                { expandidas: no.expandidas.includes(caminho) ? no.expandidas.filter((p) => p !== caminho) : [...no.expandidas, caminho] },
                false
              )
            }
          />
        </div>
      </div>
    </MolduraNo>
  )
})
