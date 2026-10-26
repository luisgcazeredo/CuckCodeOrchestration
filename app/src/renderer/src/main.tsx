import { createRoot } from 'react-dom/client'
import '@xterm/xterm/css/xterm.css'
import './estilos.css'
import { App } from './App'

// Sem StrictMode: ele monta cada componente duas vezes no desenvolvimento, e montar um cartão de terminal
// (na integração) abre um processo de verdade; um agente iniciado duas vezes cria duas sessões.
createRoot(document.getElementById('raiz')!).render(<App />)
