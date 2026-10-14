# Gerenciamento de janelas

O aplicativo tem duas janelas — a **principal** e o **notch** — e um ícone na **bandeja do
sistema**. O código nativo fica em `src-tauri/src/windows/` e `src-tauri/src/tray.rs`.

As duas janelas carregam o mesmo `index.html`; `src/main.tsx` decide a interface pelo rótulo da
janela (`main` → `App`, `notch` → `NotchApp`) e grava `data-window` em `<html>`.

## Ciclo de vida do processo

- **Fechar a janela principal a oculta** (`WindowEvent::CloseRequested` → `prevent_close` +
  `hide`). Timer, notch e bandeja continuam ativos.
- **Encerrar** é feito pelo menu da bandeja → `app.exit(0)` → `RunEvent::Exit`, que registra a
  sessão em andamento como interrompida (ver [TIMER_ENGINE.md](TIMER_ENGINE.md#recuperação)).
- **Instância única** (`tauri-plugin-single-instance`): executar o aplicativo de novo apenas
  mostra a janela principal da instância existente e sai. Dois processos disputariam o banco e
  criariam dois notches.

Na primeira vez, por execução, em que a janela é fechada, uma notificação avisa que o
aplicativo continua na bandeja (ver [NOTIFICATIONS.md](NOTIFICATIONS.md)).

## Janela principal (`main`)

Definida em `src-tauri/tauri.conf.json` → `app.windows[0]`.

| Propriedade       | Valor      | Motivo                                                              |
| ----------------- | ---------- | ------------------------------------------------------------------- |
| `decorations`     | `false`    | Sem barra de título nem botões nativos                              |
| `shadow`          | `true`     | No Windows 11, dá sombra e cantos arredondados à janela sem moldura |
| `backgroundColor` | `#000000`  | Evita o clarão branco antes de o WebView pintar                     |
| tamanho inicial   | 1180 × 760 | Centralizada (`center: true`)                                       |
| tamanho mínimo    | 900 × 600  | Abaixo disso a grade do dashboard não cabe                          |

A janela **não** é transparente: a moldura preta é pintada pela própria interface.

### Barra de título customizada

- `components/layout/TitleBar.tsx`: faixa de 44 px no topo da área de conteúdo. O espaço vazio
  tem `data-tauri-drag-region` (arrastar move a janela; duplo clique maximiza/restaura).
- `components/layout/Sidebar.tsx`: as áreas vazias da barra lateral também arrastam a janela.
- `components/layout/WindowControls.tsx`: botões **Minimizar**, **Maximizar/Restaurar** e
  **Fechar** no canto superior direito, com `aria-label` e foco visível. **Fechar** envia a
  janela para a bandeja.
- `lib/window.ts`: única camada que fala com `@tauri-apps/api/window`. `watchMaximized` consulta
  `isMaximized()` ao montar e a cada `onResized`.

`data-tauri-drag-region` vale apenas para o elemento que recebe o clique, não para os filhos.

Permissões (`src-tauri/capabilities/default.json`):

| Permissão                                    | Usada por                         |
| -------------------------------------------- | --------------------------------- |
| `core:window:allow-start-dragging`           | `data-tauri-drag-region`          |
| `core:window:allow-internal-toggle-maximize` | duplo clique na região de arraste |
| `core:window:allow-minimize`                 | botão Minimizar                   |
| `core:window:allow-toggle-maximize`          | botão Maximizar/Restaurar         |
| `core:window:allow-close`                    | botão Fechar                      |
| `core:window:allow-is-maximized`             | `watchMaximized`                  |
| `core:event:allow-listen` / `allow-unlisten` | eventos do backend e `onResized`  |

### Mostrar a janela e navegar

`windows::show_main(app, view)` mostra, restaura e foca a janela. Se `view` for informado,
emite `app:navigate` (payload: nome da tela) para a janela principal; `App.tsx` valida o nome
com `isViewId` antes de trocar de tela. É usado pela bandeja, pelo notch (comando
`show_main_window`) e pela segunda execução do aplicativo.

### Barras de rolagem

Estilizadas em `src/styles/globals.css` com `::-webkit-scrollbar`, usando os tokens
`--scrollbar-thumb` e `--scrollbar-thumb-hover` do template ativo (ver
[THEMING.md](THEMING.md)). Não se define `scrollbar-color`, que faria o WebView2 ignorar essas
regras.

### Limitações conhecidas

- Os cantos arredondados da janela vêm do Windows 11. No Windows 10 a janela sem moldura fica
  com cantos retos (não testado).
- Os layouts de encaixe do Windows 11 ao passar o mouse sobre o botão maximizar (Snap Layouts)
  não aparecem em botões desenhados em HTML.

## Notch (`notch`)

Janela pequena, preta, colada ao centro de uma borda do **monitor principal** — superior,
esquerda ou direita. Recolhida, é um puxador; ao passar o mouse, expande e mostra o timer com
seus controles.

### Configuração da janela (`tauri.conf.json` → `app.windows[1]`)

| Propriedade                               | Valor   | Efeito                                                                 |
| ----------------------------------------- | ------- | ---------------------------------------------------------------------- |
| `decorations` / `shadow`                  | `false` | Sem moldura nem sombra                                                 |
| `transparent`                             | `true`  | Só o notch é pintado; os cantos arredondados deixam ver o que há atrás |
| `alwaysOnTop`                             | `true`  | Fica sobre as outras janelas                                           |
| `skipTaskbar`                             | `true`  | Não aparece na barra de tarefas                                        |
| `focus` / `focusable`                     | `false` | Nunca recebe o foco: clicar no notch não desativa o aplicativo em uso  |
| `resizable`, `maximizable`, `minimizable` | `false` | O tamanho é controlado pelo aplicativo                                 |
| `visible`                                 | `false` | O backend posiciona e só então mostra                                  |

`body` fica transparente nessa janela (`html[data-window='notch']` em `globals.css`).

### Geometria e posição

Fonte de verdade: `windows/notch.rs`. O notch fica colado ao centro de uma borda do monitor
principal, escolhida em **Configurações → Notch → Posição** (`notch.position`): `top` (padrão),
`left` ou `right`.

Tamanho da janela, em pixels lógicos:

| Estado                                              | No topo (largura × altura) | Nas laterais (largura × altura) |
| --------------------------------------------------- | -------------------------- | ------------------------------- |
| Recolhido (`collapsed`)                             | 148 × 12                   | 12 × 148                        |
| Expandido (`expanded`): uma aba e o player compacto | 628 × 216                  | 260 × 428                       |
| Compacto (`compact`): só o player, na aba Música    | 428 × 216                  | 260 × 388                       |

`geometry(monitor, position, layout)` converte para pixels físicos com a escala do monitor
principal (arredondando), encosta a janela na borda escolhida e a centraliza ao longo dela —
inclusive quando o monitor principal não começa na origem do desktop virtual. `apply()` lê o
monitor principal atual e só move ou redimensiona a janela se ela estiver fora do lugar.

**A janela tem sempre o tamanho exato do que está visível.** Não existe área transparente
capturando cliques além dos cantos curvos: recolhido, o notch ocupa 148 × 12 px; o resto da
tela é do aplicativo em uso. A exceção são os ~200 ms das animações de abrir e fechar, em que a
janela já tem (ou ainda tem) o tamanho expandido.

`apply()` é chamado: ao iniciar, a cada troca de layout (`notch_set_layout`), quando as configurações mudam e
nos eventos `Moved` e `ScaleFactorChanged` da janela do notch — o Windows costuma mover janelas
quando a resolução, a escala ou o monitor principal mudam.

`configure(app, settings.notch)` aplica as configurações: grava a borda, esconde ou mostra o notch e, se a borda mudou, o recolhe (o tamanho expandido depende da borda).

### Forma

O notch tem o desenho de uma "gota" presa à borda: um corpo preto (ou branco, conforme a cor escolhida) com os cantos externos
arredondados e, de cada lado, uma **aba côncava** que faz a curva de transição entre a borda
da tela e o corpo. `src/notch/shape.ts` descreve a forma em relação à borda:

| Medida   | Significado                               | Recolhido | Expandido (topo / lateral)              |
| -------- | ----------------------------------------- | --------- | --------------------------------------- |
| `along`  | comprimento do corpo ao longo da borda    | 132       | expandido 580 / 380; compacto 380 / 340 |
| `depth`  | quanto o corpo avança para dentro da tela | 12        | 216 / 260                               |
| `flare`  | raio das abas côncavas                    | 8         | 24                                      |
| `radius` | raio dos cantos externos do corpo         | 10        | 30                                      |

A janela mede `along + 2 × flare` por `depth` — os totais da tabela anterior. Os dois lados
(Rust e TypeScript) precisam concordar; `src/notch/shape.test.ts` confere os totais.

As abas são quadrados da cor do corpo com um quarto de círculo vazado
(`radial-gradient(circle farthest-side at <canto> …)`, classe `.notch-flare`); o gradiente é
relativo ao tamanho do elemento, então a curva acompanha a animação de largura e altura sem
precisar animar propriedades customizadas. `EDGE_LAYOUT` define, para cada borda, o
alinhamento, o sentido do empilhamento, o canto de cada aba e quais cantos do corpo são
arredondados.

Nas laterais o conteúdo é empilhado: fase, tempo e, abaixo, os botões.

### Cor

O notch é **preto em qualquer template**. Em **Configurações → Notch → Cor** (`notch.theme`)
escolhe-se `dark` (preto), `light` (branco) ou `system` (padrão: acompanha o modo claro ou
escuro do Windows, lido pelo WebView em `prefers-color-scheme` e atualizado na hora em que o
sistema muda). `NotchApp` grava a cor em vigor em `data-notch-theme` no `<html>`; o CSS
(`globals.css`) troca `--notch-surface` e, no tema claro, inverte as cores `white` e `black`
do Tailwind dentro da janela do notch — o conteúdo é todo escrito com `text-white/NN` e
`bg-white/NN` e se inverte sem mudanças nos componentes. O backend só guarda a preferência.

Um notch de vidro com o desfoque nativo do Windows (acrílico, com a janela recortada no
formato do notch) foi experimentado e **descartado** a pedido do usuário: o resultado visual
ficou ruim.

Para ajustar o desenho no navegador, sem o aplicativo: `npm run dev` e abra
`http://localhost:1420/?window=notch`.

### Interação (`src/notch/NotchApp.tsx`)

1. **Mouse entra** → comando `notch_set_layout` com o layout da aba atual (a janela cresce) → no
   quadro seguinte a forma é animada até esse tamanho (transição CSS de 180 ms).
2. **Mouse sai** → aguarda 350 ms (se o mouse voltar, cancela) → anima o recolhimento →
   `notch_set_layout('collapsed')`.
3. **Troca de aba com o painel aberto:** entrar ou sair da aba Música muda o layout entre
   `expanded` e `compact`. A regra é sempre a mesma (`transitionTo`, em `NotchApp.tsx`): para
   **crescer**, a janela primeiro e o desenho depois; para **diminuir**, o desenho primeiro e a
   janela ao fim da animação — assim a janela nunca é menor que o que está desenhado.
4. **Fixar:** o botão de alfinete mantém o painel aberto mesmo com o mouse fora; clicar de novo
   solta.

### Abas

O painel expandido tem um **seletor de abas** e uma área de conteúdo.

O seletor (`TabRail`, em `NotchApp.tsx`) é um carrossel de ícones: o da aba selecionada fica no
centro, maior, na cor da aba e sobre uma "bolha" da mesma cor; os vizinhos ficam menores e
apagados, sumindo nas pontas. Ao trocar de aba, a fileira inteira desliza até centralizar o
novo ícone com um movimento "de mola" (classe `.notch-spring`: passa um pouco do ponto e
volta), como se fosse arrastada com o dedo. As abas de conteúdo deslizam junto, com o mesmo
movimento; a que sai encolhe e some.

- **No topo:** seletor na horizontal, acima do conteúdo; as abas deslizam para os lados.
- **Nas laterais:** seletor em pé, junto à borda da tela; as abas deslizam na vertical.

Troca-se de aba:

- **girando a roda do mouse** sobre o notch (para baixo: próxima; para cima: anterior), com um
  intervalo mínimo de 320 ms entre trocas para um giro não pular várias abas. Se o ponteiro
  estiver sobre uma lista que ainda pode rolar naquele sentido (`data-notch-scroll`), a roda
  rola a lista em vez de trocar de aba;
- **clicando** no ícone da aba.

| Aba     | Arquivo                | Conteúdo                                                                                |
| ------- | ---------------------- | --------------------------------------------------------------------------------------- |
| Timer   | `notch/TimerTab.tsx`   | Fase, tarefa escolhida, tempo, iniciar/pausar/retomar, pular, abrir o app               |
| Tarefas | `notch/TasksTab.tsx`   | Tempo (resumido) e as tarefas abertas, cada uma com **Focar** e uma caixa para concluir |
| Música  | `notch/MediaTab.tsx`   | Só o player completo, em um painel menor — ver [MEDIA.md](MEDIA.md)                     |
| Clima   | `notch/WeatherTab.tsx` | Previsão do tempo; **só existe com a função ligada** — ver [WEATHER.md](WEATHER.md)     |

Para acrescentar uma aba, inclua uma entrada em `TABS` (`NotchApp.tsx`) com rótulo, ícone, cor
e o componente; o seletor e o trilho se ajustam ao número de abas. As abas inativas e o painel
recolhido recebem `inert`, para não serem alcançados por teclado ou leitores de tela.

Ao lado de qualquer aba que não seja a Música fica o **player compacto**
(`notch/MiniPlayer.tsx`), à direita do conteúdo no topo e abaixo dele nas laterais.

**Qual aba abre:** sempre a última usada — inclusive com música tocando, pois o player já
aparece em todas as abas. Uma aba pode declarar `enabled(settings)` em `TABS`
para existir só sob certa configuração (é o caso do clima).

O tempo é desenhado conforme o template ativo (matriz de pontos no template Matriz).

O notch usa as mesmas stores da janela principal (`stores/timer.ts`, `stores/settings.ts`,
`stores/tasks.ts`), em sua própria instância de WebView: recebe `timer:state`,
`settings:changed` e `tasks:changed` do backend e não mantém estado próprio.

Permissões (`src-tauri/capabilities/notch.json`): apenas `core:event:allow-listen` e
`allow-unlisten`. Os comandos próprios do aplicativo não exigem permissão.

### Ativar e desativar

Configuração `notch.enabled` (padrão: ligado), em **Configurações → Notch**.
`windows::notch::configure` mostra o notch recolhido ou o esconde; é chamado na inicialização e
por `update_settings`.

### Limitações e pontos não verificados

- **Cliques reais nos botões do notch** não foram testados: a janela não é focável e a
  verificação automatizada usou mensagens enviadas diretamente à janela, que não passam pela
  ativação. Precisa de teste manual.
- **Aplicativos em tela cheia** (jogos, vídeo em tela cheia) podem ficar sobre o notch; não
  testado.
- **Troca do monitor principal e mudança de DPI** dependem de o Windows emitir `Moved` ou
  `ScaleFactorChanged` para a janela; se não emitir, o notch só se realinha na próxima
  expansão. Não testado com mais de um monitor.
- No topo, o puxador cobre 148 × 12 px do centro da borda, área que em janelas maximizadas
  pertence à barra de título; nas laterais, cobre 12 × 148 px, onde podem estar barras de
  rolagem ou painéis de outros aplicativos. Quem não quiser isso pode trocar a borda ou
  desativar o notch.
- **As posições laterais e a nova forma curva não foram verificadas no aplicativo real** além
  da geometria da janela; a transparência das abas depende da janela transparente.
- A transparência dos cantos arredondados não foi conferida visualmente (a captura usada nos
  testes não registra transparência).
- Leitores de tela e teclado: como a janela não recebe foco, o notch é operável apenas com o
  mouse. Todas as suas ações existem também na janela principal e na bandeja.

## Bandeja do sistema

`src-tauri/src/tray.rs`. Ícone com a dica "Compasso".

- **Clique esquerdo:** mostra a janela principal.
- **Clique direito:** menu.

| Item               | Ação                                                    |
| ------------------ | ------------------------------------------------------- |
| Abrir Compasso     | Mostra a janela principal                               |
| Iniciar ou retomar | `TimerService::start`                                   |
| Pausar             | `TimerService::pause`                                   |
| Pular sessão       | `TimerService::skip`                                    |
| Configurações      | Mostra a janela principal na tela de Configurações      |
| Encerrar           | Encerra o aplicativo, registrando a sessão em andamento |

Os itens do timer são fixos (não mudam de rótulo nem são desabilitados conforme o estado);
ações que não se aplicam são ignoradas pela engine. A dica do ícone não mostra o tempo
restante.

## Verificação manual

Roteiros e resultados em [TESTING.md](TESTING.md).
