import { apagarAndar, lerEstado, pousarAndar, salvarAgora } from '../estado/loja'
import { avisar, confirmar } from './Perguntas'

// Ações de andar que mexem no git: sempre mostram o que vai acontecer e pedem confirmação.

// ---------- diálogo de novo andar (aberto de vários lugares: menu, pilha, lateral) ----------

let novoAndarAberto = false
const ouvintes = new Set<() => void>()

export function abrirNovoAndar(): void {
  novoAndarAberto = true
  ouvintes.forEach((o) => o())
}

export function fecharNovoAndar(): void {
  novoAndarAberto = false
  ouvintes.forEach((o) => o())
}

export const novoAndar = {
  inscrever: (o: () => void) => {
    ouvintes.add(o)
    return () => ouvintes.delete(o)
  },
  aberto: () => novoAndarAberto
}

function acharAndar(andarId: string) {
  const espaco = lerEstado().espaco
  return { espaco, andar: espaco?.andares.find((a) => a.id === andarId) }
}

const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`

/** Juntar o ramo do andar ao projeto principal (merge) e tirar o andar do quadro. */
export async function juntarAndar(andarId: string): Promise<void> {
  const { espaco, andar } = acharAndar(andarId)
  if (!espaco || !andar?.git) return
  await salvarAgora()
  const s = await window.mp.andares.situacao(espaco.id, andarId)
  if (!s) return
  if (s.destacado) {
    return avisar(
      'O projeto principal está sem ramo aberto',
      'O principal está em "HEAD solto" (nenhum ramo aberto). Abra o ramo em que o andar deve entrar (por exemplo, main) e tente de novo.'
    )
  }
  if (s.alterados > 0) {
    return avisar(
      'O andar tem mudanças fora de commit',
      `Há ${plural(s.alterados, 'arquivo mudado', 'arquivos mudados')} no andar "${andar.nome}" que ainda não foram para um commit. Faça o commit (ou descarte) e tente de novo.`
    )
  }
  if (s.alteradosNoPrincipal > 0) {
    return avisar(
      'O projeto principal tem mudanças fora de commit',
      `Há ${plural(s.alteradosNoPrincipal, 'arquivo mudado', 'arquivos mudados')} no ramo "${s.ramoPrincipal}". Faça o commit antes de juntar, para nada se misturar.`
    )
  }
  const outroRamo =
    s.ramoPrincipal !== s.ramoBase
      ? ` Atenção: o andar nasceu de "${s.ramoBase}", mas o principal agora está em "${s.ramoPrincipal}". Se não for isso que você quer, cancele e abra "${s.ramoBase}" antes.`
      : ''
  const r = await confirmar({
    titulo: `Juntar "${andar.nome}" em "${s.ramoPrincipal}"`,
    mensagem:
      (s.commitsAFrente > 0
        ? `${plural(s.commitsAFrente, 'commit', 'commits')} do ramo "${andar.git.ramo}" entram em "${s.ramoPrincipal}" (merge). Depois o andar sai do quadro, com os cartões dele, e a pasta do andar é removida.`
        : `O ramo "${andar.git.ramo}" não tem commits novos: nada entra em "${s.ramoPrincipal}". O andar só sai do quadro e a pasta dele é removida.`) +
      outroRamo,
    opcao: { rotulo: `Apagar também o ramo "${andar.git.ramo}"`, marcada: true },
    botoes: [
      { rotulo: 'Cancelar', valor: 'cancelar' },
      { rotulo: 'Juntar', valor: 'juntar', primario: true }
    ]
  })
  if (r.botao !== 'juntar') return
  const resultado = await pousarAndar(andarId, r.opcao, s.ramoPrincipal)
  if (!resultado.ok) await avisar('Não deu para juntar', resultado.mensagem, resultado.arquivos)
}

/** Apagar o andar: tira do quadro e, com git, remove a pasta do andar (o ramo só sai se pedir). */
export async function apagarAndarComConfirmacao(andarId: string): Promise<void> {
  const { espaco, andar } = acharAndar(andarId)
  if (!espaco || !andar) return
  const cartoes = plural(andar.nos.length, 'cartão', 'cartões')
  if (!andar.git) {
    const r = await confirmar({
      titulo: `Apagar o andar "${andar.nome}"?`,
      mensagem: `O andar e os ${cartoes} dele saem do quadro.`,
      botoes: [
        { rotulo: 'Cancelar', valor: 'cancelar', primario: true },
        { rotulo: 'Apagar andar', valor: 'apagar', perigo: true }
      ]
    })
    if (r.botao === 'apagar') await apagarAndar(andarId, false, false)
    return
  }
  await salvarAgora()
  const s = await window.mp.andares.situacao(espaco.id, andarId)
  const perdas = s && s.alterados > 0 ? ` ${plural(s.alterados, 'arquivo mudado e fora de commit vai ser perdido', 'arquivos mudados e fora de commit vão ser perdidos')}.` : ''
  const r = await confirmar({
    titulo: `Apagar o andar "${andar.nome}"?`,
    mensagem: `O andar e os ${cartoes} dele saem do quadro e a pasta do andar é removida.${perdas}${
      s && s.commitsAFrente > 0 ? ` O ramo tem ${plural(s.commitsAFrente, 'commit', 'commits')} que não estão no principal.` : ''
    }`,
    opcao: { rotulo: `Apagar também o ramo "${andar.git.ramo}" (os commits dele somem)`, marcada: false },
    botoes: [
      { rotulo: 'Cancelar', valor: 'cancelar', primario: true },
      { rotulo: 'Apagar andar', valor: 'apagar', perigo: true }
    ]
  })
  if (r.botao !== 'apagar') return
  const resultado = await apagarAndar(andarId, r.opcao, (s?.alterados ?? 0) > 0)
  if (!resultado.ok) await avisar('Não deu para apagar', resultado.mensagem, resultado.arquivos)
}
