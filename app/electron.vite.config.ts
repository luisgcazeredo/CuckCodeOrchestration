import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rolldownOptions: {
        // cli.js: o comando `mpro` que os agentes rodam nos terminais do app (fala com o app pelo pipe)
        input: { index: resolve('src/main/index.ts'), cli: resolve('src/cli/mpro.ts') }
      }
    }
  },
  preload: {},
  renderer: {
    plugins: [react()]
  }
})
