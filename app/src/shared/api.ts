// Contrato entre a janela (renderer) e o processo principal, exposto pelo preload em window.mp.
import type { EntradaPasta, EspacoCarregado, EstadoJanela, Preferencias, ResumoEspaco } from './modelo'

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
}

export interface ApiMaestri {
  terminal: ApiTerminal
  dados: ApiDados
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
  listarPasta: 'dados:listar-pasta'
} as const
