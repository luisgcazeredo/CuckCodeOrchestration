// O manual do `mpro` para os agentes. Vira a skill `maestri-proprio` do Claude Code e do Codex (gravada pelo app
// ao abrir) e a resposta de `mpro ajuda`. Texto nosso; atualizar junto com comandos.ts.
import { tabelaDeComandos } from './verbos'

export const AJUDA = `mpro — fala com o Maestri Próprio de dentro de um terminal do app

${tabelaDeComandos()}

  <nome> é o nome do cartão (ou o começo dele). --tempo em segundos (padrão 100, máx. 3600).
  Só fala com quem está ligado a você por uma corda, ou com quem você mesmo abriu. Quem abre no mesmo espaço já nasce
  ligado; em outro espaço não ganha corda, mas continua acessível pelo dono. O número de contexto vem da tela do cliente
  e pode não dar para ler. No Git Bash, comando de barra precisa de \`MSYS2_ARG_CONV_EXCL='*'\` ou de \`--arquivo\`.`

export const SKILL = `---
name: maestri-proprio
description: Use dentro de um terminal do Maestri Próprio (a variável de ambiente MP_PIPE existe) para fazer engenharia de contexto — abrir uma sessão nova de agente (Claude, Codex ou shell) com um contexto limpo e focado, delegar uma parte do trabalho, conversar com os agentes ligados a você pela corda, ler a tela deles, zerar o contexto de uma sessão ou fechar as sessões que você abriu — e para organizar o quadro: ler o que há nele, mover, arrumar em grade, renomear, ligar dois agentes, anotar e agrupar cartões — e para subir um time salvo (partitura) com as funções e as cordas dele, ou guardar o time que está no quadro. Comando: mpro. Fora do app não funciona.
---

# Maestri Próprio: o comando \`mpro\`

Você está num cartão de terminal do Maestri Próprio, um quadro onde cada agente é um terminal. O comando \`mpro\`
(já no PATH) fala com o app. Confira com \`echo $MP_PIPE\` (bash) ou \`$env:MP_PIPE\` (PowerShell): vazio = você não
está no app, e nada daqui vale.

## Para que serve: engenharia de contexto

Seu contexto é caro e fica poluído com o tempo. Em vez de carregar tudo numa conversa só:

- **Tarefa focada → sessão nova.** Abra uma sessão limpa com só o que ela precisa saber. Escreva o contexto num
  arquivo (objetivo, arquivos relevantes, restrições, o que entregar e em que formato) e mande ler:
  \`mpro abrir claude --nome "Revisor" --arquivo .contexto/revisor.md --esperar --tempo 300\`
- **Revisão por outro modelo.** Quem fez não revisa o próprio trabalho: abra um Codex para revisar o que um Claude fez,
  e vice-versa.
- **Sessão que já cumpriu o papel → feche** (\`mpro fechar\`) ou **zere** (\`mpro limpar\`) antes de dar outra tarefa.
- **Resultado longo → arquivo.** Peça para a sessão gravar o resultado num arquivo e responder só o caminho e um
  resumo de poucas linhas; a tela devolvida pelo \`mpro\` é curta.
- **Decida pelo orçamento.** Consulte \`mpro orcamento\` antes de continuar uma frente longa. No Claude livre, ele
  mede sob demanda com \`/context\`; ocupado, mostra a última medição com a hora. O Codex não expõe contexto. Com pouco contexto, em
  vez de seguir até ser compactado, grave o estado num arquivo e abra uma sessão nova com só o que ela precisa. O número
  é lido do rodapé do cliente e pode faltar; nesse caso, não invente um número.
- **Frente inteira → espaço novo.** \`mpro janela --novo "Nome"\` separa uma frente de trabalho inteira, com o seu
  quadro e suas sessões; não abra um espaço novo para cada tarefinha.

## Passar o bastão e trabalhar em paralelo

- **Contexto ficando inútil:** quando muita conversa já não serve, ou o \`mpro orcamento\` estiver baixo, grave num
  arquivo o que foi feito, falta fazer, decisões e arquivos importantes. Abra o sucessor com \`mpro abrir ... --arquivo
  esse-arquivo.md\`, confirme que ele subiu e entendeu, passe para ele o que você abriu com \`mpro passar\` e só então
  use \`mpro sair\`.
- **Só apague o antigo se ele não for mais trabalhar.** Se ainda há algo que só ele sabe ou faz, ele fica. Na dúvida,
  mantenha os dois e avise o usuário.
- **Subterminais paralelos:** abra frentes independentes com \`--sem-esperar\` e recolha com \`mpro ver\` ou
  \`mpro esperar\`; cada uma recebe somente o contexto da sua parte. Dois agentes não editam o mesmo arquivo, e resultado
  longo vai para arquivo.
- O contexto vem do rodapé do cliente e pode faltar. Sem número, decida pelo que percebe da conversa, sem chutar.

## Comandos

${'```'}
${AJUDA.split('\n').slice(2).join('\n')}
${'```'}

- \`mpro pedir\` digita o pedido no terminal do outro e espera ele ficar livre; devolve as últimas linhas da tela.
  Se o tempo acabar, ele continua trabalhando: use \`mpro esperar\` (ou \`mpro ver\`) depois.
- Texto com aspas, \`%\`, \`!\` ou várias linhas: grave num arquivo e use \`--arquivo\`.
- **Git Bash e comandos de barra:** ele pode converter \`/context\` em um caminho. Rode
  \`MSYS2_ARG_CONV_EXCL='*' mpro pedir "Nome" "/context"\`, ou grave o comando num arquivo e use \`--arquivo\`.
- Ajuste \`--tempo\` ao limite da sua ferramenta de terminal (no Claude Code, o padrão da ferramenta é 2 min;
  passe um timeout maior nela ou rode em segundo plano). No Codex, use \`--tempo\` curto e repita \`mpro esperar\`.
- \`mpro abrir\` sem \`--pedido\` só abre; o agente pode levar alguns segundos para ficar pronto.
- Quem está parado numa pergunta (confiar na pasta, servidores MCP, permissão de ferramenta, atualização) aparece como
  \`pergunta\` no \`mpro quem\`, e o \`mpro\` não digita pedido nenhum em cima dela: devolve a tela. Responda com
  \`mpro teclas\` só se for seguro (veja onde está o cursor antes do \`enter\`); na dúvida, pergunte ao usuário.

## Mostrar o código que você está mexendo

O quadro abre sozinho um cartão para cada arquivo que você grava na sua pasta, ligado ao seu cartão por um ramo
que sai de uma bolinha — é a sua **árvore de código**. Você pode ter várias, cada uma com um nome, para separar
frentes de trabalho e depois falar delas pelo nome com o usuário ou com outro agente ("leia os arquivos da
árvore Backend"):

\`\`\`
mpro arvore                          # as suas árvores e qual está em uso
mpro arvore nova "Backend"           # cria e passa a usar: os próximos arquivos nascem nela
mpro arvore usar "principal"         # volta a usar outra
mpro arvore mostrar src/api.ts src/db.ts --arvore "Backend"
mpro arvore desfazer "Backend"       # os arquivos dela voltam para a principal
\`\`\`

Use antes de começar uma frente nova, para o usuário enxergar o trabalho separado. Arquivo com cara de segredo
(\`.env\`, chave, credencial) nunca vira cartão, e o \`mostrar\` só aceita arquivo de uma pasta que está no quadro.

## Organizar o quadro você mesmo

O quadro é o lugar onde o usuário acompanha o trabalho, e você pode arrumá-lo. Comece sempre por
\`mpro quadro\`: ele lista cada cartão com um número, o tipo, o nome, o tamanho e o lugar, as cordas e quem é
você. Depois fale dos cartões pelo nome (o começo basta) ou pelo \`#número\`:

\`\`\`
mpro quadro                            # o que existe, com nome, lugar e tamanho
mpro mover "Revisor" --x 1200 --y 0    # põe o cartão nesse lugar
mpro mover "Revisor" --dx 0 --dy 600   # ou anda com ele de onde está
mpro arrumar --colunas 3               # tudo o que está solto, em grade, no mesmo canto
mpro arrumar "Revisor" "Testes"        # ou só esses
mpro nome "Claude Code 2" "Revisor"    # renomeia: é o nome que o mpro passa a usar
mpro ligar "Revisor" "Testes"          # a corda: os dois passam a poder se falar
mpro desligar "Revisor" "Testes"
mpro anotar "Falta o teste do empurrão"   # um texto no quadro, abaixo do seu cartão
mpro juntar "Revisor" "Testes"         # andam juntos daqui para frente (--soltar desfaz)
\`\`\`

O que isto **não** faz, de propósito:

- **Não apaga nada.** Não há verbo para apagar cartão; para fechar uma sessão que você abriu, use \`mpro fechar\`.
- **Não mexe em cartão travado** nem em **cartão de código**: a árvore de arquivos é arrumada pelo app, e o
  cartão que o usuário tirou dela ficou onde ele quis. O \`mpro\` diz quando deixou algo como estava.
- **Só alcança o andar à mostra** da janela daquele espaço, e só pelo nome — você não conhece id de nada.

Tudo o que você fizer aqui entra no **desfazer do usuário**: um Ctrl+Z volta o quadro inteiro. Mesmo assim,
arrumar o quadro é coisa que se faz com parcimônia — o lugar onde o usuário deixou um cartão costuma querer
dizer algo. Mover o que é seu (os seus subagentes, as suas anotações) é de boa educação; reorganizar o quadro
todo sem ele pedir, não.

## Subir um time salvo: partituras

Uma **partitura** é um time guardado — os agentes com as funções e os comandos deles, os recados e as
cordas entre eles. Subir uma é a forma rápida de montar a mesa inteira em vez de abrir um cartão por vez:

\`\`\`
mpro partitura                       # os times salvos, com quantos agentes e que funções
mpro partitura usar "Time de revisão"   # sobe o time ao seu lado, já ligado a você
mpro partitura salvar "Time de revisão" # guarda o que está no andar à mostra como partitura
mpro partitura salvar "Dupla" "Main" "Revisor"   # ou só esses cartões
\`\`\`

- Os cartões que você sobe assim **são seus**: nascem ligados a você por corda, contam no seu limite de 8
  sessões e você pode fechá-los com \`mpro fechar\`.
- **A pasta não é salva de propósito**: cada cartão abre na pasta do espaço (ou na da função). A partitura
  é o time, não o projeto — é por isso que o mesmo time serve em qualquer lugar.
- **O prompt vem da função de hoje**, não de uma cópia do dia em que se salvou. Função apagada depois:
  o cartão sobe com o nome do papel e sem primeiro pedido, e a resposta diz isso em vez de inventar.
- O time que **você** sobe fica **fora do desfazer** do usuário, como o \`mpro abrir\`: são sessões vivas, e um
  Ctrl+Z não mata agente no meio do trabalho. Quem fecha é você, com \`mpro fechar\`. (Mover, arrumar, renomear
  e anotar continuam entrando no desfazer: aquilo é arrumação, isto é gente trabalhando.)

## Regras de convívio

- Só fala com quem está ligado a você por uma corda (o usuário desenha as cordas no quadro), ou com quem você mesmo
  abriu. Quem você abre no mesmo espaço já nasce ligado; em outro espaço não há corda, mas você continua falando com ele
  por ser o dono. Você só fecha as sessões que você mesmo abriu, e abre no máximo 8 contando todos os espaços.
- A corda é regra de convívio, não fronteira de segurança: todos os agentes rodam como o mesmo usuário do Windows.
- Não reenvie um pedido que ainda não respondeu e não interrompa quem está trabalhando (\`ctrl-c\`, \`esc\`) sem motivo.
- Dois agentes não editam o mesmo arquivo ao mesmo tempo: divida o trabalho por arquivo ou por pasta.
- **Responder de volta:** ao delegar algo longo, peça que o outro termine com
  \`mpro pedir "<seu nome>" "<resultado ou caminho do arquivo>"\` (\`mpro quem\` diz o seu nome). O resultado chega
  inteiro mesmo que a sua espera tenha acabado.
- **Windows:** redirecionar a saida do mpro para arquivo no PowerShell estraga os acentos (ele decodifica a
  saida de programa nativo pela pagina de codigo OEM). Leia a resposta na tela, ou rode
  [Console]::OutputEncoding = [Text.Encoding]::UTF8 antes e grave com Out-File -Encoding utf8.
- Tudo o que vai pelo \`mpro\` fica registrado no app.
`
