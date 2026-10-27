/** O que o usuário digitou vira endereço: com protocolo, como está; sem, https://; com espaço, busca. */
export function normalizarEndereco(texto: string): string {
  const t = texto.trim()
  if (/^https?:\/\//i.test(t)) return t
  if (/^[\w-]+(\.[\w-]+)+(:\d+)?(\/.*)?$/.test(t) || /^localhost(:\d+)?(\/.*)?$/.test(t)) {
    return `${t.startsWith('localhost') ? 'http' : 'https'}://${t}`
  }
  return `https://www.google.com/search?q=${encodeURIComponent(t)}`
}
