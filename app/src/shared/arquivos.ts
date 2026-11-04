// Regras puras sobre arquivos: o que vale acompanhar quando o agente escreve, o que tem cara de segredo e
// como um anexo entra na linha do prompt. Puro de propósito: é o que as provas conseguem testar fora do app.

export type AgenteAnexo = 'claude' | 'codex' | 'shell'

/** Pastas que não interessam: barulho de build, de dependência e de ferramenta. */
export const PASTAS_IGNORADAS = [
  '.git',
  'node_modules',
  'out',
  'dist',
  'build',
  '.next',
  '.turbo',
  '.cache',
  '.vite',
  '.parcel-cache',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  'target',
  'bin',
  'obj'
]

/** Arquivo gerado que muda a toda hora e não diz nada sobre o trabalho do agente. */
const BARULHENTOS = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'desktop.ini', 'thumbs.db', '.ds_store', '4913']

/** Sem texto para mostrar. */
const EXTENSOES_BINARIAS = [
  'png','jpg','jpeg','gif','webp','bmp','ico','icns','svgz','pdf','zip','rar','7z','gz','tar','xz',
  'exe','dll','so','dylib','node','pdb','lib','a','o','obj','class','jar','wasm','bin','dat','db','sqlite',
  'mp3','mp4','mov','avi','mkv','wav','ogg','ttf','otf','woff','woff2','eot','psd','ai','blend'
]

/** Arquivo que a ferramenta está no meio de gravar: aparece, muda de nome e some. */
const TEMPORARIOS = [/~$/, /\.tmp$/, /\.temp$/, /\.swp$/, /\.swx$/, /\.partial$/, /\.crdownload$/, /^\.#/, /^~\$/]

/**
 * Cara de segredo: credencial, chave ou token. Nunca mostro o conteúdo — nem seguindo a pasta, nem preso à mão.
 * O custo de um falso positivo é não ver um arquivo; o de um falso negativo é uma chave na tela (ou na gravação).
 */
export function temCaraDeSegredo(caminho: string): boolean {
  const nome = (nomeDoArquivo(caminho) || '').toLowerCase()
  if (!nome) return false
  if (nome === '.env' || nome.startsWith('.env.') || nome.endsWith('.env')) return true
  if (['.mcp.json', '.npmrc', '.netrc', '_netrc', '.pgpass', '.htpasswd', '.pypirc'].includes(nome)) return true
  if (/^google-.*\.json$/.test(nome)) return true
  if (/^id_(rsa|dsa|ecdsa|ed25519)/.test(nome)) return true
  if (/\.(pem|key|pfx|p12|ppk|keystore|jks|asc|gpg|kdbx)$/.test(nome)) return true
  // palavra inteira: `tokenizer.ts` é código, `access_token.json` é segredo
  return /(^|[._-])(secret|secrets|credential|credentials|segredo|segredos|senha|senhas|token|tokens)([._-]|$)/.test(nome)
}

export const nomeDoArquivo = (caminho: string): string => partes(caminho).pop() ?? ''

// Barra dos dois tipos. A invertida entra como escape unicode de propósito: escrita crua, ela se perde em
// ferramenta que edita este arquivo por linha de comando, e o separador do Windows sumia sem avisar.
const partes = (caminho: string): string[] => caminho.split(/[/\u005C]/).filter(Boolean)

/** Windows não diferencia maiúscula de minúscula em caminho. */
const mesmoNome = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase()

/**
 * Caminho de `caminho` a partir de `pasta`, com barra para frente (é a forma que o `@` dos agentes aceita).
 * null quando está fora da pasta — ou quando é a própria pasta.
 */
export function caminhoRelativo(pasta: string, caminho: string): string | null {
  const raiz = partes(pasta)
  const alvo = partes(caminho)
  if (alvo.length <= raiz.length) return null
  if (!raiz.every((parte, i) => mesmoNome(parte, alvo[i]))) return null
  return alvo.slice(raiz.length).join('/')
}

/** Vale seguir este arquivo (caminho relativo à pasta vigiada)? */
export function valeSeguir(relativo: string): boolean {
  const pedacos = partes(relativo)
  if (!pedacos.length) return false
  const nome = pedacos[pedacos.length - 1].toLowerCase()
  if (pedacos.slice(0, -1).some((p) => PASTAS_IGNORADAS.includes(p.toLowerCase()))) return false
  if (BARULHENTOS.includes(nome)) return false
  if (TEMPORARIOS.some((r) => r.test(nome))) return false
  if (EXTENSOES_BINARIAS.includes(nome.split('.').pop() ?? '')) return false
  return !temCaraDeSegredo(nome)
}

/**
 * Como um arquivo entra na linha do prompt. O `@` do Claude e do Codex só funciona com caminho relativo à
 * pasta onde o agente abriu, e espaço no meio quebra o completar: nesses casos vai o caminho inteiro, entre
 * aspas. O shell não tem `@`.
 */
export function textoDoAnexo(caminho: string, pasta: string, agente: AgenteAnexo): string {
  const relativo = caminhoRelativo(pasta, caminho)
  if (agente !== 'shell' && relativo && !/\s/.test(relativo)) return `@${relativo}`
  return /\s/.test(caminho) ? `"${caminho}"` : caminho
}

/** Vários anexos de uma vez, prontos para escrever no terminal (com o espaço final, para o usuário seguir digitando). */
export function textoDosAnexos(caminhos: string[], pasta: string, agente: AgenteAnexo): string {
  const texto = caminhos.map((c) => textoDoAnexo(c, pasta, agente)).join(' ')
  return texto ? `${texto} ` : ''
}

/**
 * Vale vigiar esta pasta à espera de código? A vigia é recursiva: apontada para a pasta do usuário, para a
 * raiz de um disco ou para uma pasta de sistema, ela observa dezenas de milhares de arquivos e abre cartão
 * para qualquer coisa que **outro programa** grave ali (navegador, OneDrive, o próprio Claude em ~/.claude).
 *
 * A comparação é pela pasta exata, não pelo que está dentro: um projeto dentro da pasta do usuário continua
 * valendo, que é o caso normal.
 */
export function pastaVigiavel(pasta: string, casa: string): boolean {
  const limpa = (p: string): string => p.replace(/[/\u005C]+$/, '').toLowerCase()
  const alvo = limpa(pasta)
  if (!alvo) return false
  // raiz de disco (C:, C:\) ou do sistema de arquivos (/)
  if (/^[a-z]:$/.test(alvo) || alvo === '/') return false
  if (alvo === limpa(casa)) return false
  const proibidas = [
    'appdata',
    'appdata/local',
    'appdata/roaming',
    'appdata/locallow',
    'onedrive',
    'documents',
    'documentos',
    'downloads',
    'desktop',
    'área de trabalho',
    'area de trabalho'
  ]
  const dentroDaCasa = alvo.startsWith(limpa(casa) + '/') || alvo.startsWith(limpa(casa) + '\u005C')
  if (dentroDaCasa) {
    const resto = alvo.slice(limpa(casa).length + 1).split(/[/\u005C]/).join('/')
    if (proibidas.includes(resto)) return false
  }
  const sistema = ['c:/windows', 'c:/program files', 'c:/program files (x86)', 'c:/programdata']
  return !sistema.includes(alvo.split(/[/\u005C]/).join('/'))
}
