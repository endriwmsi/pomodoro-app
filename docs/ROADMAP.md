# Roadmap

Progresso **real** do projeto. Um item só é marcado depois de verificado; "feito mas não
verificado" continua desmarcado, com uma nota. Última atualização: 2026-10-13.

Legenda: `[x]` concluído e verificado · `[ ]` pendente · `[~]` parcial (ver nota).

## Fase 0 — Inspeção e planejamento ✅

- [x] Inspecionar o repositório (estava vazio, sem git) e as ferramentas instaladas
- [x] `AGENTS.md` e `CLAUDE.md`
- [x] Documentação inicial (arquitetura, desenvolvimento, janelas, testes, troubleshooting)
- [x] Decisões essenciais: [ADR-001](decisions/ADR-001-TECH-STACK.md) (stack) e
      [ADR-002](decisions/ADR-002-TIMER-ENGINE.md) (diretrizes do timer)
- [x] Riscos técnicos identificados (seção ao final)

## Fase 1 — Scaffold funcional ✅

Critério: o aplicativo abre no Windows, o frontend é renderizado e o build funciona —
**verificado** em 2026-10-13 com o executável de release.

- [x] Tauri 2 + Rust + Cargo
- [x] React + TypeScript estrito + Vite + Tailwind v4
- [x] ESLint, Prettier, rustfmt, Clippy; script `npm run check`
- [x] Estrutura modular (`src/features`, `src/components`, `src/lib`, `src-tauri/src/commands`)
- [x] Janela principal sem decoração nativa, com controles próprios no canto superior direito
- [x] Estrutura visual: moldura preta, barra lateral de ícones, painel com imagem de fundo
      opcional e superfícies translúcidas
- [x] Primeiro comando Tauri de ponta a ponta (`app_info`)
- [x] Primeiro build de release (`tauri build --no-bundle`)
- [~] Roteiro manual da janela: itens 1–5 verificados; **6–12 pendentes** (minimizar e fechar
  por clique, arraste, duplo clique, redimensionamento, DPI, Windows 10) — ver
  [TESTING.md](TESTING.md#roteiro-manual--janela-principal)

Pendências herdadas desta fase:

- [ ] Imagem de fundo definitiva em `src/assets/background.*` (hoje: gradiente de fallback)
- [ ] Ícone definitivo (hoje: `src-tauri/app-icon.png` provisório)
- [x] Nome e identificador definidos: **Compasso**, `com.endriwmsi.compasso` (o identificador
      define o diretório de dados e não deve mais mudar)

## Fase 2 — Persistência local ✅

Critério: os dados continuam disponíveis após reiniciar o aplicativo — **verificado** em
2026-10-13: teste automatizado que fecha e reabre o arquivo, e o executável de release lendo do
banco um template gravado previamente.

- [x] [ADR-003](decisions/ADR-003-DATABASE-LAYER.md): rusqlite (bundled) em vez de SQLx
- [x] SQLite em `%APPDATA%\com.endriwmsi.compasso\compasso.db`, com WAL e chaves estrangeiras
- [x] Migrations versionadas por `user_version`, transacionais, com recusa de esquema mais novo
- [x] Camada de acesso isolada (`database/`) e comandos assíncronos
- [x] Configurações persistidas e validadas no Rust (`get_settings`, `update_settings`)
- [x] Tela de Configurações: template de estilização e parâmetros do Pomodoro
- [x] Testes: migrations, rollback, configurações, leitura tolerante, erros
- [x] [DATABASE.md](DATABASE.md)
- [~] Salvar pela interface **no aplicativo real** (clique em Configurações) não foi exercitado;
  está coberto por testes de frontend com o backend simulado e por testes de Rust do comando

Mudança em relação ao plano original: a Fase 2 criou apenas a tabela `settings`. As tabelas de
sessões e de tarefas serão criadas por migrations nas Fases 3 e 6, junto com o código que as
usa — migrations versionadas tornam isso seguro, e evita-se publicar um esquema especulativo que
depois não poderia ser editado.

Pendências desta fase:

- [ ] Mensagem visível ao usuário quando o banco não puder ser aberto (hoje o aplicativo apenas
      não inicia) — Fase 8
- [ ] Evento de mudança de configurações para outras janelas — necessário na Fase 4

## Templates de estilização (fora das fases originais) ✅

Pedido durante a Fase 2. Ver [THEMING.md](THEMING.md).

- [x] Infraestrutura: `appearance.template` persistido, tokens por template, variante `matrix:`
- [x] Template **Vidro** (padrão) e template **Matriz** (painéis escuros, monoespaçado, matriz
      de pontos)
- [x] Seletor em Configurações
- [x] Conteúdo das telas em coluna centralizada de largura máxima (hoje `max-w-6xl`)
- [ ] Novos templates (a definir)
- [ ] Aplicar o template ao notch (Fase 4) e aos gráficos reais do dashboard (Fase 7)

## Fase 3 — Engine do Pomodoro ✅

Critério: o timer funciona sem depender da janela ou de contadores do React — **verificado** em
2026-10-13: a contagem e a conclusão são feitas por uma thread do backend (testes de Rust com
relógio falso) e o frontend apenas exibe eventos (teste que avança o tempo local sem eventos e
confere que a tela não muda). No executável de release, uma sessão iniciada pela interface
contou o tempo e, ao fechar a janela, ficou gravada como interrompida com o tempo exato.

- [x] Migration `0002`: tabelas `pomodoro_sessions` e `timer_state`
- [x] Máquina de estados (fase × situação) conforme ADR-002
- [x] Trait `Clock`; tempo restante derivado do relógio monotônico
- [x] Comandos `timer_get_state`, `timer_start` (inicia/retoma), `timer_pause`, `timer_skip`,
      `timer_reset` e evento `timer:state`
- [x] Ticker em thread própria, bloqueado enquanto o timer está parado ou pausado
- [x] Persistência com checkpoints, encerramento ordenado e recuperação após queda
- [x] Conclusão única (transição sob lock + restrições no banco)
- [x] Pausa automática ao detectar salto de tempo (suspensão)
- [x] Tela de Pomodoro nos dois templates
- [x] Testes com relógio falso (engine, serviço, persistência)
- [x] [TIMER_ENGINE.md](TIMER_ENGINE.md)
- [ ] **Medir o comportamento real na suspensão do Windows** — a lógica cobre os dois
      comportamentos possíveis de `Instant`, mas só foi exercitada com relógio falso
- [ ] Sessões longas reais (25 min completos, pausa/retomada manual) no aplicativo — até aqui só
      uma execução curta foi observada
- [ ] Atalhos de teclado para os controles

Desde a Fase 4, fechar a janela principal não interrompe mais a sessão: o aplicativo continua
na bandeja.

## Fase 4 — Notch e bandeja do sistema (implementada; verificação manual pendente)

Critério: o timer continua com a janela principal minimizada e o notch é utilizável sobre
outros aplicativos — **parcialmente verificado** em 2026-10-13. Confirmado no executável de
release: o notch aparece centralizado no topo, sempre no topo e sem tomar o foco; expande e
recolhe com o ponteiro; fechar a janela principal mantém o processo e o notch; uma segunda
execução reexibe a janela. **Falta** usar o notch com o mouse real sobre outros aplicativos,
por isso a fase não está marcada como concluída.

- [x] Janela do notch: transparente, sem moldura, sempre no topo, não focável
- [x] Centralização no monitor principal, com escala de DPI (função pura, testada)
- [x] Expansão ao passar o mouse, recolhimento com atraso de 350 ms, fixar por clique
- [x] Janela do tamanho exato do que está visível (sem capturar cliques fora)
- [x] Painel do notch conectado ao timer e ao template
- [x] Bandeja do sistema com menu (abrir, iniciar/retomar, pausar, pular, configurações,
      encerrar)
- [x] Fechar a janela principal a oculta; encerrar só pela bandeja
- [x] Instância única
- [x] Evento `settings:changed` e opção para desativar o notch
- [x] [WINDOW_MANAGER.md](WINDOW_MANAGER.md) atualizado
- [ ] **Cliques reais nos botões do notch** (janela não focável) — teste manual
- [ ] Menu da bandeja: cada item, e o clique esquerdo — teste manual
- [ ] Notch fora da barra de tarefas e do Alt+Tab — conferir visualmente
- [ ] Notch sobre aplicativos em tela cheia
- [ ] Múltiplos monitores, troca do monitor principal, escalas de DPI 125 %/150 %
- [x] Aviso de que o aplicativo continua na bandeja (feito na Fase 5)

## Fase 5 — Notificações e sons (implementada; verificação manual pendente)

Não marcada como concluída: som e notificação **não foram ouvidos nem vistos** — só a lógica
foi testada. Ver [NOTIFICATIONS.md](NOTIFICATIONS.md).

- [x] Notificação nativa ao concluir sessão (`tauri-plugin-notification`), configurável
- [x] Sons locais, sintetizados em memória e tocados pela API do Windows, configuráveis
- [x] Aviso disparado exatamente uma vez por sessão concluída, só depois de gravada; nunca
      para sessões puladas, reiniciadas ou interrompidas (testado)
- [x] Falhas de som ou notificação não afetam o timer
- [x] Configurações `alerts.soundEnabled` e `alerts.notificationsEnabled`; botão "Testar aviso"
- [x] Aviso de que o aplicativo continua na bandeja ao fechar a janela (uma vez por execução)
- [x] [NOTIFICATIONS.md](NOTIFICATIONS.md)
- [ ] **Ouvir os dois sons e ver a notificação** (botão "Testar aviso" e uma sessão real)
- [ ] Conferir o nome/ícone com que a notificação aparece sem instalador
- [ ] Comportamento com o modo "Não perturbe" do Windows
- [ ] Escolha de som e controle de volume (não previstos por ora)

## Ajustes de interface pedidos durante as Fases 4 e 5 ✅

- [x] Barras de rolagem no estilo do template
- [x] Template Vidro redesenhado (vidro fumê, destaque âmbar)
- [x] Notch com forma curva (abas côncavas ligando o corpo à borda)
- [x] Posição do notch configurável: topo, lateral esquerda ou lateral direita — geometria
      verificada no executável nas três bordas
- [x] Checkboxes e select do shadcn/ui nas Configurações, adaptados aos tokens dos templates
- [ ] Ver o notch curvo e as posições laterais com os próprios olhos (transparência das abas)

## Fase 6 — Kanban ✅

Verificado em 2026-10-13: regras e ordem por testes de Rust (inclusive reabrindo o arquivo); no
executável de release, o quadro foi exibido com tarefas reais, tarefas foram movidas entre
colunas e um foco foi iniciado para uma tarefa, ficando a sessão gravada com o vínculo.

- [x] Migration `0003`: tabela `tasks`; `pomodoro_sessions.task_id`;
      `timer_state.active_task_id`
- [x] Tarefas: criar, editar, excluir com confirmação
- [x] Colunas A fazer / Em andamento / Concluído
- [x] Arrastar e soltar (dnd-kit) **e** alternativas: botões no cartão e arraste por teclado
- [x] Ordem persistida de forma transacional, sempre densa
- [x] Sessões de foco associadas a tarefas; pomodoros concluídos por tarefa
- [x] "Focar nesta tarefa" (quadro e notch); timer continua utilizável sem tarefa
- [x] Notch com abas (roda do mouse ou clique) e aba **Tarefas**
- [x] [KANBAN.md](KANBAN.md)
- [ ] Arrastar com o mouse real, e o diálogo de tarefa, conferidos visualmente
- [ ] Pré-visualização da posição final ao arrastar entre colunas
- [ ] Ordenação/filtro por prioridade ou prazo (não previsto por ora)

## Abas adicionais do notch (implementadas; verificação manual parcial)

Decisões em [ADR-004](decisions/ADR-004-NETWORK-FEATURES.md).

### Música — ver [MEDIA.md](MEDIA.md)

- [x] Sessão de mídia do Windows: título, artista, capa, tocando/pausado
- [x] Anterior, tocar/pausar, próxima
- [x] Volume **do aplicativo que toca** (procurado em todas as saídas de áudio); o do sistema
      só como alternativa
- [x] Ordem aleatória e repetição
- [x] Controle de volume vertical; título, artista e controles centralizados
- [x] Player compacto ao lado das outras abas; na aba Música, só o player, em um painel menor
- [x] O painel abre sempre na aba em que estava (deixou de pular para a Música quando há algo
      tocando, a pedido)
- [x] Barra de progresso da faixa, com mudança de posição, nos dois players
- [x] Nas laterais, player empilhado com o volume deitado abaixo dos controles
- [x] Consulta só com a aba visível (a cada 2 s)
- [x] Verificado no executável: leu a faixa em reprodução no Spotify, com capa, estado de
      aleatório/repetição, o volume do próprio Spotify (que tocava em uma saída não padrão) e
      a posição/duração da faixa
- [ ] **Acionar os controles, o volume e a mudança de posição com o mouse real** — não
      exercitados
- [ ] **Aba Música nas laterais** — coberta só por testes de componente; não foi vista no
      aplicativo real
- [ ] Escolha entre vários players

### Clima — ver [WEATHER.md](WEATHER.md)

- [x] Função opcional, desligada por padrão; única parte do aplicativo que usa a rede
- [x] Open-Meteo, consultado pelo backend, no máximo uma vez a cada 15 minutos
- [x] Localização do Windows, com permissão; sem ela, as maiores capitais de cada região
- [x] Dados anteriores marcados como desatualizados quando a atualização falha
- [x] Verificado no executável: consulta real, cinco capitais exibidas
- [x] Aba redesenhada: lugar no topo, temperatura de um lado e condição do outro, previsão
      das próximas horas embaixo; capitais uma por vez, com setas
- [x] Previsão pela localização do computador — verificada no executável em 2026-10-13
- [x] Nome do lugar perto de uma capital brasileira ("Região de …"), como alternativa
- [x] Cidade, estado e país da localização pelo Nominatim (ADR-004 revisado); ícones coloridos;
      temperatura, condição, vento e umidade agrupados; separadores entre as horas
- [x] Nome da cidade e o novo desenho da aba confirmados pelo usuário no aplicativo real
      ("Torres" / "Rio Grande do Sul, Brasil"); a previsão por hora ficava cortada — corrigido
      com o notch mais alto, ainda não revisto no aplicativo
- [x] Cor do notch: preto, branco ou seguir o sistema (o vidro com desfoque foi descartado)
- [ ] Notch branco e "seguir o sistema" no aplicativo real — vistos só na pré-visualização do
      navegador
- [x] Borda animada opcional no notch recolhido, colorida ou de uma cor escolhida, seguindo o
      contorno suave (abas incluídas), com 2 px no fundo e 1 px nas abas
      ([WINDOW_MANAGER.md](WINDOW_MANAGER.md#borda-animada)) — testes automatizados,
      pré-visualização no navegador (topo e lateral, preto e branco) e aprovada pelo usuário no
      executável de release em 2026-10-15, junto com o seletor de cor
- [ ] Consumo de CPU/GPU com a borda ligada — não medido
- [ ] Nome do lugar longe das capitais (exige outro serviço ou um campo para o usuário
      digitar); capitais de outros países
- [ ] Setas de troca de capital no aplicativo real — cobertas só por testes de componente

## Fase 7 — Dashboard ✅

Verificado em 2026-10-13: cálculos e limites de calendário por testes de Rust; no executável de
release, com sessões concluídas gravadas, o dashboard mostrou os indicadores do dia, o gráfico
semanal com o dia atual em destaque e os totais da semana.

- [x] Indicadores diários a partir das sessões e tarefas persistidas
- [x] Gráfico semanal (segunda a domingo) com navegação entre semanas
- [x] Regras de fuso, limites de dia e semana e sessões que cruzam a meia-noite, documentadas e
      testadas
- [x] Meta diária opcional, com progresso
- [x] Migration `0004` (índices das consultas)
- [x] [ANALYTICS.md](ANALYTICS.md)
- [x] Calendário do mês com marcadores por dia (foco, tarefa concluída, prazo)
- [ ] Conferir a virada do dia com o dashboard aberto e a navegação entre semanas e meses no
      aplicativo real
- [ ] Estatísticas por tarefa, médias e exportação (não previstos por ora)

## Ajustes de interface pedidos durante a Fase 7 ✅

- [x] Conteúdo das telas mais largo (`max-w-6xl`)
- [x] Cores de prioridade nas tarefas (baixa, média, alta)
- [x] Campos numéricos com setas no estilo do template (`NumberInput`)
- [x] Seletor de abas do notch em carrossel, com animação "de mola" e ícones coloridos; nas
      laterais o seletor fica em pé e as abas deslizam na vertical
- [ ] Ver a animação do seletor com o mouse real

## Rotinas e expediente (implementadas; verificação no aplicativo pendente)

Ver [ROUTINES.md](ROUTINES.md).

- [x] Rotinas diárias (nome, horário, duração, dias da semana), persistidas (migration `0005`)
- [x] Expediente opcional nas configurações
- [x] Encaixe dos ciclos: foco curto antes da âncora, pausa que absorve a sobra, último foco
      terminando com o expediente
- [x] A rotina ocupa o timer: pausa e retoma o foco, substitui a pausa; "Pular a rotina"
- [x] Foco curto conta tempo, mas não soma pomodoro
- [x] Nada começa sozinho fora do expediente; o timer segue utilizável manualmente
- [x] Avisos ao começar uma rotina e ao fim do expediente
- [x] Tela Rotina (expediente, faixa do dia, lista) e indicação no Pomodoro e no notch
- [x] Verificado no executável: a migration foi aplicada sobre o banco existente e a tela abre
- [ ] **Comportamento ao vivo no aplicativo real** — criar uma rotina, vê-la começar, o foco
      pausar e voltar, pular, os avisos e o fim do expediente só foram exercitados por testes
      automatizados (relógio simulado)
- [ ] Pomodoros previstos na faixa do dia
- [ ] No dashboard, o foco do dia em relação ao que o expediente comporta
- [ ] Expediente diferente por dia da semana; rotinas que atravessam a meia-noite

## Imagem de fundo configurável ✅ (envio de imagem não verificado)

- [x] Escolha entre as imagens embutidas (`src/assets/backgrounds/`), nenhuma ou a do usuário
- [x] Envio de imagem própria, copiada para os dados do aplicativo
- [x] Verificado no executável: a grade aparece em Configurações com a imagem atual selecionada
- [ ] **Enviar uma imagem e trocar de fundo no aplicativo real** — só testes automatizados

## Templates Sinal e Relevo; ajustes do notch; dados de exemplo ✅ (verificação parcial)

- [x] Template **Sinal** (telemetria, verde) e template **Relevo** (claro, neumorfismo)
- [x] Notch: player compacto mais largo, aba Timer com ciclo e progresso, aba Tarefas mais cheia
- [x] `scripts/demo-data.mjs` e `COMPASSO_DATA_DIR`: banco de exemplo sem tocar nos dados reais
- [x] Capturas do README e imagens do instalador refeitas com os dados de exemplo
- [ ] Rever Kanban, diálogos e Configurações nos templates Sinal e Relevo (só o dashboard foi
      conferido)

## Publicação automática (workflows escritos; primeira execução pendente)

Ver [RELEASING.md](RELEASING.md).

- [x] Workflow de CI: `npm run check` no Windows; Clippy e testes do backend em Linux e macOS
- [x] Workflow de Release por tag `v*`: instaladores para Windows, Linux e macOS (os dois
      processadores), anexados a uma Release do GitHub
- [x] `npm run release:version` para definir a versão em todos os arquivos
- [x] Fuso local lido de forma portátil (`chrono`), para as rotinas valerem fora do Windows
- [ ] **Primeira execução dos workflows no GitHub** — eles não puderam ser executados
      localmente; erros de compilação em Linux ou macOS só aparecem lá
- [ ] Testar o aplicativo em Linux e macOS (notch, bandeja, janelas)
- [ ] Assinatura de código (certificado pago do Windows e conta da Apple)

## Atualização automática (implementada; primeira Release com ela pendente)

Ver [UPDATER.md](UPDATER.md) e [RELEASING.md](RELEASING.md).

- [x] `tauri-plugin-updater`: consulta o `latest.json` da última Release ao abrir, confere a
      assinatura, instala e reinicia; opção em Configurações → Atualizações (ADR-004 revisado)
- [x] Chave de assinatura das atualizações (gratuita, sem relação com o certificado do Windows)
- [x] `npm run release -- patch|minor|major|X.Y.Z`: verifica, fecha o CHANGELOG, versiona,
      cria a tag e envia; o workflow compila, assina e publica com as notas do CHANGELOG
- [ ] **Cadastrar o secret `TAURI_SIGNING_PRIVATE_KEY` no GitHub** (passo único, manual)
- [ ] **Publicar a primeira versão com o atualizador e ver uma instalação antiga se atualizar**
      — nada disso foi exercitado de ponta a ponta

## Avisos no notch: fim de sessão e início de rotina (implementados; verificação pendente)

Ver [WINDOW_MANAGER.md](WINDOW_MANAGER.md#avisos-no-notch).

- [x] Evento `notch:notice` ao concluir um foco ou uma pausa; o notch abre na aba Timer com o
      aviso por 3 s e recolhe, voltando à aba anterior; opção `notch.notices` (ligada)
- [x] Testes automatizados do comportamento (abrir, recolher, mouse em cima, fixado, desligado)
- [x] O início de uma rotina também abre o notch com o aviso (mesmo evento e mesma opção)
- [ ] Ver o aviso de início de rotina no aplicativo real
- [ ] **Ver o aviso no aplicativo real** ao fim de um foco e de uma pausa, recolhido e com o
      mouse em cima, no topo e nas laterais

## Fase 8 — Polimento e distribuição (parcial)

- [x] Instalador personalizado (apresentação com capturas, textos, licença MIT, imagens) —
      páginas conferidas até a escolha da pasta; **instalação ainda não executada**
- [x] README com capturas, instalação e pré-visualização; licença MIT
- [x] Abrir o notch com o mouse real e trocar de aba pela roda — verificado ao tirar as
      capturas (2026-10-13)
- [ ] Publicar o repositório e uma versão com o instalador; incluir o link no README e no
      instalador

- [x] Caixa de erro nativa quando a inicialização falha (banco ilegível etc.)
- [x] Instalador NSIS gerado: `Compasso_0.1.0_x64-setup.exe`, 2,7 MB
- [x] Medição de memória, CPU em repouso e tempo de inicialização registrada em
      [TESTING.md](TESTING.md#linha-de-base-de-recursos)
- [x] Preservação dos dados entre versões: três atualizações de esquema (migrations 2 a 4)
      aplicadas sobre o banco real de uso, sem perda; há teste para cada migração
- [x] Instalação, atualização e desinstalação documentadas em
      [DEVELOPMENT.md](DEVELOPMENT.md#instalador)
- [ ] **Executar o instalador** e conferir instalação, atalhos, atualização por cima e
      desinstalação — não foi executado
- [ ] Assinatura de código (sem ela o Windows SmartScreen avisa ao instalar)
- [ ] Revisão completa de acessibilidade com leitor de tela e só teclado (até aqui: nomes
      acessíveis e foco visível verificados por teste; nada com leitor de tela real)
- [ ] Reduzir o consumo de memória do WebView2 (avaliar o custo do `backdrop-filter`)
- [ ] Tema claro (os dois templates assumem texto claro)
- [ ] Atualização automática
- [ ] Windows 10: cantos da janela e instalação do WebView2
- [ ] Ícone definitivo do aplicativo

## Riscos técnicos

| Risco                                                                          | Fase | Mitigação prevista                                                   |
| ------------------------------------------------------------------------------ | ---- | -------------------------------------------------------------------- |
| Notch roubar o foco ou capturar cliques fora da área visível                   | 4    | Validar opções do Tauri uma a uma; camada Win32 mínima se necessário |
| Notch sobre aplicativos em tela cheia e reposicionamento ao trocar monitor/DPI | 4    | Roteiro manual com múltiplos monitores e escalas                     |
| Comportamento do relógio monotônico durante a suspensão                        | 3    | Medir no Windows; detecção de lacuna; testes com relógio falso       |
| Conclusão duplicada (timer × interface × recuperação)                          | 3, 5 | Transição única sob lock; efeitos derivados da transição             |
| Consumo de memória do WebView2 com duas janelas e `backdrop-filter`            | 4, 8 | Medir; reduzir o blur ou torná-lo opcional se o custo for relevante  |
| Mudar o `identifier` depois de haver dados                                     | —    | Definido como `com.endriwmsi.compasso`; não alterar                  |
| Falha ao abrir o banco encerra o aplicativo sem mensagem                       | 8    | Diálogo de erro nativo                                               |
| TypeScript preso na 6.0 pelo `typescript-eslint`                               | —    | Atualizar quando houver suporte                                      |
| Snap Layouts do Windows 11 indisponíveis no botão maximizar customizado        | 8    | Aceito por ora; avaliar tratamento nativo de `WM_NCHITTEST`          |
