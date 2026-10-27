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
  /** Traz para o espaço uma imagem guardada no momento de copiar; devolve o nome novo (null se não existe). */
  trazerImagem(arquivo: string, paraEspaco: string): Promise<string | null>
}

/** Como está a página de um portal (Chrome do app). */
export interface EstadoPortal {
  url: string
  titulo: string
  carregando: boolean
  voltar: boolean
  avancar: boolean
  /** A janela de verdade do Chrome está à mostra (fora do quadro). */
  naTela: boolean
}

/** O que o Chrome do app manda para o cartão de um portal. */
export type AvisoPortal =
  /** Um quadro da página (JPEG em base64). */
  | { tipo: 'quadro'; jpeg: string }
  | { tipo: 'estado'; estado: EstadoPortal }
  /** A página abriu outra janela (login, link em aba nova): vira outro cartão, ligado à aba `alvo`. */
  | { tipo: 'janelaNova'; alvo: string; url: string }
  /** A aba fechou (a página se fechou, ou o Chrome foi fechado). */
  | { tipo: 'fechou'; pelaPagina: boolean }
  /** alert, confirm ou prompt da página: o cartão pergunta e responde. */
  | { tipo: 'dialogo'; tipoDialogo: string; mensagem: string; padrao: string }

/** Mouse, roda e teclado do cartão, repassados para a página. Coordenadas em pixels da página. */
export type EntradaPortal =
  | {
      tipo: 'mouse'
      evento: 'mousePressed' | 'mouseReleased' | 'mouseMoved'
      x: number
      y: number
      botao: 'none' | 'left' | 'middle' | 'right'
      botoes: number
      cliques: number
      modificadores: number
    }
  | { tipo: 'roda'; x: number; y: number; dx: number; dy: number; modificadores: number }
  | {
      tipo: 'tecla'
      evento: 'keyDown' | 'rawKeyDown' | 'keyUp'
      key: string
      code: string
      texto?: string
      codigoTecla: number
      modificadores: number
      comandos?: string[]
    }

export type NavegacaoPortal = { tipo: 'ir'; url: string } | { tipo: 'voltar' } | { tipo: 'avancar' } | { tipo: 'recarregar' }

/**
 * Portal com o Chrome do app: um Chrome de verdade, com perfil próprio (os logins ficam), escondido fora da
 * tela; cada cartão é uma aba, transmitida para dentro do quadro. Os agentes usam o mesmo Chrome.
 */
export interface ApiPortal {
  /** Há Chrome (ou Edge) no PC? Sem ele, o portal usa o navegador embutido. */
  disponivel(): Promise<boolean>
  /** Liga o cartão a uma aba (nova, com `url`, ou a `alvo`, uma janela que a página abriu). */
  abrir(noId: string, url: string, alvo?: string): Promise<boolean>
  /** Tamanho da página em pixels CSS e a nitidez (pixels por pixel CSS). */
  tamanho(noId: string, largura: number, altura: number, escala: number): void
  /** Cartão fora da tela: a transmissão para (economiza CPU). */
  visivel(noId: string, sim: boolean): void
  entrada(noId: string, entrada: EntradaPortal): void
  navegar(noId: string, navegacao: NavegacaoPortal): void
  responderDialogo(noId: string, aceitar: boolean, texto?: string): void
  /** Traz a janela do Chrome para a tela (login com passkey, extensões) ou devolve para o quadro. */
  alternarJanela(noId: string): void
  fechar(noId: string): void
  aoAvisar(noId: string, ouvinte: (aviso: AvisoPortal) => void): () => void
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
  /** Devolve o espaço (a janela trocou para outro, ou desistiu de abri-lo). */
  soltar(espacoId: string): Promise<void>
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
  portal: ApiPortal
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
  soltar: 'janelas:soltar',
  nova: 'janelas:nova',
  inicio: 'janelas:inicio'
} as const

export const CANAL_AVISO = 'janelas:aviso'

export const CANAIS_PORTAL = {
  disponivel: 'portal:disponivel',
  abrir: 'portal:abrir',
  tamanho: 'portal:tamanho',
  visivel: 'portal:visivel',
  entrada: 'portal:entrada',
  navegar: 'portal:navegar',
  responderDialogo: 'portal:responder-dialogo',
  alternarJanela: 'portal:alternar-janela',
  fechar: 'portal:fechar',
  aviso: 'portal:aviso'
} as const

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
