# ADR-001 — Stack tecnológica

- **Status:** aceita
- **Data:** 2026-10-13

## Contexto

O Compasso é um aplicativo desktop para Windows, local e offline, que precisa iniciar rápido,
consumir pouca RAM/CPU em repouso, manter um timer confiável com a janela minimizada e exibir
uma segunda janela (notch) sempre no topo. Não há backend remoto.

Ambiente verificado em 2026-10-13: Windows 11 Pro 10.0.26200, Rust 1.97.1 (MSVC), Node 24.13,
npm 11.6, Build Tools do Visual Studio 18 com a carga C++, WebView2 Runtime 154.

## Decisão

| Camada         | Escolha                                                  | Versão instalada |
| -------------- | -------------------------------------------------------- | ---------------- |
| Shell desktop  | Tauri 2                                                  | 2.12             |
| Backend nativo | Rust (edition 2021)                                      | 1.97.1           |
| Interface      | React + TypeScript estrito                               | 19.3 / 6.0       |
| Bundler        | Vite                                                     | 8.3              |
| Estilo         | Tailwind CSS v4 (plugin Vite)                            | 4.3              |
| Ícones         | lucide-react                                             | 1.56             |
| Testes (front) | Vitest + React Testing Library + jsdom                   | 5.0 / 16.3       |
| Testes (Rust)  | `cargo test`                                             | —                |
| Qualidade      | ESLint 10 + typescript-eslint, Prettier, rustfmt, Clippy | —                |
| Pacotes        | npm                                                      | 11.6             |

Persistência (SQLite), estado compartilhado (Zustand), drag-and-drop (dnd-kit) e shadcn/ui
estão previstos, mas **só entram quando a fase que os utiliza começar** — nenhuma dependência é
instalada sem consumidor.

## Justificativas e alternativas

- **Tauri 2 em vez de Electron:** usa o WebView2 já presente no Windows, sem embutir um
  Chromium; binário e memória em repouso muito menores, e o backend em Rust atende ao requisito
  de timer autoritativo fora da interface. Tauri 3 existe apenas como alpha e foi descartado.
- **TypeScript 6.0 em vez de 7.0:** `typescript-eslint` 8.71 declara suporte a
  `typescript >=4.8.4 <6.1.0`. Fixado em `~6.0.3` até o lint com tipos suportar a 7.
- **npm em vez de pnpm/bun:** já vem com o Node, é o padrão dos templates do Tauri e evita um
  pré-requisito extra. Não há monorepo que justifique outro gerenciador.
- **Fontes do sistema (Segoe UI Variable):** nenhuma fonte é baixada ou empacotada; o
  aplicativo é offline e só roda no Windows.
- **Navegação por estado local em vez de biblioteca de rotas:** são quatro telas sem URL nem
  histórico. Reavaliar apenas se surgir navegação aninhada.
- **Camada de banco (SQLx × rusqlite):** adiada para um ADR próprio na Fase 2, quando houver
  código para comparar.

## Consequências

- Requer WebView2 Runtime na máquina do usuário (presente por padrão no Windows 11; o
  instalador deverá tratar o Windows 10 na Fase 8).
- A interface depende do motor Chromium do WebView2: o alvo de build é `chrome111`.
- A atualização para TypeScript 7 fica pendente do `typescript-eslint`.
- `identifier` (`com.endriwmsi.compasso`) define o diretório de dados do aplicativo. Alterá-lo
  agora que há banco de dados deixaria os dados antigos órfãos.

## Atualizações

- 2026-10-13 — Fase 2: adotados `rusqlite` (ver [ADR-003](ADR-003-DATABASE-LAYER.md)) e
  Zustand 5 (store de configurações). O produto foi renomeado de "Focus" para "Compasso".
- 2026-10-13 — Fase 4: habilitada a feature `tray-icon` do Tauri e adotado o plugin oficial
  `tauri-plugin-single-instance`. Com o aplicativo vivendo na bandeja, abrir de novo pelo menu
  Iniciar precisa mostrar a janela existente em vez de criar um segundo processo (que disputaria
  o banco e criaria outro notch). Nenhuma API nativa do Windows foi necessária para o notch: as
  opções de janela do Tauri 2.12 (`focusable`, `alwaysOnTop`, `transparent`, `skipTaskbar`)
  bastaram para o que foi verificado até aqui.
- 2026-10-13 — Fase 5 e ajustes de interface:
  - `tauri-plugin-notification` (oficial) para as notificações do Windows;
  - `windows-sys` (só `Win32_Media_Audio`) para tocar o som com `PlaySoundW`. Alternativas
    descartadas: `rodio`/`cpal` (uma pilha de áudio inteira para tocar dois sinos curtos) e
    tocar pelo WebView (depende de uma janela viva e esbarra na política de reprodução
    automática);
  - os sons são sintetizados em memória, sem arquivos de áudio;
  - `radix-ui`, `clsx` e `tailwind-merge` para os componentes shadcn/ui (checkbox e select),
    adaptados aos tokens dos templates — ver `docs/THEMING.md`.
- 2026-10-13 — Fase 6: `@dnd-kit/core`, `@dnd-kit/sortable` e `@dnd-kit/utilities` para o
  arrastar e soltar do Kanban (já previstos nesta decisão). Escolhidos por terem sensor de
  teclado e anúncios para leitores de tela embutidos. O diálogo de tarefa usa Dialog e
  AlertDialog do Radix, já presentes.
- 2026-10-13 — Abas de música e clima: `windows` (APIs de mídia, áudio e localização), `ureq`
  (HTTP da previsão do tempo) e `base64` (capa das músicas). Justificativas e limites em
  [ADR-004](ADR-004-NETWORK-FEATURES.md), que também ajusta a premissa de aplicativo sem rede.
- 2026-10-13 — `chrono` (só o recurso `clock`) para a diferença entre o horário local e o UTC
  usada por rotinas e expediente. Substituiu uma chamada a `GetTimeZoneInformation`: funciona
  igual em Windows, Linux e macOS e dispensa `unsafe`. Passaram a ser gerados pacotes
  experimentais para Linux e macOS (ver `docs/RELEASING.md`); o Windows segue sendo a
  plataforma de referência.
- 2026-10-13 — Iniciar com o Windows: plugin oficial `tauri-plugin-autostart`, que grava a
  entrada em `HKCU\…\CurrentVersion\Run` (por usuário, sem exigir administrador). Alternativa
  descartada: escrever no registro com `windows-sys` — mesmo efeito, com código `unsafe`
  próprio para manter. O plugin é chamado só pelo Rust; nenhuma permissão dele é concedida ao
  frontend.
