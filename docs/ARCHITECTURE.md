# Arquitetura

Descreve o que **existe hoje** e os limites que o código futuro deve respeitar. O que ainda não
foi implementado aparece marcado como _planejado_; o progresso está em [ROADMAP.md](ROADMAP.md).

## Visão geral

```
Processo único (compasso.exe)
│
├── Rust — src-tauri/            regras de negócio, estado autoritativo, sistema operacional
│   ├── commands/                superfície exposta ao frontend (handlers finos)
│   ├── timer/                   engine do Pomodoro, sessões, ticker
│   ├── settings/                modelo, limites e persistência das configurações
│   ├── database/                conexão SQLite e migrations
│   ├── windows/ tray.rs         janela principal, notch e bandeja do sistema
│   ├── notifications/           som e notificação ao concluir uma sessão
│   ├── tasks/                   tarefas do Kanban
│   ├── routines/                rotinas e expediente: horários fixos do dia e o "horizonte"
│   ├── background.rs            imagem de fundo enviada pelo usuário
│   ├── analytics/               estatísticas do dashboard
│   ├── media/                   mídia em reprodução no sistema (aba de música)
│   ├── updater/                 atualização automática (Release do GitHub)
│   └── weather/                 previsão do tempo
│
├── WebView2 — src/              interface React; exibe estado e envia intenções
│
└── SQLite                       %APPDATA%\com.endriwmsi.compasso\compasso.db
```

Não há servidor HTTP nem processo auxiliar. Os únicos acessos à rede são a previsão do tempo
(opcional, desligada por padrão) e a verificação de atualizações
([ADR-004](decisions/ADR-004-NETWORK-FEATURES.md)); ambos partem do backend Rust.

## Limites de responsabilidade

| Camada | Responsável por                                                        | Não faz                                       |
| ------ | ---------------------------------------------------------------------- | --------------------------------------------- |
| Rust   | Regras de negócio, validação, persistência, timer, janelas, bandeja    | Decidir layout ou texto de interface          |
| React  | Renderização, interação, estado efêmero de interface (tela ativa etc.) | Contar tempo, acessar SQLite, regras críticas |
| SQLite | Fonte persistente dos dados locais                                     | —                                             |

A comunicação Rust ⇄ React acontece **somente** pelos comandos e eventos listados abaixo.

## Comandos e eventos

Esta seção é a fonte de verdade dos contratos. Todo comando precisa estar: implementado em
`src-tauri/src/commands/`, registrado em `generate_handler!` (`src-tauri/src/lib.rs`), tipado
em `src/lib/commands.ts` e listado aqui.

### Comandos

| Comando           | Entrada                  | Saída      | Erros                    | Consumidor                           |
| ----------------- | ------------------------ | ---------- | ------------------------ | ------------------------------------ |
| `app_info`        | —                        | `AppInfo`  | —                        | `features/settings/AboutSection.tsx` |
| `get_settings`    | —                        | `Settings` | `database`               | `stores/settings.ts` (`load`)        |
| `update_settings` | `{ settings: Settings }` | `Settings` | `validation`, `database` | `stores/settings.ts` (`save`)        |

Mais os comandos do timer — `timer_get_state`, `timer_start`, `timer_pause`, `timer_skip` e
`timer_reset` —, todos sem entrada, devolvendo `TimerSnapshot` e podendo falhar com `database`.
Consumidor: `stores/timer.ts`. Semântica, tipo e regras em
[TIMER_ENGINE.md](TIMER_ENGINE.md#contrato-com-o-frontend).

Comandos de rotinas (`commands/routines.rs`) — `routines_list`, `routine_create`,
`routine_update`, `routine_delete`, `routine_skip` — em [ROUTINES.md](ROUTINES.md). Comandos da
imagem de fundo (`commands/background.rs`) — `background_get_custom`, `background_set_custom` —
em [THEMING.md](THEMING.md#imagem-de-fundo).

Comandos de tarefas (`commands/tasks.rs`) — `tasks_list`, `task_create`, `task_update`,
`task_delete`, `task_move`, que devolvem `Task[]`, e `timer_set_task` e `timer_focus_task`, que
devolvem `TimerSnapshot`. Consumidores: `stores/tasks.ts` e `stores/timer.ts`. Contratos e
regras em [KANBAN.md](KANBAN.md).

Comandos de estatísticas (`commands/analytics.rs`): `analytics_dashboard`, usado por
`features/dashboard/DashboardPage.tsx`, e `analytics_periods`, usado por
`features/dashboard/MonthCalendar.tsx`. Contrato e definições em [ANALYTICS.md](ANALYTICS.md).

Comandos das abas do notch (`commands/notch.rs`): `weather_get` ([WEATHER.md](WEATHER.md)) e
`media_get_state`, `media_control`, `media_get_artwork`, `media_set_volume`, `media_seek`
([MEDIA.md](MEDIA.md)). Rodam em thread de trabalho, pois bloqueiam.

Comandos de atualização (`commands/updater.rs`): `update_pending`, `update_check` e
`update_install`, usados por `features/settings/UpdatesSection.tsx`. Contrato e regras em
[UPDATER.md](UPDATER.md).

Comandos de janela (`commands/window.rs`), descritos em
[WINDOW_MANAGER.md](WINDOW_MANAGER.md):
`notch_set_layout({ layout: 'collapsed' | 'expanded' | 'compact' })`, usado por
`notch/NotchApp.tsx`; `show_main_window({ view: string | null })`, usado pelo notch; e
`preview_alerts()`, usado por `features/settings/AlertsSection.tsx` (ver
[NOTIFICATIONS.md](NOTIFICATIONS.md)). `notch_set_layout` pode falhar com `internal`.

- `app_info` devolve `productName` de `tauri.conf.json` e a versão de `src-tauri/Cargo.toml`.
- `get_settings` não falha por dados ruins: seções ausentes ou ilegíveis voltam ao padrão (ver
  [DATABASE.md](DATABASE.md#configurações-padrões-limites-e-regras)).
- `update_settings` **substitui todas** as configurações. Quem chama deve enviar o objeto
  completo (o frontend parte do estado atual e altera só o que mudou). Retorna o que ficou
  gravado. Depois de gravar: avisa o timer (novos valores a partir da próxima sessão), mostra ou
  esconde o notch e emite `settings:changed`. Em caso de erro de validação nada é escrito.
- Comandos que acessam o banco são `async` para não rodarem na thread principal.

### Tipos

```ts
interface AppInfo {
  name: string;
  version: string;
}

interface Settings {
  appearance: {
    template: 'glass' | 'matrix' | 'signal' | 'relief';
    // Imagem de fundo: a padrão, nenhuma, uma embutida pelo nome ou a do usuário.
    background:
      | { kind: 'default' }
      | { kind: 'none' }
      | { kind: 'builtin'; name: string }
      | { kind: 'custom' };
  };
  timer: {
    focusMinutes: number; // 1–180
    shortBreakMinutes: number; // 1–60
    longBreakMinutes: number; // 1–120
    cyclesBeforeLongBreak: number; // 1–12
    autoStartBreaks: boolean;
    autoStartFocus: boolean;
  };
  notch: {
    enabled: boolean;
    position: 'top' | 'left' | 'right';
    theme: 'dark' | 'light' | 'system'; // cor do notch
  };
  alerts: { soundEnabled: boolean; notificationsEnabled: boolean };
  goals: { dailyPomodoros: number | null }; // 1–50, ou null
  weather: { enabled: boolean; useLocation: boolean };
  general: { launchAtLogin: boolean }; // iniciar com o Windows
  workday: { enabled: boolean; startMinute: number; endMinute: number }; // expediente
  updates: { autoUpdate: boolean }; // consultar a Release ao abrir (padrão true)
}
```

### Erros

Comandos rejeitam com `AppError` (`src-tauri/src/error.rs`):

```ts
type AppError =
  | { kind: 'validation'; field: string; message: string } // field: ex. "timer.focusMinutes"
  | { kind: 'database'; message: string }
  | { kind: 'notFound'; message: string } // o item não existe (mais), ex.: tarefa excluída
  | { kind: 'network'; message: string } // sem conexão (só a previsão do tempo)
  | { kind: 'internal'; message: string }; // falha de janela, evento ou API do sistema
```

`message` está em português e pode ser exibida ao usuário. Se os argumentos nem desserializarem
(tipo errado, template desconhecido), o próprio Tauri rejeita com uma _string_; `toAppError`
(`src/lib/errors.ts`) converte qualquer rejeição para `AppError`, usando `kind: 'unknown'`
nesse caso.

### Eventos

| Evento        | Payload         | Quando                                                                         | Consumidor                          |
| ------------- | --------------- | ------------------------------------------------------------------------------ | ----------------------------------- |
| `timer:state` | `TimerSnapshot` | A cada transição do timer e, com a sessão rodando, uma vez por segundo exibido | `lib/events.ts` → `stores/timer.ts` |

| `settings:changed` | `Settings` | Depois de `update_settings` gravar | `lib/events.ts` → `stores/settings.ts` |
| `tasks:changed` | — | Depois de qualquer alteração no quadro e ao concluir um foco | `lib/events.ts` → `stores/tasks.ts` |
| `routines:changed` | — | Depois de criar, alterar ou excluir uma rotina | `lib/events.ts` → `stores/routines.ts` |
| `app:navigate` | nome da tela (`string`) | Bandeja ou notch pedem uma tela; enviado só à janela `main` | `lib/events.ts` → `app/App.tsx` |

`timer:state`, `settings:changed` e `tasks:changed` vão para todas as janelas: é assim que a janela principal e
o notch permanecem sincronizados sem estado próprio. A interface também usa o evento interno
de redimensionamento da janela (`onResized`).

## Frontend (`src/`)

```
src/
├── main.tsx                 ponto de entrada das duas janelas; monta <App /> ou <NotchApp />
├── app/
│   ├── App.tsx              tela ativa, carga das configurações, aplicação do template
│   ├── navigation.ts        ViewId, NAV_ITEMS — única lista de telas
│   ├── templates.ts         TEMPLATES, applyTemplate, dica em localStorage
│   └── background.ts        resolve a imagem de fundo opcional
├── components/
│   ├── layout/              AppShell, Sidebar, TitleBar, WindowControls
│   └── ui/                  Panel, PanelLabel, PageHeader, PendingFeature, MetricValue,
│                            DotMatrixText, DotColumns, dotMatrix.ts, CheckboxField, NumberInput;
│                            checkbox.tsx, select.tsx e dialog.tsx (shadcn/ui)
├── features/
│   ├── dashboard/           indicadores do dia, gráfico semanal (WeekChart) e calendário
│   │                        do mês (MonthCalendar)
│   ├── pomodoro/            tela do timer (exibe o snapshot do backend)
│   ├── kanban/              quadro, cartão, diálogo de tarefa e board.ts (lógica pura)
│   ├── routines/            tela Rotina (expediente, faixa do dia, lista), diálogo e schedule.ts
│   └── settings/            AppearanceSection, GeneralSection, TimerSection, GoalsSection,
│                            NotchSection, AlertsSection, WeatherSection, AboutSection
├── notch/                   NotchApp (painel e abas), TimerTab, TasksTab, MediaTab, WeatherTab,
│                            MiniPlayer, SeekBar, VolumeSlider, shape.ts (forma e layouts)
├── stores/
│   ├── settings.ts          store Zustand das configurações; useTemplate()
│   ├── timer.ts             espelho do timer: último TimerSnapshot recebido
│   ├── tasks.ts             espelho do quadro: última lista de tarefas recebida
│   ├── routines.ts          espelho das rotinas
│   ├── background.ts        conteúdo da imagem de fundo enviada pelo usuário
│   └── media.ts             mídia em reprodução (compartilhada pelos players do notch)
├── lib/
│   ├── commands.ts          wrappers tipados de `invoke` e tipos espelhados
│   ├── errors.ts            toAppError
│   ├── events.ts            assinatura de eventos do backend
│   ├── format.ts            formatação de tempo
│   ├── calendar.ts          dias e semanas no fuso local (limites das estatísticas)
│   ├── utils.ts             cn() — junta classes (padrão shadcn/ui)
│   └── window.ts            controles da janela; no-op fora do Tauri
├── styles/globals.css       Tailwind v4, tokens (@theme) e blocos por template
└── test/setup.ts            jest-dom + limpeza entre testes
```

Regras:

- Componentes não chamam `invoke` nem `getCurrentWindow` diretamente; usam `src/lib/` ou uma
  store.
- Tudo que depende do runtime nativo verifica `isTauri()`, para que a interface renderize no
  navegador e nos testes. Fora do Tauri a store de configurações usa os padrões e "salva"
  apenas em memória.
- **Estado compartilhado** fica em stores Zustand (`src/stores/`), que guardam o valor
  confirmado pelo backend — nunca um palpite otimista. Estado de uma única tela fica em
  `useState`.
- Para adicionar uma tela: inclua o `ViewId` e o item em `navigation.ts` e o componente no mapa
  `VIEWS` de `App.tsx`.

### Linguagem visual

- Moldura preta (`--color-shell`) com barra lateral estreita de ícones à esquerda; a área de
  conteúdo é um painel de cantos arredondados (`--radius-panel`) com imagem de fundo.
- O conteúdo de cada tela fica em uma coluna centralizada de largura máxima `max-w-6xl`
  (`AppShell`).
- Conteúdo em painéis (`Panel`, classe `.panel`) cuja aparência vem dos tokens do **template de
  estilização** ativo — ver [THEMING.md](THEMING.md).
- **Imagem de fundo:** coloque `background.png` (ou `.jpg`, `.jpeg`, `.webp`, `.avif`) em
  `src/assets/`. `app/background.ts` a detecta em tempo de build via `import.meta.glob`; sem
  arquivo, usa-se o gradiente `.app-background-fallback`. A imagem é empacotada no executável —
  nada é carregado da rede.
- Sem barra de título nativa; ver [WINDOW_MANAGER.md](WINDOW_MANAGER.md).

## Backend (`src-tauri/`)

```
src-tauri/
├── Cargo.toml               crate `compasso`, biblioteca `compasso_lib`
├── tauri.conf.json          janelas (principal e notch), CSP, bundle
├── capabilities/            default.json (janela `main`), notch.json (janela `notch`)
├── migrations/              SQL versionado (embutido no executável)
├── app-icon.png             fonte dos ícones (provisório) — `npm run tauri icon`
├── icons/                   gerado a partir de app-icon.png
└── src/
    ├── main.rs              chama compasso_lib::run()
    ├── lib.rs               abre o banco, cria o timer e o ticker, registra comandos
    ├── error.rs             AppError (contrato de erro com o frontend)
    ├── commands/            analytics.rs, app.rs, notch.rs, settings.rs, tasks.rs, timer.rs,
    │                        window.rs
    ├── database/            mod.rs (Database, DatabaseError), migrations.rs
    ├── settings/            mod.rs (modelo, limites, validação), store.rs (SQL)
    ├── timer/               engine.rs (estados), clock.rs, store.rs (SQL), mod.rs (serviço)
    ├── windows/             mod.rs (janela principal), notch.rs (geometria e estado)
    ├── notifications/       mod.rs (Alerts, textos), sound.rs (síntese e reprodução)
    ├── tasks/               mod.rs (modelo, validação), store.rs (SQL, ordem do quadro)
    ├── routines/            mod.rs (modelo, validação, horizonte), store.rs (SQL)
    ├── background.rs        guarda e lê a imagem de fundo do usuário
    ├── analytics/           mod.rs (totais por período, a partir de sessões e tarefas)
    ├── media/               mod.rs (sessão de mídia e volume do Windows)
    ├── weather/             mod.rs (provedor, cache de 15 min), location.rs (localização)
    └── tray.rs              ícone e menu da bandeja
```

Dependências entre módulos: `commands → tasks, timer, settings, database, error`;
`tasks → error` (seus testes usam `timer::store` para criar sessões);
`timer → settings, database, error`; `settings → error`; `database → error`. Módulos de domínio não conhecem o Tauri — recebem uma `&Connection` e são
testados sem janela.

O banco e o serviço do timer são estados do Tauri (`Arc<Database>`, `Arc<TimerService>`). Ordem
de locks: primeiro o do timer, depois o do banco — nunca o inverso.

Todos os módulos de domínio previstos existem; `analytics` só lê (`tasks` e
`pomodoro_sessions`).

## Segurança

- **Capabilities:** `capabilities/default.json` vale só para a janela `main` e concede apenas
  ouvir/cancelar eventos e minimizar, maximizar, consultar `is-maximized`, fechar e arrastar a
  janela; `capabilities/notch.json` concede à janela `notch` apenas ouvir/cancelar eventos. Não
  se usa `core:default`. Comandos próprios do aplicativo não exigem permissão
  adicional.
- **CSP** (`tauri.conf.json`): `default-src 'self'`; imagens de `'self'` e `data:`; estilos com
  `'unsafe-inline'` (necessário para o atributo `style` da imagem de fundo); `connect-src`
  apenas para o IPC do Tauri. `devCsp` é `null` para não bloquear o HMR do Vite em
  desenvolvimento.
- **SQL** sempre parametrizado; entradas validadas no Rust antes de qualquer escrita.
- Sem `eval`, sem conteúdo remoto, sem plugins de shell/fs/http/sql. Os plugins em uso
  (`single-instance`, `notification`, `autostart`, `updater`) são chamados só pelo Rust; nenhuma permissão deles é
  concedida ao frontend.
- **Rede:** só o backend. Previsão do tempo, só com `weather.enabled`: `api.open-meteo.com` e —
  com `weather.useLocation` — `nominatim.openstreetmap.org` (nome da cidade). Atualização, com
  `updates.autoUpdate` ou pelo botão "Verificar agora": `github.com` (o `latest.json` e o
  instalador da última Release), com a assinatura conferida antes de executar. A CSP do
  WebView não tem destinos externos.
- Blocos `unsafe` apenas em chamadas diretas a APIs do Windows: `PlaySoundW`
  (`notifications/sound.rs`), volume do sistema (`media/mod.rs`) e a caixa de erro da
  inicialização (`lib.rs`).
- Se a inicialização falhar (por exemplo, banco ilegível), o aplicativo mostra uma caixa de
  erro nativa e encerra, sem alterar os dados.

## Versão do aplicativo

A versão exibida vem de `src-tauri/Cargo.toml`. `package.json` repete o número e deve ser
atualizado junto (nenhuma automação ainda).
