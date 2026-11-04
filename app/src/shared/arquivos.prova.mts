import assert from 'node:assert/strict'
import test from 'node:test'
// Node executa provas TypeScript diretamente e precisa da extensão; o bundler resolve a fonte normalmente.
// @ts-expect-error TS ainda exige allowImportingTsExtensions para esse modo de execução do Node.
import { caminhoRelativo, pastaVigiavel, temCaraDeSegredo, textoDoAnexo, textoDosAnexos, valeSeguir } from './arquivos.ts'

// Caminhos crus (String.raw) porque é assim que o Windows entrega, com barra invertida e espaço no meio.
const PASTA = String.raw`C:\Users\luisg\ARQUIVOS GERAL\02 PROJETOS\Maestri Proprio\app`
const dentro = (resto: string): string => `${PASTA}\u005C${resto}`

test('caminho relativo sai com barra para frente e ignora maiúscula', () => {
  assert.equal(caminhoRelativo(PASTA, dentro(String.raw`src\main\codigo.ts`)), 'src/main/codigo.ts')
  assert.equal(caminhoRelativo(PASTA.toLowerCase(), dentro('src/App.tsx')), 'src/App.tsx')
  assert.equal(caminhoRelativo(PASTA, PASTA), null)
  assert.equal(caminhoRelativo(PASTA, String.raw`C:\Windows\System32\drivers\etc\hosts`), null)
})

test('anexo: @relativo para o agente, caminho inteiro quando tem espaço', () => {
  const codigo = dentro(String.raw`src\main\codigo.ts`)
  assert.equal(textoDoAnexo(codigo, PASTA, 'claude'), '@src/main/codigo.ts')
  assert.equal(textoDoAnexo(codigo, PASTA, 'codex'), '@src/main/codigo.ts')
  // o shell não tem @: vai o caminho, entre aspas por causa do espaço de "ARQUIVOS GERAL"
  assert.equal(textoDoAnexo(codigo, PASTA, 'shell'), `"${codigo}"`)
  // relativo com espaço quebraria o completar do @: vai o caminho inteiro
  const comEspaco = dentro(String.raw`src\meu arquivo.ts`)
  assert.equal(textoDoAnexo(comEspaco, PASTA, 'claude'), `"${comEspaco}"`)
  // fora da pasta do agente não existe relativo
  assert.equal(textoDoAnexo(String.raw`D:\exports\lista.csv`, PASTA, 'claude'), String.raw`D:\exports\lista.csv`)
})

test('vários anexos saem separados, com espaço no fim para continuar digitando', () => {
  assert.equal(textoDosAnexos([dentro('a.ts'), dentro('b.ts')], PASTA, 'claude'), '@a.ts @b.ts ')
  assert.equal(textoDosAnexos([], PASTA, 'claude'), '')
})

test('segredo: nome de credencial sim, código com "token" no meio da palavra não', () => {
  const segredos = ['.env', '.env.local', '.mcp.json', 'google-conta-servico.json', 'id_ed25519', 'chave.pem', 'access_token.json', 'senhas.txt', 'client-secret.yml']
  for (const nome of segredos) assert.equal(temCaraDeSegredo(dentro(nome)), true, nome)
  for (const nome of ['tokenizer.ts', 'secretaria.md', 'ambiente.ts', 'index.html']) {
    assert.equal(temCaraDeSegredo(dentro(nome)), false, nome)
  }
})

test('seguir: código sim; build, binário, temporário e segredo não', () => {
  assert.equal(valeSeguir('src/main/codigo.ts'), true)
  assert.equal(valeSeguir('docs/README.md'), true)
  assert.equal(valeSeguir('.claude/agents/n8n.md'), true)
  assert.equal(valeSeguir(String.raw`src\main\codigo.ts`), true)
  assert.equal(valeSeguir('node_modules/react/index.js'), false)
  assert.equal(valeSeguir('.git/index'), false)
  assert.equal(valeSeguir('out/main/index.js'), false)
  assert.equal(valeSeguir('public/logo.png'), false)
  assert.equal(valeSeguir('src/codigo.ts.tmp'), false)
  assert.equal(valeSeguir('package-lock.json'), false)
  assert.equal(valeSeguir('.env'), false)
  assert.equal(valeSeguir(''), false)
})

test('pastaVigiavel recusa casa, raiz e pastas de sistema, e aceita projeto', () => {
  const casa = 'C:\u005CUsers\u005Cluis'
  assert.equal(pastaVigiavel('C:\u005CUsers\u005Cluis\u005Cprojetos\u005Cmeuapp', casa), true)
  assert.equal(pastaVigiavel(casa, casa), false)
  assert.equal(pastaVigiavel(casa + '\u005C', casa), false)
  assert.equal(pastaVigiavel('C:\u005C', casa), false)
  assert.equal(pastaVigiavel('C:', casa), false)
  assert.equal(pastaVigiavel('/', casa), false)
  assert.equal(pastaVigiavel(casa + '\u005CDownloads', casa), false)
  assert.equal(pastaVigiavel(casa + '\u005CAppData\u005CLocal', casa), false)
  assert.equal(pastaVigiavel('C:\u005CWindows', casa), false)
  // uma pasta dentro de uma recusada continua valendo: o projeto é que manda
  assert.equal(pastaVigiavel(casa + '\u005CDownloads\u005Cprojeto', casa), true)
  assert.equal(pastaVigiavel(casa + '\u005CAppData\u005CLocal\u005CTemp\u005Cteste-123', casa), true)
})
