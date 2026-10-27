import { useEffect, useState, useSyncExternalStore } from 'react'
import { GitBranch, Home, Layers, Plus } from 'lucide-react'
import type { Andar, EstadoAndar, No, Plano, SituacaoAndar } from '../../../shared/modelo'
import { abrirVistaAndares, andarAtual, criarAndar, irParaAndar, usarLoja } from '../estado/loja'
import { caixaDoDesenho, uniao, type Caixa } from '../quadro/geometria'
import { abrirNovoAndar, fecharNovoAndar, novoAndar } from './acoesAndar'
import { Dialogo } from './Dialogo'
import { abrirMenu } from './MenuContexto'
import { itensDoAndar } from './menus'
import { avisar } from './Perguntas'

export const COR_ESTADO: Record<EstadoAndar, string> = {
  trabalhando: '#007AFF',
  travado: '#FF9500',
  revisao: '#AF52DE',
  pronto: '#34C759'
}

/** Térreo + andares, de baixo para cima, no formato que a pilha desenha. */
interface Nivel {
  id: string | null
  nome: string
  ramo: string | null
  plano: Plano
  andar: Andar | null
}

function usarNiveis(): Nivel[] {
  const espaco = usarLoja((e) => e.espaco)
  if (!espaco) return []
  return [
    { id: null, nome: 'Térreo', ramo: null, plano: espaco, andar: null },
    ...espaco.andares.map((a) => ({ id: a.id, nome: a.nome, ramo: a.git?.ramo ?? null, plano: a, andar: a }))
  ]
}

// ---------- números do git ao vivo ----------

/** Situação do git do andar (commits à frente, arquivos fora de commit): lida agora e a cada 5 s. */
function usarSituacao(andar: Andar | null): SituacaoAndar | null {
  const espacoId = usarLoja((e) => e.espaco?.id ?? null)
  const andarId = andar?.git ? andar.id : null
  const [situacao, setSituacao] = useState<SituacaoAndar | null>(null)
  useEffect(() => {
    setSituacao(null)
    if (!espacoId || !andarId) return
    let vivo = true
    const ler = (): void => {
      if (document.hidden) return
      window.mp.andares.situacao(espacoId, andarId).then(
        (s) => vivo && setSituacao(s),
        () => vivo && setSituacao(null)
      )
    }
    ler()
    // a primeira leitura pode chegar antes de o andar novo ser salvo: tenta de novo logo
    const logo = setTimeout(ler, 1200)
    const relogio = setInterval(ler, 5000)
    return () => {
      vivo = false
      clearTimeout(logo)
      clearInterval(relogio)
    }
  }, [espacoId, andarId])
  return situacao
}

const plural = (n: number, um: string, varios: string): string => `${n} ${n === 1 ? um : varios}`

/** "3 commits · 2 alterados", ou "em dia" quando não há nada para juntar. */
function NumerosAndar({ andar }: { andar: Andar | null }) {
  const s = usarSituacao(andar)
  if (!s) return null
  const partes = [
    ...(s.commitsAFrente ? [plural(s.commitsAFrente, 'commit', 'commits')] : []),
    ...(s.alterados ? [plural(s.alterados, 'alterado', 'alterados')] : [])
  ]
  return (
    <span
      className="andar-numeros"
      title={`${plural(s.commitsAFrente, 'commit', 'commits')} que "${s.ramoPrincipal}" ainda não tem · ${plural(s.alterados, 'arquivo mudado', 'arquivos mudados')} fora de commit`}
    >
      {partes.length ? partes.join(' · ') : 'em dia'}
    </span>
  )
}

// ---------- miniatura de um plano (o que aparece em cada andar da pilha) ----------

const COR_MINI: Record<No['tipo'], string> = {
  terminal: '#1a1a1e',
  postit: '#fff3a0',
  texto: 'transparent',
  arquivo: '#d8d8dc',
  pasta: '#d8d8dc',
  portal: '#ffffff'
}

function Miniatura({ plano, largura, altura }: { plano: Plano; largura: number; altura: number }) {
  const caixas: Caixa[] = [
    ...plano.nos.map((n) => ({ x: n.x, y: n.y, largura: n.largura, altura: n.altura })),
    ...plano.desenhos.map(caixaDoDesenho)
  ]
  const tudo = uniao(caixas)
  if (!tudo) return <div className="mini-vazio">vazio</div>
  const folga = 18
  const escala = Math.min((largura - folga * 2) / Math.max(tudo.largura, 1), (altura - folga * 2) / Math.max(tudo.altura, 1), 0.6)
  const ox = (largura - tudo.largura * escala) / 2 - tudo.x * escala
  const oy = (altura - tudo.altura * escala) / 2 - tudo.y * escala
  return (
    <svg width={largura} height={altura} className="miniatura">
      {plano.nos.map((n) => (
        <g key={n.id} transform={`translate(${n.x * escala + ox} ${n.y * escala + oy})`}>
          <rect
            width={n.largura * escala}
            height={n.altura * escala}
            rx={4}
            fill={COR_MINI[n.tipo]}
            stroke={n.cor && n.tipo !== 'postit' && n.tipo !== 'texto' ? n.cor : 'rgba(128,128,128,0.45)'}
            strokeWidth={1}
          />
          {(n.tipo === 'terminal' || n.tipo === 'pasta' || n.tipo === 'portal') && (
            <rect width={n.largura * escala} height={Math.max(3, 24 * escala)} rx={3} fill={n.cor ?? '#3a3a3e'} opacity={0.9} />
          )}
          {n.tipo === 'texto' && (
            <rect y={(n.altura * escala) / 3} width={n.largura * escala} height={Math.max(2, (n.altura * escala) / 3)} rx={1} fill={n.cor ?? '#9a9aa0'} />
          )}
        </g>
      ))}
      {plano.desenhos.map((d) => (
        <polyline
          key={d.id}
          points={d.pontos.map(([x, y]) => `${x * escala + ox},${y * escala + oy}`).join(' ')}
          fill="none"
          stroke={d.cor}
          strokeWidth={1.5}
        />
      ))}
    </svg>
  )
}

// ---------- vista em perspectiva ----------

export function VistaAndares() {
  const aberta = usarLoja((e) => e.vistaAndares)
  const ativo = usarLoja((e) => e.espaco?.andarAtivo ?? null)
  const niveis = usarNiveis()
  const [montada, setMontada] = useState(false)
  const [destaque, setDestaque] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    if (!aberta) return setMontada(false)
    const quadro = requestAnimationFrame(() => setMontada(true))
    return () => cancelAnimationFrame(quadro)
  }, [aberta])

  useEffect(() => {
    const acender = (e: Event): void => setDestaque((e as CustomEvent<string | null | undefined>).detail)
    window.addEventListener('mp:destacar-andar', acender)
    return () => window.removeEventListener('mp:destacar-andar', acender)
  }, [])

  if (!aberta) return null
  const LARGURA = 700
  const ALTURA = 400
  // planos bem separados com poucos andares; com muitos, aproxima para caber na tela
  const passo = Math.max(80, Math.min(200, 600 / Math.max(niveis.length, 1)))
  return (
    <div className={`vista-andares ${montada ? 'montada' : ''}`} onPointerDown={() => abrirVistaAndares(false)}>
      <div className="pilha-3d">
        {niveis.map((nivel, i) => {
          const deslocamento = ((niveis.length - 1) / 2 - i) * passo
          const marcado = nivel.id === ativo
          const aceso = destaque !== undefined && destaque === nivel.id
          return (
            <div
              key={nivel.id ?? 'terreo'}
              className={`plano-3d ${marcado ? 'ativo' : ''} ${aceso ? 'aceso' : ''}`}
              style={{
                width: LARGURA,
                height: ALTURA,
                transform: `translate(-50%, -50%) translateY(${montada ? deslocamento : 0}px) rotateX(48deg) ${aceso ? 'translateZ(24px)' : ''}`,
                transitionDelay: `${i * 40}ms`
              }}
              onPointerDown={(e) => {
                e.stopPropagation()
                irParaAndar(nivel.id)
                abrirVistaAndares(false)
              }}
              onPointerEnter={() => setDestaque(nivel.id)}
              onPointerLeave={() => setDestaque(undefined)}
            >
              <Miniatura plano={nivel.plano} largura={LARGURA} altura={ALTURA} />
              <div className="plano-rotulo">
                {nivel.id === null ? <Home size={13} /> : <Layers size={13} />}
                {nivel.nome}
                {nivel.ramo && (
                  <span className="plano-ramo">
                    <GitBranch size={11} /> {nivel.ramo}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ---------- botão e pilha de pílulas (canto inferior) ----------

export function BotaoAndares() {
  const aberta = usarLoja((e) => e.vistaAndares)
  const ativo = usarLoja((e) => e.espaco?.andarAtivo ?? null)
  const niveis = usarNiveis()
  const destacar = (id: string | null | undefined): void => {
    window.dispatchEvent(new CustomEvent('mp:destacar-andar', { detail: id }))
  }

  return (
    <div className="andares-canto">
      {aberta && (
        <div className="pilha-pilulas" onPointerLeave={() => destacar(undefined)}>
          <button className="pilula-andar novo" onClick={() => (abrirVistaAndares(false), abrirNovoAndar())}>
            <Plus size={13} /> Novo andar
          </button>
          {[...niveis].reverse().map((nivel) => (
            <button
              key={nivel.id ?? 'terreo'}
              className={`pilula-andar ${nivel.id === ativo ? 'ativa' : ''}`}
              onPointerEnter={() => destacar(nivel.id)}
              onClick={() => {
                irParaAndar(nivel.id)
                abrirVistaAndares(false)
              }}
              onContextMenu={(e) => {
                e.preventDefault()
                if (nivel.andar) abrirMenu(e.clientX, e.clientY, itensDoAndar(nivel.andar))
              }}
            >
              <span className="pilula-andar-nome">
                {nivel.id === null && <Home size={12} />}
                {nivel.andar?.status && (
                  <span className="ponto-estado" style={{ background: COR_ESTADO[nivel.andar.status.estado] }} />
                )}
                {nivel.nome}
              </span>
              {nivel.ramo && (
                <span className="pilula-andar-ramo">
                  <GitBranch size={10} /> {nivel.ramo}
                </span>
              )}
              <NumerosAndar andar={nivel.andar} />
            </button>
          ))}
        </div>
      )}
      <button
        className={`pilula botao-andares ${aberta ? 'ativo' : ''}`}
        title="Andares: níveis do quadro, cada um com seu ramo do git"
        onClick={() => abrirVistaAndares(!aberta)}
      >
        <Layers size={15} />
        Andares
        {niveis.length > 1 && <span className="contagem">{niveis.length - 1}</span>}
      </button>
    </div>
  )
}

/** Mostra em que andar se está, quando não é o térreo. */
export function IndicadorAndar() {
  usarLoja((e) => e.espaco)
  const andar = andarAtual()
  if (!andar) return null
  return (
    <button
      className="pilula indicador-andar"
      title="Voltar ao térreo"
      onClick={() => irParaAndar(null)}
      onContextMenu={(e) => {
        e.preventDefault()
        abrirMenu(e.clientX, e.clientY, itensDoAndar(andar))
      }}
    >
      <Layers size={13} />
      {andar.nome}
      {andar.git && (
        <span className="plano-ramo">
          <GitBranch size={11} /> {andar.git.ramo}
        </span>
      )}
      <NumerosAndar andar={andar} />
      {andar.status && <span className="ponto-estado" style={{ background: COR_ESTADO[andar.status.estado] }} />}
    </button>
  )
}

// ---------- novo andar ----------

export function DialogoNovoAndar() {
  const aberto = useSyncExternalStore(novoAndar.inscrever, novoAndar.aberto)
  const espacoId = usarLoja((e) => e.espaco?.id)
  const [nome, setNome] = useState('')
  const [git, setGit] = useState<{ repositorio: boolean; ramo: string | null } | null>(null)
  const [usarGit, setUsarGit] = useState(true)
  const [criando, setCriando] = useState(false)

  useEffect(() => {
    if (!aberto || !espacoId) return
    setNome('')
    setGit(null)
    setCriando(false)
    void window.mp.andares.situacaoGit(espacoId).then((g) => {
      setGit(g)
      setUsarGit(g.repositorio)
    })
  }, [aberto, espacoId])

  if (!aberto) return null
  const slug =
    nome
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'novo'

  async function criar(): Promise<void> {
    if (!nome.trim() || criando) return
    setCriando(true)
    try {
      await criarAndar(nome, usarGit && !!git?.repositorio)
      fecharNovoAndar()
    } catch (erro) {
      fecharNovoAndar()
      await avisar('Não deu para criar o andar', String(erro).replace(/^Error: /, ''))
    }
  }

  return (
    <Dialogo titulo="Novo andar" aoFechar={fecharNovoAndar}>
      <label className="campo">
        <span>Nome (o que vai ser feito neste andar)</span>
        <input autoFocus value={nome} placeholder="Ex.: arrumar o login" onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && criar()} />
      </label>
      {git === null ? (
        <p className="dialogo-texto suave">Conferindo o git da pasta…</p>
      ) : git.repositorio ? (
        <label className="dialogo-opcao">
          <input type="checkbox" checked={usarGit} onChange={(e) => setUsarGit(e.target.checked)} />
          <span>
            Ramo isolado com git: cria <b>andar/{slug}</b> a partir de <b>{git.ramo}</b>, numa pasta à parte. O projeto
            principal não é tocado até você juntar.
          </span>
        </label>
      ) : (
        <p className="dialogo-texto suave">
          A pasta deste espaço não é um repositório git: o andar vai ser só um quadro novo, na mesma pasta.
        </p>
      )}
      <div className="dialogo-acoes">
        <button onClick={fecharNovoAndar}>Cancelar</button>
        <button className="primario" disabled={!nome.trim() || criando || git === null} onClick={criar}>
          {criando ? 'Criando…' : 'Criar andar'}
        </button>
      </div>
    </Dialogo>
  )
}

export { abrirNovoAndar }
