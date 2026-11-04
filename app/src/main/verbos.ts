/** Registro puro do protocolo do mpro: pode ser usado pelo main, pelo CLI e pelas provas sem Electron. */
export type TipoDeOpcao = 'texto' | 'numero' | 'bandeira'

export interface ArgumentoDoVerbo {
  nome: string
  obrigatorio?: boolean
  resto?: boolean
}

export interface OpcaoDoVerbo {
  nome: string
  tipo: TipoDeOpcao
  minimo?: number
  maximo?: number
}

export interface Verbo {
  nome: string
  aliases: string[]
  posicionais: ArgumentoDoVerbo[]
  opcoes: OpcaoDoVerbo[]
  descricao: string
  /** Bloco já alinhado para preservar a ajuda existente palavra por palavra. */
  ajuda: string
}

const texto = (nome: string): OpcaoDoVerbo => ({ nome, tipo: 'texto' })
const numero = (nome: string, minimo: number, maximo: number): OpcaoDoVerbo => ({ nome, tipo: 'numero', minimo, maximo })
const bandeira = (nome: string): OpcaoDoVerbo => ({ nome, tipo: 'bandeira' })
const obrigatorio = (nome: string): ArgumentoDoVerbo => ({ nome, obrigatorio: true })

export const VERBOS = [
  { nome: 'ajuda', aliases: ['help'], posicionais: [], opcoes: [], descricao: 'mostra esta ajuda', ajuda: '' },
  { nome: 'quem', aliases: [], posicionais: [], opcoes: [], descricao: 'quem é você, seus ligados e o último contexto conhecido', ajuda: '  mpro quem                           quem é você, seus ligados e o último contexto conhecido' },
  { nome: 'orcamento', aliases: [], posicionais: [], opcoes: [], descricao: 'mede o contexto do Claude livre; Codex declara que não expõe', ajuda: '  mpro orcamento                      mede o contexto do Claude livre; Codex declara que não expõe' },
  { nome: 'espacos', aliases: [], posicionais: [], opcoes: [], descricao: 'lista todos os espaços, janela, cartões e marca o seu', ajuda: '  mpro espacos                        lista todos os espaços, janela, cartões e marca o seu' },
  {
    nome: 'janela', aliases: [], posicionais: [{ nome: 'nome do espaço' }], opcoes: [texto('novo'), texto('pasta')],
    descricao: 'abre o espaço numa janela (ou traz a que já está aberta)',
    ajuda: '  mpro janela <nome do espaço>        abre o espaço numa janela (ou traz a que já está aberta)\n  mpro janela --novo "Nome" [--pasta P]\n                                       cria um espaço e abre uma janela nele'
  },
  {
    nome: 'abrir', aliases: [], posicionais: [obrigatorio('claude|codex|shell')],
    opcoes: [texto('espaco'), texto('nome'), texto('pasta'), texto('pedido'), texto('arquivo'), bandeira('esperar'), numero('tempo', 1, 3600)],
    descricao: 'abre uma sessão nova; em outro espaço, você continua sendo o dono',
    ajuda: '  mpro abrir <claude|codex|shell> [--espaco "Nome"] [--nome N] [--pasta P] [--pedido "texto" | --arquivo pedido.md] [--esperar] [--tempo S]\n                                       abre uma sessão nova; em outro espaço, você continua sendo o dono'
  },
  {
    nome: 'pedir', aliases: [], posicionais: [obrigatorio('nome'), { nome: 'texto', resto: true }],
    opcoes: [texto('arquivo'), bandeira('sem-esperar'), numero('tempo', 1, 3600)],
    descricao: 'manda um pedido e espera ele terminar (devolve a tela)',
    ajuda: '  mpro pedir <nome> "texto" | --arquivo pedido.md [--sem-esperar] [--tempo S]\n                                      manda um pedido e espera ele terminar (devolve a tela)'
  },
  { nome: 'esperar', aliases: [], posicionais: [obrigatorio('nome')], opcoes: [numero('tempo', 1, 3600)], descricao: 'espera terminar o que está fazendo', ajuda: '  mpro esperar <nome> [--tempo S]     espera terminar o que está fazendo' },
  { nome: 'ver', aliases: [], posicionais: [obrigatorio('nome')], opcoes: [numero('linhas', 1, 2000)], descricao: 'lê a tela sem mandar nada', ajuda: '  mpro ver <nome> [--linhas N]        lê a tela sem mandar nada' },
  { nome: 'teclas', aliases: [], posicionais: [obrigatorio('nome'), { nome: 'tecla', obrigatorio: true, resto: true }], opcoes: [], descricao: 'envia teclas nomeadas ao cartão', ajuda: '  mpro teclas <nome> <tecla>...       enter, esc, tab, shift-tab, cima, baixo, esquerda, direita, ctrl-c, espaco, 1, 2, y, n…' },
  {
    nome: 'arvore', aliases: ['arvores'], posicionais: [{ nome: 'nova|usar|mostrar|desfazer' }, { nome: 'nome ou arquivos', resto: true }],
    opcoes: [texto('arvore')],
    descricao: 'as árvores de código do seu cartão: separe os arquivos por assunto',
    ajuda: '  mpro arvore                         lista as árvores de código do seu cartão (e qual está em uso)\n  mpro arvore nova "Nome"             cria uma árvore e passa a usá-la para os próximos arquivos\n  mpro arvore usar "Nome"             passa a usar uma árvore que já existe\n  mpro arvore mostrar <arquivo>... [--arvore "Nome"]\n                                      abre esses arquivos como cartões na árvore\n  mpro arvore desfazer "Nome"         desfaz a árvore; os arquivos dela voltam para a principal'
  },
  { nome: 'limpar', aliases: [], posicionais: [obrigatorio('nome')], opcoes: [], descricao: 'zera o contexto da sessão', ajuda: '  mpro limpar <nome>                  zera o contexto da sessão (/clear no Claude, /new no Codex)' },
  { nome: 'fechar', aliases: [], posicionais: [obrigatorio('nome')], opcoes: [], descricao: 'fecha uma sessão que você abriu', ajuda: '  mpro fechar <nome>                  fecha uma sessão que você abriu; o que ela abriu passa para você' },
  { nome: 'passar', aliases: [], posicionais: [obrigatorio('nome')], opcoes: [], descricao: 'passa ao sucessor vivo as sessões que você abriu', ajuda: '  mpro passar <nome>                  passa ao sucessor vivo (aberto por você ou ligado) as outras sessões que abriu' },
  {
    nome: 'sair', aliases: [], posicionais: [], opcoes: [texto('motivo'), bandeira('com-as-minhas')],
    descricao: 'fecha seu cartão; com as minhas, fecha toda a árvore de sessões que você abriu',
    ajuda: '  mpro sair [--motivo "texto"] [--com-as-minhas]\n                                      fecha seu cartão; com as minhas, fecha toda a árvore de sessões que você abriu'
  }
]  as const satisfies readonly Verbo[]

/** O nome de cada verbo como tipo: o Record de handlers nao compila se faltar um. */
export type NomeDeVerbo = (typeof VERBOS)[number]["nome"]

export function verboPorNome(nome: string): Verbo | undefined {
  const normalizado = nome.toLowerCase()
  return VERBOS.find((verbo) => verbo.nome === normalizado || (verbo.aliases as readonly string[]).includes(normalizado))
}

export function opcaoExigeValor(comando: string, opcao: string): boolean {
  const verbo = verboPorNome(comando)
  return verbo?.opcoes.find((x) => x.nome === opcao)?.tipo !== 'bandeira'
}

export interface ChamadaValidada {
  verbo: Verbo
  posicionais: string[]
  opcoes: Record<string, string | number | true>
}

/** Valida a parte estrutural do protocolo sem mexer em texto livre nem em processos. */
export function validarChamada(comando: string, posicionais: string[], opcoes: Record<string, unknown>): ChamadaValidada {
  const verbo = verboPorNome(comando)
  if (!verbo) throw new Error(`comando desconhecido: ${comando}. Veja \`mpro ajuda\`.`)

  const pos = posicionais.filter((valor): valor is string => typeof valor === 'string')
  let indice = 0
  for (const argumento of verbo.posicionais) {
    if (argumento.resto) {
      if (argumento.obrigatorio && indice >= pos.length) throw new Error(`falta ${argumento.nome}: mpro ${verbo.nome} ${verbo.posicionais.map((x) => `<${x.nome}>`).join(' ')}`)
      indice = pos.length
      break
    }
    if (argumento.obrigatorio && indice >= pos.length) throw new Error(`falta ${argumento.nome}: mpro ${verbo.nome} ${verbo.posicionais.map((x) => `<${x.nome}>`).join(' ')}`)
    if (indice < pos.length) indice++
  }
  if (indice < pos.length) throw new Error(`argumento a mais: ${pos[indice]}. Veja \`mpro ajuda\`.`)

  const validas = new Map(verbo.opcoes.map((opcao) => [opcao.nome, opcao]))
  const resultado: Record<string, string | number | true> = {}
  for (const [nome, valor] of Object.entries(opcoes)) {
    const opcao = validas.get(nome)
    if (!opcao) throw new Error(`opção desconhecida: --${nome}. Veja \`mpro ajuda\`.`)
    if (opcao.tipo === 'bandeira') {
      if (valor !== true) throw new Error(`--${nome} não recebe valor`)
      resultado[nome] = true
      continue
    }
    if (typeof valor !== 'string' || !valor.trim()) throw new Error(`falta o valor de --${nome}`)
    if (opcao.tipo === 'texto') {
      resultado[nome] = valor
      continue
    }
    const numeroLido = Number(valor)
    if (!Number.isFinite(numeroLido) || numeroLido < opcao.minimo! || numeroLido > opcao.maximo!) {
      throw new Error(`--${nome} deve ser um número entre ${opcao.minimo} e ${opcao.maximo}`)
    }
    resultado[nome] = numeroLido
  }
  return { verbo, posicionais: pos, opcoes: resultado }
}

export function tabelaDeComandos(): string {
  return VERBOS.filter((verbo) => verbo.ajuda).map((verbo) => verbo.ajuda).join('\n')
}
