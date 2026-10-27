import { memo } from 'react'
import { File, FileArchive, FileImage, FileSpreadsheet, FileText, type LucideIcon } from 'lucide-react'
import type { NoArquivo } from '../../../shared/modelo'
import { MolduraNo, type Marca } from '../quadro/MolduraNo'

function iconeDe(nome: string): LucideIcon {
  const ext = nome.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return FileImage
  if (['xlsx', 'xls', 'csv'].includes(ext)) return FileSpreadsheet
  if (['zip', 'rar', '7z'].includes(ext)) return FileArchive
  if (['pdf', 'md', 'txt', 'doc', 'docx'].includes(ext)) return FileText
  return File
}

export const Arquivo = memo(function Arquivo({ no, selecionado }: { no: NoArquivo; selecionado: Marca }) {
  const Icone = iconeDe(no.nomeExibido)
  return (
    <MolduraNo no={no} selecionado={selecionado} aoClicarDuasVezes={() => void window.mp.dados.abrirArquivo(no.caminho)}>
      <div className="arquivo" data-arrasta title={`${no.caminho}\nClique duas vezes para abrir`}>
        <Icone size={40} strokeWidth={1.4} />
        <span className="arquivo-nome">{no.nomeExibido}</span>
      </div>
    </MolduraNo>
  )
})
