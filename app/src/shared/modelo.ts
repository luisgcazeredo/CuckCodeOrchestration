// O que fica salvo em disco. Toda mudança de formato sobe a `versao` e ganha uma migração.

export type Agente = 'claude' | 'codex' | 'shell'

/**
 * Uma função (papel) que um agente pode ter: o que ele é, escrito uma vez e reaproveitado. O cartão nasce
 * com o nome da função e recebe o prompt dela como primeiro pedido, em vez de nascer vazio.
 */
export interface Funcao {
  id: string
  nome: string
  /** O que o agente é e o que se espera dele. Vai como primeiro pedido assim que o cartão fica pronto. */
  prompt: string
  /** Pasta própria de quem nasce nesta função; vazia, vale a do espaço. */
  pasta?: string
  /** Preset preferido (id). Sem ele, a função usa o preset que o usuário escolher na hora. */
  preset?: string
}

export interface PresetAgente {
  id: string
  nome: string
  agente: Agente
  /** Linha de comando digitada quando o terminal abre (vazia = só o shell). */
  comando: string
}

interface NoBase {
  id: string
  x: number
  y: number
  largura: number
  altura: number
  /** Ordem de empilhamento: maior fica por cima. */
  z: number
  criadoEm: string
  /** Cor do cartão (destaque no terminal e nos cartões; cor do texto no texto solto; tom do post-it). */
  cor?: string
  /** Travado: não move, não redimensiona e não apaga até destravar. */
  travado?: boolean
  /** Grupo (como o "agrupar" do Canva): itens com o mesmo grupo são selecionados e movidos juntos. */
  grupo?: string
}

export interface NoTerminal extends NoBase {
  tipo: 'terminal'
  nome: string
  agente: Agente
  comando: string
  /** Pasta própria; sem ela, a pasta do espaço. */
  pasta?: string
  /** Conversa do agente, para retomar ao reabrir (Claude: escolhida ao criar; Codex: descoberta depois). */
  sessao?: string
  /** Cartão do agente que abriu este pelo `mpro abrir` (só ele pode fechar). */
  criadoPor?: string
  /** Nome da função com que este cartão nasceu, para você e as partituras saberem o papel dele. */
  funcao?: string
  /** false: o usuário fechou o cartão de código deste agente, então ele não nasce mais sozinho. */
  codigoSozinho?: boolean
  /**
   * Para onde o usuário arrastou a árvore principal de arquivos deste agente (pela bolinha das ligações), em
   * relação ao lugar padrão — à direita dele, alinhada pelo topo. Guardado aqui, e não em cada cartão, porque
   * é a árvore que anda: o arquivo que chegar depois nasce no lugar novo.
   */
  codigoDesloc?: { x: number; y: number }
  /**
   * Árvores de código além da principal. Servem para separar os arquivos por assunto — o agente cria uma por
   * frente de trabalho e diz "leia os arquivos da árvore X". A principal não fica nesta lista.
   */
  arvores?: ArvoreDeCodigo[]
  /** Em qual árvore nascem os próximos arquivos deste agente. Vazio: a principal. */
  arvoreAtiva?: string
}

/** Um ramo de arquivos de um agente, com nome, do jeito de um mapa mental. */
export interface ArvoreDeCodigo {
  id: string
  nome: string
  /** Para onde o usuário arrastou esta árvore, em relação ao lugar padrão dela. */
  desloc?: { x: number; y: number }
}

export type CorPostIt = 'amarelo' | 'rosa' | 'azul' | 'verde' | 'roxo'

export interface NoPostIt extends NoBase {
  tipo: 'postit'
  /** Nome do arquivo .md dentro de `notas/` do espaço. */
  arquivo: string
  cor: CorPostIt
}

export interface NoTexto extends NoBase {
  tipo: 'texto'
  texto: string
  tamanhoFonte: number
  mono: boolean
  cor?: string
}

export interface NoArquivo extends NoBase {
  tipo: 'arquivo'
  caminho: string
  nomeExibido: string
}

/** Árvore de arquivos de uma pasta, navegável no quadro. */
export interface NoPasta extends NoBase {
  tipo: 'pasta'
  caminho: string
  /** Subpastas abertas (caminhos completos). */
  expandidas: string[]
}

/**
 * Cartão que mostra o código: acompanha um cartão de terminal e segue o arquivo que o agente mexeu por
 * último, ou fica preso num arquivo escolhido à mão.
 */
export interface NoCodigo extends NoBase {
  tipo: 'codigo'
  /** Terminal acompanhado; sem ele (ou se o cartão saiu do quadro), segue a pasta do espaço ou do andar. */
  terminal?: string
  /**
   * O arquivo que o cartão mostra. Fica vazio só no instante entre abrir o cartão e o agente gravar algo:
   * na primeira gravação ele passa a ser o cartão daquele arquivo, e o próximo arquivo abre outro cartão.
   */
  caminho?: string
  /** O que mudou desde o último commit, ou o arquivo inteiro. */
  modo: 'diff' | 'conteudo'
  /** Só o cabeçalho à mostra, para não espalhar o quadro. */
  recolhido?: boolean
  /** Tamanho de antes de recolher, para o cartão voltar ao que era. */
  alturaAberta?: number
  larguraAberta?: number
  /**
   * O cartão está na coluna do agente, arrumada pelo app. Ler, recolher, redimensionar e mesmo arrastar
   * dentro da coluna não tiram ele daqui — só arrastar para longe dela, ou o menu. Fora da coluna, o cartão
   * fica onde o usuário o deixou.
   */
  automatico?: boolean
  /** Lugar na coluna, de cima para baixo. É o que guarda a ordem quando você arrasta um cartão para outra. */
  ordem?: number
  /** Árvore do agente a que este cartão pertence. Vazio: a árvore principal. */
  arvore?: string
}

/** Navegador dentro do quadro. */
export interface NoPortal extends NoBase {
  tipo: 'portal'
  url: string
}

/** Imagem colada (print): o arquivo mora em `imagens/` do espaço. */
export interface NoImagem extends NoBase {
  tipo: 'imagem'
  /** Nome do arquivo .png dentro de `imagens/` do espaço. */
  arquivo: string
}

export interface EntradaPasta {
  nome: string
  caminho: string
  ehPasta: boolean
}

export type No = NoTerminal | NoPostIt | NoTexto | NoArquivo | NoPasta | NoPortal | NoImagem | NoCodigo
export type TipoNo = No['tipo']

/** Ligação entre dois terminais: é a permissão de um agente falar com o outro pelo `mpro`. */
export interface Corda {
  id: string
  de: string
  para: string
  criadoEm: string
}

export type FerramentaDesenho = 'lapis' | 'retangulo' | 'seta'
/** O que a barra de desenho escolhe: uma forma ou a borracha (que apaga traços). */
export type PincelDesenho = FerramentaDesenho | 'borracha'

export interface Desenho {
  id: string
  ferramenta: FerramentaDesenho
  /** Lápis: todos os pontos; retângulo e seta: início e fim. Coordenadas do quadro. */
  pontos: Array<[number, number]>
  cor: string
  espessura: number
  z: number
  grupo?: string
}

export interface Camera {
  x: number
  y: number
  zoom: number
}

/** O conteúdo de um nível do quadro: o térreo (o próprio espaço) e cada andar têm o seu. */
export interface Plano {
  camera: Camera
  nos: No[]
  cordas: Corda[]
  desenhos: Desenho[]
}

export type EstadoAndar = 'trabalhando' | 'travado' | 'revisao' | 'pronto'

/**
 * Andar: um nível dentro do espaço, com quadro próprio. Com git, ganha um ramo e uma pasta isolada
 * (git worktree) para mexer sem tocar no projeto principal; depois é "pousado" (juntado) ou apagado.
 */
export interface Andar extends Plano {
  id: string
  nome: string
  criadoEm: string
  git: null | {
    ramo: string
    /** Pasta do worktree, onde os terminais deste andar abrem. */
    pasta: string
    /** Ramo do projeto principal quando o andar nasceu. */
    ramoBase: string
  }
  status?: { texto: string; estado: EstadoAndar }
}

export interface Espaco extends Plano {
  versao: 1
  id: string
  nome: string
  /** Pasta do projeto: onde os terminais abrem. */
  pasta: string
  cor: string
  icone: string
  criadoEm: string
  abertoEm: string
  andares: Andar[]
  /** Andar à mostra; null = térreo. */
  andarAtivo: string | null
}

export interface ResumoAndar {
  id: string
  nome: string
  ramo: string | null
  estado?: EstadoAndar
}

export interface ResumoEspaco {
  id: string
  nome: string
  cor: string
  icone: string
  pasta: string
  terminais: number
  andares: ResumoAndar[]
}

/** Situação do git de um andar, lida na hora (não fica salva). */
export interface SituacaoAndar {
  /** Commits do andar que o principal ainda não tem. */
  commitsAFrente: number
  /** Arquivos mudados no andar e ainda fora de commit. */
  alterados: number
  /** Arquivos mudados no projeto principal e ainda fora de commit (atrapalham juntar). */
  alteradosNoPrincipal: number
  ramoPrincipal: string
  /** Ramo de onde o andar nasceu. */
  ramoBase: string
  /** O principal está sem ramo aberto (HEAD solto): juntar fica bloqueado. */
  destacado: boolean
}

export interface ResultadoGit {
  ok: boolean
  mensagem: string
  arquivos?: string[]
}

export type Tema = 'escuro' | 'claro'

export interface Preferencias {
  versao: 1
  tema: Tema
  presets: PresetAgente[]
  /** Campo novo: sem ele, não há nenhuma função guardada. */
  funcoes?: Funcao[]
  corPostItPadrao: CorPostIt
  /** false esconde as linhas entre o agente e os cartões de código dele. Campo novo: sem ele, mostra. */
  linhasDoCodigo?: boolean
}

export interface EstadoJanela {
  versao: 1
  espacoAtivo: string | null
  lateralAberta: boolean
  /** Barra da direita: as pastas que o usuário deixou abertas ali. Campo novo: arquivo antigo não tem. */
  explorador?: { aberto: boolean; raizes: string[] }
}

export interface EspacoCarregado {
  espaco: Espaco
  /** Conteúdo de cada post-it, pelo nome do arquivo. */
  notas: Record<string, string>
}

export const PRESETS_PADRAO: PresetAgente[] = [
  { id: 'claude', nome: 'Claude Code', agente: 'claude', comando: 'claude' },
  { id: 'codex', nome: 'Codex', agente: 'codex', comando: 'codex' },
  { id: 'shell', nome: 'PowerShell', agente: 'shell', comando: '' }
]
