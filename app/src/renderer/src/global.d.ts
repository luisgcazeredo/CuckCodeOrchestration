import type { ApiMaestri } from '../../shared/api'
import type * as loja from './estado/loja'

declare global {
  interface Window {
    mp: ApiMaestri
    /** Só existe no autoteste: acesso às ações do quadro. */
    __teste?: { loja: typeof loja }
  }
}

export {}
