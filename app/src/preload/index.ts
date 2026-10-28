import { contextBridge, ipcRenderer } from 'electron'
import {
  CANAIS,
  CANAIS_AGENTES,
  CANAIS_ANDARES,
  CANAIS_APP,
  CANAIS_AREA,
  CANAIS_DADOS,
  CANAIS_JANELAS,
  CANAL_AVISO,
  CANAIS_PORTAL,
  type ApiAndares,
  type ApiArea,
  type ApiDados,
  type ApiJanelas,
  type ApiPortal,
  type AvisoPortal,
  type AvisoJanelas,
  type ApiMaestri,
  type PedidoDoAgente
} from '../shared/api'

/** Cada canal vira uma função que chama o processo principal e devolve a resposta. */
function chamadas<T>(canais: Record<string, string>): T {
  return Object.fromEntries(
    Object.entries(canais).map(([nome, canal]) => [nome, (...args: unknown[]) => ipcRenderer.invoke(canal, ...args)])
  ) as T
}

const dados = chamadas<ApiDados>(CANAIS_DADOS)
const andares = chamadas<ApiAndares>(CANAIS_ANDARES)
const area = chamadas<ApiArea>(CANAIS_AREA)
const janelas: ApiJanelas = {
  ...chamadas<Omit<ApiJanelas, 'aoAvisar'>>(CANAIS_JANELAS),
  aoAvisar: (ouvinte) => {
    ipcRenderer.on(CANAL_AVISO, (_evento, aviso: AvisoJanelas) => ouvinte(aviso))
  }
}

// Um ouvinte de IPC por canal, repassando só para o cartão daquele terminal:
// com muitos terminais, a saída de um não acorda os outros.
function distribuidor<T>(canal: string) {
  const porTerminal = new Map<string, Set<(valor: T) => void>>()
  ipcRenderer.on(canal, (_evento, id: string, valor: T) => {
    porTerminal.get(id)?.forEach((ouvinte) => ouvinte(valor))
  })
  return (id: string, ouvinte: (valor: T) => void): (() => void) => {
    let ouvintes = porTerminal.get(id)
    if (!ouvintes) porTerminal.set(id, (ouvintes = new Set()))
    ouvintes.add(ouvinte)
    return () => {
      ouvintes.delete(ouvinte)
      if (ouvintes.size === 0) porTerminal.delete(id)
    }
  }
}

const avisosDoPortal = distribuidor<AvisoPortal>(CANAIS_PORTAL.aviso)
const portal: ApiPortal = {
  disponivel: () => ipcRenderer.invoke(CANAIS_PORTAL.disponivel),
  abrir: (noId, url, alvo) => ipcRenderer.invoke(CANAIS_PORTAL.abrir, noId, url, alvo),
  // eventos frequentes (mouse, tamanho) vão sem esperar resposta
  tamanho: (noId, largura, altura, escala) => ipcRenderer.send(CANAIS_PORTAL.tamanho, noId, largura, altura, escala),
  visivel: (noId, sim) => ipcRenderer.send(CANAIS_PORTAL.visivel, noId, sim),
  entrada: (noId, entrada) => ipcRenderer.send(CANAIS_PORTAL.entrada, noId, entrada),
  navegar: (noId, navegacao) => ipcRenderer.send(CANAIS_PORTAL.navegar, noId, navegacao),
  responderDialogo: (noId, aceitar, texto) => ipcRenderer.send(CANAIS_PORTAL.responderDialogo, noId, aceitar, texto),
  alternarJanela: (noId) => ipcRenderer.send(CANAIS_PORTAL.alternarJanela, noId),
  fechar: (noId) => ipcRenderer.send(CANAIS_PORTAL.fechar, noId),
  aoAvisar: avisosDoPortal
}

// A janela não tem acesso ao Node: só a estas funções, nesta forma.
const api: ApiMaestri = {
  terminal: {
    sincronizar: (espacoId, terminais, cordas) => ipcRenderer.invoke(CANAIS.sincronizar, espacoId, terminais, cordas),
    ligar: (id) => ipcRenderer.invoke(CANAIS.ligar, id),
    desligar: (id) => ipcRenderer.send(CANAIS.desligar, id),
    escrever: (id, dados) => ipcRenderer.send(CANAIS.escrever, id, dados),
    redimensionar: (id, colunas, linhas) => ipcRenderer.send(CANAIS.redimensionar, id, colunas, linhas),
    reiniciar: (id) => ipcRenderer.invoke(CANAIS.reiniciar, id),
    aoReceber: distribuidor<string>(CANAIS.dados),
    aoSair: distribuidor<number>(CANAIS.saida),
    aoDescobrirSessao: (ouvinte) => {
      ipcRenderer.on(CANAIS.sessao, (_evento, id: string, sessao: string) => ouvinte(id, sessao))
    }
  },
  agentes: {
    aoPedir: (atender) => {
      ipcRenderer.on(CANAIS_AGENTES.pedido, async (_evento, id: string, pedido: PedidoDoAgente) => {
        const resposta = await Promise.resolve(atender(pedido)).catch((erro: unknown) => ({
          ok: false as const,
          erro: erro instanceof Error ? erro.message : String(erro)
        }))
        ipcRenderer.send(CANAIS_AGENTES.resposta, id, resposta)
      })
    }
  },
  dados,
  andares,
  area,
  janelas,
  portal,
  aoPedirFechar: (salvar) => {
    ipcRenderer.on(CANAIS_APP.vaiFechar, async () => {
      const gravou = await salvar().catch(() => false)
      ipcRenderer.send(CANAIS_APP.podeFechar, gravou)
    })
  },
  autoteste: process.argv.includes('--autoteste')
}

contextBridge.exposeInMainWorld('mp', api)
