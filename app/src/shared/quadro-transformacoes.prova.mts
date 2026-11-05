import assert from 'node:assert/strict'
import test from 'node:test'
// Node executa provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { abrir, fechar, passar, type AmbienteTransformacoesDoQuadro } from './quadro/transformacoes.ts'
import type { Andar, Corda, Espaco, NoTerminal } from './modelo'

const instante = '2026-10-30T12:00:00.000Z'

function ambiente(): AmbienteTransformacoesDoQuadro {
  let proximo = 1
  return {
    presets: [],
    funcoes: [],
    presetsPadrao: [
      { id: 'claude', nome: 'Claude Code', agente: 'claude', comando: 'claude' },
      { id: 'codex', nome: 'Codex', agente: 'codex', comando: 'codex' },
      { id: 'shell', nome: 'PowerShell', agente: 'shell', comando: '' }
    ],
    limiteSessoesPorAgente: 8,
    novoId: () => `novo-${proximo++}`,
    agora: () => instante
  }
}

function terminal(id: string, criadoPor?: string): NoTerminal {
  return {
    id,
    x: 0,
    y: 0,
    largura: 720,
    altura: 460,
    z: 1,
    criadoEm: instante,
    tipo: 'terminal',
    nome: id,
    agente: 'codex',
    comando: 'codex',
    criadoPor
  }
}

function corda(id: string, de: string, para: string): Corda {
  return { id, de, para, criadoEm: instante }
}

function andar(id: string, nos: NoTerminal[] = [], cordas: Corda[] = []): Andar {
  return {
    id,
    nome: id,
    criadoEm: instante,
    git: null,
    camera: { x: 0, y: 0, zoom: 1 },
    nos,
    cordas,
    desenhos: []
  }
}

function espaco(nos: NoTerminal[] = [], andares: Andar[] = [], andarAtivo: string | null = null): Espaco {
  return {
    versao: 1,
    id: 'espaco',
    nome: 'Espaço',
    pasta: 'C:/projeto',
    cor: '#000',
    icone: '□',
    criadoEm: instante,
    abertoEm: instante,
    andares,
    andarAtivo,
    camera: { x: 0, y: 0, zoom: 1 },
    nos,
    cordas: [],
    desenhos: []
  }
}

test('abrir cria ao lado do criador, desconflita nome e liga a corda', () => {
  const resultado = abrir(espaco([terminal('criador'), terminal('Codex')]), { tipo: 'abrir', espacoId: 'espaco', criador: 'criador', agente: 'codex' }, ambiente())

  assert.deepEqual(resultado.resposta, { ok: true, id: 'novo-1', nome: 'Codex 2' })
  const criado = resultado.espaco.nos.at(-1) as NoTerminal
  assert.equal(criado.x, 800)
  assert.equal(criado.y, 0)
  assert.equal(criado.sessao, undefined)
  assert.deepEqual(resultado.espaco.cordas, [corda('novo-2', 'criador', 'novo-1')])
})

test('abrir sem criador no quadro ignora o limite local e começa no andar ativo sem corda', () => {
  const filhosDeOutroEspaco = Array.from({ length: 8 }, (_, indice) => terminal(`filho-${indice}`, 'ausente'))
  const resultado = abrir(
    espaco(filhosDeOutroEspaco, [andar('andar-1')], 'andar-1'),
    { tipo: 'abrir', espacoId: 'espaco', criador: 'ausente', agente: 'claude' },
    ambiente()
  )

  assert.deepEqual(resultado.resposta, { ok: true, id: 'novo-1', nome: 'Claude Code' })
  assert.equal(resultado.espaco.nos.length, 8)
  const criado = resultado.espaco.andares[0].nos[0] as NoTerminal
  assert.deepEqual({ x: criado.x, y: criado.y, sessao: criado.sessao }, { x: 120, y: 120, sessao: 'novo-2' })
  assert.deepEqual(resultado.espaco.andares[0].cordas, [])
})

test('abrir recusa o nono filho quando o criador está no quadro', () => {
  const resultado = abrir(
    espaco([terminal('criador'), ...Array.from({ length: 8 }, (_, indice) => terminal(`filho-${indice}`, 'criador'))]),
    { tipo: 'abrir', espacoId: 'espaco', criador: 'criador', agente: 'codex' },
    ambiente()
  )

  assert.deepEqual(resultado.resposta, { ok: false, erro: 'você já tem 8 sessões abertas (o limite é 8)' })
  assert.equal(resultado.espaco.nos.length, 9)
})

test('fechar cartão ausente recusa sem transformar o espaço', () => {
  const original = espaco([terminal('presente')])
  const resultado = fechar(original, { tipo: 'fechar', espacoId: 'espaco', id: 'ausente' })

  assert.deepEqual(resultado.resposta, { ok: false, erro: 'esse cartão não está mais no quadro' })
  assert.equal(resultado.espaco, original)
})

test('passar cartão ausente recusa sem transformar o espaço', () => {
  const original = espaco([terminal('antigo'), terminal('novo')])
  const resultado = passar(
    original,
    { tipo: 'passar', espacoId: 'espaco', ids: ['ausente'], sucessor: 'ignorado', novoCriador: 'novo', antigo: 'antigo' },
    ambiente()
  )

  assert.deepEqual(resultado.resposta, { ok: false, erro: 'um cartão a passar não está mais no quadro' })
  assert.equal(resultado.espaco, original)
})

test('passar move a corda apenas no plano onde o novo dono também está', () => {
  const andarComCartao = andar('andar-1', [terminal('cartao-andar', 'antigo')], [corda('corda-andar', 'antigo', 'cartao-andar')])
  const original = espaco([terminal('antigo'), terminal('novo'), terminal('cartao-raiz', 'antigo')], [andarComCartao])
  original.cordas = [corda('corda-raiz', 'antigo', 'cartao-raiz')]

  const resultado = passar(
    original,
    { tipo: 'passar', espacoId: 'espaco', ids: ['cartao-raiz', 'cartao-andar'], sucessor: 'ignorado', novoCriador: 'novo', antigo: 'antigo' },
    ambiente()
  )

  assert.deepEqual(resultado.espaco.cordas, [corda('novo-1', 'novo', 'cartao-raiz')])
  assert.deepEqual(resultado.espaco.andares[0].cordas, [])
  assert.equal((resultado.espaco.nos.find((no) => no.id === 'cartao-raiz') as NoTerminal).criadoPor, 'novo')
  assert.equal((resultado.espaco.andares[0].nos[0] as NoTerminal).criadoPor, 'novo')
})

test('passar distingue donoDoSucessor ausente de presente e nulo', () => {
  const semCampo = passar(
    espaco([terminal('antigo'), terminal('novo'), terminal('cartao', 'antigo')]),
    { tipo: 'passar', espacoId: 'espaco', ids: ['cartao'], sucessor: 'sucessor-ausente', novoCriador: 'novo', antigo: 'antigo' },
    ambiente()
  )
  assert.equal(semCampo.resposta.ok, true)

  const comNulo = passar(
    espaco([terminal('antigo'), terminal('novo'), terminal('cartao', 'antigo'), terminal('sucessor', 'antigo')]),
    { tipo: 'passar', espacoId: 'espaco', ids: ['cartao'], sucessor: 'sucessor', novoCriador: 'novo', antigo: 'antigo', donoDoSucessor: null },
    ambiente()
  )
  assert.equal(comNulo.resposta.ok, true)
  assert.equal((comNulo.espaco.nos.find((no) => no.id === 'sucessor') as NoTerminal).criadoPor, undefined)
})
