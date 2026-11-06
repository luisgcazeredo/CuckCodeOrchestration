import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { ChevronRight, File, Folder, FolderOpen } from 'lucide-react'
import type { EntradaPasta } from '../../../shared/modelo'
import { prepararLeitura } from '../estado/loja'

// A mesma árvore serve ao cartão de pasta do quadro e ao explorador da direita. O que muda é quem guarda as
// pastas abertas: o cartão guarda no nó (vai para o disco), o explorador guarda no estado da janela.

interface Props {
  raiz: string
  /** Caminhos completos das pastas abertas. */
  expandidas: string[]
  aoAlternar: (caminho: string) => void
  aoEscolherArquivo?: (caminho: string) => void
  aoMenu?: (evento: React.MouseEvent, item: EntradaPasta) => void
  /** Muda este número para recarregar tudo (botão de atualizar). */
  versao?: number
  /** Caminho em destaque (o arquivo que o cartão de código está mostrando, por exemplo). */
  marcado?: string
}

export function Arvore({ raiz, expandidas, aoAlternar, aoEscolherArquivo, aoMenu, versao = 0, marcado }: Props) {
  const [conteudo, definirConteudo] = useState<Record<string, EntradaPasta[] | 'erro'>>({})

  const carregar = useCallback(
    async (caminho: string) => {
      try {
        // o processo principal só lista pasta que está no quadro ou no estado salvo: grava antes de pedir
        await prepararLeitura()
        const entradas = await window.ork.dados.listarPasta(raiz, caminho)
        definirConteudo((c) => ({ ...c, [caminho]: entradas }))
      } catch {
        definirConteudo((c) => ({ ...c, [caminho]: 'erro' }))
      }
    },
    [raiz]
  )

  // recarrega na abertura e quando pedem; abrir uma pasta carrega só ela (em `alternar`)
  useEffect(() => {
    void carregar(raiz)
    expandidas.forEach((p) => void carregar(p))
  }, [carregar, versao])

  function alternar(caminho: string): void {
    const aberta = expandidas.includes(caminho)
    aoAlternar(caminho)
    if (!aberta && !conteudo[caminho]) void carregar(caminho)
  }

  function linhas(caminho: string, nivel: number): ReactElement[] {
    const itens = conteudo[caminho]
    if (itens === 'erro') {
      return [
        <div key={`${caminho}-erro`} className="arvore-aviso" style={{ paddingLeft: 10 + nivel * 14 }}>
          sem acesso
        </div>
      ]
    }
    if (!itens) return []
    return itens.flatMap((item) => {
      const aberta = item.ehPasta && expandidas.includes(item.caminho)
      const linha = (
        <div
          key={item.caminho}
          className={`arvore-linha ${marcado === item.caminho ? 'marcada' : ''}`}
          style={{ paddingLeft: 6 + nivel * 14 }}
          title={item.caminho}
          onClick={() => (item.ehPasta ? alternar(item.caminho) : aoEscolherArquivo?.(item.caminho))}
          onDoubleClick={(e) => {
            e.stopPropagation()
            if (!item.ehPasta) void window.ork.dados.abrirArquivo(item.caminho)
          }}
          onContextMenu={aoMenu ? (e) => aoMenu(e, item) : undefined}
        >
          <ChevronRight size={12} className={`arvore-seta ${item.ehPasta ? '' : 'invisivel'} ${aberta ? 'aberta' : ''}`} />
          {item.ehPasta ? (
            aberta ? (
              <FolderOpen size={14} className="arvore-pasta" />
            ) : (
              <Folder size={14} className="arvore-pasta" />
            )
          ) : (
            <File size={14} />
          )}
          <span>{item.nome}</span>
        </div>
      )
      return aberta ? [linha, ...linhas(item.caminho, nivel + 1)] : [linha]
    })
  }

  return <>{linhas(raiz, 0)}</>
}
