# Changelog

Mudanças relevantes para usuários e desenvolvedores. Formato inspirado em
[Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões seguem SemVer.

## [Não lançado]

### Corrigido

- O workflow Release gerava um `latest.json` incompleto quando as plataformas terminavam ao
  mesmo tempo: na v0.3.3 ele ficou só com o Windows (Linux e macOS não veriam a atualização) e
  o job do macOS (Apple Silicon) falhou. Agora os jobs de compilação não escrevem o arquivo; um
  job final o monta a partir das assinaturas publicadas (`scripts/updater-json.mjs`, workflow
  `updater-json.yml`), que também pode ser rodado à mão para refazer o arquivo de uma Release.

## [0.3.3] — 2026-10-19

### Adicionado

- **O início de uma rotina também abre o notch** por uns 3 segundos, com o nome da rotina e a
  duração dela, como já acontece ao fim de cada foco e pausa. Usa o mesmo evento
  `notch:notice` e a mesma opção em Configurações → Notch, cujo texto passa a citar as rotinas.

## [0.3.2] — 2026-10-19

### Adicionado

- **Aviso no notch ao fim de cada foco e pausa.** Quando uma sessão termina, o notch se abre
  sozinho na aba Timer, mostra o que terminou e o que vem a seguir (o mesmo texto da
  notificação do Windows) e se recolhe depois de uns 3 segundos, voltando à aba em que estava.
  Com o mouse sobre o notch ou o painel fixado, o aviso aparece sem recolher. Opção em
  Configurações → Notch (ligada por padrão). Novo evento `notch:notice`, enviado só à janela do
  notch, e campo de configuração `notch.notices`.

## [0.3.1] — 2026-10-15

### Corrigido

- O workflow Release falhava logo no início nos quatro sistemas: como o repositório tem
  `pnpm-lock.yaml` além do `package-lock.json`, a ação `tauri-apps/tauri-action` escolhia o pnpm,
  que o workflow não instala. Agora ela usa `npx tauri`. A versão 0.3.0 chegou a ser etiquetada,
  mas **nunca foi publicada** no GitHub; a primeira Release com o atualizador é a seguinte.

## [0.3.0] — 2026-10-15

### Adicionado

- **Atualização automática.** Ao abrir, o Compasso consulta a última Release do GitHub e, havendo
  versão nova, baixa, confere a assinatura, instala e reinicia sozinho. Opção em Configurações →
  Atualizações (ligada por padrão), com botão "Verificar agora". Usa `tauri-plugin-updater`;
  comandos `update_pending`, `update_check` e `update_install`; nova seção de configurações
  `updates` (`autoUpdate`). Documentado em `docs/UPDATER.md`; ADR-004 revisado (segunda exceção
  de rede). A primeira versão com o atualizador precisa ser instalada à mão.
- **Publicação com um comando:** `npm run release -- patch|minor|major|X.Y.Z` confere o
  repositório, roda `npm run check`, fecha o CHANGELOG, define a versão, cria o commit e a tag e
  envia. O workflow Release assina os pacotes, publica o `latest.json` e usa o texto do
  CHANGELOG como notas da Release.

### Alterado

- O workflow Release exige o secret `TAURI_SIGNING_PRIVATE_KEY` (chave gratuita do Tauri; ver
  `docs/RELEASING.md`). Gerar o instalador localmente passa a exigir a mesma chave, a menos que
  seja com `--no-bundle`.
- O texto de boas-vindas do instalador, `AGENTS.md`, `README.md` e as Configurações deixam de
  dizer que o clima é a única função que usa a rede.

## [0.2.0] — 2026-10-15

Primeira versão numerada desde a 0.1.0, que só existiu como instalador local, sem publicação
nem seção própria. Por isso, o que veio nela também está listado aqui.

### Adicionado

- Scaffold do aplicativo: Tauri 2 + Rust no backend, React 19 + TypeScript estrito + Vite +
  Tailwind CSS v4 no frontend.
- Janela principal sem decoração nativa, com botões próprios de minimizar, maximizar/restaurar
  e fechar no canto superior direito e regiões de arraste na faixa superior e na barra lateral.
- Estrutura visual: moldura preta, barra lateral de ícones, painel de conteúdo arredondado com
  imagem de fundo opcional (`src/assets/background.*`, com gradiente de fallback) e superfícies
  translúcidas.
- Navegação entre Dashboard, Pomodoro, Kanban e Configurações. Dashboard com a estrutura dos
  indicadores e do gráfico semanal, ainda sem dados; Pomodoro e Kanban com estados vazios.
- Comando Tauri `app_info` e painel "Sobre" em Configurações.
- Capabilities mínimas para a janela `main` e CSP restritiva.
- Ferramentas de qualidade: ESLint (typescript-eslint com tipos), Prettier, Vitest + Testing
  Library, rustfmt, Clippy e o script agregador `npm run check`.
- Documentação inicial: `AGENTS.md`, `CLAUDE.md`, `README.md`, `docs/` (arquitetura, roadmap,
  desenvolvimento, janelas, testes, troubleshooting) e os ADRs 001 (stack) e 002 (diretrizes
  da engine do timer).

- Persistência local em SQLite (`rusqlite` com SQLite embutido) no diretório de dados do
  aplicativo, com migrations versionadas e transacionais.
- Configurações persistidas e validadas no backend: comandos `get_settings` e
  `update_settings`, com erros tipados (`AppError`).
- Tela de Configurações com os parâmetros do Pomodoro (foco, pausas, ciclos, início
  automático). Os valores são gravados, mas só terão efeito quando o timer existir.
- Templates de estilização selecionáveis em Configurações: **Vidro** (padrão) e **Matriz**
  (painéis escuros, texto monoespaçado, leituras e gráfico em matriz de pontos).
- Componentes `DotMatrixText` e `DotColumns`; store de configurações com Zustand.
- Documentos `docs/DATABASE.md`, `docs/THEMING.md` e ADR-003 (camada de banco).

- **Timer do Pomodoro** com engine em Rust: máquina de estados (fase × situação), contagem
  pelo relógio monotônico, thread de ticker independente das janelas, pausa automática ao
  detectar suspensão do computador e conclusão registrada uma única vez.
- Comandos `timer_get_state`, `timer_start`, `timer_pause`, `timer_skip`, `timer_reset` e
  evento `timer:state`.
- Registro de todas as sessões em `pomodoro_sessions` (migration `0002`), com checkpoints a
  cada 10 s, encerramento ordenado e recuperação de sessões interrompidas por queda. A posição
  no ciclo sobrevive ao reinício (`timer_state`).
- Tela de Pomodoro: tempo, fase, progresso, posição no ciclo e controles de iniciar, pausar,
  retomar, pular e reiniciar, nos templates Vidro e Matriz.
- Documento `docs/TIMER_ENGINE.md`.

- **Notch**: janela pequena, sempre no topo e que não toma o foco, centralizada na borda
  superior do monitor principal. Expande ao passar o mouse para mostrar o timer e os controles
  (iniciar/pausar, pular, abrir o aplicativo), recolhe sozinha e pode ser fixada aberta. Pode
  ser desativada em Configurações → Notch.
- **Bandeja do sistema** com menu: abrir, iniciar ou retomar, pausar, pular, configurações e
  encerrar.
- Instância única (`tauri-plugin-single-instance`): executar o aplicativo de novo traz a janela
  existente.
- Evento `settings:changed`, que mantém as janelas sincronizadas, e `app:navigate`.
- Barras de rolagem no estilo do template ativo.
- **Avisos ao concluir uma sessão**: som (dois sinos sintetizados em memória, um para o fim do
  foco e outro para o fim da pausa) e notificação do Windows, cada um com sua opção em
  Configurações → Avisos e um botão "Testar aviso". Disparados exatamente uma vez por sessão
  concluída.
- Notificação, uma vez por execução, avisando que o aplicativo continua na bandeja ao fechar a
  janela.
- **Posição do notch** configurável: topo, lateral esquerda ou lateral direita.
- Componentes `checkbox` e `select` do shadcn/ui, adaptados aos tokens dos templates.
- Documento `docs/NOTIFICATIONS.md`.
- **Kanban**: tarefas com título, descrição, prioridade, prazo e estimativa de pomodoros, em
  três colunas (A fazer, Em andamento, Concluído). Criar, editar, excluir com confirmação,
  arrastar e soltar, e mover por botões no cartão ou pelo teclado. A ordem é gravada de forma
  transacional (migration `0003`).
- **Foco dedicado a uma tarefa**: botão "Focar nesta tarefa" no cartão e no notch; cada sessão
  de foco fica associada à tarefa escolhida e o cartão mostra os pomodoros concluídos. O timer
  continua funcionando sem tarefa.
- **Abas no notch**, alternadas pela roda do mouse ou por clique, com seletor animado: Timer e
  **Tarefas** (tarefas abertas, com Focar e uma caixa para concluir).
- Comandos `tasks_list`, `task_create`, `task_update`, `task_delete`, `task_move`,
  `timer_set_task` e `timer_focus_task`; evento `tasks:changed`; erro `notFound`.
- Componente `dialog` (Dialog e AlertDialog) do shadcn/ui. Documento `docs/KANBAN.md`.
- **Dashboard com dados reais**: pomodoros concluídos, tempo de foco, tarefas concluídas e em
  andamento do dia, e gráfico semanal (segunda a domingo) com navegação entre semanas — tudo
  calculado das sessões e tarefas gravadas (comando `analytics_dashboard`, migration `0004`).
- **Meta diária** opcional de pomodoros (Configurações → Meta diária), com barra de progresso
  no dashboard.
- **Cores de prioridade** nas tarefas: azul (baixa), amarelo ou verde (média, conforme o
  template) e a cor de destaque (alta).
- Componente `NumberInput`: campos numéricos com setas no estilo do template.
- Documento `docs/ANALYTICS.md`.
- **Aba Música no notch**: mostra a faixa em reprodução em outros aplicativos (título, artista
  e capa) e permite voltar, tocar/pausar, avançar e ajustar o volume do sistema. Com música
  tocando, o notch abre direto nessa aba.
- **Aba Clima no notch** (opcional, desligada por padrão): previsão pela localização do
  computador, se permitida, ou das maiores capitais de cada região. É a única função que usa a
  internet; consulta o Open-Meteo no máximo uma vez a cada 15 minutos.
- Caixa de erro nativa quando o aplicativo não consegue iniciar (banco ilegível ou de versão
  mais nova).
- **Instalador para Windows** (NSIS), gerado por `npm run tauri build`.
- Documentos `docs/WEATHER.md`, `docs/MEDIA.md` e ADR-004.
- **Calendário no dashboard**: mês com o dia de hoje em destaque e marcadores por dia — foco
  concluído, tarefa concluída e prazo de tarefa (comando `analytics_periods`).
- **Player de música em todas as abas do notch**: versão compacta à direita do conteúdo. Na aba
  Música aparece só o player completo, e o notch fica menor.
- Botões de **ordem aleatória** e **repetição** no player, e **controle de volume vertical**.
- **Barra de progresso da faixa** nos dois players do notch, com o tempo decorrido e o total;
  arrastar (ou as setas do teclado) muda a posição. Comando `media_seek`; `MediaState` ganhou
  `positionMs`, `durationMs` e `canSeek`.
- **Cor do notch** (Configurações → Notch → Cor): preto, branco ou seguir o modo claro ou
  escuro do Windows (`notch.theme`; o padrão é seguir o sistema). A cor não depende do template; um notch de
  vidro com desfoque foi experimentado e descartado.
- **Publicação automática**: workflows do GitHub Actions para verificar cada push (Windows,
  Linux e macOS) e, a cada tag `v*`, gerar e publicar os instaladores para os três sistemas.
  Script `npm run release:version`; documento `docs/RELEASING.md`. Linux e macOS são
  experimentais.

- **Dois templates novos**: **Sinal** (painel de telemetria: quase preto, rótulos monoespaçados
  e blocos verdes) e **Relevo** (claro e macio, em neumorfismo, sem imagem de fundo).
- Aba Timer do notch com os pontos do ciclo e uma barra de progresso da sessão.
- `scripts/demo-data.mjs`: cria um banco de exemplo em uma pasta à parte; a variável
  `COMPASSO_DATA_DIR` faz o aplicativo usar essa pasta. Capturas do README e imagens do
  instalador refeitas com esses dados.

- **Rotinas e expediente** (tela Rotina): atividades em horário fixo que se repetem ("Hora do
  café") e um horário de expediente opcional. O timer encaixa os ciclos nesses horários: o foco
  antes de uma rotina é encurtado para terminar na hora, a pausa absorve sobras pequenas, o
  último foco termina com o expediente e nada começa sozinho fora dele. Durante a rotina o
  timer espera (o foco em andamento é pausado e retomado sozinho) e há "Pular a rotina". Focos
  encurtados contam tempo, mas não somam pomodoro. Avisos ao começar uma rotina e ao fim do
  expediente. Migration `0005`; comandos `routines_list`, `routine_create`, `routine_update`,
  `routine_delete`, `routine_skip`; evento `routines:changed`; `TimerSnapshot` ganhou
  `routineId`, `routineRemainingMs` e `short`; documento `docs/ROUTINES.md`.
- **Imagem de fundo configurável** (Configurações): escolha entre as imagens que vêm com o
  aplicativo, nenhuma, ou envie a sua (PNG, JPEG ou WebP de até 12 MB), que é copiada para os
  dados do Compasso. Comandos `background_get_custom` e `background_set_custom`; configuração
  `appearance.background`.

- **Instalador personalizado**, em português: página de apresentação com capturas do
  aplicativo, boas-vindas explicando que tudo é local e sem rastreamento, licença MIT, barra
  lateral e cabeçalho com a identidade do Compasso e link do autor na conclusão.
- Arquivo `LICENSE` (MIT) e README com capturas de tela, passo a passo de instalação e de
  pré-visualização.
- **Iniciar com o Windows** (Configurações → Geral), desligado por padrão: abre o Compasso no
  painel ao entrar na sessão. Nova seção de configurações `general` (`launchAtLogin`) e plugin
  `tauri-plugin-autostart`.
- Previsão **hora a hora** na aba Clima.
- **Cidade, estado e país** na previsão por localização, obtidos do Nominatim (OpenStreetMap)
  com as mesmas coordenadas aproximadas — um segundo serviço de rede, só com a opção de
  localização ligada (ADR-004 revisado). Sem resposta dele: "Região de \<capital\>" a até
  100 km de uma capital, ou "Sua localização". `WeatherPlace` ganhou `detail`.
- **Borda animada no notch recolhido** (Configurações → Notch), desligada por padrão: uma faixa
  de cor que segue o contorno do notch fechado da ponta de uma aba à da outra, com 2 px no lado
  comprido e afinando nos cantos até 1 px ao longo das abas, colorida ou de uma cor escolhida
  pelo usuário. Com ela ligada, a lasca entre a aba e o canto do corpo é preenchida e a ponta
  da aba, aparada, para o contorno ser uma curva só. Campo novo
  `notch.border` (`enabled`, `style` `rainbow` | `solid`, `color` `#rrggbb`, validada no
  backend); sem migration. `windows::notch::configure` passou a receber
  `&NotchSettings`, que deixou de ser `Copy`.
- Seletor de cor no estilo do shadcn/ui (`components/ui/ColorPicker.tsx`, sobre `Popover` e
  `Slider` do `radix-ui`, já instalado): área de saturação e brilho, faixa de matiz, código
  hexadecimal e cores prontas. Usado na cor da borda do notch no lugar do seletor nativo.

### Alterado

- Controles da janela principal redesenhados: três pontos coloridos (minimizar, maximizar/
  restaurar, fechar) em uma cápsula, cada um com seu símbolo. Novos tokens `--color-window-*`.
- O fuso local (rotinas e expediente) passou a ser lido com a crate `chrono`, que funciona em
  todos os sistemas, em vez de uma chamada direta à API do Windows — um bloco `unsafe` a menos.
- `tauri.conf.json`: ícone `.icns` e `macOSPrivateApi`, para o pacote do macOS e a janela
  transparente do notch nele.

### Corrigido

- Campos de horário do expediente (tela Rotina): digitar "17" no fim do expediente era recusado
  porque cada tecla gravava na hora ("1" virava 01:00, antes do início). Agora o horário é
  gravado ao sair do campo ou com Enter; um horário incompleto volta ao valor gravado.

- **Notch mais largo no topo** (628 × 216): o player compacto passou a ocupar 160 px, com capa
  maior e os tempos da faixa. Na aba Timer os controles ficam junto do relógio, e na aba
  Tarefas as linhas são maiores e centralizadas na altura.

- A imagem de fundo embutida mudou de `src/assets/background.*` para a pasta
  `src/assets/backgrounds/`; novas imagens entram só por estarem lá.
- `Settings` deixou de ser `Copy` no backend (a escolha do fundo carrega um nome).

- **O notch não pula mais para a aba Música** quando há algo tocando: abre sempre na aba em que
  estava (o player já aparece em todas).
- **Notch mais alto**: 588 × 216 expandido e 428 × 216 na aba Música (antes 156 de altura), com
  mais folga embaixo; nas laterais, 260 × 428 e 260 × 388.
- **Player nas laterais totalmente empilhado**: capa, faixa, controles, progresso e, por último,
  o volume deitado (antes ficava em pé, ao lado).
- **Ícones do clima coloridos** (sol laranja, nuvens cinza, chuva azul, lua à noite), no lugar
  dos ícones de traço de uma cor só.
- **Aba Clima redesenhada**: lugar centralizado no topo, temperatura de um lado e condição do
  outro (juntos, com vento e umidade ao lado), e a previsão das próximas horas embaixo, com
  separadores entre elas. As capitais aparecem uma por vez, trocadas
  por setas (antes: uma lista). A previsão dos próximos dias saiu da aba.

- **Fechar a janela principal agora a envia para a bandeja**; o aplicativo só encerra pelo item
  "Encerrar" do menu da bandeja.
- Template **Vidro** redesenhado: painéis de vidro fumê com brilho suave, cantos mais
  arredondados, números maiores e destaque âmbar (antes: painéis azulados e destaque branco).
- Configurações ganham a seção `notch` (`enabled`); `AppError` ganha o tipo `internal`.
- **Notch com forma curva**: abas côncavas ligam o corpo à borda da tela e os cantos ficaram
  mais arredondados. A janela do notch passou a medir 148 × 12 recolhida e 368 × 108 (topo) ou
  176 × 208 (laterais) expandida.
- As opções das Configurações usam checkboxes do shadcn/ui em vez dos controles nativos.
- O conteúdo das telas passou a ocupar até `max-w-6xl` (antes `max-w-4xl`).
- **Seletor de abas do notch** virou um carrossel: o ícone selecionado fica no centro, colorido
  e maior, e a troca tem um movimento "de mola". Nas laterais o seletor fica em pé e as abas
  deslizam na vertical; o painel lateral passou a 260 × 298.
- **O volume do player passou a ser o do aplicativo que está tocando**, não o do sistema; o do
  sistema é usado só quando o aplicativo não é encontrado entre as sessões de áudio.
- No player, título, artista e controles ficaram centralizados.
- O comando `notch_set_expanded` deu lugar a `notch_set_layout` (`collapsed`, `expanded`,
  `compact`); a janela do notch mede 588 × 156 expandida e 428 × 156 na aba Música (260 × 418
  e 260 × 298 nas laterais). `PeriodStats` ganhou `tasksCompleted`.
- O notch expandido ficou maior para comportar as abas: 468 × 156 no topo e 240 × 298 nas
  laterais. `TimerSnapshot` ganhou `taskId`.
- Configurações ganham `notch.position` e a seção `alerts`.

- As configurações do Pomodoro passam a ter efeito: valem a partir da próxima sessão.
- `Database` e `TimerService` são estados compartilhados (`Arc`) no backend.

- O aplicativo passa a se chamar **Compasso** (antes "Focus"): `productName`, título da janela,
  crate (`compasso`) e identificador (`com.endriwmsi.compasso`). Nenhum dado existia sob o
  identificador anterior.
- O conteúdo das telas fica em uma coluna centralizada de largura máxima `max-w-4xl`.
- `GlassPanel` foi substituído por `Panel`, e os tokens `--color-glass*` por `--color-panel*`,
  agora definidos por template.

### Notas

- TypeScript fixado em `~6.0` por compatibilidade com `typescript-eslint`.
- Ícone do aplicativo e plano de fundo são provisórios.
