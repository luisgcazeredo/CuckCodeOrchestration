import { ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { Andar, ResultadoGit, SituacaoAndar } from '../shared/modelo'
import { CANAIS_ANDARES } from '../shared/api'
import { PASTA_DADOS, lerEspacoSalvo } from './dados'
import { exigirDono } from './janelas'

// Andares com git: cada um é um worktree num ramo próprio, guardado em ~/.maestri-proprio/andares/<espaço>/,
// fora das pastas de projeto. O git roda direto (execFile, sem shell), sempre com a pasta lida do disco.

interface Saida {
  codigo: number
  saida: string
  erro: string
}

function git(pasta: string, args: string[]): Promise<Saida> {
  return new Promise((resolver) => {
    execFile('git', args, { cwd: pasta, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }, (falha, saida, erro) => {
      const codigo = falha ? (typeof falha.code === 'number' ? falha.code : 1) : 0
      resolver({ codigo, saida: saida.trim(), erro: erro.trim() })
    })
  })
}

async function ehRepositorio(pasta: string): Promise<boolean> {
  return existsSync(pasta) && (await git(pasta, ['rev-parse', '--is-inside-work-tree'])).saida === 'true'
}

async function ramoAtual(pasta: string): Promise<string> {
  return (await git(pasta, ['rev-parse', '--abbrev-ref', 'HEAD'])).saida
}

/** Linhas de `git status --porcelain`, cada uma um arquivo mudado. */
async function mudados(pasta: string, comNaoRastreados: boolean): Promise<string[]> {
  const r = await git(pasta, ['status', '--porcelain', comNaoRastreados ? '--untracked-files=normal' : '--untracked-files=no'])
  return r.saida ? r.saida.split('\n').map((l) => l.slice(3)) : []
}

/** Nome de ramo a partir do nome do andar: "Arrumar login!" → "andar/arrumar-login". */
function ramoDoNome(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return `andar/${base || 'novo'}`
}

function localizar(espacoId: string, andarId: string): { pastaEspaco: string; andar: Andar } {
  const espaco = lerEspacoSalvo(espacoId)
  const andar = espaco?.andares?.find((a) => a.id === andarId)
  if (!espaco || !andar) throw new Error('andar não encontrado (salve o quadro antes)')
  return { pastaEspaco: espaco.pasta, andar }
}

export function registrarAndares(): void {
  ipcMain.handle(CANAIS_ANDARES.situacaoGit, async (_e, espacoId: string) => {
    const espaco = lerEspacoSalvo(espacoId)
    if (!espaco || !(await ehRepositorio(espaco.pasta))) return { repositorio: false, ramo: null }
    return { repositorio: true, ramo: await ramoAtual(espaco.pasta) }
  })

  ipcMain.handle(CANAIS_ANDARES.criar, async (evento, espacoId: string, nome: string, usarGit: boolean): Promise<Andar> => {
    exigirDono(evento, espacoId)
    const espaco = lerEspacoSalvo(espacoId)
    if (!espaco) throw new Error('espaço não encontrado')
    const limpo = String(nome ?? '').trim().slice(0, 60) || 'Novo andar'
    const andar: Andar = {
      id: randomUUID(),
      nome: limpo,
      criadoEm: new Date().toISOString(),
      git: null,
      camera: { x: 0, y: 0, zoom: 1 },
      nos: [],
      cordas: [],
      desenhos: []
    }
    if (!usarGit) return andar
    if (!(await ehRepositorio(espaco.pasta))) throw new Error('a pasta do espaço não é um repositório git')

    // ramo novo e livre: andar/nome, andar/nome-2, andar/nome-3…
    let ramo = ramoDoNome(limpo)
    for (let n = 2; (await git(espaco.pasta, ['rev-parse', '--verify', '--quiet', `refs/heads/${ramo}`])).codigo === 0; n++) {
      ramo = `${ramoDoNome(limpo)}-${n}`
    }
    const pastaAndar = join(PASTA_DADOS, 'andares', espacoId, ramo.replace('andar/', '') + '-' + andar.id.slice(0, 6))
    mkdirSync(join(PASTA_DADOS, 'andares', espacoId), { recursive: true })
    const ramoBase = await ramoAtual(espaco.pasta)
    const r = await git(espaco.pasta, ['worktree', 'add', '-b', ramo, pastaAndar])
    if (r.codigo !== 0) throw new Error(`git worktree falhou: ${r.erro || r.saida}`)
    andar.git = { ramo, pasta: pastaAndar, ramoBase }
    return andar
  })

  ipcMain.handle(CANAIS_ANDARES.situacao, async (_e, espacoId: string, andarId: string): Promise<SituacaoAndar | null> => {
    // é só leitura (a pílula pergunta a cada 5 s): andar recém-criado e ainda não salvo responde "nada"
    const espaco = lerEspacoSalvo(espacoId)
    const andar = espaco?.andares.find((a) => a.id === andarId)
    if (!espaco || !andar?.git) return null
    const pastaEspaco = espaco.pasta
    const principal = await ramoAtual(pastaEspaco)
    const destacado = (await git(pastaEspaco, ['symbolic-ref', '-q', 'HEAD'])).codigo !== 0
    const aFrente = await git(pastaEspaco, ['rev-list', '--count', `HEAD..refs/heads/${andar.git.ramo}`])
    return {
      commitsAFrente: Number(aFrente.saida) || 0,
      alterados: existsSync(andar.git.pasta) ? (await mudados(andar.git.pasta, true)).length : 0,
      alteradosNoPrincipal: (await mudados(pastaEspaco, false)).length,
      ramoPrincipal: principal,
      ramoBase: andar.git.ramoBase,
      destacado
    }
  })

  /**
   * Junta o ramo do andar em `destino` (o ramo que o usuário confirmou) e remove o worktree.
   * Recusa se o principal mudou de ramo depois da confirmação, se está sem ramo (HEAD solto) ou se o
   * worktree não bate com o que o git conhece.
   */
  ipcMain.handle(
    CANAIS_ANDARES.pousar,
    async (evento, espacoId: string, andarId: string, apagarRamo: boolean, destino: string): Promise<ResultadoGit> => {
      exigirDono(evento, espacoId)
      const { pastaEspaco, andar } = localizar(espacoId, andarId)
      if (!andar.git) return { ok: true, mensagem: 'andar sem git: nada para juntar' }
      const { ramo, pasta } = andar.git
      if ((await conferirWorktree(pastaEspaco, ramo, pasta)) !== 'confere') {
        return { ok: false, mensagem: 'A pasta e o ramo deste andar não batem com o que o git conhece. Nada foi feito.' }
      }
      if ((await git(pastaEspaco, ['symbolic-ref', '-q', 'HEAD'])).codigo !== 0) {
        return { ok: false, mensagem: 'O projeto principal está sem ramo aberto (HEAD solto). Abra um ramo antes de juntar.' }
      }
      const principal = await ramoAtual(pastaEspaco)
      if (principal !== destino) {
        return { ok: false, mensagem: `O projeto principal mudou para "${principal}" (você confirmou "${destino}"). Nada foi feito; tente de novo.` }
      }
      const noAndar = await mudados(pasta, true)
      if (noAndar.length) {
        return { ok: false, mensagem: 'O andar tem mudanças fora de commit. Faça o commit (ou descarte) antes de juntar.', arquivos: noAndar }
      }
      const noPrincipal = await mudados(pastaEspaco, false)
      if (noPrincipal.length) {
        return { ok: false, mensagem: 'O projeto principal tem mudanças fora de commit. Faça o commit antes de juntar.', arquivos: noPrincipal }
      }
      const junta = await git(pastaEspaco, ['merge', '--no-ff', '--no-edit', '-m', `Junta o andar "${andar.nome}" (${ramo})`, `refs/heads/${ramo}`])
      if (junta.codigo !== 0) {
        const conflitos = (await git(pastaEspaco, ['diff', '--name-only', '--diff-filter=U'])).saida.split('\n').filter(Boolean)
        await git(pastaEspaco, ['merge', '--abort'])
        const aindaJuntando = (await git(pastaEspaco, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).codigo === 0
        if (aindaJuntando) {
          return {
            ok: false,
            mensagem: `A junção falhou e o projeto ficou no meio dela. Abra um terminal em "${pastaEspaco}" e rode "git merge --abort" (ou resolva os conflitos).`,
            arquivos: conflitos
          }
        }
        if (/identity unknown|user\.email|user\.name/i.test(junta.erro)) {
          return {
            ok: false,
            mensagem: 'O git não sabe quem assina o commit da junção neste projeto (falta user.name e user.email). Configure no repositório e tente de novo. Nada foi mudado.'
          }
        }
        return {
          ok: false,
          mensagem: `Não deu para juntar em "${principal}": ${conflitos.length ? 'conflito nos arquivos abaixo' : junta.erro || junta.saida}. Nada foi mudado.`,
          arquivos: conflitos
        }
      }
      const remove = await git(pastaEspaco, ['worktree', 'remove', pasta])
      if (remove.codigo !== 0) {
        // a junção já está feita; o andar fica no quadro para não perder o rastro da pasta que sobrou
        return {
          ok: false,
          mensagem: `O andar foi juntado em "${principal}", mas a pasta dele não saiu (${remove.erro}). O andar continua no quadro: feche o que estiver usando a pasta e apague o andar.`
        }
      }
      // -d (não -D): o git só apaga se o ramo já estiver todo dentro do principal
      const apagou = apagarRamo ? await git(pastaEspaco, ['branch', '-d', ramo]) : null
      return {
        ok: true,
        mensagem: `Andar juntado em "${principal}".${apagou && apagou.codigo !== 0 ? ` O ramo ficou: ${apagou.erro}` : ''}`
      }
    }
  )

  /** Apaga o andar: remove o worktree e, se pedido, o ramo. `forcar` descarta mudanças fora de commit. */
  ipcMain.handle(
    CANAIS_ANDARES.apagar,
    async (evento, espacoId: string, andarId: string, apagarRamo: boolean, forcar: boolean): Promise<ResultadoGit> => {
      exigirDono(evento, espacoId)
      const { pastaEspaco, andar } = localizar(espacoId, andarId)
      if (!andar.git) return { ok: true, mensagem: 'andar apagado' }
      const { ramo, pasta } = andar.git
      const situacao = await conferirWorktree(pastaEspaco, ramo, pasta)
      if (situacao === 'diferente') {
        return { ok: false, mensagem: 'A pasta e o ramo deste andar não batem com o que o git conhece. Nada foi apagado.' }
      }
      if (situacao === 'confere') {
        const pendentes = await mudados(pasta, true)
        if (pendentes.length && !forcar) {
          return { ok: false, mensagem: 'O andar tem mudanças fora de commit, que seriam perdidas.', arquivos: pendentes }
        }
        const r = await git(pastaEspaco, ['worktree', 'remove', ...(forcar ? ['--force'] : []), pasta])
        if (r.codigo !== 0) return { ok: false, mensagem: `A pasta do andar não saiu: ${r.erro}` }
      } else {
        await git(pastaEspaco, ['worktree', 'prune'])
      }
      if (apagarRamo) {
        const r = await git(pastaEspaco, ['branch', '-D', ramo])
        if (r.codigo !== 0) return { ok: true, mensagem: `Andar apagado; o ramo ficou: ${r.erro}` }
      }
      return { ok: true, mensagem: apagarRamo ? 'Andar e ramo apagados.' : `Andar apagado; o ramo "${ramo}" continua no projeto.` }
    }
  )
}

const mesmoCaminho = (a: string, b: string): boolean => resolve(a).toLowerCase() === resolve(b).toLowerCase()

/**
 * Confere com o git (`worktree list`): 'confere' = há um worktree nesta pasta com este ramo;
 * 'sem-pasta' = a pasta já não existe e nenhum worktree usa o ramo; 'diferente' = qualquer outra coisa.
 */
async function conferirWorktree(pastaEspaco: string, ramo: string, pasta: string): Promise<'confere' | 'sem-pasta' | 'diferente'> {
  const lista = (await git(pastaEspaco, ['worktree', 'list', '--porcelain'])).saida.split(/\r?\n\r?\n/)
  const entradas = lista.map((bloco) => ({
    pasta: /^worktree (.+)$/m.exec(bloco)?.[1] ?? '',
    ramo: /^branch refs\/heads\/(.+)$/m.exec(bloco)?.[1] ?? null
  }))
  const daPasta = entradas.find((e) => e.pasta && mesmoCaminho(e.pasta, pasta))
  if (daPasta) return daPasta.ramo === ramo ? 'confere' : 'diferente'
  const outroUsaORamo = entradas.some((e) => e.ramo === ramo)
  return !existsSync(pasta) && !outroUsaORamo ? 'sem-pasta' : 'diferente'
}
