/**
 * Trocar o agente de um cartão: o mesmo cartão passa a rodar outro agente (Claude → Codex, Codex → shell…)
 * **sem perder lugar, tamanho, nome, função, cordas, banda nem a árvore de código**. É o que faltava para
 * experimentar outro modelo numa frente de trabalho já montada sem desmontar o quadro.
 *
 * Função pura: decide o cartão novo e diz o que a janela tem de fazer depois (reabrir o processo e, se o
 * cartão tem função, entregar o prompt dela de novo — o agente novo chega sem saber de nada).
 */
import type { Funcao, Plano, PresetAgente } from '../modelo'

export interface PedidoDeTroca {
  id: string
  /** O preset escolhido: é dele que vêm o agente e a linha de comando. */
  preset: PresetAgente
  /** Pedido de agente pelo `mpro`: aí vale a regra de cartão travado ser intocável. */
  porAgente?: boolean
}

export interface TrocaFeita {
  plano: Plano
  id: string
  nome: string
  /** O prompt da função, para a janela entregar ao agente novo quando ele ficar pronto. */
  primeiroPedido?: string
  texto: string
}

export type ResultadoDaTroca = { erro: string } | TrocaFeita

export function trocarAgente(
  plano: Plano,
  pedido: PedidoDeTroca,
  funcoes: Funcao[],
  amb: { novoId: () => string }
): ResultadoDaTroca {
  const antigo = plano.nos.find((no) => no.id === pedido.id)
  if (!antigo) return { erro: 'esse cartão não está no andar à mostra' }
  if (antigo.tipo !== 'terminal') return { erro: 'só cartão de agente troca de agente' }
  if (pedido.porAgente && antigo.travado) return { erro: `não troquei nada: "${antigo.nome}" está travado` }
  const preset = pedido.preset
  if (antigo.agente === preset.agente && antigo.comando === preset.comando) {
    return { erro: `"${antigo.nome}" já é ${preset.nome}` }
  }

  const novo = {
    ...antigo,
    agente: preset.agente,
    comando: preset.comando,
    // a conversa é de quem saiu: o agente novo começa a sua (o Claude aceita o id desde o começo)
    sessao: preset.agente === 'claude' ? amb.novoId() : undefined
  }
  const funcao = antigo.funcao ? funcoes.find((f) => f.nome.toLowerCase() === antigo.funcao!.toLowerCase()) : undefined
  const prompt = funcao?.prompt.trim() ? funcao.prompt : undefined
  return {
    plano: { ...plano, nos: plano.nos.map((no) => (no.id === antigo.id ? novo : no)) },
    id: antigo.id,
    nome: antigo.nome,
    primeiroPedido: prompt,
    texto: [
      `Troquei "${antigo.nome}" para ${preset.nome}.`,
      'O lugar, o nome, as cordas e a árvore de código ficaram; a conversa anterior não vem (é outro agente).',
      ...(antigo.funcao
        ? [
            prompt
              ? `A função "${antigo.funcao}" foi entregue de novo ao agente novo.`
              : `O cartão continua com a função "${antigo.funcao}", mas ela não existe mais nas preferências: nada foi entregue.`
          ]
        : [])
    ].join(' ')
  }
}
