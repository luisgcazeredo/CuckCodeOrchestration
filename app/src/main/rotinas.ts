import { ipcMain, webContents, type WebContents } from 'electron'
import { CANAIS_ROTINAS, type AvisoRotina } from '../shared/api'
import type { Rotina } from '../shared/modelo'
import { aplicarDisparo, rotinaValida, vencidas } from '../shared/rotinas'
import { dispararNoTerminal } from './comandos'
import { donoDe, exigirDono } from './janelas'

// O relógio das rotinas. Quem conta o tempo e digita é o processo principal, porque é ele que tem o processo
// do cartão e sabe se o terminal está livre (a janela não sabe). A decisão de quando cada uma vence é da
// função pura em shared/rotinas.ts.
//
// Escopo, decidido assim de propósito: **a rotina corre enquanto o espaço está aberto numa janela.** É a
// janela que manda a lista; se ela fecha, o relógio daquele espaço para. Um relógio que rodasse com o app
// fechado é tarefa do Windows, não disto — e digitar num cartão que ninguém está vendo é pior do que não
// digitar.

const AUTOTESTE = process.argv.includes('--autoteste')
/** De quanto em quanto o relógio confere. No autoteste, rápido, para a suíte não esperar um minuto. */
const PASSO = AUTOTESTE ? 1000 : 10_000

interface PorEspaco {
  janela: number
  rotinas: Rotina[]
}

const porEspaco = new Map<string, PorEspaco>()
let relogio: ReturnType<typeof setInterval> | null = null
/** Um disparo por vez: digitar leva tempo (lê a tela antes), e dois ao mesmo tempo embaralhariam o teclado. */
let disparando = false

function avisar(janela: number, aviso: AvisoRotina): void {
  const conteudo: WebContents | undefined = webContents.fromId(janela)
  if (conteudo && !conteudo.isDestroyed()) conteudo.send(CANAIS_ROTINAS.aviso, aviso)
}

async function conferir(): Promise<void> {
  if (disparando) return
  disparando = true
  try {
    const agora = new Date()
    for (const [espacoId, dados] of [...porEspaco]) {
      // a janela fechou ou trocou de espaço: o relógio daquele espaço para, sem digitar nada
      if (donoDe(espacoId) !== dados.janela) {
        porEspaco.delete(espacoId)
        continue
      }
      for (const rotina of vencidas(dados.rotinas, agora)) {
        const resultado = await dispararNoTerminal(rotina.terminal, rotina.texto)
        const em = new Date()
        const depois = aplicarDisparo(rotina, resultado, em)
        // a conta nova fica aqui na hora: sem isso, a mesma rotina venceria de novo no passo seguinte,
        // antes de a janela devolver a lista atualizada
        dados.rotinas = dados.rotinas.map((r) => (r.id === rotina.id ? depois : r))
        avisar(dados.janela, { id: rotina.id, espacoId, resultado, em: em.toISOString(), proxima: depois.proxima })
      }
    }
  } finally {
    disparando = false
  }
}

export function registrarRotinas(): void {
  ipcMain.on(CANAIS_ROTINAS.definir, (evento, espacoId: unknown, lista: unknown) => {
    // sem exigirDono (que lança): num `send` da janela, uma exceção não tem para onde voltar — aqui basta
    // não aceitar lista de quem não é dono do espaço
    if (typeof espacoId !== 'string' || !Array.isArray(lista) || donoDe(espacoId) !== evento.sender.id) return
    const rotinas = lista.filter((r): r is Rotina => rotinaValida(r as Rotina))
    if (!rotinas.length) porEspaco.delete(espacoId)
    else porEspaco.set(espacoId, { janela: evento.sender.id, rotinas })
  })

  // disparar agora ("testar"), sem mexer no relógio: o resultado volta pelo mesmo aviso
  ipcMain.handle(CANAIS_ROTINAS.testar, async (evento, espacoId: unknown, id: unknown) => {
    if (typeof espacoId !== 'string' || typeof id !== 'string') return 'sem-cartao'
    exigirDono(evento, espacoId)
    const rotina = porEspaco.get(espacoId)?.rotinas.find((r) => r.id === id)
    if (!rotina) return 'sem-cartao'
    return dispararNoTerminal(rotina.terminal, rotina.texto)
  })

  relogio = setInterval(() => void conferir(), PASSO)
  relogio.unref?.()
}

/** Para o relógio (o app fechando). */
export function pararRotinas(): void {
  if (relogio) clearInterval(relogio)
  relogio = null
  porEspaco.clear()
}
