import assert from 'node:assert/strict'
import test from 'node:test'
// Node executa provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { aplicarPartitura, partituraDe, resumoDaPartitura, type SubidaDePartitura } from './partituras.ts'
// @ts-expect-error idem.
import { membrosDaBanda } from './bandas.ts'
import type { Funcao, No, Partitura, Plano } from '../modelo'

const instante = '2026-11-05T12:00:00.000Z'

function ambiente(extra: { funcoes?: Funcao[]; dono?: string; limiteSessoesPorAgente?: number } = {}) {
  let proximo = 0
  return { novoId: () => `novo-${++proximo}`, agora: () => instante, funcoes: extra.funcoes ?? [], ...extra }
}

const agente = (id: string, nome: string, x: number, y: number, extra: Partial<No> = {}): No =>
  ({
    id,
    tipo: 'terminal',
    nome,
    agente: 'claude',
    comando: 'claude',
    x,
    y,
    largura: 800,
    altura: 500,
    z: 1,
    criadoEm: instante,
    ...extra
  }) as No

const texto = (id: string, conteudo: string, x: number, y: number, extra: Partial<No> = {}): No =>
  ({ id, tipo: 'texto', texto: conteudo, tamanhoFonte: 24, mono: false, x, y, largura: 420, altura: 48, z: 1, criadoEm: instante, ...extra }) as No

const postit = (id: string, arquivo: string, x: number, y: number): No =>
  ({ id, tipo: 'postit', arquivo, cor: 'rosa', x, y, largura: 260, altura: 160, z: 1, criadoEm: instante }) as No

const codigo = (id: string, x: number, y: number): No =>
  ({ id, tipo: 'codigo', caminho: 'src/api.ts', modo: 'diff', terminal: 'a', x, y, largura: 620, altura: 460, z: 1, criadoEm: instante }) as No

function plano(nos: No[], cordas: Plano['cordas'] = []): Plano {
  return { camera: { x: 0, y: 0, zoom: 1 }, nos, desenhos: [], cordas }
}

const corda = (id: string, de: string, para: string) => ({ id, de, para, criadoEm: instante })

const funcao = (nome: string, prompt: string, pasta?: string): Funcao => ({ id: nome, nome, prompt, ...(pasta ? { pasta } : {}) })

/** Um time de quatro, como o da prova da volta: dois agentes ligados, um recado e um post-it. */
function timeDeQuatro(): { plano: Plano; notas: Record<string, string> } {
  return {
    plano: plano(
      [
        agente('m', 'Main', 1000, 500, { funcao: 'Main', pasta: 'C:/projeto/main', cor: '#007AFF' }),
        agente('r', 'Revisor', 2000, 500, { funcao: 'Revisor', agente: 'codex', comando: 'codex' }),
        texto('t', 'divida por arquivo', 1000, 1100),
        postit('p', 'p.md', 2000, 1100)
      ],
      [corda('c1', 'm', 'r')]
    ),
    notas: { 'p.md': '# combinado\n- um arquivo por agente' }
  }
}

function salvar(nome = 'Time'): Partitura {
  const { plano: p, notas } = timeDeQuatro()
  const feito = partituraDe(p, notas, nome, null, ambiente())
  assert.ok(typeof feito !== 'string', typeof feito === 'string' ? feito : '')
  return feito as Partitura
}

function subida(r: ReturnType<typeof aplicarPartitura>): SubidaDePartitura {
  assert.ok(!('erro' in r), 'erro' in r ? r.erro : '')
  return r as SubidaDePartitura
}

test('salva o time inteiro, com lugar relativo ao canto do arranjo', () => {
  const p = salvar()
  assert.equal(p.nome, 'Time')
  assert.equal(p.pecas.length, 4)
  // o canto de cima à esquerda do arranjo é a origem: a partitura cabe em qualquer canto de qualquer espaço
  assert.deepEqual(
    p.pecas.map((x) => [x.tipo, x.x, x.y]),
    [
      ['terminal', 0, 0],
      ['terminal', 1000, 0],
      ['texto', 0, 600],
      ['postit', 1000, 600]
    ]
  )
  assert.equal(p.largura, 1800)
  assert.deepEqual(p.cordas, [[0, 1]])
  const main = p.pecas[0]
  assert.equal(main.tipo === 'terminal' && main.funcao, 'Main')
  assert.equal(main.cor, '#007AFF')
  const revisor = p.pecas[1]
  assert.equal(revisor.tipo === 'terminal' && revisor.agente, 'codex')
})

test('a pasta do cartão não é salva: a partitura é o time, não o projeto', () => {
  const main = salvar().pecas[0]
  assert.equal('pasta' in main, false)
})

test('o texto do post-it vai dentro da partitura (a nota do espaço fica para trás)', () => {
  const nota = salvar().pecas[3]
  assert.equal(nota.tipo === 'postit' && nota.texto, '# combinado\n- um arquivo por agente')
  assert.equal(nota.tipo === 'postit' && nota.corPostIt, 'rosa')
})

test('sem nenhum agente escolhido, recusa: partitura é time', () => {
  const p = plano([texto('t', 'só um recado', 0, 0), codigo('k', 500, 0)])
  const feito = partituraDe(p, {}, 'Nada', null, ambiente())
  assert.equal(typeof feito, 'string')
  assert.match(String(feito), /pelo menos um cartão de agente/)
})

test('cartão de código, pasta e portal não entram na partitura', () => {
  const p = plano([agente('a', 'Main', 0, 0), codigo('k', 900, 0)])
  const feito = partituraDe(p, {}, 'Time', null, ambiente()) as Partitura
  assert.deepEqual(feito.pecas.map((x) => x.tipo), ['terminal'])
})

test('salva só os cartões escolhidos, e a corda que fica dentro da escolha', () => {
  const { plano: p, notas } = timeDeQuatro()
  const feito = partituraDe(p, notas, 'Só o Main', ['m', 't'], ambiente()) as Partitura
  assert.deepEqual(feito.pecas.map((x) => x.tipo), ['terminal', 'texto'])
  assert.deepEqual(feito.cordas, [])
})

test('sobe num andar vazio: cartões, nomes, cordas, conversa nova e pasta da função', () => {
  const p = salvar()
  const r = subida(aplicarPartitura(plano([]), {}, p, 0, 0, ambiente({ funcoes: [funcao('Main', 'Você cuida do main', 'C:/outro/projeto')] })))
  assert.equal(r.plano.nos.length, 4)
  const main = r.plano.nos[0]
  assert.equal(main.tipo === 'terminal' && main.nome, 'Main')
  // a pasta vem da função de hoje, não de um caminho salvo no dia da partitura
  assert.equal(main.tipo === 'terminal' && main.pasta, 'C:/outro/projeto')
  assert.ok(main.tipo === 'terminal' && main.sessao, 'o Claude sobe com conversa própria')
  const revisor = r.plano.nos[1]
  assert.equal(revisor.tipo === 'terminal' && revisor.sessao, undefined)
  assert.equal(r.plano.cordas.length, 1)
  assert.equal(r.plano.cordas[0].de, main.id)
  // o prompt da função vira o primeiro pedido de quem tem papel
  assert.deepEqual(r.pedidos, [{ id: main.id, texto: 'Você cuida do main' }])
  const nota = r.plano.nos[3]
  assert.equal(nota.tipo === 'postit' && r.notas[nota.arquivo], '# combinado\n- um arquivo por agente')
  assert.match(r.texto, /Subi a partitura "Time": 2 agentes/)
})

test('nome em uso ganha número, como no `mpro abrir`', () => {
  const r = subida(aplicarPartitura(plano([agente('x', 'Main', -5000, -5000)]), {}, salvar(), 0, 0, ambiente()))
  const nomes = r.plano.nos.flatMap((n) => (n.tipo === 'terminal' ? [n.nome] : []))
  assert.deepEqual(nomes, ['Main', 'Main 2', 'Revisor'])
})

test('função apagada depois de salvar: o cartão sobe sem primeiro pedido, e a resposta diz', () => {
  const r = subida(aplicarPartitura(plano([]), {}, salvar(), 0, 0, ambiente({ funcoes: [] })))
  assert.deepEqual(r.pedidos, [])
  assert.match(r.texto, /não existe mais/)
  // mesmo sem a função, o papel continua escrito no cartão
  assert.equal(r.plano.nos[0].tipo === 'terminal' && r.plano.nos[0].funcao, 'Main')
})

test('subida por agente: nasce ligada a ele e sob a responsabilidade dele', () => {
  const chefe = agente('chefe', 'Maestro', -5000, -5000)
  const r = subida(aplicarPartitura(plano([chefe]), {}, salvar(), 0, 0, ambiente({ dono: 'chefe', limiteSessoesPorAgente: 8 })))
  const novos = r.plano.nos.filter((n) => n.tipo === 'terminal' && n.id !== 'chefe')
  assert.equal(novos.length, 2)
  assert.ok(novos.every((n) => n.tipo === 'terminal' && n.criadoPor === 'chefe'))
  // a corda da partitura mais uma de cada agente novo com quem pediu
  assert.equal(r.plano.cordas.length, 3)
  assert.equal(r.plano.cordas.filter((c) => c.de === 'chefe').length, 2)
  assert.match(r.texto, /pode fechá-los/)
})

test('subida pelo usuário não inventa dono nem corda a mais', () => {
  const r = subida(aplicarPartitura(plano([agente('chefe', 'Maestro', -5000, -5000)]), {}, salvar(), 0, 0, ambiente()))
  assert.equal(r.plano.cordas.length, 1)
  assert.ok(r.plano.nos.every((n) => n.tipo !== 'terminal' || n.criadoPor === undefined))
})

test('o limite de sessões do agente vale para a partitura inteira', () => {
  const nos = [agente('chefe', 'Maestro', -9000, -9000), ...Array.from({ length: 7 }, (_, i) => agente(`f${i}`, `Filho ${i}`, -9000 + i * 900, -8000, { criadoPor: 'chefe' }))]
  const r = aplicarPartitura(plano(nos), {}, salvar(), 0, 0, ambiente({ dono: 'chefe', limiteSessoesPorAgente: 8 }))
  assert.ok('erro' in r)
  assert.match(r.erro, /o limite é 8/)
})

test('lugar ocupado: o arranjo desce até achar canto livre, sem empurrar ninguém', () => {
  const ocupante = agente('o', 'Quem já estava', 0, 0)
  const antes = plano([ocupante])
  const r = subida(aplicarPartitura(antes, {}, salvar(), 0, 0, ambiente()))
  const main = r.plano.nos.find((n) => n.id !== 'o')!
  assert.ok(main.y > ocupante.y + ocupante.altura, 'o time subiu abaixo de quem já estava')
  // nada do que estava no quadro mudou
  assert.deepEqual(r.plano.nos.find((n) => n.id === 'o'), ocupante)
})

test('grupo volta como grupo, com id novo', () => {
  const { plano: p, notas } = timeDeQuatro()
  const juntos = plano(
    p.nos.map((n) => (n.id === 'm' || n.id === 't' ? ({ ...n, grupo: 'g-antigo' } as No) : n)),
    p.cordas
  )
  const salva = partituraDe(juntos, notas, 'Time', null, ambiente()) as Partitura
  assert.deepEqual(salva.pecas.map((x) => x.grupo), [0, undefined, 0, undefined])
  const r = subida(aplicarPartitura(plano([]), {}, salva, 0, 0, ambiente()))
  const grupos = r.plano.nos.map((n) => n.grupo)
  assert.equal(grupos[0], grupos[2])
  assert.ok(grupos[0] && grupos[0] !== 'g-antigo')
  assert.equal(grupos[1], undefined)
})

test('um cartão sozinho de um grupo sobe solto', () => {
  const { plano: p, notas } = timeDeQuatro()
  const comGrupo = plano(p.nos.map((n) => (n.id === 'm' ? ({ ...n, grupo: 'g' } as No) : n)), p.cordas)
  const salva = partituraDe(comGrupo, notas, 'Time', ['m', 't'], ambiente()) as Partitura
  assert.deepEqual(salva.pecas.map((x) => x.grupo), [undefined, undefined])
})

test('nenhuma subida apaga nada: o quadro só cresce', () => {
  const antes = plano([agente('a', 'Quem já estava', 0, 0), texto('t', 'recado antigo', 0, 2000)], [])
  const r = subida(aplicarPartitura(antes, { 'velha.md': 'fica' }, salvar(), 0, 0, ambiente()))
  assert.equal(r.plano.nos.length, antes.nos.length + 4)
  for (const velho of antes.nos) assert.deepEqual(r.plano.nos.find((n) => n.id === velho.id), velho)
  assert.equal(r.notas['velha.md'], 'fica')
})

test('teto de cartões do andar: recusa em vez de encher o quadro', () => {
  const muitos = Array.from({ length: 398 }, (_, i) => texto(`t${i}`, `${i}`, i * 500, 0))
  const r = aplicarPartitura(plano(muitos), {}, salvar(), 0, 0, ambiente())
  assert.ok('erro' in r)
  assert.match(r.erro, /passaria do limite/)
})

test('o resumo conta o que tem dentro, sem abrir', () => {
  assert.equal(resumoDaPartitura(salvar()), '2 agentes · 2 recados · 1 corda · funções: "Main", "Revisor"')
})

test('a banda vai na partitura: o time sobe junto com a moldura que dá as permissões', () => {
  const banda = { id: 'b', tipo: 'banda', nome: 'Revisores', x: 900, y: 400, largura: 2000, altura: 800, z: -1, criadoEm: instante } as No
  const { plano: p, notas } = timeDeQuatro()
  const comBanda = plano([banda, ...p.nos], [...p.cordas, corda('c2', 'b', 'm')])
  const salva = partituraDe(comBanda, notas, 'Time', null, ambiente()) as Partitura
  const moldura = salva.pecas.find((x) => x.tipo === 'banda')
  assert.ok(moldura, 'a moldura entrou na partitura')
  assert.equal(moldura.tipo === 'banda' && moldura.nome, 'Revisores')
  // a corda desenhada na banda também é guardada (é permissão de time, não enfeite)
  assert.equal(salva.cordas.length, 2)
  const r = subida(aplicarPartitura(plano([]), {}, salva, 0, 0, ambiente()))
  const nova = r.plano.nos.find((n) => n.tipo === 'banda')
  assert.ok(nova && nova.tipo === 'banda' && nova.nome === 'Revisores')
  // a moldura sobe atrás dos cartões, senão cobriria o time
  assert.ok(nova.z < Math.min(...r.plano.nos.filter((n) => n.tipo !== 'banda').map((n) => n.z)))
  // e o time sobe dentro dela: a moldura guarda o lugar relativo, então quem estava dentro continua dentro
  assert.deepEqual(
    membrosDaBanda(r.plano, nova.id).map((n) => n.nome),
    ['Main', 'Revisor']
  )
  assert.match(resumoDaPartitura(salva), /banda/)
})
