import type { ApiMaestri } from '../../shared/api'

declare global {
  interface Window {
    mp: ApiMaestri
    /** Só existe no autoteste: o texto visível do terminal. */
    __textoDoTerminal?: () => string
  }
}

export {}
