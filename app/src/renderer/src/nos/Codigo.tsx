import { memo, useEffect, useState } from 'react'
import {
  ChevronsDownUp,
  ChevronsUpDown,
  FileCode,
  GitCompare,
  History,
  Pin,
  PinOff,
  RefreshCw
} from 'lucide-react'
import type { MudancaArquivo } from '../../../shared/api'
import { caminhoRelativo, nomeDoArquivo } from '../../../shared/arquivos'
import type { NoCodigo } from '../../../shared/modelo'
import { atualizarNo, planoDe, pastaDoPlano, usarLoja } from '../estado/loja'
import { MolduraNo, type Marca } from '../quadro/MolduraNo'
import { abrirMenu } from '../ui/MenuContexto'

// O cartão que mostra o código. Ele não pergunta nada ao agente: vigia a pasta onde o agente abriu e segue o
// arquivo gravado mais recente. Preso num arquivo, mostra sempre aquele.

interface Carga {
  /** Linhas já classificadas para a tela. */
  linhas: Array<{ texto: string; tipo: 'mais' | 'menos' | 'trecho' | 'igual' }>
  erro: string | null
  aviso: string | null
  truncado: boolean
}

const VAZIO: Carga = { linhas: [], erro: null, aviso: null, truncado: false }

/**
 * Recolher encolhe o cartão de verdade (não só esconde o conteúdo): era o pedido de não espalhar o quadro.
 * A altura de antes fica guardada para ele voltar ao tamanho que tinha.
 */
export function alternarRecolhido(no: NoCodigo): void {
  const mudanca = no.recolhido
    ? { recolhido: false, altura: no.alturaAberta ?? 460 }
    : { recolhido: true, alturaAberta: no.altura, altura: 30 }
  atualizarNo(no.id, mudanca, false)
}

/** Separa o patch do git em linhas com cor. O cabeçalho do arquivo não interessa: o cartão já diz o nome. */
function lerPatch(patch: string): Carga['linhas'] {
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
  const [seguido, definirSeguido] = useState<string | null>(null)
  const [carga, definirCarga] = useState<Carga>(VAZIO)
  const [rodada, definirRodada] = useState(0)

  const alvo = no.caminho ?? seguido
  const preso = !!no.caminho

  // o que a pasta já tem, para o cartão não nascer vazio quando o agente mexeu antes dele abrir
  useEffect(() => {
    if (!pasta) return
    let vivo = true
    void window.mp.codigo.recentes(pasta).then((lista) => {
      if (!vivo) return
      definirRecentes(lista)
      definirSeguido((atual) => atual ?? lista[0]?.caminho ?? null)
    })
    return () => {
      vivo = false
    }
  }, [pasta])

  // vigia a pasta: cada gravação entra na lista e, se o cartão não está preso, passa a ser o arquivo à mostra
  useEffect(() => {
    if (!pasta) return
    return window.mp.codigo.vigiar(pasta, (mudanca) => {
      definirRecentes((lista) => [mudanca, ...lista.filter((m) => m.caminho !== mudanca.caminho)].slice(0, 30))
      definirSeguido(mudanca.caminho)
      definirRodada((r) => r + 1)
    })
  }, [pasta])

  useEffect(() => {
    // recolhido não lê nada: o cartão fica só com o nome e para de custar leitura de disco
    if (no.recolhido || !alvo) return definirCarga(VAZIO)
    let vivo = true
    const guardar = (c: Carga): void => {
      if (vivo) definirCarga(c)
    }
    if (no.modo === 'conteudo') {
      void window.mp.codigo.ler(alvo).then((t) =>
        guardar({
          linhas: t.erro ? [] : t.conteudo.split('\n').map((texto) => ({ texto, tipo: 'igual' as const })),
          erro: t.erro ?? null,
          aviso: null,
          truncado: t.truncado
        })
      )
      return () => {
        vivo = false
      }
    }
    void window.mp.codigo.diff(alvo).then(async (d) => {
      if (d.erro) return guardar({ ...VAZIO, erro: d.erro })
      if (d.patch) return guardar({ linhas: lerPatch(d.patch), erro: null, aviso: null, truncado: false })
      // nada para comparar (pasta sem git, arquivo novo, ou sem mudança): mostra o arquivo e diz por quê
      const t = await window.mp.codigo.ler(alvo)
      guardar({
        linhas: t.erro ? [] : t.conteudo.split('\n').map((texto) => ({ texto, tipo: 'igual' as const })),
        erro: t.erro ?? null,
        aviso: d.semGit
          ? 'pasta sem git: mostrando o arquivo inteiro'
          : d.novo
            ? 'arquivo novo: o git ainda não tem com o que comparar'
            : 'igual ao último commit',
        truncado: t.truncado
      })
    })
    return () => {
      vivo = false
    }
  }, [alvo, no.modo, no.recolhido, rodada])

  const nome = alvo ? nomeDoArquivo(alvo) : 'nenhum arquivo ainda'
  const relativo = alvo ? caminhoRelativo(pasta, alvo) ?? alvo : ''
  const semArrasto = { onPointerDown: (e: React.PointerEvent) => e.stopPropagation() }

  return (
    <MolduraNo no={no} selecionado={selecionado} className={no.recolhido ? 'recolhido' : ''}>
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
            className={`botao-mini ${preso ? 'ativo' : ''}`}
            title={preso ? 'Soltar: voltar a seguir o que o agente mexer' : 'Prender neste arquivo'}
            disabled={!alvo}
            {...semArrasto}
            onClick={() => atualizarNo(no.id, { caminho: preso ? undefined : alvo ?? undefined }, false)}
          >
            {preso ? <PinOff size={12} /> : <Pin size={12} />}
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
          <button
            className="botao-mini"
            title={no.recolhido ? 'Abrir' : 'Recolher (fica só o cabeçalho)'}
            {...semArrasto}
            onClick={() => alternarRecolhido(no)}
          >
            {no.recolhido ? <ChevronsUpDown size={12} /> : <ChevronsDownUp size={12} />}
          </button>
        </header>
        {!no.recolhido && (
          <div className="codigo-corpo rolavel" data-sem-arrasto>
            {carga.erro ? (
              <p className="codigo-aviso">{carga.erro}</p>
            ) : (
              <>
                {carga.aviso && <p className="codigo-aviso">{carga.aviso}</p>}
                <pre className="codigo-linhas">
                  {carga.linhas.map((linha, i) => (
                    <code key={i} className={`codigo-linha ${linha.tipo}`}>
                      {linha.texto || ' '}
                    </code>
                  ))}
                </pre>
                {carga.truncado && <p className="codigo-aviso">arquivo grande: só o começo está à mostra</p>}
              </>
            )}
          </div>
        )}
        {!no.recolhido && (
          <footer className="cartao-ferramenta-rodape" data-arrasta title={alvo ?? ''}>
            <span className="codigo-caminho">{relativo || pasta}</span>
            <span className="codigo-fonte">{preso ? 'preso' : nomeDoTerminal ? `segue ${nomeDoTerminal}` : 'segue a pasta'}</span>
          </footer>
        )}
      </div>
    </MolduraNo>
  )
})
