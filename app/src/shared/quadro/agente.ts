/**
 * O agente mexendo no quadro pelo `ork`: ler, mover, arrumar, renomear, ligar, anotar e juntar.
 *
 * Tudo aqui é função pura sobre o plano à mostra, para a janela só precisar aplicar o resultado (e para as
 * provas rodarem sem Electron). Três regras valem para todas as ações, e é por elas que dar esse poder ao
 * agente não dá medo:
 *
 * - **Nada é apagado.** O agente move, nomeia, liga e anota; cartão nenhum sai do quadro por aqui.
 * - **Cartão travado é intocável** e **cartão de código também**: a coluna de arquivos é arrumada pelo app, e
 *   o cartão que o usuário tirou dela ficou onde ele quis.
 * - **Só pelo nome**, no andar à mostra. O agente não conhece id de nada, então não alcança o que não vê.
 *
 * A janela registra isso no desfazer: uma bagunça de agente volta inteira com um Ctrl+Z, ao contrário dos
 * outros pedidos do `ork` (abrir, fechar, passar), que são estado operacional e ficam fora do histórico.
 */
import type { Corda, Desenho, No, Plano } from '../modelo'

export type AcaoNoQuadro = 'ler' | 'mover' | 'arrumar' | 'nome' | 'ligar' | 'desligar' | 'anotar' | 'juntar'

export interface PedidoNoQuadro {
  acao: AcaoNoQuadro
  /** Cartão de quem pediu: marcado como "você" na leitura e usado como referência do `anotar`. */
  eu: string
  /** Cartões pelo nome (ou pelo começo dele), ou por `#n`, o número que a leitura mostra. */
  alvos?: string[]
  /** `nome`: o nome novo; `anotar`: o texto. */
  texto?: string
  x?: number
  y?: number
  dx?: number
  dy?: number
  colunas?: number
  vao?: number
  /** `juntar --soltar`: desfaz o grupo em vez de criar um. */
  soltar?: boolean
  /** Linha de cabeçalho da leitura (espaço e andar), que só a janela conhece. */
  onde?: string
}

export interface AmbienteDoQuadroDoAgente {
  novoId: () => string
  agora: () => string
}

export interface MudancaNoQuadro {
  plano: Plano
  texto: string
  /** Terminais que mudaram de lugar: a janela rearruma a coluna de código deles. */
  terminais: string[]
}

export type ResultadoNoQuadro = { erro: string } | MudancaNoQuadro

/** Teto de cartões no plano: o `anotar` para aqui em vez de encher o quadro num laço. */
export const MAX_NOS = 400
export const MAX_CORDAS = 200
export const MAX_TEXTO = 2000
export const MAX_NOME = 80
/** Vão entre cartões do `arrumar`, quando o agente não pede outro. */
export const VAO = 40

const nomeDoArquivo = (caminho: string): string => caminho.split(/[/\\]/).filter(Boolean).pop() ?? caminho

const umaLinha = (texto: string): string => texto.replace(/\s+/g, ' ').trim()

/** Como o agente chama cada cartão. É o que ele lê e o que ele escreve de volta. */
export function rotuloDoNo(no: No): string {
  switch (no.tipo) {
    case 'terminal':
      return no.nome
    case 'codigo':
      return no.caminho ? nomeDoArquivo(no.caminho) : 'código (sem arquivo ainda)'
    case 'texto':
      return umaLinha(no.texto).slice(0, 60) || 'texto vazio'
    case 'postit':
      return 'post-it'
    case 'arquivo':
      return no.nomeExibido || nomeDoArquivo(no.caminho)
    case 'pasta':
      return nomeDoArquivo(no.caminho)
    case 'portal':
      return no.url
    case 'imagem':
      return 'imagem'
    case 'banda':
      return no.nome
  }
}

const COMO_CHAMAR: Record<No['tipo'], string> = {
  terminal: 'agente',
  codigo: 'codigo',
  texto: 'texto',
  postit: 'post-it',
  arquivo: 'arquivo',
  pasta: 'pasta',
  portal: 'portal',
  imagem: 'imagem',
  banda: 'banda'
}

/** A ordem em que a leitura numera os cartões: de cima para baixo, da esquerda para a direita. */
export function ordenados(plano: Plano): No[] {
  return [...plano.nos].sort((a, b) => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id))
}

/** Por que este cartão não se mexe nem se renomeia por pedido de agente (null = pode). */
export function motivoImovel(no: No): string | null {
  if (no.travado) return 'está travado'
  if (no.tipo === 'codigo') return 'é cartão de código (a árvore é do app, e o cartão solto é do usuário)'
  return null
}

function acharUm(plano: Plano, termo: string): No | string {
  const lista = ordenados(plano)
  const limpo = termo.trim()
  if (!limpo) return 'diga o nome do cartão'
  const numero = limpo.match(/^#(\d+)$/)
  if (numero) {
    const no = lista[Number(numero[1]) - 1]
    return no ?? `não há cartão ${limpo} no quadro (são ${lista.length})`
  }
  const procurado = limpo.toLowerCase()
  const comRotulo = lista.map((no, i) => ({ no, i, rotulo: rotuloDoNo(no).toLowerCase() }))
  const tentativas = [
    comRotulo.filter((c) => c.rotulo === procurado),
    comRotulo.filter((c) => c.rotulo.startsWith(procurado)),
    comRotulo.filter((c) => c.rotulo.includes(procurado))
  ]
  for (const achados of tentativas) {
    if (achados.length === 1) return achados[0].no
    if (achados.length > 1) {
      const quais = achados.map((c) => `#${c.i + 1} "${rotuloDoNo(c.no)}"`).join(', ')
      return `"${limpo}" serve para mais de um cartão: ${quais}. Use o número.`
    }
  }
  return `não achei "${limpo}" no quadro. Veja \`ork quadro\`.`
}

/** Os cartões pedidos, na ordem em que o agente os nomeou, ou a primeira queixa. */
export function acharAlvos(plano: Plano, termos: string[]): No[] | string {
  const achados: No[] = []
  for (const termo of termos) {
    const um = acharUm(plano, termo)
    if (typeof um === 'string') return um
    if (!achados.some((n) => n.id === um.id)) achados.push(um)
  }
  return achados
}

/** Quem está agrupado anda junto, como na seleção do quadro. */
function comOGrupo(plano: Plano, escolhidos: No[]): No[] {
  const grupos = new Set(escolhidos.flatMap((n) => (n.grupo ? [n.grupo] : [])))
  if (!grupos.size) return escolhidos
  const ids = new Set(escolhidos.map((n) => n.id))
  return [...escolhidos, ...plano.nos.filter((n) => n.grupo && grupos.has(n.grupo) && !ids.has(n.id))]
}

interface Caixa {
  x: number
  y: number
  largura: number
  altura: number
}

const uniaoDas = (nos: No[]): Caixa => {
  const x = Math.min(...nos.map((n) => n.x))
  const y = Math.min(...nos.map((n) => n.y))
  return {
    x,
    y,
    largura: Math.max(...nos.map((n) => n.x + n.largura)) - x,
    altura: Math.max(...nos.map((n) => n.y + n.altura)) - y
  }
}

/** Desloca cartões e os traços que fazem parte dos mesmos grupos. */
function deslocar(plano: Plano, deltas: Map<string, { dx: number; dy: number }>): Plano {
  const grupos = new Map<string, { dx: number; dy: number }>()
  for (const no of plano.nos) {
    const d = deltas.get(no.id)
    if (d && no.grupo && !grupos.has(no.grupo)) grupos.set(no.grupo, d)
  }
  const mover = (no: No): No => {
    const d = deltas.get(no.id)
    return d ? ({ ...no, x: Math.round(no.x + d.dx), y: Math.round(no.y + d.dy) } as No) : no
  }
  const moverTraco = (desenho: Desenho): Desenho => {
    const d = desenho.grupo ? grupos.get(desenho.grupo) : undefined
    if (!d) return desenho
    const pontos = desenho.pontos.map(([px, py]) => [Math.round(px + d.dx), Math.round(py + d.dy)] as [number, number])
    return { ...desenho, pontos }
  }
  return { ...plano, nos: plano.nos.map(mover), desenhos: plano.desenhos.map(moverTraco) }
}

const emPonto = (no: No): string => `${Math.round(no.largura)}x${Math.round(no.altura)} em (${Math.round(no.x)}, ${Math.round(no.y)})`

/** A leitura do quadro: é o único jeito de o agente saber o que existe e como chamar cada coisa. */
export function lerQuadro(plano: Plano, pedido: PedidoNoQuadro): string {
  const lista = ordenados(plano)
  const nomeDoId = new Map(plano.nos.map((n) => [n.id, rotuloDoNo(n)]))
  const linhas = lista.map((no, i) => {
    const partes = [`#${i + 1}`, COMO_CHAMAR[no.tipo], `"${rotuloDoNo(no)}"`, '·', emPonto(no)]
    if (no.tipo === 'terminal') {
      if (no.funcao) partes.push(`· função "${no.funcao}"`)
      if (no.pasta) partes.push(`· pasta ${no.pasta}`)
    }
    if (no.tipo === 'codigo' && no.terminal) partes.push(`· na árvore de "${nomeDoId.get(no.terminal) ?? 'alguém'}"`)
    if (no.grupo) partes.push(`· grupo ${no.grupo.slice(0, 4)}`)
    if (no.travado) partes.push('· travado')
    if (no.id === pedido.eu) partes.push('← você')
    return `  ${partes.join(' ')}`
  })
  const cordas = plano.cordas.map((c) => `  "${nomeDoId.get(c.de) ?? '?'}" ↔ "${nomeDoId.get(c.para) ?? '?'}"`)
  const cabecalho = `${pedido.onde ? `${pedido.onde} · ` : ''}${lista.length} cartão(ões), ${plano.cordas.length} corda(s)`
  return [
    cabecalho,
    ...(linhas.length ? linhas : ['  (quadro vazio)']),
    ...(cordas.length ? ['Cordas:', ...cordas] : []),
    'Mexa com: ork mover, arrumar, nome, ligar, desligar, anotar, juntar (sempre pelo nome ou pelo #número).'
  ].join('\n')
}

const listar = (nos: No[]): string => nos.map((n) => `"${rotuloDoNo(n)}"`).join(', ')

/** Aplica um pedido do agente ao plano. Nada é apagado, e cartão travado ou de código fica como está. */
export function mexerNoQuadro(plano: Plano, pedido: PedidoNoQuadro, amb: AmbienteDoQuadroDoAgente): ResultadoNoQuadro {
  const alvosPedidos = (pedido.alvos ?? []).filter((a) => a.trim())

  if (pedido.acao === 'ler') return { plano, terminais: [], texto: lerQuadro(plano, pedido) }

  if (pedido.acao === 'anotar') {
    const texto = (pedido.texto ?? '').trim()
    if (!texto) return { erro: 'diga o que anotar: ork anotar "texto"' }
    if (texto.length > MAX_TEXTO) return { erro: `a anotação é longa demais (máx. ${MAX_TEXTO} caracteres)` }
    if (plano.nos.length >= MAX_NOS) return { erro: `o quadro está cheio (${MAX_NOS} cartões); fale com o usuário` }
    const eu = plano.nos.find((n) => n.id === pedido.eu)
    // sem lugar pedido, a anotação nasce logo abaixo do cartão de quem anotou: perto do assunto e fora da
    // árvore de código, que fica à direita dele
    const x = pedido.x ?? (eu ? eu.x : 0)
    const y = pedido.y ?? (eu ? eu.y + eu.altura + VAO : 0)
    const z = Math.max(0, ...plano.nos.map((n) => n.z), ...plano.desenhos.map((d) => d.z)) + 1
    const no: No = {
      id: amb.novoId(),
      x: Math.round(x),
      y: Math.round(y),
      largura: 420,
      altura: 48,
      z,
      criadoEm: amb.agora(),
      tipo: 'texto',
      texto,
      tamanhoFonte: 20,
      mono: false
    }
    return { plano: { ...plano, nos: [...plano.nos, no] }, terminais: [], texto: `Anotei no quadro, em (${no.x}, ${no.y}).` }
  }

  if (pedido.acao === 'mover') {
    if (!alvosPedidos.length) return { erro: 'diga o que mover: ork mover <cartão>... --x N --y N (ou --dx/--dy)' }
    const temDestino = [pedido.x, pedido.y, pedido.dx, pedido.dy].some((v) => typeof v === 'number')
    if (!temDestino) return { erro: 'diga para onde: --x/--y (lugar) ou --dx/--dy (quanto andar)' }
    const alvos = acharAlvos(plano, alvosPedidos)
    if (typeof alvos === 'string') return { erro: alvos }
    const todos = comOGrupo(plano, alvos)
    const presos = todos.filter((n) => motivoImovel(n))
    const livres = todos.filter((n) => !motivoImovel(n))
    if (!livres.length) {
      const porque = presos.map((n) => `"${rotuloDoNo(n)}" ${motivoImovel(n)}`).join('; ')
      return { erro: `não movi nada: ${porque || 'nada para mover'}` }
    }
    const caixa = uniaoDas(livres)
    const dx = (typeof pedido.x === 'number' ? pedido.x - caixa.x : 0) + (pedido.dx ?? 0)
    const dy = (typeof pedido.y === 'number' ? pedido.y - caixa.y : 0) + (pedido.dy ?? 0)
    const deltas = new Map(livres.map((n) => [n.id, { dx, dy }]))
    const sobrou = presos.length ? ` Deixei ${listar(presos)} como estava (${motivoImovel(presos[0])}).` : ''
    return {
      plano: deslocar(plano, deltas),
      terminais: livres.filter((n) => n.tipo === 'terminal').map((n) => n.id),
      texto: `Movi ${listar(livres)} para (${Math.round(caixa.x + dx)}, ${Math.round(caixa.y + dy)}).${sobrou}`
    }
  }

  if (pedido.acao === 'arrumar') {
    const escolhidos = alvosPedidos.length ? acharAlvos(plano, alvosPedidos) : plano.nos
    if (typeof escolhidos === 'string') return { erro: escolhidos }
    const livres = comOGrupo(plano, escolhidos).filter((n) => !motivoImovel(n))
    if (livres.length < 2) return { erro: 'preciso de pelo menos dois cartões soltos para arrumar' }
    // cada grupo anda como um bloco só, para o arrumar não desmanchar o que o usuário agrupou
    const blocos = new Map<string, No[]>()
    for (const no of livres) {
      const chave = no.grupo ? `g:${no.grupo}` : `n:${no.id}`
      blocos.set(chave, [...(blocos.get(chave) ?? []), no])
    }
    const lista = [...blocos.values()]
      .map((membros) => ({ membros, caixa: uniaoDas(membros) }))
      .sort((a, b) => a.caixa.y - b.caixa.y || a.caixa.x - b.caixa.x)
    const colunas = Math.min(Math.max(1, Math.round(pedido.colunas ?? Math.sqrt(lista.length))), 12)
    const vao = Math.max(0, pedido.vao ?? VAO)
    const origem = uniaoDas(livres)
    const largurasPorColuna: number[] = []
    const alturasPorLinha: number[] = []
    lista.forEach((bloco, i) => {
      const coluna = i % colunas
      const linha = Math.floor(i / colunas)
      largurasPorColuna[coluna] = Math.max(largurasPorColuna[coluna] ?? 0, bloco.caixa.largura)
      alturasPorLinha[linha] = Math.max(alturasPorLinha[linha] ?? 0, bloco.caixa.altura)
    })
    const soma = (valores: number[], ate: number): number => valores.slice(0, ate).reduce((total, valor) => total + valor + vao, 0)
    const deltas = new Map<string, { dx: number; dy: number }>()
    lista.forEach((bloco, i) => {
      const dx = origem.x + soma(largurasPorColuna, i % colunas) - bloco.caixa.x
      const dy = origem.y + soma(alturasPorLinha, Math.floor(i / colunas)) - bloco.caixa.y
      for (const membro of bloco.membros) deltas.set(membro.id, { dx, dy })
    })
    return {
      plano: deslocar(plano, deltas),
      terminais: livres.filter((n) => n.tipo === 'terminal').map((n) => n.id),
      texto: `Arrumei ${lista.length} bloco(s) em ${colunas} coluna(s), a partir de (${Math.round(origem.x)}, ${Math.round(origem.y)}).`
    }
  }

  if (pedido.acao === 'nome') {
    const novo = umaLinha(pedido.texto ?? '')
    if (!alvosPedidos.length || !novo) return { erro: 'diga qual e como: ork nome <cartão> "Nome novo"' }
    if (novo.length > MAX_NOME) return { erro: `nome comprido demais (máx. ${MAX_NOME} caracteres)` }
    const alvos = acharAlvos(plano, alvosPedidos.slice(0, 1))
    if (typeof alvos === 'string') return { erro: alvos }
    const alvo = alvos[0]
    if (alvo.tipo !== 'terminal') return { erro: `só cartão de agente tem nome; "${rotuloDoNo(alvo)}" é ${COMO_CHAMAR[alvo.tipo]}` }
    if (alvo.travado) return { erro: `"${alvo.nome}" está travado` }
    const repetido = plano.nos.some((n) => n.tipo === 'terminal' && n.id !== alvo.id && n.nome.toLowerCase() === novo.toLowerCase())
    if (repetido) return { erro: `já existe um cartão chamado "${novo}"` }
    const antigo = alvo.nome
    return {
      plano: { ...plano, nos: plano.nos.map((n) => (n.id === alvo.id ? { ...n, nome: novo } : n)) },
      terminais: [],
      texto: `"${antigo}" agora se chama "${novo}". Quem falar com ele pelo ork usa o nome novo.`
    }
  }

  if (pedido.acao === 'ligar' || pedido.acao === 'desligar') {
    if (alvosPedidos.length !== 2) return { erro: `diga os dois cartões: ork ${pedido.acao} <cartão> <cartão>` }
    const alvos = acharAlvos(plano, alvosPedidos)
    if (typeof alvos === 'string') return { erro: alvos }
    if (alvos.length !== 2) return { erro: 'são o mesmo cartão; a corda liga dois agentes diferentes' }
    const [a, b] = alvos
    // a corda liga agentes, e também uma banda (aí ela vale para cada agente de dentro da moldura)
    const naoAgente = alvos.find((n) => n.tipo !== 'terminal' && n.tipo !== 'banda')
    if (naoAgente) return { erro: `a corda liga agentes (ou uma banda); "${rotuloDoNo(naoAgente)}" é ${COMO_CHAMAR[naoAgente.tipo]}` }
    const achada = plano.cordas.find((c) => (c.de === a.id && c.para === b.id) || (c.de === b.id && c.para === a.id))
    if (pedido.acao === 'desligar') {
      if (!achada) return { erro: `"${rotuloDoNo(a)}" e "${rotuloDoNo(b)}" não estão ligados` }
      return {
        plano: { ...plano, cordas: plano.cordas.filter((c) => c.id !== achada.id) },
        terminais: [],
        texto: `Desliguei "${rotuloDoNo(a)}" de "${rotuloDoNo(b)}"; eles não falam mais pelo ork.`
      }
    }
    if (achada) return { erro: `"${rotuloDoNo(a)}" e "${rotuloDoNo(b)}" já estão ligados` }
    if (plano.cordas.length >= MAX_CORDAS) return { erro: `cordas demais no quadro (${MAX_CORDAS})` }
    const corda: Corda = { id: amb.novoId(), de: a.id, para: b.id, criadoEm: amb.agora() }
    return {
      plano: { ...plano, cordas: [...plano.cordas, corda] },
      terminais: [],
      texto: `Liguei "${rotuloDoNo(a)}" a "${rotuloDoNo(b)}"; agora os dois falam pelo ork.`
    }
  }

  if (!alvosPedidos.length) return { erro: 'diga quais cartões: ork juntar <cartão> <cartão>... [--soltar]' }
  const alvos = acharAlvos(plano, alvosPedidos)
  if (typeof alvos === 'string') return { erro: alvos }
  const todos = comOGrupo(plano, alvos)
  if (pedido.soltar) {
    const comGrupo = todos.filter((n) => n.grupo)
    if (!comGrupo.length) return { erro: `${listar(alvos)} não está num grupo` }
    const ids = new Set(comGrupo.map((n) => n.id))
    const grupos = new Set(comGrupo.flatMap((n) => (n.grupo ? [n.grupo] : [])))
    return {
      plano: {
        ...plano,
        nos: plano.nos.map((n) => (ids.has(n.id) ? ({ ...n, grupo: undefined } as No) : n)),
        desenhos: plano.desenhos.map((d) => (d.grupo && grupos.has(d.grupo) ? { ...d, grupo: undefined } : d))
      },
      terminais: [],
      texto: `Soltei ${listar(comGrupo)} do grupo.`
    }
  }
  if (todos.length < 2) return { erro: 'preciso de dois cartões ou mais para juntar' }
  const grupo = amb.novoId()
  const ids = new Set(todos.map((n) => n.id))
  const antigos = new Set(todos.flatMap((n) => (n.grupo ? [n.grupo] : [])))
  return {
    plano: {
      ...plano,
      nos: plano.nos.map((n) => (ids.has(n.id) ? ({ ...n, grupo } as No) : n)),
      desenhos: plano.desenhos.map((d) => (d.grupo && antigos.has(d.grupo) ? { ...d, grupo } : d))
    },
    terminais: [],
    texto: `Juntei ${listar(todos)} num grupo: agora andam juntos no quadro.`
  }
}
