import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceAround,
  AppWindow,
  ArrowDownToLine,
  ArrowUpToLine,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardPaste,
  Copy,
  FileCode,
  ExternalLink,
  FileText,
  FolderOpen,
  FolderTree,
  GitMerge,
  Globe,
  Group,
  Keyboard,
  Layers,
  Lock,
  Map as IconeMapa,
  Moon,
  Paintbrush,
  Paperclip,
  Pencil,
  Plus,
  Scan,
  Scissors,
  SquareTerminal,
  StickyNote,
  Sun,
  Trash2,
  Type,
  Ungroup,
  Unlink,
  Repeat,
  Unlock,
  Users
} from 'lucide-react'
import type { Andar, Desenho, EntradaPasta, EstadoAndar, No, NoPostIt, NoTerminal, ResumoEspaco } from '../../../shared/modelo'
import {
  abrirEspaco,
  abrirNovaJanela,
  adicionarNo,
  agrupar,
  alinhar,
  alternarCodigoSozinho,
  alternarLinhasDoCodigo,
  ARVORE_PRINCIPAL,
  arvoresDoTerminal,
  contarCodigos,
  contarCodigosSoltos,
  criarArvore,
  fecharCodigosSoltos,
  pastaEhVigiavel,
  desfazerArvore,
  juntarCodigosDoTerminal,
  renomearArvore,
  soltarCodigoDaColuna,
  usarArvore,
  fecharCodigosDoTerminal,
  recolherCodigosDoTerminal,
  alternarMiniMapa,
  alternarTravaSelecao,
  apagar,
  apagarEspaco,
  apagarSelecao,
  atualizarNo,
  definirCorDesenho,
  definirCorNo,
  definirCorSelecao,
  definirStatusAndar,
  definirTema,
  definirTomPostIts,
  desagrupar,
  distribuir,
  duplicarSelecao,
  editar,
  enviarParaTras,
  infoDaSelecao,
  irParaAndar,
  lerEstado,
  pastaDoPlano,
  renomearAndar,
  renomearEspaco,
  salvarPartitura,
  criarBandaNoQuadro,
  membrosDaBandaAtual,
  trocarAgenteDoCartao,
  selecionarTudo,
  selecionarVarios,
  tirarDoGrupo,
  trazerParaFrente
} from '../estado/loja'
import { anexarAoPrompt, anexarArquivosAoPrompt, anexarPastaAoPrompt } from './anexar'
import { abrirAtalhos } from './Atalhos'
import { colar, copiarSelecao } from './area'
import { alternarRecolhido } from '../nos/Codigo'
import { ICONE_AGENTE } from '../nos/icones'
import { COR_POSTIT } from '../nos/PostIt'
import { abrirNovoAndar, apagarAndarComConfirmacao, juntarAndar } from './acoesAndar'
import { enquadrarTudo } from './Controles'
import type { ItemMenu } from './MenuContexto'
import { avisar, confirmar, perguntarTexto } from './Perguntas'

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

/**
 * Cartão de código do lado do terminal, já no último arquivo que mexeram na pasta dele. Sem nenhum arquivo
 * ainda, ele nasce vazio e pega o primeiro que o agente gravar.
 */
export async function verCodigoDoTerminal(no: NoTerminal): Promise<void> {
  const espaco = lerEstado().espaco
  const pasta = no.pasta || (espaco ? pastaDoPlano(espaco) : '')
  const recentes = pasta ? await window.mp.codigo.recentes(pasta).catch(() => []) : []
  // adicionarNo centra no ponto; isto põe o cartão colado à direita do terminal, alinhado pelo topo
  adicionarNo({ tipo: 'codigo', terminal: no.id, caminho: recentes[0]?.caminho }, no.x + no.largura + 40 + 310, no.y + 230)
}

/**
 * O "node" do mapa mental: tudo sobre os cartões de código de um agente num lugar só. Serve ao menu do
 * cartão e ao botão no rodapé dele.
 */
/**
 * As árvores de código do agente: cada uma é um ramo com nome, e os próximos arquivos nascem na que estiver
 * em uso. É assim que ele separa frentes de trabalho ("leia os arquivos da árvore Backend").
 */
function itensDasArvores(no: NoTerminal): ItemMenu[] {
  const ativa = no.arvoreAtiva ?? ARVORE_PRINCIPAL
  const arvores = arvoresDoTerminal(no).map((arvore) => {
    const conta = contarCodigos(no.id, arvore.id)
    const principal = arvore.id === ARVORE_PRINCIPAL
    return {
      rotulo: `${arvore.nome || 'principal'} · ${conta.total}`,
      icone: FileCode,
      marcado: arvore.id === ativa,
      submenu: [
        { rotulo: 'Os próximos arquivos vêm para cá', icone: FileCode, acao: () => usarArvore(no.id, arvore.id) },
        {
          rotulo: 'Recolher os desta árvore',
          icone: ChevronsDownUp,
          desligado: !conta.total || conta.recolhidos === conta.total,
          acao: () => recolherCodigosDoTerminal(no.id, true, arvore.id)
        },
        {
          rotulo: 'Abrir os desta árvore',
          icone: ChevronsUpDown,
          desligado: !conta.recolhidos,
          acao: () => recolherCodigosDoTerminal(no.id, false, arvore.id)
        },
        separador,
        {
          rotulo: 'Renomear a árvore…',
          icone: Pencil,
          acao: async () => {
            const nome = await perguntarTexto('Renomear árvore', 'Nome', arvore.nome, 'Renomear')
            if (nome) renomearArvore(no.id, arvore.id, nome)
          }
        },
        ...(principal
          ? []
          : [
              {
                rotulo: 'Desfazer a árvore (os arquivos voltam para a principal)',
                icone: Unlink,
                acao: () => desfazerArvore(no.id, arvore.id)
              }
            ])
      ]
    }
  })
  return [
    ...arvores,
    separador,
    {
      rotulo: 'Nova árvore…',
      icone: FileCode,
      acao: async () => {
        const nome = await perguntarTexto('Nova árvore de código', 'Nome', '', 'Criar')
        if (nome) criarArvore(no.id, nome)
      }
    }
  ]
}

export function itensDoCodigoDoTerminal(no: NoTerminal): ItemMenu[] {
  const { total, recolhidos } = contarCodigos(no.id)
  const soltos = contarCodigosSoltos(no.id)
  const comLinhas = lerEstado().preferencias.linhasDoCodigo !== false
  // pasta que o app não vigia (a do usuário, a raiz de um disco): dizer o motivo, senão o cartão
  // simplesmente não nasce e parece defeito
  const espacoAtual = lerEstado().espaco
  const vigiavel = pastaEhVigiavel(no.pasta || (espacoAtual ? pastaDoPlano(espacoAtual) : ''))
  return [
    vigiavel === false
      ? {
          rotulo: 'Pasta grande demais para vigiar: aponte o agente para a pasta do projeto',
          icone: FileCode,
          desligado: true,
          acao: () => {}
        }
      : {
          rotulo: 'Abrir o código sozinho quando ele gravar',
          icone: FileCode,
          marcado: no.codigoSozinho !== false,
          acao: () => alternarCodigoSozinho(no.id)
        },
    { rotulo: 'Abrir um cartão com o último arquivo mexido', icone: FileCode, acao: () => void verCodigoDoTerminal(no) },
    { rotulo: 'Árvores', icone: FileCode, submenu: itensDasArvores(no) },
    separador,
    {
      rotulo: total ? `Recolher os ${total} em bloquinhos` : 'Recolher todos',
      icone: ChevronsDownUp,
      desligado: !total || recolhidos === total,
      acao: () => recolherCodigosDoTerminal(no.id, true)
    },
    {
      rotulo: 'Abrir todos',
      icone: ChevronsUpDown,
      desligado: !recolhidos,
      acao: () => recolherCodigosDoTerminal(no.id, false)
    },
    {
      rotulo: soltos ? `Trazer ${soltos === 1 ? 'o arquivo solto' : `os ${soltos} arquivos soltos`} de volta` : 'Juntar na coluna',
      icone: FileCode,
      desligado: !soltos,
      acao: () => juntarCodigosDoTerminal(no.id)
    },
    {
      rotulo: soltos ? `Fechar ${soltos === 1 ? 'o arquivo solto' : `os ${soltos} arquivos soltos`}` : 'Fechar os soltos',
      icone: Trash2,
      desligado: !soltos,
      acao: () => fecharCodigosSoltos(no.id)
    },
    {
      rotulo: total ? `Fechar os ${total} e parar de abrir` : 'Fechar todos e parar de abrir',
      icone: Trash2,
      perigo: true,
      desligado: !total,
      acao: () => fecharCodigosDoTerminal(no.id)
    },
    separador,
    { rotulo: 'Mostrar as linhas até os cartões', icone: Unlink, marcado: comLinhas, acao: alternarLinhasDoCodigo }
  ]
}

/** Terminais deste plano, para escolher a quem anexar ou quem o cartão de código acompanha. */
function terminaisDoPlano(): NoTerminal[] {
  const espaco = lerEstado().espaco
  if (!espaco) return []
  const plano = espaco.andarAtivo ? espaco.andares.find((a) => a.id === espaco.andarAtivo) : espaco
  return (plano?.nos ?? []).filter((n): n is NoTerminal => n.tipo === 'terminal')
}

/** Submenu "Anexar ao prompt de": um terminal só vai direto. */
function anexarEmAlgumTerminal(caminhos: string[]): ItemMenu {
  const terminais = terminaisDoPlano()
  if (terminais.length === 1) {
    return { rotulo: `Anexar ao prompt de "${terminais[0].nome}"`, icone: Paperclip, acao: () => anexarAoPrompt(terminais[0].id, caminhos) }
  }
  return {
    rotulo: 'Anexar ao prompt de',
    icone: Paperclip,
    desligado: !terminais.length,
    submenu: terminais.map((t) => ({ rotulo: t.nome, icone: ICONE_AGENTE[t.agente], acao: () => anexarAoPrompt(t.id, caminhos) }))
  }
}

/** Menu de um arquivo ou pasta do explorador da direita. */
export function itensDoItemDoExplorador(item: EntradaPasta, x: number, y: number): ItemMenu[] {
  const comuns: ItemMenu[] = [
    anexarEmAlgumTerminal([item.caminho]),
    { rotulo: 'Mostrar no Explorer', icone: FolderOpen, acao: () => void window.mp.dados.mostrarNoExplorer(item.caminho) }
  ]
  if (item.ehPasta) {
    return [
      { rotulo: 'Pôr a árvore no quadro', icone: FolderTree, acao: () => adicionarNo({ tipo: 'pasta', caminho: item.caminho }, x, y) },
      ...comuns
    ]
  }
  return [
    { rotulo: 'Ver o código no quadro', icone: FileCode, acao: () => adicionarNo({ tipo: 'codigo', caminho: item.caminho }, x, y) },
    { rotulo: 'Abrir no programa do sistema', icone: FileText, acao: () => void window.mp.dados.abrirArquivo(item.caminho) },
    { rotulo: 'Pôr o arquivo no quadro', icone: Paperclip, acao: () => adicionarNo({ tipo: 'arquivo', caminho: item.caminho, nome: item.nome }, x, y) },
    ...comuns
  ]
}

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
    { rotulo: 'Banda (grupo de agentes)…', icone: Users, acao: () => void novaBandaEm([], { x, y }) },
    { rotulo: 'Colar aqui', icone: ClipboardPaste, atalho: 'Ctrl+V', acao: () => void colar({ x, y }) },
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
    { rotulo: 'Selecionar tudo', atalho: 'Ctrl+A', acao: selecionarTudo },
    { rotulo: 'Ver tudo', icone: Scan, atalho: 'Ctrl+1', acao: enquadrarTudo },
    { rotulo: 'Mini-mapa', icone: IconeMapa, marcado: miniMapa, acao: alternarMiniMapa },
    preferencias.tema === 'escuro'
      ? { rotulo: 'Tema claro', icone: Sun, acao: () => definirTema('claro') }
      : { rotulo: 'Tema escuro', icone: Moon, acao: () => definirTema('escuro') },
    separador,
    { rotulo: 'Atalhos do teclado', icone: Keyboard, atalho: '?', acao: abrirAtalhos }
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

/** Cores para a seleção inteira; se é só post-it, os tons pastel. */
export function linhaDeCoresDaSelecao(): ItemMenu {
  const { nos, desenhos } = infoDaSelecao()
  if (nos.length && !desenhos.length && nos.every((n) => n.tipo === 'postit')) {
    const atual = new Set(nos.map((n) => n.cor))
    return {
      cores: {
        valores: (Object.keys(COR_POSTIT) as Array<NoPostIt['cor']>).map((c) => ({ cor: c, nome: NOMES_POSTIT[c], amostra: COR_POSTIT[c] })),
        atual: atual.size === 1 ? [...atual][0] : undefined,
        escolher: (c) => c && definirTomPostIts(c as NoPostIt['cor'])
      }
    }
  }
  const cores = new Set([...nos.map((n) => n.cor ?? null), ...desenhos.map((d) => d.cor)])
  return {
    cores: {
      valores: CORES_CARTAO,
      atual: cores.size === 1 ? [...cores][0] : undefined,
      escolher: definirCorSelecao
    }
  }
}

const itensDeCopia: ItemMenu[] = [
  { rotulo: 'Copiar', icone: Copy, atalho: 'Ctrl+C', acao: () => void copiarSelecao() },
  { rotulo: 'Recortar', icone: Scissors, atalho: 'Ctrl+X', acao: () => void copiarSelecao(true) },
  { rotulo: 'Duplicar', icone: Copy, atalho: 'Ctrl+D', acao: duplicarSelecao }
]

const itemTirarDoGrupo: ItemMenu = { rotulo: 'Tirar do grupo', icone: Ungroup, acao: tirarDoGrupo }

/**
 * Cria uma banda (grupo de agentes): a moldura em volta dos cartões escolhidos, ou vazia no ponto do clique
 * para você arrastar agentes para dentro depois.
 */
async function novaBandaEm(ids: string[], onde: { x: number; y: number }): Promise<void> {
  const nome = await perguntarTexto('Nova banda', 'Nome do time', '', 'Criar')
  if (!nome?.trim()) return
  const feito = criarBandaNoQuadro(nome, ids, onde)
  if ('erro' in feito) await avisar('Banda', feito.erro)
}

/** Trocar o agente de um cartão: o cartão fica, o agente muda (ver shared/quadro/trocar.ts). */
function itemTrocarAgente(no: NoTerminal): ItemMenu {
  const { preferencias } = lerEstado()
  return {
    rotulo: 'Trocar o agente',
    icone: Repeat,
    submenu: preferencias.presets.map((p) => ({
      rotulo: p.nome,
      marcado: p.agente === no.agente && p.comando === no.comando,
      desligado: p.agente === no.agente && p.comando === no.comando,
      acao: async () => {
        const feito = trocarAgenteDoCartao(no.id, p)
        if ('erro' in feito) await avisar('Trocar o agente', feito.erro)
      }
    }))
  }
}

/**
 * Guarda os cartões escolhidos como partitura (um time reaplicável). Só aparece quando há agente na
 * escolha: partitura é time, e o que vale guardar é quem trabalha, com os recados ao redor.
 */
function itemSalvarPartitura(ids: string[]): ItemMenu {
  return {
    rotulo: 'Salvar como partitura…',
    icone: Users,
    acao: async () => {
      const nome = await perguntarTexto('Salvar como partitura', 'Nome do time', '', 'Salvar')
      if (!nome?.trim()) return
      const erro = salvarPartitura(nome, ids)
      if (erro) await avisar('Partitura', erro)
    }
  }
}

/** Menu de vários itens selecionados (ou de um grupo). */
export function itensDaSelecao(): ItemMenu[] {
  const info = infoDaSelecao()
  const alinhamentos: Array<[Parameters<typeof alinhar>[0], string, ItemMenu['icone']]> = [
    ['esquerda', 'À esquerda', AlignStartVertical],
    ['centro', 'Ao centro', AlignCenterVertical],
    ['direita', 'À direita', AlignEndVertical],
    ['topo', 'Em cima', AlignStartHorizontal],
    ['meio', 'No meio', AlignCenterHorizontal],
    ['base', 'Embaixo', AlignEndHorizontal]
  ]
  return [
    { rotulo: 'Cor', icone: Paintbrush, submenu: [linhaDeCoresDaSelecao()] },
    ...itensDeCopia,
    ...(info.nos.some((n) => n.tipo === 'terminal')
      ? [
          itemSalvarPartitura(info.nos.map((n) => n.id)),
          {
            rotulo: 'Juntar numa banda…',
            icone: Users,
            acao: () => void novaBandaEm(info.nos.filter((n) => n.tipo === 'terminal').map((n) => n.id), { x: 0, y: 0 })
          }
        ]
      : []),
    info.umGrupo
      ? { rotulo: 'Desagrupar', icone: Ungroup, atalho: 'Ctrl+Shift+G', acao: desagrupar }
      : { rotulo: 'Agrupar', icone: Group, atalho: 'Ctrl+G', acao: agrupar },
    ...(info.temGrupo && !info.umGrupo ? [{ rotulo: 'Desfazer os grupos', icone: Ungroup, acao: desagrupar }] : []),
    {
      rotulo: 'Alinhar',
      icone: AlignStartVertical,
      desligado: info.pecas < 2,
      submenu: [
        ...alinhamentos.map(([como, rotulo, icone]) => ({ rotulo, icone, acao: () => alinhar(como) })),
        separador,
        { rotulo: 'Distribuir na horizontal', icone: AlignHorizontalSpaceAround, desligado: info.pecas < 3, acao: () => distribuir('x') },
        { rotulo: 'Distribuir na vertical', icone: AlignVerticalSpaceAround, desligado: info.pecas < 3, acao: () => distribuir('y') }
      ]
    },
    separador,
    { rotulo: 'Trazer para frente', icone: ArrowUpToLine, desligado: !info.nos.length, acao: () => trazerParaFrente(info.nos.map((n) => n.id)) },
    { rotulo: 'Enviar para trás', icone: ArrowDownToLine, desligado: !info.nos.length, acao: enviarParaTras },
    ...(info.nos.length
      ? [
          info.travados
            ? { rotulo: 'Destravar', icone: Unlock, acao: alternarTravaSelecao }
            : { rotulo: 'Travar (não move nem apaga)', icone: Lock, acao: alternarTravaSelecao }
        ]
      : []),
    separador,
    { rotulo: `Apagar ${info.itens} itens`, icone: Trash2, atalho: 'Delete', perigo: true, acao: apagarSelecao }
  ]
}

export function itensDoNo(no: No): ItemMenu[] {
  const especificos: ItemMenu[] = []
  switch (no.tipo) {
    case 'terminal':
      especificos.push(
        {
          rotulo: 'Renomear…',
          icone: Pencil,
          acao: async () => {
            const nome = await perguntarTexto('Renomear terminal', 'Nome', no.nome, 'Renomear')
            if (nome) atualizarNo(no.id, { nome })
          }
        },
        { rotulo: 'Código que ele escreve', icone: FileCode, submenu: itensDoCodigoDoTerminal(no) },
        itemTrocarAgente(no),
        itemSalvarPartitura([no.id]),
        {
          rotulo: 'Anexar ao prompt',
          icone: Paperclip,
          submenu: [
            { rotulo: 'Arquivo…', icone: FileText, acao: () => void anexarArquivosAoPrompt(no.id) },
            { rotulo: 'Pasta…', icone: FolderOpen, acao: () => void anexarPastaAoPrompt(no.id) }
          ]
        }
      )
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
    case 'banda': {
      const dentro = membrosDaBandaAtual(no.id)
      especificos.push(
        {
          rotulo: 'Renomear a banda…',
          icone: Pencil,
          acao: async () => {
            const nome = await perguntarTexto('Renomear a banda', 'Nome', no.nome, 'Renomear')
            if (nome?.trim()) atualizarNo(no.id, { nome: nome.trim().slice(0, 60) })
          }
        },
        // informativo: é a moldura que diz quem é do time, então o menu só mostra quem está dentro agora
        {
          rotulo: dentro.length ? `No time: ${dentro.map((n) => n.nome).join(', ')}` : 'Vazia: arraste agentes para dentro',
          icone: Users,
          desligado: true
        },
        {
          rotulo: 'Ver o time todo',
          icone: Scan,
          desligado: !dentro.length,
          acao: () => selecionarVarios([no.id, ...dentro.map((n) => n.id)], [])
        }
      )
      break
    }
    case 'codigo':
      especificos.push(
        {
          rotulo: no.modo === 'diff' ? 'Ver o arquivo inteiro' : 'Ver o que mudou',
          icone: FileCode,
          acao: () => atualizarNo(no.id, { modo: no.modo === 'diff' ? 'conteudo' : 'diff' }, false)
        },
        { rotulo: no.recolhido ? 'Abrir' : 'Recolher', icone: FileCode, acao: () => alternarRecolhido(no) },
        ...(no.terminal
          ? [
              no.automatico
                ? { rotulo: 'Tirar da coluna do agente', icone: Unlink, acao: () => soltarCodigoDaColuna(no.id) }
                : { rotulo: 'Devolver à coluna do agente', icone: FileCode, acao: () => juntarCodigosDoTerminal(no.terminal!) }
            ]
          : []),
        ...(no.caminho
          ? [
              { rotulo: 'Abrir no programa do sistema', icone: FileText, acao: () => void window.mp.dados.abrirArquivo(no.caminho!) },
              { rotulo: 'Mostrar no Explorer', icone: FolderOpen, acao: () => void window.mp.dados.mostrarNoExplorer(no.caminho!) }
            ]
          : [])
      )
      break
  }
  return [
    ...especificos,
    ...(especificos.length ? [separador] : []),
    { rotulo: 'Cor', icone: Paintbrush, submenu: [linhaDeCores(no)] },
    ...itensDeCopia,
    ...(no.grupo ? [itemTirarDoGrupo] : []),
    { rotulo: 'Trazer para frente', icone: ArrowUpToLine, acao: () => trazerParaFrente(no.id) },
    { rotulo: 'Enviar para trás', icone: ArrowDownToLine, acao: enviarParaTras },
    no.travado
      ? { rotulo: 'Destravar', icone: Unlock, acao: alternarTravaSelecao }
      : { rotulo: 'Travar (não move nem apaga)', icone: Lock, acao: alternarTravaSelecao },
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

export function itensDoDesenho({ id, cor: corAtual, grupo }: Desenho): ItemMenu[] {
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
    { rotulo: 'Duplicar', icone: Copy, atalho: 'Ctrl+D', acao: duplicarSelecao },
    ...(grupo ? [itemTirarDoGrupo] : []),
    separador,
    { rotulo: 'Apagar desenho', icone: Trash2, atalho: 'Delete', perigo: true, acao: () => apagar({ tipo: 'desenho', id }) }
  ]
}

// ---------- lateral: espaços e andares ----------

export function itensDoEspaco(r: ResumoEspaco): ItemMenu[] {
  const ativo = lerEstado().espaco?.id === r.id
  const fora = lerEstado().emOutrasJanelas.includes(r.id)
  return [
    ...(fora
      ? [{ rotulo: 'Ir para a janela dele', icone: AppWindow, acao: () => void abrirEspaco(r.id) }]
      : ativo
        ? []
        : [
            { rotulo: 'Abrir', acao: () => void abrirEspaco(r.id) },
            { rotulo: 'Abrir em nova janela', icone: AppWindow, atalho: 'Ctrl+Shift+N', acao: () => abrirNovaJanela(r.id) }
          ]),
    {
      rotulo: 'Renomear…',
      icone: Pencil,
      acao: async () => {
        const nome = await perguntarTexto('Renomear espaço', 'Nome', r.nome, 'Renomear')
        if (nome) await renomearEspaco(r.id, nome)
      }
    },
    { rotulo: 'Mostrar pasta no Explorer', icone: FolderOpen, acao: () => void window.mp.dados.mostrarNoExplorer(r.pasta) },
    ...(fora
      ? []
      : [
          {
            rotulo: 'Novo andar…',
            icone: Layers,
            acao: async () => {
              await abrirEspaco(r.id)
              abrirNovoAndar()
            }
          }
        ]),
    separador,
    {
      rotulo: fora ? 'Apagar espaço… (feche a janela dele antes)' : 'Apagar espaço…',
      icone: Trash2,
      perigo: true,
      desligado: fora,
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
