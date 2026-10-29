# CuckCodeOrchestration

Um quadro infinito para orquestrar agentes de código. Cada terminal (Claude Code, Codex ou um shell comum) é uma
peça no quadro, ao lado de post-its e desenhos, e os agentes conversam entre si pelas ligações que você desenha.

**Estado:** quadro pronto (espaços, post-its, textos, anexos, árvore de arquivos, navegador, desenhos, ligações,
desfazer, temas claro e escuro), instalável no Windows. Os terminais são de verdade: Claude Code, Codex e PowerShell
rodam dentro do cartão, continuam vivos ao trocar de espaço e retomam a conversa ao reabrir. Dentro de qualquer
terminal do app, o comando `mpro` deixa um agente abrir sessões novas, conversar com quem está ligado a ele e ler a
tela dos outros.

## O comando `mpro`

Roda dentro de um terminal do app (fora dele, recusa). A ligação (corda) entre dois terminais é a permissão.

```text
mpro quem                         quem é você e quem está ligado a você
mpro abrir claude|codex|shell     sessão nova ao lado, já ligada, com --pedido "…" ou --arquivo pedido.md
mpro pedir <nome> "…"             manda um pedido e espera terminar (devolve a tela)
mpro esperar | ver <nome>         espera terminar · lê a tela sem mandar nada
mpro teclas <nome> enter|esc|…    responde menus e perguntas
mpro limpar | fechar <nome>       zera o contexto · fecha uma sessão que você abriu
```

O app grava o manual como skill `maestri-proprio` em `~/.claude/skills` e `~/.codex/skills`.

## Fases

1. Quadro, terminais, post-its, salvar e reabrir
2. Ligações entre agentes e linha de comando própria (`mpro`: quem, abrir, pedir, ver, notas)
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
