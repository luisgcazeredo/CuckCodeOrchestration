import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import {
  AppWindow,
  ClipboardPaste,
  FolderTree,
  Folder,
  Globe,
  Home,
  Image,
  Keyboard,
  Layers,
  Map as IconeMapa,
  Moon,
  Paperclip,
  Plus,
  Scan,
  SquareTerminal,
  StickyNote,
  Sun,
  Type,
  type LucideIcon
} from 'lucide-react'
import type { No } from '../../../shared/modelo'
import {
  abrirEspaco,
  abrirNovaJanela,
  adicionarNo,
  alternarMiniMapa,
  definirCamera,
  definirTema,
  irParaAndar,
  lerEstado,
  planoAtual,
  selecionar,
  selecionarTudo
} from '../estado/loja'
import { centroDaTela, enquadrar, lerViewport } from '../quadro/geometria'
import { ICONE_AGENTE } from '../nos/icones'
import { abrirNovoAndar } from './acoesAndar'
import { colar } from './area'
import { abrirAtalhos } from './Atalhos'
import { enquadrarTudo } from './Controles'
import { anexarArquivoEm, arvoreEm, portalEm } from './menus'

// Ctrl+K: uma caixa de busca para achar qualquer coisa (cartão, andar, espaço) e rodar qualquer comando
// sem procurar botão.

let aberta = false
const ouvintes = new Set<() => void>()
const avisar = (): void => ouvintes.forEach((o) => o())

export function abrirPaleta(): void {
  aberta = true
  avisar()
}

function fechar(): void {
  aberta = false
  avisar()
}

interface Item {
  rotulo: string
  grupo: 'Comando' | 'Cartão' | 'Andar' | 'Espaço'
  icone: LucideIcon
  detalhe?: string
  acao: () => void
}

const normalizar = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Nome que um cartão mostra na busca. */
function nomeDoCartao(n: No, notas: Record<string, string>): string {
  switch (n.tipo) {
    case 'terminal':
      return n.nome
    case 'postit': {
      const linha = (notas[n.arquivo] ?? '').split('\n').find((l) => l.trim()) ?? ''
      return linha.replace(/^#+\s*|^\s*- (\[[ xX]\] )?/g, '').trim() || 'Post-it vazio'
    }
    case 'texto':
      return n.texto.split('\n')[0] || 'Texto'
    case 'arquivo':
      return n.nomeExibido
    case 'pasta':
      return n.caminho.split(/[\\/]/).filter(Boolean).pop() ?? n.caminho
    case 'portal':
      try {
        return new URL(n.url).host
      } catch {
        return n.url
      }
    case 'imagem':
      return 'Imagem'
  }
}

const ICONE_DO_CARTAO: Record<Exclude<No['tipo'], 'terminal'>, LucideIcon> = {
  postit: StickyNote,
  texto: Type,
  arquivo: Paperclip,
  pasta: FolderTree,
  portal: Globe,
  imagem: Image
}

/** Leva a tela até o cartão (no zoom atual, se ele couber) e o seleciona. */
function irAteCartao(no: No): void {
  const cam = planoAtual()!.camera
  const { largura, altura } = lerViewport()
  const zoom = Math.max(cam.zoom, 0.5)
  if (no.largura * zoom > largura * 0.9 || no.altura * zoom > altura * 0.9) {
    definirCamera(enquadrar({ x: no.x, y: no.y, largura: no.largura, altura: no.altura }, 60))
  } else {
    definirCamera({ zoom, x: largura / 2 - (no.x + no.largura / 2) * zoom, y: altura / 2 - (no.y + no.altura / 2) * zoom })
  }
  selecionar({ tipo: 'no', id: no.id }, { sozinho: true })
}

function montarItens(): Item[] {
  const { espaco, espacos, notas, preferencias, miniMapa, emOutrasJanelas } = lerEstado()
  const plano = planoAtual()
  if (!espaco || !plano) return []
  const centro = (): { x: number; y: number } => centroDaTela(planoAtual()!.camera)
  const criar = (rotulo: string, icone: LucideIcon, fazer: (x: number, y: number) => void): Item => ({
    rotulo,
    grupo: 'Comando',
    icone,
    acao: () => {
      const { x, y } = centro()
      fazer(x, y)
    }
  })
  return [
    ...preferencias.presets.map((p) =>
      criar(`Novo terminal: ${p.nome}`, ICONE_AGENTE[p.agente] ?? SquareTerminal, (x, y) => adicionarNo({ tipo: 'terminal', preset: p }, x, y))
    ),
    criar('Novo post-it', StickyNote, (x, y) => adicionarNo({ tipo: 'postit' }, x, y)),
    criar('Novo texto', Type, (x, y) => adicionarNo({ tipo: 'texto' }, x, y)),
    criar('Novo portal (navegador)', Globe, portalEm),
    criar('Anexar arquivo…', Paperclip, (x, y) => void anexarArquivoEm(x, y)),
    criar('Árvore de uma pasta…', FolderTree, (x, y) => void arvoreEm(x, y)),
    criar('Colar', ClipboardPaste, (x, y) => void colar({ x, y })),
    { rotulo: 'Novo andar…', grupo: 'Comando', icone: Plus, acao: abrirNovoAndar },
    { rotulo: 'Nova janela', grupo: 'Comando', icone: AppWindow, detalhe: 'Ctrl+Shift+N', acao: () => abrirNovaJanela() },
    { rotulo: 'Ver tudo', grupo: 'Comando', icone: Scan, detalhe: 'Ctrl+1', acao: enquadrarTudo },
    { rotulo: 'Selecionar tudo', grupo: 'Comando', icone: Scan, detalhe: 'Ctrl+A', acao: selecionarTudo },
    { rotulo: miniMapa ? 'Esconder mini-mapa' : 'Mostrar mini-mapa', grupo: 'Comando', icone: IconeMapa, acao: alternarMiniMapa },
    preferencias.tema === 'escuro'
      ? { rotulo: 'Tema claro', grupo: 'Comando', icone: Sun, acao: () => definirTema('claro') }
      : { rotulo: 'Tema escuro', grupo: 'Comando', icone: Moon, acao: () => definirTema('escuro') },
    { rotulo: 'Atalhos do teclado', grupo: 'Comando', icone: Keyboard, detalhe: '?', acao: abrirAtalhos },
    ...plano.nos.map(
      (n): Item => ({
        rotulo: nomeDoCartao(n, notas),
        grupo: 'Cartão',
        icone: n.tipo === 'terminal' ? (ICONE_AGENTE[n.agente] ?? SquareTerminal) : ICONE_DO_CARTAO[n.tipo],
        acao: () => irAteCartao(n)
      })
    ),
    ...(espaco.andares.length
      ? [
          { rotulo: 'Térreo', grupo: 'Andar' as const, icone: Home, acao: () => irParaAndar(null) },
          ...espaco.andares.map((a) => ({ rotulo: a.nome, grupo: 'Andar' as const, icone: Layers, detalhe: a.git?.ramo, acao: () => irParaAndar(a.id) }))
        ]
      : []),
    ...espacos
      .filter((r) => r.id !== espaco.id)
      .map(
        (r): Item => ({
          rotulo: r.nome,
          grupo: 'Espaço',
          icone: emOutrasJanelas.includes(r.id) ? AppWindow : Folder,
          detalhe: emOutrasJanelas.includes(r.id) ? 'outra janela' : undefined,
          acao: () => void abrirEspaco(r.id)
        })
      )
  ]
}

/** 0: começa com a busca; 1: contém; 2: tem todas as palavras; null: não serve. */
function nota(item: Item, busca: string): number | null {
  if (!busca) return 0
  const alvo = normalizar(`${item.rotulo} ${item.detalhe ?? ''}`)
  if (alvo.startsWith(busca)) return 0
  if (alvo.includes(busca)) return 1
  const palavras = busca.split(/\s+/).filter(Boolean)
  const comGrupo = `${alvo} ${normalizar(item.grupo)}`
  return palavras.every((p) => comGrupo.includes(p)) ? 2 : null
}

export function Paleta() {
  const visivel = useSyncExternalStore(
    (o) => {
      ouvintes.add(o)
      return () => ouvintes.delete(o)
    },
    () => aberta
  )
  if (!visivel) return null
  return <CaixaPaleta />
}

function CaixaPaleta() {
  const [busca, setBusca] = useState('')
  const [indice, setIndice] = useState(0)
  const lista = useRef<HTMLDivElement>(null)
  const itens = useMemo(montarItens, [])
  const achados = useMemo(() => {
    const b = normalizar(busca.trim())
    return itens
      .map((item, ordem) => ({ item, ordem, nota: nota(item, b) }))
      .filter((a): a is { item: Item; ordem: number; nota: number } => a.nota !== null)
      .sort((a, b) => a.nota - b.nota || a.ordem - b.ordem)
      .slice(0, 60)
      .map((a) => a.item)
  }, [itens, busca])

  useEffect(() => setIndice(0), [busca])
  useEffect(() => {
    lista.current?.querySelector('.paleta-item.ativo')?.scrollIntoView({ block: 'nearest' })
  }, [indice])

  function rodar(item: Item | undefined): void {
    if (!item) return
    fechar()
    item.acao()
  }

  return (
    <div className="dialogo-fundo paleta-fundo" onPointerDown={fechar}>
      <div className="paleta" role="dialog" aria-label="Buscar" onPointerDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          className="paleta-busca"
          placeholder="Buscar cartão, andar, espaço ou comando…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') return fechar()
            if (e.key === 'Enter') return rodar(achados[indice])
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const passo = e.key === 'ArrowDown' ? 1 : -1
              setIndice((i) => (achados.length ? (i + passo + achados.length) % achados.length : 0))
            }
          }}
        />
        <div className="paleta-lista" ref={lista}>
          {achados.length === 0 && <div className="paleta-vazio">Nada encontrado</div>}
          {achados.map((item, i) => {
            const Icone = item.icone
            return (
              <button
                key={`${item.grupo}:${item.rotulo}:${i}`}
                className={`paleta-item ${i === indice ? 'ativo' : ''}`}
                onMouseMove={() => i !== indice && setIndice(i)}
                onClick={() => rodar(item)}
              >
                <Icone size={15} />
                <span className="paleta-rotulo">{item.rotulo}</span>
                {item.detalhe && <span className="paleta-detalhe">{item.detalhe}</span>}
                <span className="paleta-grupo">{item.grupo}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
