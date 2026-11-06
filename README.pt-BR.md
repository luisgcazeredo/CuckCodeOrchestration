<img src="identidade/orkester-assinatura.png" alt="Orkester" height="88">

**Um time de agentes de código num quadro infinito — e você desenha quem fala com quem.**

![versão](https://img.shields.io/badge/vers%C3%A3o-0.31.0-4060e8)
![plataforma](https://img.shields.io/badge/plataforma-Windows%2011%20x64-4060e8)
![testes](https://img.shields.io/badge/testes-117%20provas%20·%20147%20checagens-4060e8)

[English](README.md) · Português

Claude Code, Codex e PowerShell rodam de verdade dentro dos cartões, ao lado de post-its, arquivos e desenhos.
A linha que você traça entre dois cartões é a permissão para um agente falar com o outro.

---

## Por que isto existe

Um agente de código dá conta de uma tarefa por vez, e dá conta bem. Quando o trabalho cresce, a saída de todo
mundo é a mesma: abrir mais terminais. Aí o gargalo deixa de ser o agente e passa a ser você — meia dúzia de
janelas iguais, nenhuma sabe o que a outra está fazendo, e o único jeito de um agente aproveitar o trabalho do
outro é você copiar e colar entre as duas.

O Orkester troca a pilha de janelas por um quadro. Cada terminal vira um cartão com nome, lugar e função; você
desenha uma corda entre dois cartões e, a partir dela, os agentes se falam sozinhos. O arranjo que antes existia
só na sua cabeça vira uma coisa visível, que se salva e se repete no projeto seguinte.

Três ideias seguram o resto:

- **O quadro é o estado.** Posição, nome, grupo e ligação não são enfeite — é por eles que o app decide quem
  alcança quem. Arrastar um cartão para dentro de um grupo *é* colocá-lo no time.
- **A corda é a permissão.** Um agente só conversa com quem está ligado a ele. Nada de agente solto mandando
  recado para o quadro inteiro.
- **O agente tem mão.** Dentro de qualquer terminal do quadro existe o comando **`ork`**: com ele o agente abre
  sessões novas, delega, lê a tela de quem está ligado a ele, organiza o quadro e monta o próprio time. Fora do
  app, o comando recusa rodar.

## O que faz

| | |
|---|---|
| **Terminais de verdade** | Claude Code, Codex ou PowerShell dentro do cartão, com rolagem, zoom e cópia. Continuam vivos ao trocar de espaço e retomam a conversa ao reabrir o app. |
| **Delegação** | Um agente abre outro já com contexto (`--funcao`, `--pedido`, `--arquivo`), espera a resposta, lê a tela, responde menus e fecha o que abriu. |
| **Funções** | Nome + prompt + pasta. O agente nasce sabendo o papel dele em vez de nascer vazio. |
| **Bandas** | Grupos desenhados como moldura: quem está dentro fala com todos os de dentro. |
| **Partituras** | Times inteiros salvos — agentes, funções, recados, cordas, bandas — que sobem de uma vez num espaço novo, em qualquer projeto. |
| **Rotinas** | Um pedido digitado num cartão a cada X minutos, todo dia ou toda semana. Se o terminal estiver ocupado, parado numa pergunta ou encerrado, a rotina **pula a vez** em vez de escrever no meio do trabalho. |
| **Várias janelas** | Cada espaço abre na sua janela, e o app reabre as que estavam abertas, onde estavam. |
| **Andares** | Cópias isoladas do repositório por `git worktree`, para dois times mexerem no mesmo projeto sem se atropelar. |
| **Árvores de código** | Os arquivos que o agente toca viram cartões ao lado dele, com o diff do git, agrupados por frente de trabalho. |
| **Leitura de contexto** | Quanto de janela cada agente já gastou, para saber quando limpar ou passar o trabalho adiante. |
| **O resto do quadro** | Espaços de trabalho, post-its em `.md`, textos, anexos, navegador embutido, desenho à mão livre, desfazer de tudo, temas claro e escuro. |

## Instalar

Precisa de **Node 24** e **Windows 11 x64**.

```powershell
git clone https://github.com/luisgcazeredo/orkester.git
cd orkester/app
npm install
npm run instalar   # gera o instalador e instala o app neste PC
```

O app abre pelo atalho **Orkester** (área de trabalho e menu Iniciar). Os dados ficam em
`%USERPROFILE%\.orkester` — o quadro em JSON e os post-its em `.md`, legíveis fora do app — e não são apagados
ao desinstalar.

Para desenvolver:

```powershell
npm run dev        # app com recarga automática
npm run provas     # testes dos módulos puros
npm run autoteste  # dirige o app de verdade com mouse e teclado, confere tudo e fecha (0 = passou)
```

## O comando `ork`

Roda dentro de um terminal do quadro. A corda entre dois cartões é a permissão; os cartões se chamam pelo nome.

```text
# onde eu estou
ork quem                          você, quem está ligado a você e o último contexto conhecido
ork orcamento                     quanto de janela o agente já gastou
ork espacos | janela              lista os espaços · abre um numa janela (--novo cria)

# trabalhar com outros agentes
ork abrir claude|codex|shell      sessão nova ao lado, já ligada
                                  (--funcao, --pedido, --arquivo, --esperar)
ork pedir <nome> "…"              manda um pedido e espera terminar (devolve a tela)
ork esperar | ver <nome>          espera terminar · lê a tela sem mandar nada
ork teclas <nome> enter|esc|…     responde menus e perguntas
ork limpar | fechar <nome>        zera o contexto · fecha uma sessão que você abriu
ork passar <nome> | ork sair      entrega as sessões que você abriu · fecha o próprio cartão

# montar o time
ork funcoes                       os papéis guardados, para usar em `ork abrir --funcao`
ork banda | banda criar "Nome"    grupos: quem está dentro da moldura fala com todos os de dentro
ork trocar <cartão> <agente>      troca o agente de um cartão que ele abriu (o cartão fica, o agente muda)
ork partitura                     times salvos: `usar "Nome"` sobe um ao lado, `salvar "Nome"` guarda

# mexer no quadro
ork quadro                        cada cartão com número, nome, lugar e tamanho, e as cordas
ork mover | arrumar               põe cartões num lugar (--x/--y, --dx/--dy) · arruma em grade (--colunas)
ork nome | ligar | desligar       renomeia um cartão · desenha ou tira a corda entre dois agentes
ork anotar "…" | juntar           escreve um texto no quadro · agrupa cartões (--soltar desfaz)
ork arvore nova|usar|mostrar      as árvores de código do cartão, uma por frente de trabalho
```

Tudo o que o agente faz no quadro **entra no desfazer** do usuário, nunca apaga nada, não toca em cartão
travado nem em cartão de código, e só alcança o andar à mostra.

O app grava o manual completo como skill `orkester` em `~/.claude/skills` e `~/.codex/skills`, então o agente
aprende o comando sozinho na primeira vez que precisa dele.

## Três ideias que valem explicar

**Banda.** Um grupo desenhado como moldura. Não existe lista de membros — é a moldura que diz quem é do time,
então arrastar um cartão para dentro ou para fora *é* entrar e sair. A corda ligada à banda vale para cada um
dos que estão dentro.

**Partitura.** Um time salvo. A pasta *não* é salva de propósito: cada cartão abre na pasta do espaço onde a
partitura subiu, então o mesmo time serve em qualquer projeto. O prompt de cada papel vem da função de hoje,
nunca de uma cópia velha guardada junto.

**Rotina.** O que só o app consegue fazer é saber a situação do terminal antes de digitar. Uma rotina que
escreve no meio de uma resposta estraga o trabalho; por isso ela confere e pula a vez.

## Por dentro

Electron · React · TypeScript · xterm.js · node-pty.

O cálculo do quadro mora em módulos puros (`app/src/shared/`), cobertos por testes que rodam em Node sem abrir o
app. Em cima deles, o autoteste abre o app de verdade, monta um quadro, mexe com mouse e teclado e confere o
resultado na tela. Hoje: **117 provas** e **147 checagens** em 13 cenários.

```text
app/src/shared/    regras puras do quadro (bandas, partituras, trocar, rotinas, arquivos)
app/src/main/      processo principal: terminais, verbos do `ork`, dados em disco, autoteste
app/src/renderer/  o quadro em React
app/src/cli/       o comando `ork` que o agente chama
identidade/        a marca e os scripts que geram o ícone
```

## Estado

Versão **0.31.0**, em uso diário no Windows. Quadro, terminais, delegação, funções, bandas, partituras,
rotinas, andares e árvores de código estão prontos. O caminho até a 1.0 segue por operação — o que acontece
quando um agente trava, acaba o crédito ou o PC reinicia — e por um visual próprio.

## Marca

<img src="identidade/orkester-simbolo.png" alt="símbolo do Orkester" height="64">

Três peças orbitando um núcleo: três agentes em volta do mesmo trabalho. As versões com e sem a palavra, as
cores e os comandos que refazem o ícone estão em [`identidade/`](identidade/README.md).

---

Projeto pessoal de [@luisgcazeredo](https://github.com/luisgcazeredo), feito para o uso dele. O código está
aberto para ler e aproveitar; não há promessa de suporte nem de compatibilidade entre versões.
