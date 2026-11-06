/**
 * Medição de memória com muitos terminais abertos (`npm run medir`).
 *
 * Existe porque o teto `MAX_TERMINAIS` e o tamanho do histórico foram escolhidos no chute, e um relatório
 * de 30/10/2026 estimou "3 a 5 GB" sem medir nada. Aqui se mede de verdade, e o que manda é o número.
 *
 * O que entra na conta, por rodada:
 * - os processos do Electron (principal, GPU, utilitários), pelo `app.getAppMetrics()`;
 * - a **árvore** de cada shell aberto — o PowerShell, o ConPTY e o que eles abrirem —, pelo Win32_Process.
 *
 * O que **não** entra: o custo do cartão na tela (um xterm por cartão visível), porque a medição roda sem
 * janela nenhuma. É de propósito: este número é o piso que o app paga por terminal **aberto**, esteja o
 * cartão à vista ou não, e é esse piso que decide o teto.
 */
import { app } from 'electron'
import { execFileSync } from 'node:child_process'

import { abrirTerminaisDeMedicao, encerrarTodos, todasAsSessoes } from './terminais'

const QUANTIDADES = [8, 20, 50]
/** Linhas despejadas em cada terminal, para o histórico encher de verdade (o espelho guarda 5000). */
const LINHAS_DE_LIXO = 6000
const MB = 1024 * 1024

const esperar = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

/** Soma a memória (working set) de uma árvore de processos do Windows, a partir das raízes. */
function memoriaDaArvore(raizes: number[]): { processos: number; bytes: number } {
  if (raizes.length === 0) return { processos: 0, bytes: 0 }
  const script = `
    $todos = Get-CimInstance Win32_Process | Select-Object ProcessId, ParentProcessId, WorkingSetSize
    $porPai = @{}
    foreach ($p in $todos) {
      if (-not $porPai.ContainsKey($p.ParentProcessId)) { $porPai[$p.ParentProcessId] = @() }
      $porPai[$p.ParentProcessId] += $p
    }
    $porId = @{}
    foreach ($p in $todos) { $porId[[int]$p.ProcessId] = $p }
    $fila = New-Object System.Collections.Generic.Queue[int]
    foreach ($r in @(${raizes.join(',')})) { $fila.Enqueue($r) }
    $vistos = @{}
    $bytes = [int64]0
    $quantos = 0
    while ($fila.Count -gt 0) {
      $id = $fila.Dequeue()
      if ($vistos.ContainsKey($id)) { continue }
      $vistos[$id] = $true
      $p = $porId[[int]$id]
      if ($null -ne $p) { $bytes += [int64]$p.WorkingSetSize; $quantos++ }
      if ($porPai.ContainsKey([uint32]$id)) { foreach ($f in $porPai[[uint32]$id]) { $fila.Enqueue([int]$f.ProcessId) } }
    }
    ConvertTo-Json @{ processos = $quantos; bytes = $bytes }
  `
  try {
    const saida = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024
    })
    const lido = JSON.parse(saida) as { processos: number; bytes: number }
    return { processos: lido.processos ?? 0, bytes: lido.bytes ?? 0 }
  } catch (erro) {
    console.log('não consegui ler a árvore de processos:', (erro as Error).message)
    return { processos: 0, bytes: 0 }
  }
}

/** Memória dos processos do próprio Electron. */
function memoriaDoApp(): number {
  return app.getAppMetrics().reduce((total, p) => total + (p.memory?.workingSetSize ?? 0) * 1024, 0)
}

interface Linha {
  terminais: number
  appMb: number
  shellsMb: number
  processosDeShell: number
  totalMb: number
  porTerminalMb: number
}

async function umaRodada(quantos: number, baseDoApp: number): Promise<Linha> {
  const pids = abrirTerminaisDeMedicao(quantos)
  await esperar(4000) // os shells sobem e imprimem o prompt

  // enche o histórico de cada um: é o pior caso que o espelho precisa aguentar
  for (const s of todasAsSessoes()) {
    s.processo?.write(`1..${LINHAS_DE_LIXO} | ForEach-Object { "linha $_ " + ("x" * 60) }\r`)
  }
  await esperar(Math.max(8000, quantos * 400))

  const shells = memoriaDaArvore(pids)
  const doApp = memoriaDoApp()
  const total = doApp + shells.bytes
  const linha: Linha = {
    terminais: quantos,
    appMb: Math.round(doApp / MB),
    shellsMb: Math.round(shells.bytes / MB),
    processosDeShell: shells.processos,
    totalMb: Math.round(total / MB),
    porTerminalMb: Math.round(((total - baseDoApp) / quantos / MB) * 10) / 10
  }
  encerrarTodos()
  await esperar(3000)
  return linha
}

export async function rodarMedicao(): Promise<void> {
  console.log('MEDIÇÃO de memória — terminais de shell, sem janela')
  await esperar(1500)
  const baseDoApp = memoriaDoApp()
  console.log(`base (app sem terminal nenhum): ${Math.round(baseDoApp / MB)} MB`)

  const linhas: Linha[] = []
  for (const quantos of QUANTIDADES) {
    const linha = await umaRodada(quantos, baseDoApp)
    linhas.push(linha)
    console.log(
      `MEDIÇÃO ${String(linha.terminais).padStart(2)} terminais · app ${String(linha.appMb).padStart(4)} MB · ` +
        `shells ${String(linha.shellsMb).padStart(5)} MB em ${linha.processosDeShell} processos · ` +
        `total ${String(linha.totalMb).padStart(5)} MB · ${linha.porTerminalMb} MB por terminal`
    )
  }

  const pior = linhas[linhas.length - 1]
  console.log('')
  console.log('| terminais | app | shells | total | por terminal |')
  console.log('|---|---|---|---|---|')
  for (const l of linhas) {
    console.log(`| ${l.terminais} | ${l.appMb} MB | ${l.shellsMb} MB (${l.processosDeShell} proc.) | ${l.totalMb} MB | ${l.porTerminalMb} MB |`)
  }
  console.log('')
  console.log(`custo marginal medido: ~${pior.porTerminalMb} MB por terminal aberto, com o histórico cheio`)
  app.quit()
}
