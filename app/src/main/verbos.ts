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
/** Coordenada do quadro: cabe folgado o maior quadro que alguém arruma à mão, e nada de infinito. */
const lugar = (nome: string): OpcaoDoVerbo => numero(nome, -1_000_000, 1_000_000)
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
    opcoes: [texto('espaco'), texto('nome'), texto('pasta'), texto('funcao'), texto('pedido'), texto('arquivo'), bandeira('esperar'), numero('tempo', 1, 3600)],
    descricao: 'abre uma sessão nova; em outro espaço, você continua sendo o dono',
    ajuda: '  mpro abrir <claude|codex|shell> [--espaco "Nome"] [--nome N] [--pasta P] [--funcao "Papel"] [--pedido "texto" | --arquivo pedido.md] [--esperar] [--tempo S]\n                                       abre uma sessão nova; em outro espaço, você continua sendo o dono'
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
  { nome: 'quadro', aliases: [], posicionais: [], opcoes: [], descricao: 'lê o quadro: cada cartão com número, nome, lugar e tamanho, e as cordas', ajuda: '  mpro quadro                         lê o quadro: cada cartão com número, nome, lugar e tamanho, e as cordas' },
  {
    nome: 'mover', aliases: [], posicionais: [{ nome: 'cartão', obrigatorio: true, resto: true }],
    opcoes: [lugar('x'), lugar('y'), lugar('dx'), lugar('dy')],
    descricao: 'põe cartões num lugar (--x/--y) ou anda com eles (--dx/--dy)',
    ajuda: '  mpro mover <cartão>... [--x N --y N] [--dx N --dy N]\n                                      põe cartões num lugar, ou anda com eles de onde estão'
  },
  {
    nome: 'arrumar', aliases: [], posicionais: [{ nome: 'cartão', resto: true }],
    opcoes: [numero('colunas', 1, 12), numero('vao', 0, 400)],
    descricao: 'põe os cartões em grade, sem sair do canto onde já estavam',
    ajuda: '  mpro arrumar [cartão]... [--colunas N] [--vao N]\n                                      põe os cartões (ou só esses) em grade, a partir do canto onde já estavam'
  },
  {
    nome: 'nome', aliases: [], posicionais: [obrigatorio('cartão'), { nome: 'nome novo', obrigatorio: true, resto: true }], opcoes: [],
    descricao: 'renomeia um cartão de agente (o nome é como todos falam dele)',
    ajuda: '  mpro nome <cartão> "Nome novo"      renomeia um cartão de agente; é o nome que o `mpro` passa a usar'
  },
  { nome: 'ligar', aliases: [], posicionais: [obrigatorio('cartão'), obrigatorio('cartão')], opcoes: [], descricao: 'desenha a corda entre dois agentes (eles passam a poder se falar)', ajuda: '  mpro ligar <cartão> <cartão>        desenha a corda entre dois agentes: eles passam a poder se falar' },
  { nome: 'desligar', aliases: [], posicionais: [obrigatorio('cartão'), obrigatorio('cartão')], opcoes: [], descricao: 'tira a corda entre dois agentes', ajuda: '  mpro desligar <cartão> <cartão>     tira a corda entre dois agentes' },
  {
    nome: 'anotar', aliases: [], posicionais: [{ nome: 'texto', obrigatorio: true, resto: true }], opcoes: [lugar('x'), lugar('y')],
    descricao: 'escreve um texto no quadro, abaixo do seu cartão',
    ajuda: '  mpro anotar "texto" [--x N --y N]   escreve um texto no quadro (abaixo do seu cartão, se você não disser onde)'
  },
  {
    nome: 'juntar', aliases: [], posicionais: [{ nome: 'cartão', obrigatorio: true, resto: true }], opcoes: [bandeira('soltar')],
    descricao: 'agrupa cartões (andam juntos); --soltar desfaz',
    ajuda: '  mpro juntar <cartão>... [--soltar]  agrupa cartões para andarem juntos no quadro; --soltar desfaz o grupo'
  },
  {
    nome: 'trocar', aliases: [], posicionais: [obrigatorio('cartão'), obrigatorio('claude|codex|shell')], opcoes: [],
    descricao: 'troca o agente de um cartão que você abriu (o cartão fica, o agente muda)',
    ajuda: '  mpro trocar <cartão> <claude|codex|shell>\n                                      troca o agente de um cartão que você abriu: lugar, nome e cordas ficam'
  },
  {
    nome: 'banda', aliases: ['bandas'], posicionais: [{ nome: 'criar' }, { nome: 'nome' }, { nome: 'cartão', resto: true }], opcoes: [],
    descricao: 'bandas (grupos de agentes): quem está dentro da moldura fala com todos os de dentro',
    ajuda: '  mpro banda                          lista as bandas do andar, com quem está dentro de cada uma\n  mpro banda criar "Nome" <cartão>...  põe uma moldura em volta desses agentes: todos passam a se falar'
  },
  {
    nome: 'partitura', aliases: ['partituras'], posicionais: [{ nome: 'usar|salvar' }, { nome: 'nome' }, { nome: 'cartão', resto: true }], opcoes: [],
    descricao: 'times salvos: lista, sobe um time no quadro ou guarda o que está nele',
    ajuda: '  mpro partitura                      lista os times salvos (agentes, funções, cordas e recados)\n  mpro partitura usar "Nome"          sobe esse time ao seu lado, ligado a você\n  mpro partitura salvar "Nome" [cartão]...\n                                      guarda como partitura os cartões (ou o andar à mostra todo)'
  },
  { nome: 'funcoes', aliases: ['funcao'], posicionais: [], opcoes: [], descricao: 'lista as funções (papéis) que o usuário guardou', ajuda: '  mpro funcoes                        lista as funções (papéis) guardadas, para usar em `mpro abrir --funcao`' },
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
