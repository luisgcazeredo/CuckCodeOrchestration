/**
 * Partituras: um time salvo e reaplicável — os agentes com as funções e os comandos deles, os recados
 * (textos e post-its), as cordas entre os agentes e os grupos.
 *
 * Tudo aqui é função pura sobre o plano à mostra: a janela só aplica o que volta, e as provas rodam sem
 * Electron. As decisões que valem para toda partitura:
 *
 * - **Pasta não é salva.** A partitura é o time, não o projeto: cada cartão abre na pasta do espaço onde
 *   subiu (ou na pasta da função, quando ela tem uma). Guardar o caminho de outro projeto subiria o time
 *   inteiro mexendo na pasta errada.
 * - **O prompt vem da função, na hora de subir**, nunca de uma cópia feita no dia em que se salvou. Função
 *   que não existe mais: o cartão sobe com o nome do papel e sem primeiro pedido — e a resposta diz isso,
 *   em vez de inventar um prompt.
 * - **Nada é apagado para abrir espaço.** Se o lugar escolhido está ocupado, o arranjo desce até achar um
 *   canto livre.
 * - **Agente e usuário sobem o mesmo time, com um laço de diferença:** subida por agente nasce ligada a ele
 *   (corda) e sob a responsabilidade dele, como o `mpro abrir` — e, como ele, fica fora do desfazer, porque
 *   o Ctrl+Z do usuário não mata sessão de agente no meio do trabalho; quem subiu fecha com `mpro fechar`.
 *   Subida pelo usuário é cartão do usuário: entra no desfazer e sai inteira com um Ctrl+Z.
 */
import type { Corda, Funcao, No, NoPostIt, NoTerminal, NoTexto, Partitura, PecaDePartitura, Plano } from '../modelo'
// Node executa as provas TypeScript diretamente e precisa da extensão nestes imports de execução.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { MAX_NOS } from './agente.ts'
// @ts-expect-error idem.
import { caixaDoNo, proximoZ, tocam, type Caixa } from './geometria.ts'

/** Teto de cartões numa partitura: um time, não um quadro inteiro. */
export const MAX_PECAS = 40
/** Quantas partituras ficam guardadas (a validação das preferências usa o mesmo número). */
export const MAX_PARTITURAS = 50
export const MAX_NOME_DA_PARTITURA = 80
/** Texto de recado salvo na partitura (post-it ou texto solto). */
export const MAX_TEXTO_DA_PECA = 4000
/** Folga ao procurar um canto livre para o arranjo. */
export const FOLGA = 60

export type NoSalvavel = NoTerminal | NoTexto | NoPostIt

/** O que entra numa partitura: agentes e recados. O resto do quadro (código, pasta, portal…) fica de fora. */
export const salvavel = (no: No): no is NoSalvavel => no.tipo === 'terminal' || no.tipo === 'texto' || no.tipo === 'postit'

export interface AmbienteDePartitura {
  novoId: () => string
  agora: () => string
  /** As funções guardadas: é delas que sai o prompt de cada papel na hora de subir. */
  funcoes: Funcao[]
  /** Cartão do agente que pediu: os cartões nascem ligados a ele e sob a responsabilidade dele. */
  dono?: string
  /** Limite de sessões por agente (só vale quando há `dono`). */
  limiteSessoesPorAgente?: number
}

export interface SubidaDePartitura {
  plano: Plano
  /** Os textos dos post-its que subiram, somados aos que já havia. */
  notas: Record<string, string>
  /** Cartões que subiram com função: o prompt dela é o primeiro pedido deles. */
  pedidos: Array<{ id: string; texto: string }>
  /** Ids dos cartões que subiram, na ordem da partitura (a janela seleciona esses). */
  ids: string[]
  texto: string
}

export type ResultadoDePartitura = { erro: string } | SubidaDePartitura

const ordem = (a: No, b: No): number => a.y - b.y || a.x - b.x || a.id.localeCompare(b.id)

const limitar = (texto: string): string => texto.slice(0, MAX_TEXTO_DA_PECA)

/** Linha de uma partitura numa lista: o que ela tem dentro, sem abrir. */
export function resumoDaPartitura(partitura: Partitura): string {
  const agentes = partitura.pecas.filter((p) => p.tipo === 'terminal')
  const recados = partitura.pecas.length - agentes.length
  const papeis = [...new Set(agentes.flatMap((p) => (p.tipo === 'terminal' && p.funcao ? [p.funcao] : [])))]
  const partes = [`${agentes.length} ${agentes.length === 1 ? 'agente' : 'agentes'}`]
  if (recados) partes.push(`${recados} ${recados === 1 ? 'recado' : 'recados'}`)
  if (partitura.cordas.length) partes.push(`${partitura.cordas.length} ${partitura.cordas.length === 1 ? 'corda' : 'cordas'}`)
  if (papeis.length) partes.push(`funções: ${papeis.map((p) => `"${p}"`).join(', ')}`)
  return partes.join(' · ')
}

/**
 * Salva como partitura os cartões escolhidos (ou todos os salváveis do plano, com `ids` nulo). Devolve a
 * queixa em texto quando não dá — é o que a janela e o `mpro` mostram.
 */
export function partituraDe(
  plano: Plano,
  notas: Record<string, string>,
  nome: string,
  ids: string[] | null,
  amb: Pick<AmbienteDePartitura, 'novoId' | 'agora'>
): Partitura | string {
  const limpo = nome.trim().slice(0, MAX_NOME_DA_PARTITURA)
  if (!limpo) return 'dê um nome à partitura'
  const escolhidos = ids ? plano.nos.filter((no) => ids.includes(no.id)) : plano.nos
  const nos = escolhidos.filter(salvavel).sort(ordem)
  if (!nos.some((no) => no.tipo === 'terminal')) {
    return 'uma partitura é um time: escolha pelo menos um cartão de agente (os cartões de código, pasta e portal não entram)'
  }
  if (nos.length > MAX_PECAS) return `são ${nos.length} cartões, e o limite de uma partitura é ${MAX_PECAS}`

  const minX = Math.min(...nos.map((no) => no.x))
  const minY = Math.min(...nos.map((no) => no.y))
  // só vira grupo na partitura o grupo que entrou com dois cartões ou mais (um cartão sozinho sobe solto)
  const quantos = new Map<string, number>()
  for (const no of nos) if (no.grupo) quantos.set(no.grupo, (quantos.get(no.grupo) ?? 0) + 1)
  const numeros = new Map<string, number>()
  const grupoDe = (grupo?: string): number | undefined => {
    if (!grupo || (quantos.get(grupo) ?? 0) < 2) return undefined
    if (!numeros.has(grupo)) numeros.set(grupo, numeros.size)
    return numeros.get(grupo)
  }

  const pecas: PecaDePartitura[] = nos.map((no) => {
    const base = {
      x: no.x - minX,
      y: no.y - minY,
      largura: no.largura,
      altura: no.altura,
      ...(no.cor ? { cor: no.cor } : {}),
      ...(grupoDe(no.grupo) === undefined ? {} : { grupo: grupoDe(no.grupo) })
    }
    if (no.tipo === 'terminal') {
      return { ...base, tipo: 'terminal', nome: no.nome, agente: no.agente, comando: no.comando, ...(no.funcao ? { funcao: no.funcao } : {}) }
    }
    if (no.tipo === 'texto') {
      return { ...base, tipo: 'texto', texto: limitar(no.texto), tamanhoFonte: no.tamanhoFonte, mono: no.mono }
    }
    return { ...base, tipo: 'postit', texto: limitar(notas[no.arquivo] ?? ''), corPostIt: no.cor }
  })

  const indices = new Map(nos.map((no, indice) => [no.id, indice]))
  const vistas = new Set<string>()
  const cordas: Array<[number, number]> = []
  for (const corda of plano.cordas) {
    const de = indices.get(corda.de)
    const para = indices.get(corda.para)
    if (de === undefined || para === undefined || de === para) continue
    if (nos[de].tipo !== 'terminal' || nos[para].tipo !== 'terminal') continue
    const chave = [Math.min(de, para), Math.max(de, para)].join('-')
    if (vistas.has(chave)) continue
    vistas.add(chave)
    cordas.push([de, para])
  }

  return {
    id: amb.novoId(),
    nome: limpo,
    criadaEm: amb.agora(),
    largura: Math.max(...nos.map((no) => no.x + no.largura)) - minX,
    altura: Math.max(...nos.map((no) => no.y + no.altura)) - minY,
    pecas,
    cordas
  }
}

/** Desce o arranjo até ele não encostar em nada. Trinta tentativas: depois, sobe mesmo encostando. */
function cantoLivre(plano: Plano, caixa: Caixa): { x: number; y: number } {
  const lugar = { ...caixa }
  for (let tentativa = 0; tentativa < 30 && plano.nos.some((no) => tocam(lugar, caixaDoNo(no), 30)); tentativa++) {
    lugar.y += lugar.altura + FOLGA
  }
  return { x: lugar.x, y: lugar.y }
}

/**
 * Sobe a partitura no plano, com o canto de cima à esquerda em (x, y) — ou mais abaixo, se ali estiver
 * ocupado. Os cartões nascem com id, grupo e conversa novos; os nomes repetidos ganham número, como no
 * `mpro abrir`.
 */
export function aplicarPartitura(
  plano: Plano,
  notas: Record<string, string>,
  partitura: Partitura,
  x: number,
  y: number,
  amb: AmbienteDePartitura
): ResultadoDePartitura {
  const pecas = partitura.pecas ?? []
  if (!pecas.length) return { erro: `a partitura "${partitura.nome}" está vazia` }
  if (pecas.length > MAX_PECAS) return { erro: `a partitura "${partitura.nome}" tem ${pecas.length} cartões, acima do limite de ${MAX_PECAS}` }
  if (plano.nos.length + pecas.length > MAX_NOS) {
    return { erro: `o andar à mostra já tem ${plano.nos.length} cartões; subir mais ${pecas.length} passaria do limite de ${MAX_NOS}` }
  }

  const agentes = pecas.filter((p) => p.tipo === 'terminal').length
  const dono = amb.dono ? plano.nos.find((no) => no.id === amb.dono && no.tipo === 'terminal') : undefined
  if (amb.dono && dono && amb.limiteSessoesPorAgente !== undefined) {
    const filhos = plano.nos.filter((no) => no.tipo === 'terminal' && no.criadoPor === amb.dono).length
    if (filhos + agentes > amb.limiteSessoesPorAgente) {
      return {
        erro: `você já tem ${filhos} sessões abertas e esta partitura abriria ${agentes}; o limite é ${amb.limiteSessoesPorAgente}`
      }
    }
  }

  const lugar = cantoLivre(plano, { x, y, largura: partitura.largura, altura: partitura.altura })
  const usados = new Set(plano.nos.flatMap((no) => (no.tipo === 'terminal' ? [no.nome.toLowerCase()] : [])))
  const grupos = new Map<number, string>()
  const grupoDe = (grupo?: number): string | undefined => {
    if (grupo === undefined) return undefined
    if (!grupos.has(grupo)) grupos.set(grupo, amb.novoId())
    return grupos.get(grupo)
  }
  const porNome = new Map(amb.funcoes.map((f) => [f.nome.trim().toLowerCase(), f]))

  let z = proximoZ(plano)
  const novas = { ...notas }
  const pedidos: Array<{ id: string; texto: string }> = []
  const semFuncao = new Set<string>()
  const linhas: string[] = []

  const nos: No[] = pecas.map((peca) => {
    const id = amb.novoId()
    const base = {
      id,
      x: lugar.x + peca.x,
      y: lugar.y + peca.y,
      largura: peca.largura,
      altura: peca.altura,
      z: z++,
      criadoEm: amb.agora(),
      ...(peca.cor ? { cor: peca.cor } : {}),
      ...(grupoDe(peca.grupo) ? { grupo: grupoDe(peca.grupo) } : {})
    }
    if (peca.tipo === 'texto') return { ...base, tipo: 'texto', texto: peca.texto, tamanhoFonte: peca.tamanhoFonte, mono: peca.mono }
    if (peca.tipo === 'postit') {
      const arquivo = `${id}.md`
      novas[arquivo] = peca.texto
      return { ...base, tipo: 'postit', arquivo, cor: peca.corPostIt }
    }
    let nome = peca.nome
    for (let indice = 2; usados.has(nome.toLowerCase()); indice++) nome = `${peca.nome} ${indice}`
    usados.add(nome.toLowerCase())
    const funcao: Funcao | undefined = peca.funcao ? porNome.get(peca.funcao.trim().toLowerCase()) : undefined
    if (peca.funcao && !funcao) semFuncao.add(peca.funcao)
    if (funcao?.prompt.trim()) pedidos.push({ id, texto: funcao.prompt })
    linhas.push(`  "${nome}" (${peca.agente})${peca.funcao ? ` · função "${peca.funcao}"${funcao ? '' : ' (não existe mais)'}` : ''}`)
    return {
      ...base,
      tipo: 'terminal',
      nome,
      agente: peca.agente,
      comando: peca.comando,
      funcao: peca.funcao,
      pasta: funcao?.pasta || undefined,
      sessao: peca.agente === 'claude' ? amb.novoId() : undefined,
      criadoPor: dono ? dono.id : undefined
    }
  })

  const cordas: Corda[] = []
  for (const [de, para] of partitura.cordas ?? []) {
    const a = nos[de]
    const b = nos[para]
    if (!a || !b || a.tipo !== 'terminal' || b.tipo !== 'terminal') continue
    cordas.push({ id: amb.novoId(), de: a.id, para: b.id, criadoEm: amb.agora() })
  }
  if (dono) {
    for (const no of nos) {
      if (no.tipo === 'terminal') cordas.push({ id: amb.novoId(), de: dono.id, para: no.id, criadoEm: amb.agora() })
    }
  }

  const texto = [
    `Subi a partitura "${partitura.nome}": ${agentes} ${agentes === 1 ? 'agente' : 'agentes'}${
      pecas.length > agentes ? ` e ${pecas.length - agentes} recado(s)` : ''
    }.`,
    ...linhas,
    ...(cordas.length ? [`${cordas.length} corda(s) desenhada(s).`] : []),
    ...(semFuncao.size
      ? [`Função que não existe mais: ${[...semFuncao].map((f) => `"${f}"`).join(', ')} — esses cartões subiram sem primeiro pedido.`]
      : []),
    ...(dono ? ['Você está ligado a todos eles e pode fechá-los com `mpro fechar`.'] : [])
  ].join('\n')

  return {
    plano: { ...plano, nos: [...plano.nos, ...nos], cordas: [...plano.cordas, ...cordas] },
    notas: novas,
    pedidos,
    ids: nos.map((no) => no.id),
    texto
  }
}
