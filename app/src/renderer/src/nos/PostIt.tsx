import { memo, useEffect, useRef, type ReactNode } from 'react'
import type { NoPostIt } from '../../../shared/modelo'
import { definirNota, editar } from '../estado/loja'
import { MolduraNo } from '../quadro/MolduraNo'

export const COR_POSTIT: Record<NoPostIt['cor'], string> = {
  amarelo: '#FFF9C4',
  rosa: '#FFD9E2',
  azul: '#D8EAFF',
  verde: '#DAF5D7',
  roxo: '#E9DDFF'
}

const TAREFA = /^(\s*)- \[( |x|X)\] (.*)$/

/** Markdown do jeito que post-it precisa: título, lista, tarefa marcável e parágrafo. */
function Conteudo({ texto, aoMarcar }: { texto: string; aoMarcar: (linha: number) => void }) {
  if (!texto.trim()) return <p className="postit-vazio">Clique duas vezes para escrever</p>
  const blocos: ReactNode[] = texto.split('\n').map((linha, i) => {
    const tarefa = linha.match(TAREFA)
    if (tarefa) {
      const feita = tarefa[2].toLowerCase() === 'x'
      return (
        <label key={i} className={`postit-tarefa ${feita ? 'feita' : ''}`} onPointerDown={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={feita} onChange={() => aoMarcar(i)} />
          <span>{tarefa[3]}</span>
        </label>
      )
    }
    if (/^#{1,3} /.test(linha)) return <h4 key={i}>{linha.replace(/^#{1,3} /, '')}</h4>
    if (/^\s*- /.test(linha)) return <li key={i}>{linha.replace(/^\s*- /, '')}</li>
    if (!linha.trim()) return <div key={i} className="postit-espaco" />
    return <p key={i}>{linha}</p>
  })
  return <>{blocos}</>
}

interface Props {
  no: NoPostIt
  texto: string
  selecionado: boolean
  editando: boolean
}

export const PostIt = memo(function PostIt({ no, texto, selecionado, editando }: Props) {
  const campo = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editando) {
      campo.current?.focus()
      const fim = campo.current?.value.length ?? 0
      campo.current?.setSelectionRange(fim, fim)
    }
  }, [editando])

  function marcar(linha: number): void {
    const linhas = texto.split('\n')
    linhas[linha] = linhas[linha].replace(/- \[( |x|X)\]/, (m) => (m === '- [ ]' ? '- [x]' : '- [ ]'))
    definirNota(no.arquivo, linhas.join('\n'))
  }

  return (
    <MolduraNo no={no} selecionado={selecionado} aoClicarDuasVezes={() => editar(no.id)}>
      <div className="postit" style={{ background: COR_POSTIT[no.cor] }}>
        {editando ? (
          <textarea
            ref={campo}
            className="postit-campo"
            value={texto}
            spellCheck={false}
            onChange={(e) => definirNota(no.arquivo, e.target.value)}
            onBlur={() => editar(null)}
            onKeyDown={(e) => e.key === 'Escape' && editar(null)}
          />
        ) : (
          <div className="postit-texto" data-arrasta>
            <Conteudo texto={texto} aoMarcar={marcar} />
          </div>
        )}
      </div>
    </MolduraNo>
  )
})
