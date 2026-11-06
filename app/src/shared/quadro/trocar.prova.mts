import assert from 'node:assert/strict'
import test from 'node:test'
// Node executa provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { trocarAgente, type TrocaFeita } from './trocar.ts'
import type { Funcao, No, Plano, PresetAgente } from '../modelo'

const instante = '2026-11-06T10:00:00.000Z'
const amb = { novoId: () => 'conversa-nova' }

const claude: PresetAgente = { id: 'claude', nome: 'Claude Code', agente: 'claude', comando: 'claude' }
const codex: PresetAgente = { id: 'codex', nome: 'Codex', agente: 'codex', comando: 'codex' }
const shell: PresetAgente = { id: 'shell', nome: 'PowerShell', agente: 'shell', comando: '' }

const revisor = (extra: Partial<No> = {}): No =>
  ({
    id: 'r',
    tipo: 'terminal',
    nome: 'Revisor',
    agente: 'claude',
    comando: 'claude',
    sessao: 'conversa-velha',
    funcao: 'Revisor',
    pasta: 'C:/projeto',
    criadoPor: 'chefe',
    arvores: [{ id: 'arv', nome: 'Backend' }],
    x: 100,
    y: 200,
    largura: 800,
    altura: 500,
    z: 3,
    cor: '#007AFF',
    grupo: 'g1',
    criadoEm: instante,
    ...extra
  }) as No

const plano = (nos: No[], cordas: Plano['cordas'] = []): Plano => ({ camera: { x: 0, y: 0, zoom: 1 }, nos, desenhos: [], cordas })

const funcoes: Funcao[] = [{ id: 'f', nome: 'Revisor', prompt: 'Você revisa o que o Main escreveu.' }]

function feita(r: ReturnType<typeof trocarAgente>): TrocaFeita {
  assert.ok(!('erro' in r), 'erro' in r ? r.erro : '')
  return r as TrocaFeita
}

test('troca o agente sem perder lugar, tamanho, nome, função, cor, grupo, dono nem árvore', () => {
  const antes = revisor()
  const r = feita(trocarAgente(plano([antes], [{ id: 'c', de: 'chefe', para: 'r', criadoEm: instante }]), { id: 'r', preset: codex }, funcoes, amb))
  const novo = r.plano.nos[0]
  assert.equal(novo.tipo === 'terminal' && novo.agente, 'codex')
  assert.equal(novo.tipo === 'terminal' && novo.comando, 'codex')
  for (const campo of ['id', 'nome', 'x', 'y', 'largura', 'altura', 'z', 'cor', 'grupo', 'funcao', 'pasta', 'criadoPor'] as const) {
    assert.deepEqual((novo as unknown as Record<string, unknown>)[campo], (antes as unknown as Record<string, unknown>)[campo], campo)
  }
  assert.deepEqual(novo.tipo === 'terminal' && novo.arvores, [{ id: 'arv', nome: 'Backend' }])
  // a corda continua: é o mesmo cartão
  assert.equal(r.plano.cordas.length, 1)
})

test('a conversa não atravessa a troca: Claude sai com a dele, Codex entra sem nenhuma', () => {
  const r = feita(trocarAgente(plano([revisor()]), { id: 'r', preset: codex }, funcoes, amb))
  assert.equal(r.plano.nos[0].tipo === 'terminal' && r.plano.nos[0].sessao, undefined)
  assert.match(r.texto, /a conversa anterior não vem/)
})

test('trocar para Claude dá uma conversa nova ao cartão', () => {
  const r = feita(trocarAgente(plano([revisor({ agente: 'codex', comando: 'codex', sessao: 'c-velha' })]), { id: 'r', preset: claude }, funcoes, amb))
  assert.equal(r.plano.nos[0].tipo === 'terminal' && r.plano.nos[0].sessao, 'conversa-nova')
})

test('a função é entregue de novo: o agente novo chega sem saber de nada', () => {
  const r = feita(trocarAgente(plano([revisor()]), { id: 'r', preset: codex }, funcoes, amb))
  assert.equal(r.primeiroPedido, 'Você revisa o que o Main escreveu.')
  assert.match(r.texto, /foi entregue de novo/)
})

test('função que não existe mais: troca, não entrega nada e diz por quê', () => {
  const r = feita(trocarAgente(plano([revisor()]), { id: 'r', preset: shell }, [], amb))
  assert.equal(r.primeiroPedido, undefined)
  assert.match(r.texto, /não existe mais nas preferências/)
})

test('cartão sem função troca sem falar de função', () => {
  const r = feita(trocarAgente(plano([revisor({ funcao: undefined })]), { id: 'r', preset: codex }, funcoes, amb))
  assert.equal(r.primeiroPedido, undefined)
  assert.doesNotMatch(r.texto, /função/)
})

test('trocar para o preset que já está: recusa em vez de reabrir o agente por nada', () => {
  const r = trocarAgente(plano([revisor()]), { id: 'r', preset: claude }, funcoes, amb)
  assert.ok('erro' in r)
  assert.match(r.erro, /já é Claude Code/)
})

test('preset diferente com o mesmo agente (outro modelo) troca normalmente', () => {
  const opus: PresetAgente = { id: 'opus', nome: 'Claude Opus', agente: 'claude', comando: 'claude --model opus' }
  const r = feita(trocarAgente(plano([revisor()]), { id: 'r', preset: opus }, funcoes, amb))
  assert.equal(r.plano.nos[0].tipo === 'terminal' && r.plano.nos[0].comando, 'claude --model opus')
})

test('cartão que não é de agente, e cartão que não existe, são recusados', () => {
  const recado = { id: 't', tipo: 'texto', texto: 'oi', tamanhoFonte: 20, mono: false, x: 0, y: 0, largura: 10, altura: 10, z: 1, criadoEm: instante } as No
  assert.match((trocarAgente(plano([recado]), { id: 't', preset: codex }, funcoes, amb) as { erro: string }).erro, /só cartão de agente/)
  assert.match((trocarAgente(plano([]), { id: 'x', preset: codex }, funcoes, amb) as { erro: string }).erro, /não está no andar/)
})

test('cartão travado: o agente não troca; o usuário troca', () => {
  const travado = plano([revisor({ travado: true })])
  assert.match((trocarAgente(travado, { id: 'r', preset: codex, porAgente: true }, funcoes, amb) as { erro: string }).erro, /está travado/)
  const doUsuario = feita(trocarAgente(travado, { id: 'r', preset: codex }, funcoes, amb))
  assert.equal(doUsuario.plano.nos[0].tipo === 'terminal' && doUsuario.plano.nos[0].agente, 'codex')
})
