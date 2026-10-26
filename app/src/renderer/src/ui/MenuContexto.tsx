import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Check, ChevronRight, type LucideIcon } from 'lucide-react'

export interface LinhaDeCores {
  valores: Array<{ cor: string | null; nome: string; amostra?: string }>
  atual?: string | null
  escolher: (cor: string | null) => void
}

export interface ItemMenu {
  rotulo?: string
  icone?: LucideIcon
  atalho?: string
  acao?: () => void
  submenu?: ItemMenu[]
  cores?: LinhaDeCores
  perigo?: boolean
  desligado?: boolean
  marcado?: boolean
  separador?: boolean
}

// ---------- estado do menu (um por vez) ----------

let aberto: { x: number; y: number; itens: ItemMenu[] } | null = null
const ouvintes = new Set<() => void>()
const avisar = (): void => ouvintes.forEach((o) => o())

export function abrirMenu(x: number, y: number, itens: ItemMenu[]): void {
  aberto = { x, y, itens }
  avisar()
}

export function fecharMenu(): void {
  if (!aberto) return
  aberto = null
  avisar()
}

export function menuAberto(): boolean {
  return aberto !== null
}

// ---------- desenho ----------

function Lista({ itens, x, y, aoEscolher }: { itens: ItemMenu[]; x: number; y: number; aoEscolher: () => void }) {
  const caixa = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x, y })
  const [submenu, setSubmenu] = useState<{ indice: number; x: number; y: number } | null>(null)

  // nunca sai da janela: encosta na borda ou abre para o outro lado
  useLayoutEffect(() => {
    const r = caixa.current!.getBoundingClientRect()
    setPos({
      x: x + r.width > window.innerWidth - 8 ? Math.max(8, x - r.width) : x,
      y: y + r.height > window.innerHeight - 8 ? Math.max(8, window.innerHeight - r.height - 8) : y
    })
  }, [x, y])

  return (
    <div ref={caixa} className="menu-contexto" style={{ left: pos.x, top: pos.y }} role="menu">
      {itens.map((item, i) => {
        if (item.separador) return <div key={i} className="menu-separador" />
        if (item.cores) {
          const { valores, atual, escolher } = item.cores
          return (
            <div key={i} className="menu-cores">
              {valores.map((v) => (
                <button
                  key={v.nome}
                  className={`menu-amostra ${atual === v.cor || (!atual && v.cor === null) ? 'ativa' : ''} ${v.cor ? '' : 'sem-cor'}`}
                  style={{ background: v.amostra ?? v.cor ?? undefined }}
                  title={v.nome}
                  onClick={() => {
                    escolher(v.cor)
                    aoEscolher()
                  }}
                />
              ))}
            </div>
          )
        }
        const Icone = item.icone
        return (
          <button
            key={i}
            role="menuitem"
            className={`menu-item ${item.perigo ? 'perigo' : ''} ${submenu?.indice === i ? 'aberto' : ''}`}
            disabled={item.desligado}
            onMouseEnter={(e) => {
              if (!item.submenu) return setSubmenu(null)
              const r = e.currentTarget.getBoundingClientRect()
              setSubmenu({ indice: i, x: r.right - 4, y: r.top - 5 })
            }}
            onClick={() => {
              if (item.submenu) return
              item.acao?.()
              aoEscolher()
            }}
          >
            <span className="menu-icone">{item.marcado ? <Check size={14} /> : Icone ? <Icone size={14} /> : null}</span>
            <span className="menu-rotulo">{item.rotulo}</span>
            {item.atalho && <span className="menu-atalho">{item.atalho}</span>}
            {item.submenu && <ChevronRight size={13} className="menu-seta" />}
          </button>
        )
      })}
      {submenu && itens[submenu.indice]?.submenu && (
        <Lista itens={itens[submenu.indice].submenu!} x={submenu.x} y={submenu.y} aoEscolher={aoEscolher} />
      )}
    </div>
  )
}

export function MenuContexto() {
  const atual = useSyncExternalStore(
    (o) => {
      ouvintes.add(o)
      return () => ouvintes.delete(o)
    },
    () => aberto
  )

  useEffect(() => {
    if (!atual) return
    const fora = (e: Event): void => {
      if (!(e.target as HTMLElement).closest?.('.menu-contexto')) fecharMenu()
    }
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') fecharMenu()
    }
    window.addEventListener('pointerdown', fora, true)
    window.addEventListener('wheel', fecharMenu, true)
    window.addEventListener('blur', fecharMenu)
    window.addEventListener('keydown', tecla, true)
    return () => {
      window.removeEventListener('pointerdown', fora, true)
      window.removeEventListener('wheel', fecharMenu, true)
      window.removeEventListener('blur', fecharMenu)
      window.removeEventListener('keydown', tecla, true)
    }
  }, [atual])

  if (!atual) return null
  return <Lista itens={atual.itens} x={atual.x} y={atual.y} aoEscolher={fecharMenu} />
}
