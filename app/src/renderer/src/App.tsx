import { CartaoTerminal } from './CartaoTerminal'

// Passo 1 da fase 1: um terminal de verdade na janela. O quadro infinito vem no passo 2.
export function App() {
  return (
    <main className="quadro">
      <CartaoTerminal nome="PowerShell" />
    </main>
  )
}
