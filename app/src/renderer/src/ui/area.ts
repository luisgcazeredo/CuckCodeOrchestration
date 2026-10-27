import type { No } from '../../../shared/modelo'
import { adicionarNo, apagarSelecao, colarFragmento, fragmentoDaSelecao, lerEstado, planoAtual, type Fragmento } from '../estado/loja'
import { caixaDoDesenho, caixaDoNo, pontoParaColar, uniao, type Ponto } from '../quadro/geometria'
import { avisar } from './Perguntas'

// Ctrl+C, Ctrl+X e Ctrl+V no quadro. Cartões vão e voltam pela área de transferência do sistema, então
// funcionam entre espaços, andares e janelas; um print colado vira cartão de imagem; texto vira cartão.

/** O que aparece quando os cartões são colados fora do app (num e-mail, no bloco de notas). */
function textoSimples(f: Fragmento): string {
  const linha = (n: No): string => {
    switch (n.tipo) {
      case 'terminal':
        return n.nome
      case 'postit':
        return f.notas[n.arquivo] ?? ''
      case 'texto':
        return n.texto
      case 'arquivo':
      case 'pasta':
        return n.caminho
      case 'portal':
        return n.url
      case 'imagem':
        return ''
    }
  }
  return [...f.nos]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(linha)
    .filter((t) => t.trim())
    .join('\n\n')
}

export async function copiarSelecao(recortar = false): Promise<void> {
  const f = fragmentoDaSelecao()
  const espaco = lerEstado().espaco
  if (!f || !espaco) return
  try {
    await window.mp.area.copiar(JSON.stringify(f), espaco.id, textoSimples(f))
  } catch (erro) {
    return avisar('Não deu para copiar', String(erro).replace(/^Error: /, ''))
  }
  if (recortar) apagarSelecao()
}

/** Cola o que estiver na área de transferência em `onde` (ou embaixo do mouse). */
export async function colar(onde?: Ponto): Promise<void> {
  const espaco = lerEstado().espaco
  if (!espaco) return
  const ponto = onde ?? pontoParaColar(planoAtual()!.camera)
  let conteudo
  try {
    conteudo = await window.mp.area.colar(espaco.id)
  } catch (erro) {
    return avisar('Não deu para colar', String(erro).replace(/^Error: /, ''))
  }
  // a janela pode ter trocado de espaço enquanto lia (o print já foi gravado no espaço de antes)
  if (lerEstado().espaco?.id !== espaco.id) return
  switch (conteudo.tipo) {
    case 'fragmento': {
      const f = JSON.parse(conteudo.json) as Fragmento
      // cada imagem vem da cópia guardada ao copiar e vira um arquivo novo deste espaço
      const semArquivo = new Set<string>()
      for (const n of f.nos) {
        if (n.tipo !== 'imagem') continue
        const novo = await window.mp.area.trazerImagem(n.arquivo, espaco.id)
        if (novo) n.arquivo = novo
        else semArquivo.add(n.id)
      }
      // a cópia guardada sumiu: o cartão dela não vem (chegaria quebrado)
      f.nos = f.nos.filter((n) => !semArquivo.has(n.id))
      if (lerEstado().espaco?.id !== espaco.id) return
      const caixa = uniao([...f.nos.map(caixaDoNo), ...f.desenhos.map(caixaDoDesenho)])
      if (!caixa) return
      colarFragmento(f, Math.round(ponto.x - (caixa.x + caixa.largura / 2)), Math.round(ponto.y - (caixa.y + caixa.altura / 2)))
      return
    }
    case 'imagem':
      adicionarNo({ tipo: 'imagem', arquivo: conteudo.arquivo, largura: conteudo.largura, altura: conteudo.altura }, ponto.x, ponto.y)
      return
    case 'texto': {
      const texto = conteudo.texto.trim()
      // uma linha curta vira texto solto; o resto vira post-it (que guarda markdown)
      const curto = !texto.includes('\n') && texto.length <= 60
      adicionarNo(curto ? { tipo: 'texto', texto } : { tipo: 'postit', texto }, ponto.x, ponto.y)
      return
    }
  }
}
