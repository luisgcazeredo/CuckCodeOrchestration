import type { ApiOrkester } from '../../shared/api'
import type * as loja from './estado/loja'

declare global {
  interface Window {
    ork: ApiOrkester
    /** Só existe no autoteste: acesso às ações do quadro. */
    __teste?: { loja: typeof loja }
  }
}

export {}
