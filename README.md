# CuckCodeOrchestration

Um quadro infinito para orquestrar agentes de código. Cada terminal (Claude Code, Codex ou um shell comum) é uma
peça no quadro, ao lado de post-its e desenhos, e os agentes conversam entre si pelas ligações que você desenha.

**Estado:** quadro pronto (espaços, terminais como peças, post-its, textos, anexos, árvore de arquivos, navegador,
desenhos, ligações, desfazer, temas claro e escuro), instalável no Windows. Próximo: ligar os terminais aos processos.

## Fases

1. Quadro, terminais, post-its, salvar e reabrir
2. Ligações entre agentes e linha de comando própria (`list`, `ask`, `check`, notas)
3. Andares isolados com git worktree
4. Gerente de time: funções, recrutar agentes, grupos, times salvos
5. Navegador embutido, rotinas, desenhos, árvore de arquivos, medidor de uso

## Stack

Electron · React · TypeScript · xterm.js · node-pty — Windows 11 x64 primeiro.

## Rodar

Precisa de Node 24.

```powershell
cd app
npm install
npm run dev        # abre o app com recarga automática (para desenvolver)
npm run autoteste  # monta um quadro de teste, usa o mouse e o teclado, confere tudo e fecha (0 = passou)
npm run instalar   # gera o instalador e instala/atualiza o app neste PC (feche o app antes)
```

Instalado, o app abre pelo atalho **Maestri Próprio** (área de trabalho e menu Iniciar). Os dados ficam em
`%USERPROFILE%\.maestri-proprio` (JSON + post-its em `.md`) e não são apagados ao desinstalar.
