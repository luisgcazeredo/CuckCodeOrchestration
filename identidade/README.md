# Identidade do Orkester

A marca que o Luís trouxe em **06/11/2026**: um símbolo de três peças orbitando um núcleo — três agentes em
volta do trabalho — e a palavra *Orkester* ao lado.

| Arquivo | O que é | Onde se usa |
|---|---|---|
| `orkester-original.png` | o arquivo como ele mandou, sem tocar | fonte de tudo o que está aqui; não editar |
| `orkester-assinatura.png` | a assinatura inteira (símbolo + palavra), sem as margens brancas | README, apresentação, qualquer lugar com espaço horizontal |
| `orkester-simbolo.png` | só o símbolo, sem a palavra | onde o nome já está escrito ao lado, ou não cabe |
| `orkester-simbolo-vetor.svg` | o símbolo **redesenhado em vetor**, fundo transparente | dentro do app, telas, qualquer tamanho |
| `../app/build/icon.svg` | o mesmo vetor com a chapa de fundo | é dele que sai o ícone do app e do instalador |

**Cores medidas do arquivo original:** azul `#4060e8` (peças e faixas), azul claro `#98a8f8` (núcleo),
quase-preto `#182028` (a palavra).

**Por que o ícone é vetor e não o PNG:** o ícone do Windows é desenhado de 16 px a 256 px. Um PNG de fundo
branco encolhido para 16 px vira uma mancha; o vetor continua nítido. O desenho segue o símbolo dele (mesmos
ângulos, mesmas cores) — se um dia a marca mudar, mudam-se os números no script e roda-se de novo.

## Como refazer

Os dois comandos rodam de dentro de `app/` e não dependem de nada além do Node:

- `npm run marca` — corta o original nas duas versões (ele acha sozinho onde a palavra começa: o maior vão
  de colunas brancas). Script: `app/scripts/gerar-marca.mjs`.
- `npm run icone` — redesenha o símbolo e escreve `build/icon.svg`, `build/icon.png` (512 px) e
  `orkester-simbolo-vetor.svg`. Script: `app/scripts/gerar-icone.mjs`; o desenho é todo analítico, então o
  mesmo cálculo gera o vetor e o pixel, sem navegador nem biblioteca de imagem.
