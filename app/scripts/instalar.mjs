// Instala (ou atualiza) o Maestri Próprio neste PC a partir do instalador gerado em release/.
// Rodar com `npm run instalar` (gera o instalador antes). Os dados em ~/.maestri-proprio não são tocados.
import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const app = join(import.meta.dirname, '..')
const { version } = JSON.parse(readFileSync(join(app, 'package.json'), 'utf8'))
const instalador = join(app, 'release', `MaestriProprio-Instalador-${version}.exe`)
if (!readdirSync(join(app, 'release')).includes(`MaestriProprio-Instalador-${version}.exe`)) {
  console.error(`Instalador não encontrado: ${instalador}`)
  process.exit(1)
}

// com o app aberto a atualização falha; fechar à força perderia o que não foi salvo, então só avisa
const aberto = execFileSync('tasklist', ['/FI', 'IMAGENAME eq MaestriProprio.exe', '/NH'], { encoding: 'utf8' })
if (aberto.includes('MaestriProprio.exe')) {
  console.error('O Maestri Próprio está aberto. Feche o app e rode de novo.')
  process.exit(1)
}

console.log(`Instalando ${instalador} ...`)
const r = spawnSync(instalador, ['/S'], { stdio: 'inherit' })
if (r.status !== 0) {
  console.error(`O instalador terminou com código ${r.status}`)
  process.exit(r.status ?? 1)
}
console.log('Instalado. Abra pelo atalho "Maestri Próprio" na área de trabalho ou no menu Iniciar.')
