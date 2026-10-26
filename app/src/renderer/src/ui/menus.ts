import {
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  ExternalLink,
  FileText,
  FolderOpen,
  FolderTree,
  GitMerge,
  Globe,
  Layers,
  Lock,
  Map as IconeMapa,
  Moon,
  Paintbrush,
  Paperclip,
  Pencil,
  Plus,
  Scan,
  SquareTerminal,
  StickyNote,
  Sun,
  Trash2,
  Type,
  Unlink,
  Unlock
} from 'lucide-react'
import type { Andar, EstadoAndar, No, NoPostIt, ResumoEspaco } from '../../../shared/modelo'
import {
  abrirEspaco,
  adicionarNo,
  alternarMiniMapa,
  alternarTrava,
  apagar,
  apagarEspaco,
  atualizarNo,
  definirCorDesenho,
  definirCorNo,
  definirStatusAndar,
  definirTema,
  duplicarNo,
  editar,
  enviarParaTras,
  irParaAndar,
  lerEstado,
  renomearAndar,
  renomearEspaco,
  trazerParaFrente
} from '../estado/loja'
import { COR_POSTIT } from '../nos/PostIt'
import { abrirNovoAndar, apagarAndarComConfirmacao, juntarAndar } from './acoesAndar'
import { enquadrarTudo } from './Controles'
import type { ItemMenu } from './MenuContexto'
import { confirmar, perguntarTexto } from './Perguntas'

export const CORES_CARTAO: Array<{ cor: string | null; nome: string }> = [
  { cor: null, nome: 'Sem cor' },
  { cor: '#007AFF', nome: 'Azul' },
  { cor: '#AF52DE', nome: 'Roxo' },
  { cor: '#FF2D55', nome: 'Rosa' },
  { cor: '#FF3B30', nome: 'Vermelho' },
  { cor: '#FF9500', nome: 'Laranja' },
  { cor: '#FFCC00', nome: 'Amarelo' },
  { cor: '#34C759', nome: 'Verde' },
  { cor: '#8E8E93', nome: 'Cinza' }
]

const NOMES_POSTIT: Record<NoPostIt['cor'], string> = {
  amarelo: 'Amarelo',
  rosa: 'Rosa',
  azul: 'Azul',
  verde: 'Verde',
  roxo: 'Roxo'
}

const separador: ItemMenu = { separador: true }

// ---------- criar coisas ----------

export async function anexarArquivoEm(x: number, y: number): Promise<void> {
  const arquivo = await window.mp.dados.escolherArquivo()
  if (arquivo) adicionarNo({ tipo: 'arquivo', caminho: arquivo.caminho, nome: arquivo.nome }, x, y)
}

export async function arvoreEm(x: number, y: number): Promise<void> {
  const pasta = await window.mp.dados.escolherPasta()
  if (pasta) adicionarNo({ tipo: 'pasta', caminho: pasta }, x, y)
}

export function portalEm(x: number, y: number): void {
  adicionarNo({ tipo: 'portal', url: 'https://www.google.com' }, x, y)
}

// ---------- fundo do quadro ----------

export function itensDoFundo(x: number, y: number): ItemMenu[] {
  const { preferencias, miniMapa, espaco } = lerEstado()
  const andares = espaco?.andares ?? []
  return [
    {
      rotulo: 'Novo terminal',
      icone: SquareTerminal,
      submenu: preferencias.presets.map((p) => ({ rotulo: p.nome, acao: () => adicionarNo({ tipo: 'terminal', preset: p }, x, y) }))
    },
    { rotulo: 'Post-it', icone: StickyNote, atalho: 'N', acao: () => adicionarNo({ tipo: 'postit' }, x, y) },
    { rotulo: 'Texto', icone: Type, atalho: 'T', acao: () => adicionarNo({ tipo: 'texto' }, x, y) },
    { rotulo: 'Anexar arquivo…', icone: Paperclip, acao: () => void anexarArquivoEm(x, y) },
    { rotulo: 'Árvore de uma pasta…', icone: FolderTree, acao: () => void arvoreEm(x, y) },
    { rotulo: 'Portal (navegador)', icone: Globe, acao: () => portalEm(x, y) },
    separador,
    {
      rotulo: 'Andares',
      icone: Layers,
      submenu: [
        { rotulo: 'Novo andar…', icone: Plus, acao: abrirNovoAndar },
        ...(andares.length ? [separador] : []),
        { rotulo: 'Térreo', marcado: !espaco?.andarAtivo, acao: () => irParaAndar(null) },
        ...andares.map((a) => ({ rotulo: a.nome, marcado: espaco?.andarAtivo === a.id, acao: () => irParaAndar(a.id) }))
      ]
    },
    separador,
    { rotulo: 'Ver tudo', icone: Scan, atalho: 'Ctrl+1', acao: enquadrarTudo },
    { rotulo: 'Mini-mapa', icone: IconeMapa, marcado: miniMapa, acao: alternarMiniMapa },
    preferencias.tema === 'escuro'
      ? { rotulo: 'Tema claro', icone: Sun, acao: () => definirTema('claro') }
      : { rotulo: 'Tema escuro', icone: Moon, acao: () => definirTema('escuro') }
  ]
}

// ---------- cartões ----------

function linhaDeCores(no: No): ItemMenu {
  if (no.tipo === 'postit') {
    return {
      cores: {
        valores: (Object.keys(COR_POSTIT) as Array<NoPostIt['cor']>).map((c) => ({ cor: c, nome: NOMES_POSTIT[c], amostra: COR_POSTIT[c] })),
        atual: no.cor,
        escolher: (c) => c && atualizarNo(no.id, { cor: c as NoPostIt['cor'] })
      }
    }
  }
  return {
    cores: {
      valores: CORES_CARTAO.map((v) => (v.cor === null && no.tipo === 'texto' ? { ...v, nome: 'Cor padrão' } : v)),
      atual: no.cor ?? null,
      escolher: (c) => definirCorNo(no.id, c ?? undefined)
    }
  }
}

export function itensDoNo(no: No): ItemMenu[] {
  const especificos: ItemMenu[] = []
  switch (no.tipo) {
    case 'terminal':
      especificos.push({
        rotulo: 'Renomear…',
        icone: Pencil,
        acao: async () => {
          const nome = await perguntarTexto('Renomear terminal', 'Nome', no.nome, 'Renomear')
          if (nome) atualizarNo(no.id, { nome })
        }
      })
      break
    case 'postit':
      especificos.push({ rotulo: 'Editar texto', icone: Pencil, acao: () => editar(no.id) })
      break
    case 'texto':
      especificos.push(
        { rotulo: 'Editar texto', icone: Pencil, acao: () => editar(no.id) },
        {
          rotulo: 'Tamanho',
          icone: Type,
          submenu: [
            ['Pequeno', 16],
            ['Médio', 24],
            ['Grande', 36],
            ['Enorme', 56]
          ].map(([rotulo, tamanho]) => ({
            rotulo: rotulo as string,
            marcado: no.tamanhoFonte === tamanho,
            acao: () => atualizarNo(no.id, { tamanhoFonte: tamanho as number })
          }))
        },
        { rotulo: 'Letra monoespaçada', marcado: no.mono, acao: () => atualizarNo(no.id, { mono: !no.mono }) }
      )
      break
    case 'arquivo':
      especificos.push(
        { rotulo: 'Abrir', icone: FileText, acao: () => void window.mp.dados.abrirArquivo(no.caminho) },
        { rotulo: 'Mostrar no Explorer', icone: FolderOpen, acao: () => void window.mp.dados.mostrarNoExplorer(no.caminho) }
      )
      break
    case 'pasta':
      especificos.push({ rotulo: 'Mostrar no Explorer', icone: FolderOpen, acao: () => void window.mp.dados.mostrarNoExplorer(no.caminho) })
      break
    case 'portal':
      especificos.push({ rotulo: 'Abrir no navegador do sistema', icone: ExternalLink, acao: () => window.open(no.url) })
      break
  }
  return [
    ...especificos,
    ...(especificos.length ? [separador] : []),
    { rotulo: 'Cor', icone: Paintbrush, submenu: [linhaDeCores(no)] },
    { rotulo: 'Duplicar', icone: Copy, atalho: 'Ctrl+D', acao: () => duplicarNo(no.id) },
    { rotulo: 'Trazer para frente', icone: ArrowUpToLine, acao: () => trazerParaFrente(no.id) },
    { rotulo: 'Enviar para trás', icone: ArrowDownToLine, acao: () => enviarParaTras(no.id) },
    no.travado
      ? { rotulo: 'Destravar', icone: Unlock, acao: () => alternarTrava(no.id) }
      : { rotulo: 'Travar (não move nem apaga)', icone: Lock, acao: () => alternarTrava(no.id) },
    separador,
    {
      rotulo: 'Apagar',
      icone: Trash2,
      atalho: 'Delete',
      perigo: true,
      desligado: no.travado,
      acao: () => apagar({ tipo: 'no', id: no.id })
    }
  ]
}

export function itensDaCorda(id: string): ItemMenu[] {
  return [{ rotulo: 'Apagar ligação', icone: Unlink, perigo: true, acao: () => apagar({ tipo: 'corda', id }) }]
}

export function itensDoDesenho(id: string, corAtual: string): ItemMenu[] {
  return [
    {
      rotulo: 'Cor',
      icone: Paintbrush,
      submenu: [
        {
          cores: {
            valores: CORES_CARTAO.filter((v) => v.cor !== null),
            atual: corAtual,
            escolher: (c) => c && definirCorDesenho(id, c)
          }
        }
      ]
    },
    separador,
    { rotulo: 'Apagar desenho', icone: Trash2, atalho: 'Delete', perigo: true, acao: () => apagar({ tipo: 'desenho', id }) }
  ]
}

// ---------- lateral: espaços e andares ----------

export function itensDoEspaco(r: ResumoEspaco): ItemMenu[] {
  const ativo = lerEstado().espaco?.id === r.id
  return [
    ...(ativo ? [] : [{ rotulo: 'Abrir', acao: () => void abrirEspaco(r.id) }]),
    {
      rotulo: 'Renomear…',
      icone: Pencil,
      acao: async () => {
        const nome = await perguntarTexto('Renomear espaço', 'Nome', r.nome, 'Renomear')
        if (nome) await renomearEspaco(r.id, nome)
      }
    },
    { rotulo: 'Mostrar pasta no Explorer', icone: FolderOpen, acao: () => void window.mp.dados.mostrarNoExplorer(r.pasta) },
    {
      rotulo: 'Novo andar…',
      icone: Layers,
      acao: async () => {
        await abrirEspaco(r.id)
        abrirNovoAndar()
      }
    },
    separador,
    {
      rotulo: 'Apagar espaço…',
      icone: Trash2,
      perigo: true,
      acao: async () => {
        const resposta = await confirmar({
          titulo: `Apagar o espaço "${r.nome}"?`,
          mensagem: `O quadro, os post-its e os andares deste espaço saem do app. A pasta do projeto (${r.pasta}) e os ramos do git não são tocados.${
            r.andares.some((a) => a.ramo) ? ' As pastas dos andares com git ficam; apague os andares antes se quiser removê-las.' : ''
          }`,
          botoes: [
            { rotulo: 'Cancelar', valor: 'cancelar', primario: true },
            { rotulo: 'Apagar espaço', valor: 'apagar', perigo: true }
          ]
        })
        if (resposta.botao === 'apagar') await apagarEspaco(r.id)
      }
    }
  ]
}

const ESTADOS: Array<[EstadoAndar, string]> = [
  ['trabalhando', 'Trabalhando'],
  ['travado', 'Travado (precisa de você)'],
  ['revisao', 'Em revisão'],
  ['pronto', 'Pronto']
]

export function itensDoAndar(andar: Andar): ItemMenu[] {
  const ativo = lerEstado().espaco?.andarAtivo === andar.id
  return [
    ...(ativo ? [] : [{ rotulo: 'Ir para este andar', icone: Layers, acao: () => irParaAndar(andar.id) }]),
    {
      rotulo: 'Renomear…',
      icone: Pencil,
      acao: async () => {
        const nome = await perguntarTexto('Renomear andar', 'Nome', andar.nome, 'Renomear')
        if (nome) renomearAndar(andar.id, nome)
      }
    },
    {
      rotulo: 'Status',
      submenu: [
        ...ESTADOS.map(([estado, rotulo]) => ({
          rotulo,
          marcado: andar.status?.estado === estado,
          acao: () => definirStatusAndar(andar.id, { texto: andar.status?.texto ?? '', estado })
        })),
        separador,
        { rotulo: 'Sem status', acao: () => definirStatusAndar(andar.id, undefined) }
      ]
    },
    ...(andar.git
      ? [{ rotulo: 'Mostrar pasta do andar no Explorer', icone: FolderOpen, acao: () => void window.mp.dados.mostrarNoExplorer(andar.git!.pasta) }]
      : []),
    separador,
    ...(andar.git ? [{ rotulo: 'Juntar ao principal…', icone: GitMerge, acao: () => void juntarAndar(andar.id) }] : []),
    { rotulo: 'Apagar andar…', icone: Trash2, perigo: true, acao: () => void apagarAndarComConfirmacao(andar.id) }
  ]
}
