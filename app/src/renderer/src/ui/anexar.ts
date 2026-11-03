import { textoDosAnexos } from '../../../shared/arquivos'
import { lerEstado, pastaDoPlano, planoDe } from '../estado/loja'

// Anexar ao prompt é apontar um caminho para o agente, não enviar arquivo: o agente roda na mesma máquina e
// lê o arquivo ele mesmo. O texto entra na linha dele sem Enter, para o usuário seguir escrevendo o pedido.

interface Destino {
  pasta: string
  agente: 'claude' | 'codex' | 'shell'
}

function destino(terminalId: string): Destino | null {
  const espaco = lerEstado().espaco
  if (!espaco) return null
  const no = planoDe(espaco).nos.find((n) => n.id === terminalId)
  if (no?.tipo !== 'terminal') return null
  return { pasta: no.pasta || pastaDoPlano(espaco), agente: no.agente }
}

/** Escreve os caminhos na linha do terminal. Devolve false quando não havia o que escrever. */
export function anexarAoPrompt(terminalId: string, caminhos: string[]): boolean {
  const alvo = destino(terminalId)
  if (!alvo || !caminhos.length) return false
  const texto = textoDosAnexos(caminhos, alvo.pasta, alvo.agente)
  if (!texto) return false
  window.mp.terminal.escrever(terminalId, texto)
  return true
}

export async function anexarArquivosAoPrompt(terminalId: string): Promise<void> {
  const escolhidos = await window.mp.dados.escolherArquivos()
  anexarAoPrompt(
    terminalId,
    escolhidos.map((a) => a.caminho)
  )
}

export async function anexarPastaAoPrompt(terminalId: string): Promise<void> {
  const pasta = await window.mp.dados.escolherPasta()
  if (pasta) anexarAoPrompt(terminalId, [pasta])
}
