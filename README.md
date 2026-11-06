<img src="identidade/orkester-assinatura.png" alt="Orkester" height="96">

> **Nome novo em 06/11/2026.** O projeto se chamava *Maestri Próprio* (repositório `CuckCodeOrchestration`) e o
> comando dos agentes era `mpro`. Agora é **Orkester**, o comando é **`ork`**, a skill é `orkester` e os dados
> ficam em `~/.orkester` — o app move a pasta antiga sozinho na primeira abertura.

Um quadro infinito para orquestrar agentes de código. Cada terminal (Claude Code, Codex ou um shell comum) é uma
peça no quadro, ao lado de post-its e desenhos, e os agentes conversam entre si pelas ligações que você desenha.

**Estado:** quadro pronto (espaços, post-its, textos, anexos, árvore de arquivos, navegador, desenhos, ligações,
desfazer, temas claro e escuro), instalável no Windows. Os terminais são de verdade: Claude Code, Codex e PowerShell
rodam dentro do cartão, continuam vivos ao trocar de espaço e retomam a conversa ao reabrir. Dentro de qualquer
terminal do app, o comando `ork` deixa um agente abrir sessões novas, conversar com quem está ligado a ele e ler a
tela dos outros.

## O comando `ork`

Roda dentro de um terminal do app (fora dele, recusa). A ligação (corda) entre dois terminais é a permissão.

```text
ork quem                         quem é você e quem está ligado a você
ork abrir claude|codex|shell     sessão nova ao lado, já ligada, com --pedido "…" ou --arquivo pedido.md
ork pedir <nome> "…"             manda um pedido e espera terminar (devolve a tela)
ork esperar | ver <nome>         espera terminar · lê a tela sem mandar nada
ork teclas <nome> enter|esc|…    responde menus e perguntas
ork limpar | fechar <nome>       zera o contexto · fecha uma sessão que você abriu
ork arvore nova|usar|mostrar     as árvores de código do cartão dele, uma por frente de trabalho
ork quadro                       lê o quadro: cada cartão com número, nome, lugar e tamanho, e as cordas
ork mover | arrumar              põe cartões num lugar (--x/--y, --dx/--dy) · arruma em grade (--colunas)
ork nome | ligar | desligar      renomeia um cartão · desenha ou tira a corda entre dois agentes
ork anotar "…" | juntar          escreve um texto no quadro · agrupa cartões (--soltar desfaz)
ork banda | banda criar "Nome" …  grupos de agentes: quem está dentro da moldura fala com todos os de dentro
ork trocar <cartão> <agente>     troca o agente de um cartão que ele abriu (o cartão fica, o agente muda)
ork partitura                    times salvos: lista, `usar "Nome"` sobe um ao seu lado, `salvar "Nome"` guarda
```

Mexer no quadro **entra no desfazer** do usuário, nunca apaga nada, não toca em cartão travado nem em cartão
de código, e só alcança o andar à mostra — sempre pelo nome do cartão.

Uma **rotina** digita um pedido num cartão a cada X minutos, todo dia ou toda semana (menu do cartão →
Rotinas…). O que só o app faz: se o terminal estiver **ocupado**, parado numa pergunta ou encerrado, ela
**pula a vez** em vez de escrever no meio do trabalho. Correm enquanto o espaço está aberto numa janela.

Uma **banda** é um grupo de agentes desenhado como moldura: quem está dentro dela fala com todos os outros de
dentro, e a corda desenhada na banda vale para cada um deles. Não há lista de membros — é a moldura que diz
quem é do time, então arrastar um cartão para dentro ou para fora é entrar e sair. **Trocar o agente** de um
cartão (menu do cartão, ou `ork trocar`) mantém lugar, nome, função, cordas, banda e árvore de código.

Uma **partitura** é um time salvo (agentes com funções e comandos, recados, bandas, cordas e grupos) que sobe inteiro
num espaço novo: no app, pelo menu de terminal ou por "Salvar como partitura…" na seleção. A pasta não é
salva de propósito — cada cartão abre na pasta do espaço (ou na da função), então o mesmo time serve em
qualquer projeto —, e o prompt de cada papel vem da função de hoje, nunca de uma cópia velha.

O app grava o manual como skill `orkester` em `~/.claude/skills` e `~/.codex/skills`.

## Fases

1. Quadro, terminais, post-its, salvar e reabrir
2. Ligações entre agentes e linha de comando própria (`ork`: quem, abrir, pedir, ver, notas)
3. Andares isolados com git worktree
4. Gerente de time: funções, recrutar agentes, grupos, times salvos
5. Navegador embutido, rotinas, desenhos, árvore de arquivos, medidor de uso

## Stack

Electron · React · TypeScript · xterm.js · node-pty — Windows 11 x64 primeiro.

## Marca

<img src="identidade/orkester-simbolo.png" alt="símbolo do Orkester" height="72">

Três peças orbitando um núcleo: três agentes em volta do trabalho. As versões (com e sem a palavra, PNG e
vetor), as cores e os dois comandos que refazem tudo estão em [`identidade/`](identidade/README.md).

## Rodar

Precisa de Node 24.

```powershell
cd app
npm install
npm run dev        # abre o app com recarga automática (para desenvolver)
npm run autoteste  # monta um quadro de teste, usa o mouse e o teclado, confere tudo e fecha (0 = passou)
npm run instalar   # gera o instalador e instala/atualiza o app neste PC (feche o app antes)
```

Instalado, o app abre pelo atalho **Orkester** (área de trabalho e menu Iniciar). Os dados ficam em
`%USERPROFILE%\.orkester` (JSON + post-its em `.md`) e não são apagados ao desinstalar.

<!-- Linha de teste do visualizador de código (04/11/2026). -->
