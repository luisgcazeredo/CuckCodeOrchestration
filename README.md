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
mpro arvore nova|usar|mostrar     as árvores de código do cartão dele, uma por frente de trabalho
mpro quadro                       lê o quadro: cada cartão com número, nome, lugar e tamanho, e as cordas
mpro mover | arrumar              põe cartões num lugar (--x/--y, --dx/--dy) · arruma em grade (--colunas)
mpro nome | ligar | desligar      renomeia um cartão · desenha ou tira a corda entre dois agentes
mpro anotar "…" | juntar          escreve um texto no quadro · agrupa cartões (--soltar desfaz)
mpro banda | banda criar "Nome" …  grupos de agentes: quem está dentro da moldura fala com todos os de dentro
mpro trocar <cartão> <agente>     troca o agente de um cartão que ele abriu (o cartão fica, o agente muda)
mpro partitura                    times salvos: lista, `usar "Nome"` sobe um ao seu lado, `salvar "Nome"` guarda
```

Mexer no quadro **entra no desfazer** do usuário, nunca apaga nada, não toca em cartão travado nem em cartão
de código, e só alcança o andar à mostra — sempre pelo nome do cartão.

Uma **banda** é um grupo de agentes desenhado como moldura: quem está dentro dela fala com todos os outros de
dentro, e a corda desenhada na banda vale para cada um deles. Não há lista de membros — é a moldura que diz
quem é do time, então arrastar um cartão para dentro ou para fora é entrar e sair. **Trocar o agente** de um
cartão (menu do cartão, ou `mpro trocar`) mantém lugar, nome, função, cordas, banda e árvore de código.

Uma **partitura** é um time salvo (agentes com funções e comandos, recados, bandas, cordas e grupos) que sobe inteiro
num espaço novo: no app, pelo menu de terminal ou por "Salvar como partitura…" na seleção. A pasta não é
salva de propósito — cada cartão abre na pasta do espaço (ou na da função), então o mesmo time serve em
qualquer projeto —, e o prompt de cada papel vem da função de hoje, nunca de uma cópia velha.

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

<!-- Linha de teste do visualizador de código (04/11/2026). -->
