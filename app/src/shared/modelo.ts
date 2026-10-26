// O que fica salvo em disco. Toda mudança de formato sobe a `versao` e ganha uma migração.

export type Agente = 'claude' | 'codex' | 'shell'

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
}

export interface NoTerminal extends NoBase {
  tipo: 'terminal'
  nome: string
  agente: Agente
  comando: string
  /** Pasta própria; sem ela, a pasta do espaço. */
  pasta?: string
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

export type No = NoTerminal | NoPostIt | NoTexto | NoArquivo
export type TipoNo = No['tipo']

/** Ligação entre dois terminais: é a permissão de um agente falar com o outro (integração depois). */
export interface Corda {
  id: string
  de: string
  para: string
  criadoEm: string
}

export type FerramentaDesenho = 'lapis' | 'retangulo' | 'seta'

export interface Desenho {
  id: string
  ferramenta: FerramentaDesenho
  /** Lápis: todos os pontos; retângulo e seta: início e fim. Coordenadas do quadro. */
  pontos: Array<[number, number]>
  cor: string
  espessura: number
  z: number
}

export interface Camera {
  x: number
  y: number
  zoom: number
}

export interface Espaco {
  versao: 1
  id: string
  nome: string
  /** Pasta do projeto: onde os terminais abrem. */
  pasta: string
  cor: string
  icone: string
  criadoEm: string
  abertoEm: string
  camera: Camera
  nos: No[]
  cordas: Corda[]
  desenhos: Desenho[]
}

export interface ResumoEspaco {
  id: string
  nome: string
  cor: string
  icone: string
  pasta: string
  terminais: number
}

export type Tema = 'escuro' | 'claro'

export interface Preferencias {
  versao: 1
  tema: Tema
  presets: PresetAgente[]
  corPostItPadrao: CorPostIt
}

export interface EstadoJanela {
  versao: 1
  espacoAtivo: string | null
  lateralAberta: boolean
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
