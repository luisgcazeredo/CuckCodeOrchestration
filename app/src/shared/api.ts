// Contrato entre a janela (renderer) e o processo principal, exposto pelo preload em window.mp.
import type {
  Andar,
  EntradaPasta,
  EspacoCarregado,
  EstadoJanela,
  Preferencias,
  ResultadoGit,
  ResumoEspaco,
  SituacaoAndar
} from './modelo'

export interface OpcoesTerminal {
  colunas: number
  linhas: number
  /** Pasta onde o terminal abre; sem ela, a pasta do usuário. */
  pasta?: string
}

export interface ApiTerminal {
  criar(opcoes: OpcoesTerminal): Promise<string>
  escrever(id: string, dados: string): void
  redimensionar(id: string, colunas: number, linhas: number): void
  encerrar(id: string): void
  /** Saída de um terminal só. Devolve a função que cancela a inscrição. */
  aoReceber(id: string, ouvinte: (dados: string) => void): () => void
  aoSair(id: string, ouvinte: (codigo: number) => void): () => void
}

export interface ApiDados {
  listarEspacos(): Promise<ResumoEspaco[]>
  carregarEspaco(id: string): Promise<EspacoCarregado | null>
  salvarEspaco(carregado: EspacoCarregado): Promise<ResumoEspaco>
  criarEspaco(nome: string, pasta: string): Promise<ResumoEspaco>
  carregarPreferencias(): Promise<Preferencias>
  salvarPreferencias(preferencias: Preferencias): Promise<void>
  carregarEstado(): Promise<EstadoJanela>
  salvarEstado(estado: EstadoJanela): Promise<void>
  escolherPasta(): Promise<string | null>
  escolherArquivo(): Promise<{ caminho: string; nome: string } | null>
  abrirArquivo(caminho: string): Promise<string>
  /** Conteúdo de `caminho`, que precisa estar dentro de `raiz` (a pasta de uma árvore do quadro). */
  listarPasta(raiz: string, caminho: string): Promise<EntradaPasta[]>
  /** Apaga o espaço do app (quadro e post-its). A pasta do projeto não é tocada. */
  apagarEspaco(id: string): Promise<void>
  /** Mostra no Explorer: pasta de espaço ou de andar, arquivo anexado, ou algo dentro de uma árvore do quadro. */
  mostrarNoExplorer(caminho: string): Promise<string>
  /** Renomeia um espaço que não está aberto nesta janela (se estiver em outra, ela é que renomeia). */
  renomearEspaco(id: string, nome: string): Promise<void>
}

export interface ApiAndares {
  situacaoGit(espacoId: string): Promise<{ repositorio: boolean; ramo: string | null }>
  /** Cria o andar (com git: ramo + worktree). Ele volta vazio; quem chama põe no espaço e salva. */
  criar(espacoId: string, nome: string, usarGit: boolean): Promise<Andar>
  situacao(espacoId: string, andarId: string): Promise<SituacaoAndar | null>
  /** Junta o ramo do andar em `destino` (o ramo do principal que o usuário confirmou) e remove o worktree. */
  pousar(espacoId: string, andarId: string, apagarRamo: boolean, destino: string): Promise<ResultadoGit>
  apagar(espacoId: string, andarId: string, apagarRamo: boolean, forcar: boolean): Promise<ResultadoGit>
}

/** O que estava na área de transferência, já interpretado pelo processo principal. */
export type ConteudoArea =
  /** Cartões copiados neste app (a assinatura confere). */
  | { tipo: 'fragmento'; json: string; espacoOrigem: string }
  /** Imagem (print), já gravada como arquivo do espaço. */
  | { tipo: 'imagem'; arquivo: string; largura: number; altura: number }
  | { tipo: 'texto'; texto: string }
  | { tipo: 'nada' }

export interface ApiArea {
  /** Copia cartões (JSON assinado pelo app), com um texto simples para quem colar fora do app. */
  copiar(json: string, espacoOrigem: string, texto: string): Promise<void>
  /** Lê a área de transferência. Uma imagem é gravada em `imagens/` do espaço `espacoId`. */
  colar(espacoId: string): Promise<ConteudoArea>
  /** Copia uma imagem de outro espaço para este e devolve o nome novo (null se ela não existe mais). */
  trazerImagem(deEspaco: string, arquivo: string, paraEspaco: string): Promise<string | null>
}

/** Avisos que o processo principal manda para cada janela. */
export type AvisoJanelas =
  /** Espaços foram criados ou apagados: ler a lista de novo. */
  | { tipo: 'lista' }
  /** Um espaço mudou (salvo ou renomeado em outra janela). */
  | { tipo: 'resumo'; resumo: ResumoEspaco }
  /** Espaços abertos nas outras janelas. */
  | { tipo: 'abertos'; ids: string[] }
  /** Outra janela pediu para renomear o espaço que esta mostra. */
  | { tipo: 'renomear'; espacoId: string; nome: string }
  /** Tema ou outra preferência mudou em outra janela. */
  | { tipo: 'preferencias' }

export interface ApiJanelas {
  /** Fica com o espaço nesta janela. false: ele já está aberto em outra janela, que vem para a frente. */
  reservar(espacoId: string): Promise<boolean>
  /** Abre uma janela nova. Com espaço, mostra ele (se já estiver aberto em outra, traz aquela para a frente). */
  nova(espacoId: string | null): Promise<void>
  /** Com que espaço esta janela começa e quais estão abertos nas outras. */
  inicio(): Promise<{ espacoId: string | null; abertosEmOutras: string[] }>
  aoAvisar(ouvinte: (aviso: AvisoJanelas) => void): void
}

export interface ApiMaestri {
  terminal: ApiTerminal
  dados: ApiDados
  andares: ApiAndares
  area: ApiArea
  janelas: ApiJanelas
  /** Chamado quando a janela vai fechar; `salvar` diz se gravou. Se não gravou, o app pergunta antes de fechar. */
  aoPedirFechar(salvar: () => Promise<boolean>): void
  autoteste: boolean
}

export const CANAIS_APP = {
  vaiFechar: 'app:vai-fechar',
  podeFechar: 'app:pode-fechar'
} as const

export const CANAIS = {
  criar: 'terminal:criar',
  escrever: 'terminal:escrever',
  redimensionar: 'terminal:redimensionar',
  encerrar: 'terminal:encerrar',
  dados: 'terminal:dados',
  saida: 'terminal:saida'
} as const

export const CANAIS_DADOS = {
  listarEspacos: 'dados:listar-espacos',
  carregarEspaco: 'dados:carregar-espaco',
  salvarEspaco: 'dados:salvar-espaco',
  criarEspaco: 'dados:criar-espaco',
  carregarPreferencias: 'dados:carregar-preferencias',
  salvarPreferencias: 'dados:salvar-preferencias',
  carregarEstado: 'dados:carregar-estado',
  salvarEstado: 'dados:salvar-estado',
  escolherPasta: 'dados:escolher-pasta',
  escolherArquivo: 'dados:escolher-arquivo',
  abrirArquivo: 'dados:abrir-arquivo',
  listarPasta: 'dados:listar-pasta',
  apagarEspaco: 'dados:apagar-espaco',
  mostrarNoExplorer: 'dados:mostrar-no-explorer',
  renomearEspaco: 'dados:renomear-espaco'
} as const

export const CANAIS_JANELAS = {
  reservar: 'janelas:reservar',
  nova: 'janelas:nova',
  inicio: 'janelas:inicio'
} as const

export const CANAL_AVISO = 'janelas:aviso'

export const CANAIS_AREA = {
  copiar: 'area:copiar',
  colar: 'area:colar',
  trazerImagem: 'area:trazer-imagem'
} as const

export const CANAIS_ANDARES = {
  situacaoGit: 'andares:situacao-git',
  criar: 'andares:criar',
  situacao: 'andares:situacao',
  pousar: 'andares:pousar',
  apagar: 'andares:apagar'
} as const
