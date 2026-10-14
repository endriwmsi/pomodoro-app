# Música

Aba do notch que mostra o que está tocando em **outros aplicativos** — Spotify, Apple Music,
YouTube no navegador e qualquer outro que se registre no controle de mídia do Windows — e
permite voltar, tocar/pausar, avançar, mudar a posição na faixa e ajustar o volume **do próprio
player**. Não usa a internet.

Código: `src-tauri/src/media/mod.rs` e, em `src/notch/`, `MediaTab.tsx`, `MiniPlayer.tsx`,
`SeekBar.tsx` e `VolumeSlider.tsx`. As APIs nativas usadas estão
justificadas em [ADR-004](decisions/ADR-004-NETWORK-FEATURES.md).

## Como funciona

O Windows mantém uma "sessão de mídia" para cada aplicativo que toca algo e elege uma como
**atual** — a mesma que as teclas de mídia do teclado controlam. O Compasso lê e comanda essa
sessão (`GlobalSystemMediaTransportControlsSessionManager`).

| Informação                   | Origem                                                                    |
| ---------------------------- | ------------------------------------------------------------------------- |
| Título e artista             | Propriedades da sessão atual                                              |
| Tocando ou pausado           | Estado de reprodução da sessão                                            |
| Anterior/próxima habilitados | Controles que o aplicativo declara suportar                               |
| Ordem aleatória e repetição  | Estado da sessão, quando o aplicativo informa (`null` se não informa)     |
| Capa                         | Miniatura publicada pelo aplicativo, convertida em `data:` URL (até 4 MB) |
| Volume                       | Volume **do aplicativo que está tocando** — ver abaixo                    |
| Posição e duração da faixa   | Linha do tempo da sessão — ver abaixo; `null` se o aplicativo não informa |

### Posição na faixa

O aplicativo publica a posição só de vez em quando (ao tocar, pausar, trocar de faixa…), junto
com a hora em que ela valia. `current_position_ms` soma o tempo decorrido desde então enquanto
a faixa toca, limita o resultado à duração e ignora horas de atualização ausentes ou no futuro.
No notch, `SeekBar` faz o mesmo entre duas leituras: avança pelo relógio local a cada segundo,
sem consultar o backend.

Mudar a posição (`media_seek`) só é oferecido se o aplicativo declara aceitar
(`canSeek`). O pedido é enviado **uma vez, ao soltar** a barra (ou a cada seta do teclado, de
5 em 5 segundos). Como o aplicativo demora a publicar a nova posição, o estado devolvido logo
após um pedido aceito já traz a posição pedida. Sem duração conhecida (rádio, transmissão ao
vivo) não há barra.

### Volume: do aplicativo, não do sistema

O controle ajusta o volume só do player, como o Mixer de volume do Windows
(`ISimpleAudioVolume` da sessão de áudio do aplicativo). Para achar essa sessão:

1. percorrem-se as sessões de áudio de **todas as saídas de áudio ativas** — o player pode
   estar tocando em uma que não é a padrão (fones escolhidos no próprio aplicativo, placas de
   som virtuais);
2. para cada sessão, obtém-se o nome do executável do processo dono;
3. a sessão pertence ao player se o identificador da sessão de mídia contém esse nome
   (`belongs_to_app`): `Spotify.exe` ↔ `Spotify`, `Chrome` ↔ `chrome`,
   `SpotifyAB.SpotifyMusic_…!Spotify` ↔ `Spotify`.

Um aplicativo pode ter várias sessões de áudio (navegadores têm): todas recebem o mesmo
volume, e a leitura usa a primeira.

Se nenhuma sessão corresponder — o identificador não lembra o nome do executável, como no
Firefox —, o controle passa a agir no **volume geral do sistema** e o estado informa
`volumeScope: 'system'` (o rótulo acessível do controle muda de "Volume do aplicativo de
música" para "Volume do sistema").

## Comportamento no notch

- **O player aparece em todas as abas.** Nas abas Timer, Tarefas e Clima há um **player
  compacto** (`MiniPlayer`) à direita do conteúdo (abaixo, quando o notch está em uma lateral):
  capa, título, artista, anterior/tocar-pausar/próxima e o progresso da faixa, que também
  aceita arraste. No topo ele ocupa uma coluna de 160 px, com a capa maior e os tempos da faixa;
  nas laterais, uma linha, com a barra sem os tempos.
- **Na aba Música aparece só o player completo** (`MediaTab`) e o notch fica menor (layout
  `compact`, ver [WINDOW_MANAGER.md](WINDOW_MANAGER.md#geometria-e-posição)): capa, título e
  artista centralizados, os cinco controles (aleatório, anterior, tocar/pausar, próxima,
  repetição), a barra de progresso com o tempo decorrido e o total e o volume (`VolumeSlider`).
  - **No topo:** capa à esquerda e volume **vertical** à direita.
  - **Nas laterais:** tudo empilhado — capa, faixa, controles, progresso e, por último, o
    volume **deitado**, abaixo dos controles.
- **O painel abre na aba em que estava**, haja ou não música tocando: como o player aparece em
  todas as abas, a música não muda a aba.
- Com o painel aberto (em qualquer aba), o estado é relido a cada **2 segundos**. Com o notch
  recolhido, **nada é consultado** — não há custo em repouso.
- A capa só é buscada quando a faixa muda (título, artista ou aplicativo), pois é a parte mais
  cara.
- Sem sessão de mídia: "Nada tocando", com os controles desabilitados.

**Repetição** alterna em ciclo: desligada → lista → faixa → desligada. Os botões de aleatório e
repetição ficam desabilitados se o aplicativo declarar que não os suporta.

**Controle de volume:** arraste ou clique na pílula; o preenchimento sobe de baixo para cima
(vertical) ou da esquerda para a direita (deitado).
Durante o arraste o desenho acompanha o ponteiro imediatamente e o backend recebe no máximo
uma atualização a cada 80 ms, mais uma ao soltar.

O estado fica em `src/stores/media.ts`, compartilhado pelos dois players.

## Contrato

Comandos em `src-tauri/src/commands/notch.rs`:

| Comando                       | Devolve          | Efeito                                         |
| ----------------------------- | ---------------- | ---------------------------------------------- |
| `media_get_state()`           | `MediaState`     | Estado da sessão atual e volume                |
| `media_control({ action })`   | `MediaState`     | Executa a ação e devolve o estado depois       |
| `media_get_artwork()`         | `string \| null` | Capa como `data:` URL                          |
| `media_set_volume({ level })` | `MediaState`     | Volume do aplicativo (ou do sistema), de 0 a 1 |
| `media_seek({ positionMs })`  | `MediaState`     | Leva a faixa atual para a posição, em ms       |

```ts
type MediaAction = 'playPause' | 'next' | 'previous' | 'toggleShuffle' | 'cycleRepeat';

interface MediaState {
  available: boolean; // há uma sessão de mídia
  playing: boolean;
  title: string;
  artist: string;
  app: string; // ex.: "Spotify.exe"
  canPrevious: boolean;
  canNext: boolean;
  canShuffle: boolean;
  canRepeat: boolean;
  shuffle: boolean | null; // null: o aplicativo não informa
  repeat: 'none' | 'track' | 'list' | null;
  volume: number | null; // 0–1; null sem saída de áudio
  volumeScope: 'app' | 'system';
  positionMs: number | null; // null: o aplicativo não informa
  durationMs: number | null;
  canSeek: boolean;
}
```

Erros: `validation` (campo `level`) para volume fora de 0–1; `internal` se o Windows recusar a
chamada. Uma ação recusada pelo aplicativo (por exemplo, "próxima" na última faixa) não é
erro: o estado devolvido simplesmente não muda.

Todas as chamadas bloqueiam por alguns milissegundos e rodam em thread de trabalho.

## Limitações

- Depende de o aplicativo publicar a sessão: players que não se integram ao Windows não
  aparecem, e alguns não publicam capa ou artista.
- Com vários players abertos, vale a sessão que o Windows considera atual; não há como escolher
  outra pelo notch.
- A posição mostrada entre duas leituras é uma estimativa pelo relógio; aplicativos que
  publicam a linha do tempo com atraso (ou nunca) deixam a barra imprecisa (ou ausente).
- O volume por aplicativo depende de casar o identificador da sessão de mídia com o nome do
  executável; quando não casa, o controle age no volume do sistema.
- Acionar os controles, **alterar** o volume e **mudar a posição** não foram exercitados em uso
  real — só a leitura
  (ver [TESTING.md](TESTING.md)).
