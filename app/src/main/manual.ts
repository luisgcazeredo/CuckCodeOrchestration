// O manual do `mpro` para os agentes. Vira a skill `maestri-proprio` do Claude Code e do Codex (gravada pelo app
// ao abrir) e a resposta de `mpro ajuda`. Texto nosso; atualizar junto com comandos.ts.

export const AJUDA = `mpro — fala com o Maestri Próprio de dentro de um terminal do app

  mpro quem                           quem é você e quem está ligado a você (pela corda)
  mpro abrir <claude|codex|shell> [--nome N] [--pasta P] [--pedido "texto" | --arquivo pedido.md] [--esperar] [--tempo S]
                                      abre uma sessão nova, ligada a você, e manda o primeiro pedido
  mpro pedir <nome> "texto" | --arquivo pedido.md [--sem-esperar] [--tempo S]
                                      manda um pedido e espera ele terminar (devolve a tela)
  mpro esperar <nome> [--tempo S]     espera terminar o que está fazendo
  mpro ver <nome> [--linhas N]        lê a tela sem mandar nada
  mpro teclas <nome> <tecla>...       enter, esc, tab, shift-tab, cima, baixo, esquerda, direita, ctrl-c, espaco, 1, 2, y, n…
  mpro limpar <nome>                  zera o contexto da sessão (/clear no Claude, /new no Codex)
  mpro fechar <nome>                  fecha uma sessão que você abriu (some do quadro)

  <nome> é o nome do cartão (ou o começo dele). --tempo em segundos (padrão 100, máx. 3600).
  Só fala com quem está ligado a você por uma corda; quem você abre já nasce ligado.`

export const SKILL = `---
name: maestri-proprio
description: Use dentro de um terminal do Maestri Próprio (a variável de ambiente MP_PIPE existe) para fazer engenharia de contexto — abrir uma sessão nova de agente (Claude, Codex ou shell) com um contexto limpo e focado, delegar uma parte do trabalho, conversar com os agentes ligados a você pela corda, ler a tela deles, zerar o contexto de uma sessão ou fechar as sessões que você abriu. Comando: mp. Fora do app não funciona.
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

## Comandos

${'```'}
${AJUDA.split('\n').slice(2).join('\n')}
${'```'}

- \`mpro pedir\` digita o pedido no terminal do outro e espera ele ficar livre; devolve as últimas linhas da tela.
  Se o tempo acabar, ele continua trabalhando: use \`mpro esperar\` (ou \`mpro ver\`) depois.
- Texto com aspas, \`%\`, \`!\` ou várias linhas: grave num arquivo e use \`--arquivo\`.
- Ajuste \`--tempo\` ao limite da sua ferramenta de terminal (no Claude Code, o padrão da ferramenta é 2 min;
  passe um timeout maior nela ou rode em segundo plano). No Codex, use \`--tempo\` curto e repita \`mpro esperar\`.
- \`mpro abrir\` sem \`--pedido\` só abre; o agente pode levar alguns segundos para ficar pronto.
- Quem está parado numa pergunta (confiar na pasta, servidores MCP, permissão de ferramenta, atualização) aparece como
  \`pergunta\` no \`mpro quem\`, e o \`mpro\` não digita pedido nenhum em cima dela: devolve a tela. Responda com
  \`mpro teclas\` só se for seguro (veja onde está o cursor antes do \`enter\`); na dúvida, pergunte ao usuário.

## Regras de convívio

- Só fala com quem está ligado a você por uma corda (o usuário desenha as cordas no quadro). Quem você abre já nasce
  ligado. Você só fecha as sessões que você mesmo abriu, e abre no máximo 8.
- Não reenvie um pedido que ainda não respondeu e não interrompa quem está trabalhando (\`ctrl-c\`, \`esc\`) sem motivo.
- Dois agentes não editam o mesmo arquivo ao mesmo tempo: divida o trabalho por arquivo ou por pasta.
- **Responder de volta:** ao delegar algo longo, peça que o outro termine com
  \`mpro pedir "<seu nome>" "<resultado ou caminho do arquivo>"\` (\`mpro quem\` diz o seu nome). O resultado chega
  inteiro mesmo que a sua espera tenha acabado.
- Tudo o que vai pelo \`mpro\` fica registrado no app.
`
