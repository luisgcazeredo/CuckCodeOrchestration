import { memo, useEffect, useState } from 'react'
import { ChevronsDownUp, ChevronsUpDown, FileCode, GitCompare, History, RefreshCw } from 'lucide-react'
import type { MudancaArquivo } from '../../../shared/api'
import { caminhoRelativo, nomeDoArquivo } from '../../../shared/arquivos'
import { escaparHtml } from '../../../shared/realce'
import type { NoCodigo } from '../../../shared/modelo'
import { realcarLinhas } from '../arquivos/realce'
import { alternarRecolhidoDoCodigo, atualizarNo, pastaDoPlano, planoDe, usarLoja } from '../estado/loja'
import { MolduraNo, type Marca } from '../quadro/MolduraNo'
import { abrirMenu } from '../ui/MenuContexto'

// O cartão que mostra o código. Ele não pergunta nada ao agente: ou está preso num arquivo (é assim que os
// cartões automáticos nascem, um por arquivo), ou segue o arquivo mexido por último na pasta do agente.

type Tipo = 'mais' | 'menos' | 'trecho' | 'igual'

interface Carga {
  /** Já com o realce: cada linha é HTML de uma linha só (ver shared/realce.ts). */
  linhas: Array<{ html: string; tipo: Tipo }>
  erro: string | null
  aviso: string | null
  truncado: boolean
  /** É um diff de verdade (e não o arquivo inteiro): muda o que a canaleta da esquerda mostra. */
  patch: boolean
}

const VAZIO: Carga = { linhas: [], erro: null, aviso: null, truncado: false, patch: false }

/** O que aparece na canaleta da esquerda no modo diff. */
const SINAL: Record<Tipo, string> = { mais: '+', menos: '−', trecho: '', igual: '' }

/**
 * Recolher encolhe o cartão de verdade (não só esconde o conteúdo): era o pedido de não espalhar o quadro.
 * Quem faz é a loja, porque ela também arruma a coluna em volta.
 */
export function alternarRecolhido(no: NoCodigo): void {
  alternarRecolhidoDoCodigo(no.id)
}

/** Separa o patch do git em linhas com tipo. O cabeçalho do arquivo não interessa: o cartão já diz o nome. */
function lerPatch(patch: string): Array<{ texto: string; tipo: Tipo }> {
  return patch
    .split('\n')
    .filter((l) => !/^(diff --git|index |--- |\+\+\+ |new file|deleted file|similarity|rename |old mode|new mode)/.test(l))
    .map((texto) => {
      if (texto.startsWith('@@')) return { texto, tipo: 'trecho' as const }
      if (texto.startsWith('+')) return { texto: texto.slice(1), tipo: 'mais' as const }
      if (texto.startsWith('-')) return { texto: texto.slice(1), tipo: 'menos' as const }
      return { texto: texto.replace(/^ /, ''), tipo: 'igual' as const }
    })
}

function realcarTudo(texto: string, caminho: string): Carga['linhas'] {
  return realcarLinhas(texto, caminho).map((html) => ({ html, tipo: 'igual' as const }))
}

/**
 * Realce no diff: o texto vai inteiro ao realçador (de uma vez, para comentário e texto com crase não
 * perderem a cor na virada de linha) e o cabeçalho `@@` entra em branco, que não é código e confundiria o
 * tokenizador. Linha removida e a que a substituiu convivem no mesmo texto — às vezes isso desalinha uma
 * cor, e é um preço pequeno para ver o diff colorido.
 */
function realcarDiff(linhas: Array<{ texto: string; tipo: Tipo }>, caminho: string): Carga['linhas'] {
  const html = realcarLinhas(linhas.map((l) => (l.tipo === 'trecho' ? '' : l.texto)).join('\n'), caminho)
  return linhas.map((l, i) => ({
    tipo: l.tipo,
    html: l.tipo === 'trecho' ? escaparHtml(l.texto) : html[i] ?? escaparHtml(l.texto)
  }))
}

export const Codigo = memo(function Codigo({ no, selecionado }: { no: NoCodigo; selecionado: Marca }) {
  const pasta = usarLoja((e) => {
    if (!e.espaco) return ''
    const alvo = no.terminal ? planoDe(e.espaco).nos.find((n) => n.id === no.terminal) : undefined
    return (alvo?.tipo === 'terminal' ? alvo.pasta : undefined) || pastaDoPlano(e.espaco)
  })
  const nomeDoTerminal = usarLoja((e) => {
    if (!e.espaco || !no.terminal) return null
    const alvo = planoDe(e.espaco).nos.find((n) => n.id === no.terminal)
    return alvo?.tipo === 'terminal' ? alvo.nome : null
  })
  const [recentes, definirRecentes] = useState<MudancaArquivo[]>([])
  const [carga, definirCarga] = useState<Carga>(VAZIO)
  const [rodada, definirRodada] = useState(0)

  const alvo = no.caminho ?? null

  // a lista do botão de histórico: os arquivos que a pasta já tem
  useEffect(() => {
    if (!pasta) return
    let vivo = true
    void window.mp.codigo.recentes(pasta).then((lista) => vivo && definirRecentes(lista))
    return () => {
      vivo = false
    }
  }, [pasta])

  // vigia a pasta só para reler quando o arquivo deste cartão muda (quem abre cartão novo é a loja)
  useEffect(() => {
    if (!pasta) return
    return window.mp.codigo.vigiar(pasta, (mudanca) => {
      definirRecentes((lista) => {
        const outros = lista.filter((m) => m.caminho !== mudanca.caminho)
        return mudanca.sumiu ? outros : [mudanca, ...outros].slice(0, 30)
      })
      if (mudanca.caminho === no.caminho) definirRodada((r) => r + 1)
    })
  }, [pasta, no.caminho])

  useEffect(() => {
    // recolhido não lê nada: o bloquinho fica só com o nome e para de custar leitura de disco
    if (no.recolhido || !alvo) return definirCarga(VAZIO)
    let vivo = true
    const guardar = (c: Carga): void => {
      if (vivo) definirCarga(c)
    }
    const mostrarArquivo = async (aviso: string | null): Promise<void> => {
      const t = await window.mp.codigo.ler(alvo)
      guardar({
        linhas: t.erro ? [] : realcarTudo(t.conteudo, alvo),
        erro: t.erro ?? null,
        aviso,
        truncado: t.truncado,
        patch: false
      })
    }
    if (no.modo === 'conteudo') {
      void mostrarArquivo(null)
      return () => {
        vivo = false
      }
    }
    void window.mp.codigo.diff(alvo).then(async (d) => {
      if (d.erro) return guardar({ ...VAZIO, erro: d.erro })
      if (d.patch) {
        return guardar({ linhas: realcarDiff(lerPatch(d.patch), alvo), erro: null, aviso: null, truncado: false, patch: true })
      }
      // nada para comparar (pasta sem git, arquivo novo, ou sem mudança): mostra o arquivo e diz por quê
      await mostrarArquivo(
        d.semGit
          ? 'pasta sem git: mostrando o arquivo inteiro'
          : d.novo
            ? 'arquivo novo: o git ainda não tem com o que comparar'
            : 'igual ao último commit'
      )
    })
    return () => {
      vivo = false
    }
  }, [alvo, no.modo, no.recolhido, rodada])

  const nome = alvo ? nomeDoArquivo(alvo) : 'esperando o agente gravar'
  const relativo = alvo ? caminhoRelativo(pasta, alvo) ?? alvo : ''
  const semArrasto = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() }

  // recolhido é um bloquinho com o nome do arquivo e um só botão: abrir
  if (no.recolhido) {
    return (
      <MolduraNo no={no} selecionado={selecionado} className="recolhido" aoClicarDuasVezes={() => alternarRecolhido(no)}>
        <div className="cartao-ferramenta">
          <header className="cartao-ferramenta-cabecalho" data-arrasta title={alvo ?? pasta}>
            <FileCode size={13} />
            <span className="cartao-ferramenta-titulo">{nome}</span>
            <button className="botao-mini" title="Abrir" {...semArrasto} onClick={() => alternarRecolhido(no)}>
              <ChevronsUpDown size={12} />
            </button>
          </header>
        </div>
      </MolduraNo>
    )
  }

  return (
    <MolduraNo no={no} selecionado={selecionado}>
      <div className="cartao-ferramenta">
        <header className="cartao-ferramenta-cabecalho" data-arrasta>
          <FileCode size={13} />
          <span className="cartao-ferramenta-titulo" title={alvo ?? pasta}>
            {nome}
          </span>
          <button
            className="botao-mini"
            title="Arquivos mexidos por último nesta pasta"
            disabled={!recentes.length}
            {...semArrasto}
            onClick={(e) => {
              const caixa = e.currentTarget.getBoundingClientRect()
              abrirMenu(
                caixa.left,
                caixa.bottom,
                recentes.slice(0, 12).map((m) => ({
                  rotulo: caminhoRelativo(pasta, m.caminho) ?? nomeDoArquivo(m.caminho),
                  marcado: m.caminho === alvo,
                  acao: () => atualizarNo(no.id, { caminho: m.caminho }, false)
                }))
              )
            }}
          >
            <History size={12} />
          </button>
          <button
            className="botao-mini"
            title={no.modo === 'diff' ? 'Mostrando o que mudou — ver o arquivo inteiro' : 'Mostrando o arquivo — ver o que mudou'}
            {...semArrasto}
            onClick={() => atualizarNo(no.id, { modo: no.modo === 'diff' ? 'conteudo' : 'diff' }, false)}
          >
            {no.modo === 'diff' ? <GitCompare size={12} /> : <FileCode size={12} />}
          </button>
          <button className="botao-mini" title="Reler agora" {...semArrasto} onClick={() => definirRodada((r) => r + 1)}>
            <RefreshCw size={12} />
          </button>
          <button className="botao-mini" title="Recolher (fica só o nome)" {...semArrasto} onClick={() => alternarRecolhido(no)}>
            <ChevronsDownUp size={12} />
          </button>
        </header>
        <div className="codigo-corpo rolavel" data-sem-arrasto>
          {carga.erro ? (
            <p className="codigo-aviso">{carga.erro}</p>
          ) : (
            <>
              {carga.aviso && <p className="codigo-aviso">{carga.aviso}</p>}
              <pre className="codigo-linhas">
                {carga.linhas.map((linha, i) => (
                  <div key={i} className={`codigo-linha ${linha.tipo}`}>
                    {/* no arquivo inteiro, a canaleta é o número da linha; no diff, o sinal do que mudou */}
                    <span className="codigo-numero">{carga.patch ? SINAL[linha.tipo] : i + 1}</span>
                    <code dangerouslySetInnerHTML={{ __html: linha.html }} />
                  </div>
                ))}
              </pre>
              {carga.truncado && <p className="codigo-aviso">arquivo grande: só o começo está à mostra</p>}
            </>
          )}
        </div>
        <footer className="cartao-ferramenta-rodape" data-arrasta title={alvo ?? ''}>
          <span className="codigo-caminho">{relativo || pasta}</span>
          {nomeDoTerminal && <span className="codigo-fonte">{nomeDoTerminal}</span>}
        </footer>
      </div>
    </MolduraNo>
  )
})
