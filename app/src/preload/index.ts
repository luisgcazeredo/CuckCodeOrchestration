import { contextBridge, ipcRenderer } from 'electron'
import { CANAIS, CANAIS_APP, CANAIS_DADOS, type ApiDados, type ApiMaestri } from '../shared/api'

const dados = Object.fromEntries(
  Object.entries(CANAIS_DADOS).map(([nome, canal]) => [nome, (...args: unknown[]) => ipcRenderer.invoke(canal, ...args)])
) as unknown as ApiDados

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

// A janela não tem acesso ao Node: só a estas funções, nesta forma.
const api: ApiMaestri = {
  terminal: {
    criar: (opcoes) => ipcRenderer.invoke(CANAIS.criar, opcoes),
    escrever: (id, dados) => ipcRenderer.send(CANAIS.escrever, id, dados),
    redimensionar: (id, colunas, linhas) => ipcRenderer.send(CANAIS.redimensionar, id, colunas, linhas),
    encerrar: (id) => ipcRenderer.send(CANAIS.encerrar, id),
    aoReceber: distribuidor<string>(CANAIS.dados),
    aoSair: distribuidor<number>(CANAIS.saida)
  },
  dados,
  aoPedirFechar: (salvar) => {
    ipcRenderer.on(CANAIS_APP.vaiFechar, async () => {
      try {
        await salvar()
      } finally {
        ipcRenderer.send(CANAIS_APP.podeFechar)
      }
    })
  },
  autoteste: process.argv.includes('--autoteste')
}

contextBridge.exposeInMainWorld('mp', api)
