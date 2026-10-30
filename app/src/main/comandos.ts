import { ipcMain, webContents } from 'electron'
import { randomBytes, randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type Socket } from 'node:net'
import { homedir, tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { CANAIS, CANAIS_AGENTES, MAX_SESSOES_POR_AGENTE, type PedidoDoAgente, type RespostaAoAgente, type ResumoContextoTerminal } from '../shared/api'
import type { Agente } from '../shared/modelo'
import { criarEspacoDoAgente, PASTA_DADOS, resumosDosEspacos } from './dados'
import { abrirJanela, donoDe } from './janelas'
import { AJUDA, SKILL } from './manual'
import { extrairLeituraDeContexto, extrairLeituraDoRodape } from './contexto'
import { validarChamada, type NomeDeVerbo } from './verbos'
import {
  aceitaColagem,
  cordasDoEspaco,
  encerrarAgora,
  escreverNoProcesso,
  esperarSessao,
  sessaoPorCracha,
  sessoesCriadasPor,
  sessoesDoEspaco,
  telaDe,
  type Sessao
} from './terminais'

// O `mpro`: a linha de comando dos agentes. Cada terminal do app ganha no ambiente o endereço de um pipe local
// (MP_PIPE) e um crachá próprio (MP_CRACHA), e a pasta com o `mpro` no PATH. O `mpro` (src/cli/mpro.ts) manda uma
// linha JSON e recebe uma de volta. A corda entre dois terminais é a permissão: sem corda, não há conversa.
// O nome do crachá não tem KEY, TOKEN nem SECRET: o Codex tira essas variáveis do ambiente dos comandos.
// A corda é regra de convívio, não fronteira de segurança: todos os agentes rodam como o mesmo usuário do Windows e
// um pode ler o ambiente (e o crachá) de outro. O crachá muda a cada processo e deixa de valer quando ele sai.

const AUTOTESTE = process.argv.includes('--autoteste')
const PIPE =
  process.platform === 'win32'
    ? `\\\\.\\pipe\\maestri-proprio-${randomBytes(12).toString('hex')}`
    : join(tmpdir(), `maestri-proprio-${randomBytes(12).toString('hex')}.sock`)
const PASTA_BIN = join(PASTA_DADOS, 'bin')
const MAX_PEDIDO = 512 * 1024
const MAX_CONEXOES = 128
const TEMPO_PADRAO = 100
const TEMPO_MAX = 3600
/** O que aparece na tela de quem está ocupado (Claude Code e Codex). */
const OCUPADO = /esc to interrupt|esc para interromper/i
/**
 * Rodapés e perguntas de diálogo (confiança na pasta, servidores MCP, permissão de ferramenta, atualização,
 * sim/não). Olhando só o fim da tela: o texto da conversa pode citar essas palavras.
 */
const DIALOGO =
  /enter to confirm|esc to cancel|esc to reject|enter continue|press enter to continue|update now|trust this folder|do you trust|do you want to proceed|\(y\/n\)|\[y\/n\]/i
/** Agente desenhado e esperando o primeiro pedido (Claude Code e Codex). */
const PRONTO = /for shortcuts|context left|ask codex|try "write a test for <filepath>"|auto mode on \(shift\+tab to cycle\)/i
/** A última linha é o prompt do PowerShell: o agente nem abriu, ou já saiu. */
const PROMPT_DO_SHELL = /^PS .*>\s*$/
/** Um shell esperando comando (PowerShell, cmd, bash, o >>> do Python). */
const PROMPT_LIVRE = /(^PS .*>|[>$#])\s*$/

const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** O cli.js fica fora do app.asar (asarUnpack): o Electron em modo Node roda de lá. */
function caminhoDoCli(): string {
  return join(__dirname, 'cli.js').replace(`app.asar${sep}`, `app.asar.unpacked${sep}`)
}

/** Variáveis que cada terminal ganha para o `mpro` funcionar. */
export function ambienteDoComando(s: Sessao): { pastaBin: string; variaveis: Record<string, string> } {
  return {
    pastaBin: PASTA_BIN,
    variaveis: { MP_PIPE: PIPE, MP_CRACHA: s.cracha, MP_TERMINAL: s.espec.nome, MP_NODE: process.execPath, MP_CLI: caminhoDoCli() }
  }
}

function gravarSeMudou(caminho: string, conteudo: string): void {
  try {
    if (existsSync(caminho) && readFileSync(caminho, 'utf8') === conteudo) return
    writeFileSync(caminho, conteudo, 'utf8')
  } catch (erro) {
    console.error('não consegui gravar', caminho, erro)
  }
}

/** O `mpro` no PATH dos terminais: um .cmd (PowerShell e cmd) e um script sh (o Git Bash do Claude Code). */
function instalarComando(): void {
  mkdirSync(PASTA_BIN, { recursive: true })
  gravarSeMudou(
    join(PASTA_BIN, 'mpro.cmd'),
    [
      '@echo off',
      'rem Maestri Proprio: o comando dos agentes (so funciona dentro de um terminal do app)',
      'if not defined MP_PIPE (echo mpro: so funciona dentro de um terminal do Maestri Proprio 1>&2 & exit /b 2)',
      'setlocal',
      'set ELECTRON_RUN_AS_NODE=1',
      '"%MP_NODE%" "%MP_CLI%" %*',
      'exit /b %ERRORLEVEL%',
      ''
    ].join('\r\n')
  )
  gravarSeMudou(
    join(PASTA_BIN, 'mpro'),
    [
      '#!/bin/sh',
      '# Maestri Proprio: o comando dos agentes (so funciona dentro de um terminal do app)',
      'if [ -z "$MP_PIPE" ]; then echo "mpro: so funciona dentro de um terminal do Maestri Proprio" >&2; exit 2; fi',
      'ELECTRON_RUN_AS_NODE=1 exec "$MP_NODE" "$MP_CLI" "$@"',
      ''
    ].join('\n')
  )
  // o manual vira skill do Claude Code e do Codex (decisão do Luís, 28/10/2026); fora do app ela manda não usar
  if (AUTOTESTE) return
  for (const pasta of [process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), process.env.CODEX_HOME || join(homedir(), '.codex')]) {
    if (!existsSync(pasta)) continue
    const destino = join(pasta, 'skills', 'maestri-proprio')
    mkdirSync(destino, { recursive: true })
    gravarSeMudou(join(destino, 'SKILL.md'), SKILL)
  }
}

// ---------- pedidos que mexem no quadro: vão para a janela dona do espaço ----------

const respostas = new Map<string, { janela: number; resolver: (r: RespostaAoAgente) => void }>()
/** Aberturas em andamento por agente (contam no limite enquanto a janela cria o cartão). */
const abrindo = new Map<string, number>()
/** Janelas que já instalaram o atendente do renderer. */
const janelasProntas = new Set<number>()

function janelaDoEspaco(espacoId: string) {
  const dono = donoDe(espacoId)
  const janela = dono !== undefined ? webContents.fromId(dono) : undefined
  return janela && !janela.isDestroyed() ? janela : undefined
}

/** Uma janela reservada ainda está carregando: pedido antes do atendente se perderia no IPC. */
async function abrirJanelaPronta(espacoId: string): Promise<{ jaEstavaAberta: boolean }> {
  const jaEstavaAberta = !!janelaDoEspaco(espacoId)
  if (!abrirJanela(espacoId)) throw new Error('não consegui abrir uma janela para este espaço')
  for (const limite = Date.now() + 10_000; Date.now() < limite; await esperar(50)) {
    const janela = janelaDoEspaco(espacoId)
    if (janela && janelasProntas.has(janela.id)) return { jaEstavaAberta }
  }
  throw new Error('a janela do espaço abriu, mas não ficou pronta para atender em 10 s; tente de novo')
}

function pedirAJanela(pedido: PedidoDoAgente): Promise<RespostaAoAgente> {
  const janela = janelaDoEspaco(pedido.espacoId)
  if (!janela) {
    return Promise.resolve({ ok: false, erro: 'o espaço deste terminal não está aberto em nenhuma janela; peça ao usuário para abri-lo' })
  }
  const id = randomUUID()
  return new Promise((resolver) => {
    const limite = setTimeout(() => {
      respostas.delete(id)
      resolver({ ok: false, erro: 'a janela do app não respondeu' })
    }, 10_000)
    respostas.set(id, {
      janela: janela.id,
      resolver: (r) => {
        clearTimeout(limite)
        respostas.delete(id)
        resolver(r)
      }
    })
    janela.send(CANAIS_AGENTES.pedido, id, pedido)
  })
}

// ---------- estado e espera ----------

/** `pergunta`: parado num diálogo, esperando alguém responder (nada deve ser digitado nele por engano). */
type Situacao = 'encerrado' | 'trabalhando' | 'pergunta' | 'livre'

/**
 * Poucas linhas podem deixar passar uma pergunta verdadeira e fazer o mpro digitar em cima dela (foi assim que
 * o Codex atualizou sem querer em 28/10); linhas demais tratam uma citação velha como pergunta e travam à toa.
 */
function ultimasLinhasComTexto(tela: string, quantidade = 6): string {
  return tela.split('\n').filter((linha) => linha.trim()).slice(-quantidade).join('\n')
}

function situacaoNaTela(s: Sessao, tela: string): Situacao {
  if (!s.processo) return 'encerrado'
  // a pergunta vem antes de "teve saída agora": uma pergunta que acabou de aparecer não pode receber texto
  if (s.espec.agente !== 'shell' && DIALOGO.test(ultimasLinhasComTexto(tela))) return 'pergunta'
  if (Date.now() - s.ultimaSaida < 1200) return 'trabalhando'
  // shell: livre só com o prompt no fim (um comando quieto, como um Start-Sleep, ainda está rodando)
  if (s.espec.agente === 'shell') return PROMPT_LIVRE.test(tela.split('\n').pop() ?? '') ? 'livre' : 'trabalhando'
  return OCUPADO.test(tela) ? 'trabalhando' : 'livre'
}

async function situacao(s: Sessao): Promise<Situacao> {
  return situacaoNaTela(s, await telaDe(s, 20))
}

export { extrairContextoRestante } from './contexto'

type LeituraDoContexto = { contexto: number | null; medidoEm?: number; agora: boolean; codex: boolean }
// A chave fraca acompanha a própria sessão: quando o cartão é removido pelo terminal, seu cache não fica retido.
const ultimosContextos = new WeakMap<Sessao, { contexto: number; medidoEm: number }>()

function ultimoContexto(s: Sessao, codex = false): LeituraDoContexto {
  const ultimo = ultimosContextos.get(s)
  return ultimo
    ? { contexto: ultimo.contexto, medidoEm: ultimo.medidoEm, agora: false, codex }
    : { contexto: null, agora: false, codex }
}

function guardarContexto(s: Sessao, contexto: number): LeituraDoContexto {
  const medidoEm = Date.now()
  ultimosContextos.set(s, { contexto, medidoEm })
  return { contexto, medidoEm, agora: true, codex: false }
}

/** Leitura sem digitar nada. A saída de `/context` só vale quando foi medida por este processo. */
function contextoNaTela(s: Sessao, tela: string): LeituraDoContexto {
  if (s.espec.agente === 'codex') return ultimoContexto(s, true)
  const leitura = extrairLeituraDoRodape(tela)
  if (leitura) return guardarContexto(s, leitura.percentual)
  return ultimoContexto(s)
}

/**
 * No Claude, `/context` é a única fonte real de contexto. Só o `mpro orcamento` pede essa medição, e apenas se o
 * terminal estiver livre; `quem` e o painel ficam no último valor bom para não poluir conversas em segundo plano.
 */
async function medirContextoDoClaude(s: Sessao, telaAntes: string, cancelado: () => boolean): Promise<number | null> {
  const limite = Date.now() + 10_000
  while (Date.now() < limite && !cancelado()) {
    const tela = await telaDe(s, 80)
    // Só aceitamos o `/context` que acabou de chegar; uma saída antiga ainda no histórico não reinicia a hora.
    if (tela !== telaAntes) {
      const leitura = extrairLeituraDeContexto(tela)
      if (leitura?.origem === 'comando-claude') return leitura.percentual
    }
    await esperar(100)
  }
  return null
}

async function contextoRestante(s: Sessao, medir = false, cancelado: () => boolean = () => false): Promise<LeituraDoContexto> {
  const tela = await telaDe(s, 80)
  const passivo = contextoNaTela(s, tela)
  if (passivo.agora || !medir || s.espec.agente !== 'claude') return passivo
  if (situacaoNaTela(s, tela) !== 'livre') return passivo

  await digitarPedido(s, '/context')
  const medicao = await medirContextoDoClaude(s, tela, cancelado)
  return medicao !== null ? guardarContexto(s, medicao) : ultimoContexto(s)
}

const textoDoContexto = (leitura: LeituraDoContexto): string => {
  if (leitura.codex) return 'contexto: o Codex não expõe contexto'
  if (leitura.contexto === null) return 'contexto: não deu para ler'
  if (leitura.agora) return `contexto: ${leitura.contexto}% restante`
  const quando = new Date(leitura.medidoEm!).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `contexto: ${leitura.contexto}% restante (medido às ${quando})`
}

/** Espera começar (até 8 s) e depois sossegar (livre ou numa pergunta) por 2,5 s seguidos. false = o tempo acabou antes. */
async function aguardarFim(s: Sessao, ms: number, cancelado: () => boolean): Promise<boolean> {
  const limite = Date.now() + ms
  for (const comeco = Date.now() + Math.min(8000, ms); Date.now() < comeco && !cancelado(); await esperar(250)) {
    if ((await situacao(s)) === 'trabalhando') break
  }
  let paradoDesde = 0
  while (Date.now() < limite && !cancelado()) {
    const agora = await situacao(s)
    if (agora === 'encerrado') return true
    if (agora === 'trabalhando') {
      paradoDesde = 0
    } else {
      paradoDesde ||= Date.now()
      if (Date.now() - paradoDesde >= 2500) return true
    }
    await esperar(250)
  }
  return false
}

/** Sessão recém-aberta: espera o agente desenhar a tela dele e sossegar, ou parar numa pergunta. */
async function aguardarPronto(s: Sessao, ms: number, cancelado: () => boolean): Promise<'pronto' | 'confirmar' | 'tempo' | 'encerrado'> {
  for (const limite = Date.now() + ms; Date.now() < limite && !cancelado(); await esperar(300)) {
    if (!s.processo) return 'encerrado'
    const quieto = Date.now() - s.ultimaSaida
    if (Date.now() - s.iniciadoEm < 2000 || quieto < 1500) continue
    if (s.espec.agente === 'shell') return 'pronto'
    const tela = await telaDe(s, 40)
    if (DIALOGO.test(ultimasLinhasComTexto(tela))) return 'confirmar'
    if (PRONTO.test(tela)) return 'pronto'
    // sem a marca de pronto (outra versão do agente?): quieto há 6 s, sem diálogo e sem o prompt do shell no fim
    if (quieto > 6000 && tela.trim() && !PROMPT_DO_SHELL.test(tela.split('\n').pop() ?? '')) return 'pronto'
  }
  return 'tempo'
}

/** Nada é digitado num terminal parado numa pergunta: devolve a tela para quem pediu decidir. */
async function recusarSeEmPergunta(s: Sessao): Promise<void> {
  if ((await situacao(s)) !== 'pergunta') return
  throw new Error(
    `"${s.espec.nome}" está parado numa pergunta (confiança na pasta, permissão, atualização…) e nada foi digitado. ` +
      `Responda com \`mpro teclas "${s.espec.nome}" …\` se for seguro, ou pergunte ao usuário. Tela:\n${await telaDe(s, 25)}`
  )
}

async function digitarPedido(s: Sessao, texto: string): Promise<void> {
  const limpo = texto.replace(/\r\n?/g, '\n').trimEnd()
  if (s.espec.agente !== 'shell' && aceitaColagem(s)) {
    escreverNoProcesso(s, `\x1b[200~${limpo.replace(/\x1b\[20[01]~/g, '')}\x1b[201~`)
  } else {
    escreverNoProcesso(s, s.espec.agente === 'shell' ? limpo.replace(/\n/g, '\r') : limpo.replace(/\n/g, ' '))
  }
  // o Enter separado da colagem: junto, alguns agentes o tomam como parte do texto
  await esperar(250)
  escreverNoProcesso(s, '\r')
}

function registrar(de: Sessao, para: Sessao | null, comando: string, texto = ''): void {
  try {
    const pasta = join(PASTA_DADOS, 'registro')
    mkdirSync(pasta, { recursive: true })
    const quando = new Date()
    const dia = `${quando.getFullYear()}-${String(quando.getMonth() + 1).padStart(2, '0')}-${String(quando.getDate()).padStart(2, '0')}`
    const linha = { quando: quando.toISOString(), espaco: de.espacoId, de: de.espec.nome, para: para?.espec.nome ?? null, comando, texto: texto.slice(0, 4000) }
    appendFileSync(join(pasta, `${dia}.jsonl`), `${JSON.stringify(linha)}\n`, 'utf8')
  } catch {
    // registro é extra: não atrapalha o comando
  }
}

// ---------- quem fala com quem ----------

/** Quem está ligado a mim por corda, mais quem eu abri, mesmo se estiver em outro espaço. */
function ligadosA(eu: Sessao): Sessao[] {
  const ids = new Set<string>()
  for (const [a, b] of cordasDoEspaco(eu.espacoId)) {
    if (a === eu.id) ids.add(b)
    if (b === eu.id) ids.add(a)
  }
  const porCorda = sessoesDoEspaco(eu.espacoId).filter((s) => s.id !== eu.id && ids.has(s.id))
  const meus = sessoesCriadasPor(eu.id)
  return [...new Map([...porCorda, ...meus].map((s) => [s.id, s])).values()]
}

function acharEntre(lista: Sessao[], nome: string | undefined): Sessao {
  if (!nome) throw new Error('diga com quem: o nome do cartão (veja `mpro quem`)')
  const procurado = nome.trim().toLowerCase()
  const exatos = lista.filter((s) => s.espec.nome.toLowerCase() === procurado || s.id === procurado)
  const candidatos = exatos.length ? exatos : lista.filter((s) => s.espec.nome.toLowerCase().startsWith(procurado))
  if (candidatos.length === 1) return candidatos[0]
  const nomes = lista.map((s) => `"${s.espec.nome}"`).join(', ') || 'ninguém'
  if (candidatos.length > 1) throw new Error(`mais de um cartão com "${nome}": ${candidatos.map((s) => `"${s.espec.nome}"`).join(', ')}`)
  throw new Error(`ninguém ligado a você se chama "${nome}". Ligados: ${nomes}`)
}

function tempoDe(opcoes: Record<string, unknown>): number {
  const n = Number(opcoes.tempo ?? TEMPO_PADRAO)
  return Number.isFinite(n) && n > 0 ? Math.min(n, TEMPO_MAX) : TEMPO_PADRAO
}

async function resultado(s: Sessao, segundos: number, cancelado: () => boolean): Promise<string> {
  const terminou = await aguardarFim(s, segundos * 1000, cancelado)
  const tela = await telaDe(s, 60)
  if (terminou && (await situacao(s)) === 'pergunta') {
    return `"${s.espec.nome}" parou numa pergunta e espera resposta (responda com \`mpro teclas\` se for seguro, ou pergunte ao usuário). Tela:\n${tela}`
  }
  if (terminou) return `"${s.espec.nome}" terminou. Tela:\n${tela}`
  return `"${s.espec.nome}" ainda está trabalhando depois de ${segundos} s. Use \`mpro esperar "${s.espec.nome}"\` depois. Tela agora:\n${tela}`
}

/** Fecha cartões pelo mesmo pedido que o `mpro fechar`; só roda depois de responder ao terminal que pediu saída. */
async function fecharCartoesDepoisDaResposta(sessoes: Sessao[]): Promise<void> {
  for (const s of sessoes) {
    try {
      await abrirJanelaPronta(s.espacoId)
      const r = await pedirAJanela({ tipo: 'fechar', espacoId: s.espacoId, id: s.id })
      if (r.ok) encerrarAgora(s.id)
    } catch {
      // A resposta já saiu: não há cliente esperando este detalhe. O cartão continua visível para o usuário recuperar.
    }
  }
}

/** Todos os filhos vivos, em qualquer profundidade; propriedade ruim não pode prender o fechamento num ciclo. */
/** "1 sessão" / "2 sessões": o app fala português com os agentes. */
const contaSessoes = (n: number): string => `${n} ${n === 1 ? 'sessão' : 'sessões'}`

function descendentesDe(id: string): Sessao[] {
  const vistos = new Set([id])
  const descendentes: Sessao[] = []
  const fila = [id]
  while (fila.length) {
    const criador = fila.shift()!
    for (const filho of sessoesCriadasPor(criador)) {
      if (vistos.has(filho.id)) continue
      vistos.add(filho.id)
      descendentes.push(filho)
      fila.push(filho.id)
    }
  }
  return descendentes
}

const nomeDoEspaco = (id: string): string => resumosDosEspacos().find((espaco) => espaco.id === id)?.nome ?? id

/**
 * A loja é quem grava propriedade e cordas. Centralizar a passagem mantém `fechar` e `passar` com o mesmo bastão,
 * inclusive quando os cartões estão em janelas diferentes.
 */
async function transferirSessoes(antigo: Sessao, sucessor: Sessao, transferidas: Sessao[]): Promise<void> {
  if (!transferidas.length) return
  const porEspaco = new Map<string, Sessao[]>()
  for (const s of transferidas) porEspaco.set(s.espacoId, [...(porEspaco.get(s.espacoId) ?? []), s])
  const sucessorEraDoAntigo = sucessor.espec.criadoPor === antigo.id
  if (sucessorEraDoAntigo && !porEspaco.has(sucessor.espacoId)) porEspaco.set(sucessor.espacoId, [])
  // Reservar todas as janelas antes de mudar qualquer cartão reduz a chance de uma passagem pela metade.
  for (const espacoId of porEspaco.keys()) await abrirJanelaPronta(espacoId)
  const concluidos: Array<[string, Sessao[]]> = []
  try {
    for (const [espacoId, sessoes] of porEspaco) {
      const r = await pedirAJanela({
        tipo: 'passar',
        espacoId,
        ids: sessoes.map((s) => s.id),
        sucessor: sucessor.id,
        novoCriador: sucessor.id,
        antigo: antigo.id,
        ...(sucessorEraDoAntigo && espacoId === sucessor.espacoId ? { donoDoSucessor: null } : {})
      })
      if (!r.ok) throw new Error(r.erro)
      concluidos.push([espacoId, sessoes])
    }
  } catch (erro) {
    const causa = erro instanceof Error ? erro.message : String(erro)
    const voltaram: string[] = []
    const presos: Array<[string, Sessao[]]> = []
    // Cada janela já foi reservada. Mesmo assim, anotar o desfazer que falhar evita dizer que nada mudou.
    for (const [espacoId, sessoes] of concluidos.reverse()) {
      try {
        const r = await pedirAJanela({
          tipo: 'passar',
          espacoId,
          ids: sessoes.map((s) => s.id),
          sucessor: sucessor.id,
          novoCriador: antigo.id,
          antigo: sucessor.id,
          ...(sucessorEraDoAntigo && espacoId === sucessor.espacoId ? { donoDoSucessor: antigo.id } : {})
        })
        if (r.ok) voltaram.push(nomeDoEspaco(espacoId))
        else presos.push([espacoId, sessoes])
      } catch {
        presos.push([espacoId, sessoes])
      }
    }
    if (presos.length) {
      // Sem confirmação do desfazer, conservamos o dono novo no main para não devolver ao antigo um acesso divergente da loja.
      for (const [, sessoes] of presos) for (const s of sessoes) s.espec = { ...s.espec, criadoPor: sucessor.id }
      if (sucessorEraDoAntigo && presos.some(([espacoId]) => espacoId === sucessor.espacoId)) {
        sucessor.espec = { ...sucessor.espec, criadoPor: undefined }
      }
      const ficaram = presos.map(([espacoId]) => nomeDoEspaco(espacoId))
      const detalhe = `falhou: ${causa}; voltaram: ${voltaram.join(', ') || 'nenhum'}; ficaram com o sucessor: ${ficaram.join(', ')}`
      registrar(antigo, sucessor, 'passar parcial', detalhe)
      throw new Error(
        `a passagem falhou: ${causa}. Voltaram: ${voltaram.join(', ') || 'nenhum'}. ` +
          `A propriedade no(s) espaço(s) ${ficaram.join(', ')} ficou com "${sucessor.espec.nome}".`
      )
    }
    registrar(antigo, sucessor, 'passar desfeito', `falhou: ${causa}; voltaram: ${voltaram.join(', ') || 'nenhum'}`)
    throw new Error(`não passei nada: ${causa}. Voltei: ${voltaram.join(', ') || 'nenhum'}.`)
  }
  for (const s of transferidas) s.espec = { ...s.espec, criadoPor: sucessor.id }
  if (sucessorEraDoAntigo) sucessor.espec = { ...sucessor.espec, criadoPor: undefined }
}

const TECLAS: Record<string, string> = {
  enter: '\r',
  esc: '\x1b',
  tab: '\t',
  'shift-tab': '\x1b[Z',
  cima: '\x1b[A',
  up: '\x1b[A',
  baixo: '\x1b[B',
  down: '\x1b[B',
  direita: '\x1b[C',
  right: '\x1b[C',
  esquerda: '\x1b[D',
  left: '\x1b[D',
  'ctrl-c': '\x03',
  'ctrl-d': '\x04',
  backspace: '\x7f',
  espaco: ' ',
  space: ' '
}

function agenteDe(texto: string | undefined): Agente | null {
  const t = (texto ?? '').toLowerCase()
  if (t === 'claude') return 'claude'
  if (t === 'codex') return 'codex'
  if (t === 'shell' || t === 'powershell') return 'shell'
  return null
}

/** O MSYS do Git Bash troca `/context` por `.../Programs/Git/context` antes de chamar o mpro. */
function desfazerConversaoDoGitBash(texto: string): string {
  const achou = texto.match(/^(?:[A-Za-z]:)?(?:[\\/][^\\/\r\n]+)*[\\/]Programs[\\/]Git[\\/]([^\\/\s]+)$/i)
  return achou ? `/${achou[1]}` : texto
}

function espacoPorNome(nome: string | undefined) {
  if (!nome?.trim()) throw new Error('diga o nome do espaço (veja `mpro espacos`)')
  const procurado = nome.trim().toLocaleLowerCase('pt-BR')
  const achados = resumosDosEspacos().filter((e) => e.nome.trim().toLocaleLowerCase('pt-BR') === procurado)
  if (achados.length === 1) return achados[0]
  if (achados.length > 1) throw new Error(`há mais de um espaço chamado "${nome}"; renomeie um deles pelo quadro`)
  throw new Error(`não existe espaço chamado "${nome}". Veja mpro espacos.`)
}

interface Pedido {
  cracha?: unknown
  comando?: unknown
  posicionais?: unknown
  opcoes?: unknown
  texto?: unknown
}

interface ResultadoDoComando {
  saida: string
  /** Só é executado depois que a resposta saiu pelo pipe do próprio terminal. */
  sair?: Sessao[]
}

interface ContextoDoVerbo {
  eu: Sessao
  pos: string[]
  opcoes: Record<string, string | number | true>
  texto: string
  cancelado: () => boolean
}

type HandlerDoVerbo = (ctx: ContextoDoVerbo) => Promise<ResultadoDoComando>

/**
 * Um handler por verbo, com o nome vindo do registro: o `Record<NomeDeVerbo, …>` não compila se um verbo novo
 * entrar em `verbos.ts` e ninguém escrever o corpo dele. Argumentos e opções já chegam validados.
 */
const HANDLERS: Record<NomeDeVerbo, HandlerDoVerbo> = {
  ajuda: async () => ({ saida: AJUDA }),

  espacos: async ({ eu }) => {
    const linhas = resumosDosEspacos().map((espaco) => {
      const meu = espaco.id === eu.espacoId ? ' · seu espaço' : ''
      return `${meu ? '*' : ' '} "${espaco.nome}" · ${janelaDoEspaco(espaco.id) ? 'janela aberta' : 'sem janela'} · ${espaco.terminais} cartões${meu}`
    })
    return { saida: linhas.join('\n') || 'Não há espaços.' }
  },

  janela: async ({ eu, pos, opcoes }) => {
    if (opcoes.novo) {
      const nome = typeof opcoes.novo === 'string' ? opcoes.novo.trim() : ''
      if (!nome) throw new Error('diga o nome: mpro janela --novo "Nome" [--pasta P]')
      const pasta = typeof opcoes.pasta === 'string' ? opcoes.pasta : eu.espec.pasta
      if (!(existsSync(pasta) && statSync(pasta).isDirectory())) throw new Error(`a pasta não existe: ${pasta}`)
      const espaco = criarEspacoDoAgente(nome, pasta)
      await abrirJanelaPronta(espaco.id)
      return { saida: `Criei o espaço "${espaco.nome}" e abri uma janela nele.` }
    }
    if (opcoes.pasta) throw new Error('`--pasta` só vale com `mpro janela --novo "Nome"`')
    const espaco = espacoPorNome(pos[0])
    const { jaEstavaAberta } = await abrirJanelaPronta(espaco.id)
    return {
      saida: jaEstavaAberta
        ? `O espaço "${espaco.nome}" já estava aberto; trouxe a janela para a frente.`
        : `Abri uma janela no espaço "${espaco.nome}".`
    }
  },

  quem: async ({ eu }) => {
    const ligados = ligadosA(eu)
    const linhas = await Promise.all(
      ligados.map(
        async (s) =>
          `  "${s.espec.nome}" · ${s.espec.agente} · ${await situacao(s)} · ${textoDoContexto(await contextoRestante(s))}${
            s.espec.criadoPor === eu.id ? ' · aberto por você' : ''
          }`
      )
    )
    const filhos = sessoesCriadasPor(eu.id).length
    return {
      saida: [
        `Você é "${eu.espec.nome}" (${eu.espec.agente}) · pasta ${eu.espec.pasta} · ${textoDoContexto(await contextoRestante(eu))}`,
        'Ligados a você:',
        ...(linhas.length ? linhas : ['  ninguém (o usuário liga cartões com uma corda; quem você abre continua acessível mesmo em outro espaço)']),
        `Você abriu ${filhos} de ${MAX_SESSOES_POR_AGENTE} sessões possíveis.`
      ].join('\n')
    }
  },

  orcamento: async ({ eu, cancelado }) => ({ saida: textoDoContexto(await contextoRestante(eu, true, cancelado)) }),

  abrir: async ({ eu, pos, opcoes, texto, cancelado }) => {
    const agente = agenteDe(pos[0])
    if (!agente) throw new Error('diga qual agente: mpro abrir claude|codex|shell [--espaco "Nome"] [--nome N] [--pedido "texto"]')
    // as aberturas ainda em andamento contam: vários `abrir` ao mesmo tempo não passam do limite
    const filhos = sessoesCriadasPor(eu.id, { comFolga: true }).length + (abrindo.get(eu.id) ?? 0)
    if (filhos >= MAX_SESSOES_POR_AGENTE) {
      throw new Error(`você já abriu ${contaSessoes(filhos)} (o limite é ${MAX_SESSOES_POR_AGENTE}); feche uma com \`mpro fechar\``)
    }
    const pasta = typeof opcoes.pasta === 'string' ? opcoes.pasta : undefined
    if (pasta && !(existsSync(pasta) && statSync(pasta).isDirectory())) throw new Error(`a pasta não existe: ${pasta}`)
    const nome = typeof opcoes.nome === 'string' ? opcoes.nome.trim().slice(0, 80) || undefined : undefined
    const espaco = typeof opcoes.espaco === 'string' ? espacoPorNome(opcoes.espaco) : { id: eu.espacoId, nome: '' }
    abrindo.set(eu.id, (abrindo.get(eu.id) ?? 0) + 1)
    let novo: Sessao | undefined
    try {
      await abrirJanelaPronta(espaco.id)
      const r = await pedirAJanela({ tipo: 'abrir', espacoId: espaco.id, criador: eu.id, agente, nome, pasta })
      if (!r.ok) throw new Error(r.erro)
      novo = r.id ? await esperarSessao(r.id, 5000) : undefined
    } finally {
      abrindo.set(eu.id, (abrindo.get(eu.id) ?? 1) - 1)
    }
    if (!novo) throw new Error('o cartão foi criado, mas o processo não abriu')
    registrar(eu, novo, 'abrir', texto)
    const aberto =
      novo.espacoId === eu.espacoId
        ? `Abri "${novo.espec.nome}" (${agente}), ligado a você.`
        : `Abri "${novo.espec.nome}" (${agente}) no espaço "${espaco.nome}"; você pode falar com ele porque o abriu.`
    if (!texto) return { saida: `${aberto} Mande o primeiro pedido com: mpro pedir "${novo.espec.nome}" "…"` }
    const pronto = await aguardarPronto(novo, 90_000, cancelado)
    if (pronto !== 'pronto') {
      const motivo = {
        confirmar:
          'Ele parou numa pergunta (confiar na pasta? servidores MCP? atualização?). O pedido NÃO foi enviado: responda com `mpro teclas` se for seguro, ou pergunte ao usuário, e depois use `mpro pedir`.',
        tempo: 'Ele não ficou pronto em 90 s; o pedido NÃO foi enviado. Veja com `mpro ver` e use `mpro pedir` depois.',
        encerrado: 'O processo terminou antes de ficar pronto; o pedido NÃO foi enviado.'
      }[pronto]
      return { saida: `${aberto}\n${motivo}\nTela agora:\n${await telaDe(novo, 30)}` }
    }
    await digitarPedido(novo, texto)
    if (!opcoes.esperar) return { saida: `${aberto} Pedido enviado. Acompanhe com \`mpro esperar "${novo.espec.nome}"\` ou \`mpro ver\`.` }
    return { saida: `${aberto}\n${await resultado(novo, tempoDe(opcoes), cancelado)}` }
  },

  pedir: async ({ eu, pos, opcoes, texto, cancelado }) => {
    const alvo = acharEntre(ligadosA(eu), pos[0])
    if (!texto.trim()) throw new Error('falta o pedido: mpro pedir <nome> "texto" (ou --arquivo pedido.md)')
    if (!alvo.processo) throw new Error(`"${alvo.espec.nome}" está encerrado`)
    await recusarSeEmPergunta(alvo)
    // num agente, o pedido entra na fila dele; num shell rodando um comando, cairia no meio desse comando
    if (alvo.espec.agente === 'shell' && (await situacao(alvo)) === 'trabalhando') {
      throw new Error(`"${alvo.espec.nome}" está rodando um comando; espere terminar (\`mpro esperar "${alvo.espec.nome}"\`) e mande de novo`)
    }
    registrar(eu, alvo, 'pedir', texto)
    await digitarPedido(alvo, texto)
    if (opcoes['sem-esperar']) return { saida: `Pedido enviado para "${alvo.espec.nome}".` }
    return { saida: await resultado(alvo, tempoDe(opcoes), cancelado) }
  },

  esperar: async ({ eu, pos, opcoes, cancelado }) => {
    const alvo = acharEntre(ligadosA(eu), pos[0])
    return { saida: await resultado(alvo, tempoDe(opcoes), cancelado) }
  },

  ver: async ({ eu, pos, opcoes }) => {
    const alvo = acharEntre(ligadosA(eu), pos[0])
    const linhas = Math.min(2000, Math.max(1, Number(opcoes.linhas) || 50))
    return { saida: `"${alvo.espec.nome}" · ${await situacao(alvo)}\n${await telaDe(alvo, linhas)}` }
  },

  teclas: async ({ eu, pos }) => {
    const alvo = acharEntre(ligadosA(eu), pos[0])
    const teclas = pos.slice(1)
    if (!teclas.length) throw new Error('quais teclas? ex.: mpro teclas <nome> enter (veja `mpro ajuda`)')
    const sequencias = teclas.map((t) => {
      const s = TECLAS[t.toLowerCase()] ?? (t.length === 1 ? t : null)
      if (s === null) throw new Error(`tecla desconhecida: ${t}`)
      return s
    })
    registrar(eu, alvo, 'teclas', teclas.join(' '))
    for (const s of sequencias) {
      escreverNoProcesso(alvo, s)
      await esperar(120)
    }
    await esperar(800)
    return { saida: `"${alvo.espec.nome}" · ${await situacao(alvo)}\n${await telaDe(alvo, 30)}` }
  },

  limpar: async ({ eu, pos, cancelado }) => {
    const alvo = acharEntre(ligadosA(eu), pos[0])
    if (!alvo.processo) throw new Error(`"${alvo.espec.nome}" está encerrado`)
    if ((await situacao(alvo)) === 'trabalhando') throw new Error(`"${alvo.espec.nome}" está trabalhando; espere terminar antes de limpar`)
    await recusarSeEmPergunta(alvo)
    registrar(eu, alvo, 'limpar')
    const comandoLimpar =
      alvo.espec.agente === 'claude' ? '/clear' : alvo.espec.agente === 'codex' ? '/new' : process.platform === 'win32' ? 'Clear-Host' : 'clear'
    escreverNoProcesso(alvo, comandoLimpar)
    await esperar(400)
    escreverNoProcesso(alvo, '\r')
    await aguardarFim(alvo, 15_000, cancelado)
    return { saida: `Contexto de "${alvo.espec.nome}" zerado.` }
  },

  fechar: async ({ eu, pos }) => {
    const meus = sessoesCriadasPor(eu.id)
    const alvo = acharEntre(meus, pos[0])
    const herdadas = sessoesCriadasPor(alvo.id)
    // Fechar não mata trabalho em andamento: os filhos passam para quem fechou, como numa passagem de bastão.
    await transferirSessoes(alvo, eu, herdadas)
    await abrirJanelaPronta(alvo.espacoId)
    const r = await pedirAJanela({ tipo: 'fechar', espacoId: alvo.espacoId, id: alvo.id })
    if (!r.ok) throw new Error(r.erro)
    registrar(eu, alvo, 'fechar')
    encerrarAgora(alvo.id)
    return {
      saida: herdadas.length
        ? `Fechei "${alvo.espec.nome}". ${herdadas.length === 1 ? 'A sessão' : `As ${herdadas.length} sessões`} que ela tinha aberto agora ${
            herdadas.length === 1 ? 'é sua' : 'são suas'
          }.`
        : `Fechei "${alvo.espec.nome}".`
    }
  },

  passar: async ({ eu, pos }) => {
    const sucessor = acharEntre(ligadosA(eu), pos[0])
    if (sucessor.id === eu.id) throw new Error('você não pode passar sessões para si mesmo')
    if (!sucessor.processo) throw new Error(`"${sucessor.espec.nome}" está encerrado; escolha uma sessão viva`)
    const transferidas = sessoesCriadasPor(eu.id).filter((s) => s.id !== sucessor.id)
    const totalDoSucessor = sessoesCriadasPor(sucessor.id, { comFolga: true }).length + transferidas.length
    if (totalDoSucessor > MAX_SESSOES_POR_AGENTE) {
      throw new Error(`"${sucessor.espec.nome}" ficaria com ${contaSessoes(totalDoSucessor)} (o limite é ${MAX_SESSOES_POR_AGENTE}); nada foi passado`)
    }
    if (!transferidas.length) return { saida: `Não havia outras sessões para passar a "${sucessor.espec.nome}".` }
    await transferirSessoes(eu, sucessor, transferidas)
    registrar(eu, sucessor, 'passar', contaSessoes(transferidas.length))
    return { saida: `Passei ${contaSessoes(transferidas.length)} para "${sucessor.espec.nome}".` }
  },

  sair: async ({ eu, opcoes }) => {
    const minhas = sessoesCriadasPor(eu.id)
    if (minhas.length && !opcoes['com-as-minhas']) {
      throw new Error(
        `você ainda tem ${contaSessoes(minhas.length)} aberta${minhas.length === 1 ? '' : 's'}; use \`mpro passar <nome>\` primeiro, ou \`mpro sair --com-as-minhas\` para fechar todas junto`
      )
    }
    const motivo = typeof opcoes.motivo === 'string' ? opcoes.motivo : ''
    const comAsMinhas = opcoes['com-as-minhas'] ? descendentesDe(eu.id) : []
    registrar(eu, null, 'sair', motivo)
    return {
      saida: comAsMinhas.length
        ? `Vou fechar seu cartão e ${contaSessoes(comAsMinhas.length)} sua${comAsMinhas.length === 1 ? '' : 's'}.`
        : 'Vou fechar seu cartão.',
      sair: [...comAsMinhas, eu]
    }
  }
}

/** O main normaliza, valida pelo registro e entrega ao handler declarado. Verbo desconhecido morre na validação. */
async function executar(eu: Sessao, pedido: Pedido, cancelado: () => boolean): Promise<ResultadoDoComando> {
  const comandoInformado = typeof pedido.comando === 'string' ? pedido.comando : 'ajuda'
  const posicionais = Array.isArray(pedido.posicionais) ? pedido.posicionais.filter((p): p is string => typeof p === 'string') : []
  const opcoesRecebidas = typeof pedido.opcoes === 'object' && pedido.opcoes !== null ? (pedido.opcoes as Record<string, unknown>) : {}
  const chamada = validarChamada(comandoInformado, posicionais, opcoesRecebidas)
  const texto = desfazerConversaoDoGitBash(typeof pedido.texto === 'string' ? pedido.texto : '')
  return HANDLERS[chamada.verbo.nome as NomeDeVerbo]({ eu, pos: chamada.posicionais, opcoes: chamada.opcoes, texto, cancelado })
}

async function atender(linha: string, socket: Socket, fechado: () => boolean): Promise<void> {
  let resposta: { ok: boolean; saida?: string; erro?: string }
  try {
    const pedido = JSON.parse(linha) as Pedido
    const eu = sessaoPorCracha(pedido.cracha)
    if (!eu) throw new Error('este terminal não é do Maestri Próprio (ou o app foi reaberto: feche e abra o terminal)')
    const resultado = await executar(eu, pedido, fechado)
    resposta = { ok: true, saida: resultado.saida }
    if (resultado.sair) {
      // O `mpro` está no processo que vai morrer. Esperamos o flush do socket e mais um instante antes de matar
      // o pty, para ele imprimir a confirmação; se a janela falhar, o cliente ainda jamais fica preso no pipe.
      socket.end(`${JSON.stringify(resposta)}\n`, () => setTimeout(() => void fecharCartoesDepoisDaResposta(resultado.sair!), 120))
      return
    }
  } catch (erro) {
    resposta = { ok: false, erro: erro instanceof Error ? erro.message : String(erro) }
  }
  if (!socket.destroyed) socket.end(`${JSON.stringify(resposta)}\n`)
}

export function registrarComandos(): void {
  instalarComando()

  ipcMain.on(CANAIS_AGENTES.pronta, (evento) => {
    janelasProntas.add(evento.sender.id)
    // Recarregar preserva o WebContents, mas derruba o atendente do renderer; até ele se anunciar de novo não enviamos pedidos.
    evento.sender.once('did-start-loading', () => janelasProntas.delete(evento.sender.id))
    evento.sender.once('destroyed', () => janelasProntas.delete(evento.sender.id))
  })

  ipcMain.on(CANAIS_AGENTES.resposta, (evento, id: unknown, resposta: RespostaAoAgente) => {
    const pendente = typeof id === 'string' ? respostas.get(id) : undefined
    if (!pendente || pendente.janela !== evento.sender.id) return
    const valida = resposta && typeof resposta === 'object' && typeof resposta.ok === 'boolean'
    pendente.resolver(valida ? resposta : { ok: false, erro: 'resposta inválida da janela' })
  })

  ipcMain.handle(CANAIS.contextos, async (evento, espacoId: unknown): Promise<ResumoContextoTerminal[]> => {
    if (typeof espacoId !== 'string' || donoDe(espacoId) !== evento.sender.id) return []
    return Promise.all(
      sessoesDoEspaco(espacoId).map(async (s) => {
        // O painel precisa das duas leituras, mas o mesmo recorte de 80 linhas basta para situação e rodapé.
        const tela = await telaDe(s, 80)
        return {
          id: s.id,
          nome: s.espec.nome,
          agente: s.espec.agente,
          situacao: situacaoNaTela(s, tela),
          contexto: contextoNaTela(s, tela).contexto
        }
      })
    )
  })

  const servidor = createServer((socket) => {
    let recebido = ''
    let fechado = false
    socket.setEncoding('utf8')
    // o pedido chega de uma vez: quem conecta e não manda nada em 10 s é desligado
    socket.setTimeout(10_000, () => socket.destroy())
    socket.on('close', () => (fechado = true))
    socket.on('error', () => (fechado = true))
    const aoReceber = (parte: string): void => {
      recebido += parte
      if (recebido.length > MAX_PEDIDO) return void socket.destroy()
      const fim = recebido.indexOf('\n')
      if (fim < 0) return
      socket.off('data', aoReceber)
      // daqui em diante a espera é do comando (`mpro esperar` pode levar até uma hora)
      socket.setTimeout(0)
      void atender(recebido.slice(0, fim), socket, () => fechado)
    }
    socket.on('data', aoReceber)
  })
  servidor.maxConnections = MAX_CONEXOES
  servidor.on('error', (erro) => console.error('mpro: o pipe não abriu', erro))
  servidor.listen(PIPE)
}
