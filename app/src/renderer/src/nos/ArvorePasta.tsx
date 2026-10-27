import { memo, useCallback, useEffect, useState, type ReactElement } from 'react'
import { ChevronRight, File, Folder, FolderOpen, FolderTree, RefreshCw } from 'lucide-react'
import type { EntradaPasta, NoPasta } from '../../../shared/modelo'
import { atualizarNo, salvarAgora } from '../estado/loja'
import { MolduraNo, type Marca } from '../quadro/MolduraNo'

function nomeDaPasta(caminho: string): string {
  return caminho.split(/[\\/]/).filter(Boolean).pop() ?? caminho
}

export const ArvorePasta = memo(function ArvorePasta({ no, selecionado }: { no: NoPasta; selecionado: Marca }) {
  const [conteudo, setConteudo] = useState<Record<string, EntradaPasta[] | 'erro'>>({})
  const [versao, setVersao] = useState(0)

  const carregar = useCallback(
    async (caminho: string) => {
      try {
        // a árvore só lista pasta que já está salva no quadro (regra do processo principal)
        await salvarAgora()
        const entradas = await window.mp.dados.listarPasta(no.caminho, caminho)
        setConteudo((c) => ({ ...c, [caminho]: entradas }))
      } catch {
        setConteudo((c) => ({ ...c, [caminho]: 'erro' }))
      }
    },
    [no.caminho]
  )

  // recarrega só na abertura e no botão de atualizar (abrir uma pasta carrega só ela, em `alternar`)
  useEffect(() => {
    void carregar(no.caminho)
    no.expandidas.forEach((p) => void carregar(p))
  }, [carregar, versao])

  function alternar(caminho: string): void {
    const aberta = no.expandidas.includes(caminho)
    // abrir e fechar pasta é vista, não conteúdo: fica fora do desfazer
    atualizarNo(no.id, { expandidas: aberta ? no.expandidas.filter((p) => p !== caminho) : [...no.expandidas, caminho] }, false)
    if (!aberta && !conteudo[caminho]) void carregar(caminho)
  }

  function linhas(caminho: string, nivel: number): ReactElement[] {
    const itens = conteudo[caminho]
    if (itens === 'erro') return [<div key={`${caminho}-erro`} className="arvore-aviso" style={{ paddingLeft: 10 + nivel * 14 }}>sem acesso</div>]
    if (!itens) return []
    return itens.flatMap((item) => {
      const aberta = item.ehPasta && no.expandidas.includes(item.caminho)
      const linha = (
        <div
          key={item.caminho}
          className="arvore-linha"
          style={{ paddingLeft: 6 + nivel * 14 }}
          title={item.caminho}
          onClick={() => item.ehPasta && alternar(item.caminho)}
          onDoubleClick={(e) => {
            e.stopPropagation()
            if (!item.ehPasta) void window.mp.dados.abrirArquivo(item.caminho)
          }}
        >
          <ChevronRight size={12} className={`arvore-seta ${item.ehPasta ? '' : 'invisivel'} ${aberta ? 'aberta' : ''}`} />
          {item.ehPasta ? aberta ? <FolderOpen size={14} className="arvore-pasta" /> : <Folder size={14} className="arvore-pasta" /> : <File size={14} />}
          <span>{item.nome}</span>
        </div>
      )
      return aberta ? [linha, ...linhas(item.caminho, nivel + 1)] : [linha]
    })
  }

  return (
    <MolduraNo no={no} selecionado={selecionado}>
      <div className="cartao-ferramenta">
        <header className="cartao-ferramenta-cabecalho" data-arrasta>
          <FolderTree size={13} />
          <span className="cartao-ferramenta-titulo" title={no.caminho}>
            {nomeDaPasta(no.caminho)}
          </span>
          <button className="botao-mini" title="Atualizar" onPointerDown={(e) => e.stopPropagation()} onClick={() => setVersao((v) => v + 1)}>
            <RefreshCw size={12} />
          </button>
        </header>
        <div className="arvore rolavel">{linhas(no.caminho, 0)}</div>
      </div>
    </MolduraNo>
  )
})
