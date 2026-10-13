# Testes

## Comandos

| Comando                | Cobre                                                         |
| ---------------------- | ------------------------------------------------------------- |
| `npm run check`        | Tudo abaixo, em sequência — rode antes de concluir uma tarefa |
| `npm run typecheck`    | Tipos (TypeScript estrito)                                    |
| `npm run lint`         | ESLint com regras baseadas em tipos                           |
| `npm run format:check` | Formatação (Prettier)                                         |
| `npm run test`         | Vitest + React Testing Library (jsdom)                        |
| `npm run rust:fmt`     | Formatação do Rust                                            |
| `npm run rust:clippy`  | Clippy, avisos como erro                                      |
| `npm run rust:test`    | Testes unitários do Rust                                      |

## Estratégia

- **Regras de negócio são testadas no Rust**, onde vivem. Persistência usa banco em memória
  (`Database::open_in_memory`) ou arquivo temporário (`tempfile`) quando o teste precisa fechar
  e reabrir. Timer e agregações terão testes com relógio falso (fases 3 e 7) — nenhum teste
  deve depender de esperas reais de minutos.
- **Stores com backend simulado:** faça mock de `@/lib/commands` e de `isTauri` no arquivo de
  teste (exemplo em `stores/settings.test.ts`) e restaure a store em `afterEach`. Não importe
  stores em `src/test/setup.ts`: elas seriam criadas antes dos mocks de módulo.
- **Frontend:** testes de comportamento com Testing Library, consultando por papel e nome
  acessível. Os arquivos ficam ao lado do código (`*.test.tsx`).
- **Runtime nativo nos testes de frontend:** `isTauri()` é falso no jsdom, então `src/lib/`
  vira no-op. Para testar a integração, faça mock de `@tauri-apps/api/core` e
  `@tauri-apps/api/window` (exemplo em `components/layout/WindowControls.test.tsx`).
- **Janelas reais** (moldura, arraste, notch, DPI, múltiplos monitores) não são automatizadas:
  seguem os roteiros manuais abaixo, com resultado e data registrados.

## Testes existentes

| Arquivo                                         | Verifica                                                                                                                                                          |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/app/App.test.tsx`                          | Tela inicial, itens e ordem da navegação, troca de tela, ausência de números fictícios no dashboard, fallback do fundo, estado "fora do desktop" em Configurações |
| `src/components/layout/WindowControls.test.tsx` | Botões chamam minimizar/maximizar/fechar; rótulo alterna para "Restaurar" no início e após redimensionar                                                          |
| `src-tauri/src/commands/app.rs`                 | `AppInfo` reflete os metadados do pacote e serializa no formato esperado pelo frontend                                                                            |
| `src/app/App.test.tsx` (templates e timer)      | Template padrão, troca para Matriz e seus efeitos no dashboard, dica em `localStorage`, formulário do Pomodoro: padrões, salvar, limites, campo vazio             |
| `src/stores/settings.test.ts`                   | Carga, falha de leitura, salvar, erro de validação sem alterar o estado, normalização de falhas do IPC                                                            |
| `src/components/ui/dots.test.tsx`               | Formato dos glifos, pontos desenhados por `DotMatrixText`, escala e pontos acesos de `DotColumns`                                                                 |
| `src-tauri/src/error.rs`                        | Formato JSON de `AppError`                                                                                                                                        |
| `src-tauri/src/database/mod.rs`                 | Criação de diretórios e arquivo, pragmas (WAL, chaves estrangeiras), recusa de arquivo que não é SQLite                                                           |
| `src-tauri/src/database/migrations.rs`          | Versões sequenciais, esquema final, idempotência, só pendentes, rollback em falha, recusa de esquema mais novo, `CHECK json_valid`                                |
| `src-tauri/src/settings/mod.rs`                 | Padrões, limites inclusivos, campo apontado em cada erro, contrato JSON, padrões para campos ausentes, template desconhecido                                      |
| `src-tauri/src/settings/store.rs`               | Padrões em banco vazio, ida e volta, substituição, **persistência após reabrir o arquivo**, rejeição sem escrita, leitura tolerante (3 casos)                     |

| `src-tauri/src/timer/engine.rs` | Início, pausa e retomada, conclusão única, ciclo até a pausa longa, pular, reiniciar, comandos sem efeito, início automático, comando simultâneo à conclusão, mudança de configurações, suspensão (relógio monotônico avançando ou congelado), relógio do sistema atrasado, checkpoints, encerramento, arredondamento, contrato JSON |
| `src-tauri/src/timer/store.rs` | Ciclo de vida da linha da sessão, encerrar duas vezes, segunda sessão ativa recusada, fechamento de sessões órfãs, posição no ciclo |
| `src-tauri/src/timer/mod.rs` | Serviço com banco em memória e `FakeClock`: gravação, conclusão única com o ticker rodando, pausa/retomada, pular e reiniciar, checkpoints, **recuperação após queda**, encerramento ordenado, posição no ciclo após reinício, configurações, uma notificação por segundo exibido, silêncio quando parado, falha de escrita sem alterar o estado, suspensão, thread do ticker |
| `src/features/pomodoro/PomodoroPage.test.tsx` | Estado parado, iniciar, **tela não avança sem eventos**, troca de fase, pausar/pular/reiniciar, aviso de suspensão, erro de comando, controles desabilitados antes da primeira leitura, cancelamento da assinatura |

| `src-tauri/src/windows/notch.rs` | Geometria do notch: centralização, mesmo centro recolhido/expandido, escala de DPI, arredondamento, monitor fora da origem, monitor estreito |
| `src/notch/NotchApp.test.tsx` | Tempo e fase do backend, expansão ao entrar, recolhimento com atraso, cancelamento se o mouse volta, fixar, controles do timer, abrir a janela principal, eventos |
| `src/stores/settings.test.ts` (conexão) | Carga ao conectar, mudanças vindas de outra janela, cancelamento da assinatura |

| `src-tauri/src/notifications/mod.rs` | Texto das notificações: foco → pausa curta/longa, pausa → foco, próxima sessão já iniciada |
| `src-tauri/src/notifications/sound.rs` | Cabeçalho WAV coerente com os dados, áudio audível sem saturar e terminando em silêncio, sons distintos |
| `src-tauri/src/timer/mod.rs` (avisos) | Conclusão anunciada uma única vez; uma vez por sessão em ciclo automático; nada para sessões puladas, reiniciadas ou interrompidas; nada se a gravação falhar |
| `src/notch/shape.test.ts` | Tamanhos da janela do notch iguais aos do Rust, nas três bordas |
| `src/app/App.test.tsx` (notch e avisos) | Select de posição, desativar o notch, checkboxes de som e notificação |

| `src-tauri/src/tasks/mod.rs` | Normalização e validação: título, descrição, prazo (datas existentes, bissextos), estimativa |
| `src-tauri/src/tasks/store.rs` | Criar no fim de A fazer, editar sem mudar de lugar, reordenar, trocar de coluna, data de conclusão, excluir fechando o buraco, tarefa inexistente, **200 movimentos em sequência sem buracos nem duplicatas**, ordem após reabrir o arquivo, contagem de pomodoros, sessões preservadas ao excluir, vínculo com tarefa inexistente recusado |
| `src-tauri/src/timer/` (tarefas) | Foco carrega a tarefa e pausa não; `focus` em cada estado; foco dedicado à tarefa; reatribuição do foco em andamento; pular a pausa ao focar; escolha após reinício; tarefa indisponível; exclusão sem referência pendente; tarefa inexistente |
| `src/features/kanban/board.test.ts` | Agrupamento por coluna, destino de um arraste (`resolveDrop`), passos dos botões (`stepMove`), datas locais |
| `src/features/kanban/KanbanPage.test.tsx` | Colunas e ordem, metadados do cartão, coluna vazia, criar e editar pelo diálogo, validação local e do backend, mover pelos botões, excluir só após confirmar, focar, erro de operação, recarga por evento |
| `src/notch/NotchApp.test.tsx` (abas) | Troca por roda com intervalo mínimo e limites, roda ignorada recolhido, troca por clique, lista de tarefas abertas, focar e concluir pelo notch, quadro vazio |

| `src-tauri/src/analytics/mod.rs` | Banco vazio, contagem pelo dia do término, focos incompletos (tempo sim, pomodoro não), pausas ignoradas, sessão em andamento ignorada, limites inclusivo/exclusivo, sessão que cruza a meia-noite, dias de 23/25 h, soma da semana igual ao período único, tarefas concluídas no dia e em andamento, tarefa reaberta, limites inválidos, contrato JSON |
| `src/features/dashboard/DashboardPage.test.tsx` | Limites locais enviados ao backend, indicadores, meta e progresso (com teto), descrição do gráfico, semana vazia, navegação entre semanas, falha sem números inventados |
| `src/lib/calendar.test.ts` | Início do dia e da semana (segunda), virada de mês/ano, oito limites consecutivos, formato do intervalo; `formatFocusTime` |

| `src-tauri/src/weather/mod.rs` | Códigos de condição, URL com coordenadas arredondadas, horas pedidas, leitura de um e de vários lugares (com a previsão por hora), respostas malformadas, distância entre pontos, nome do lugar pela capital próxima, consulta do nome da cidade (URL, resposta, uma vez por lugar, nova tentativa após falha, nunca nas capitais), função desligada sem requisição, capitais e localização, limite de 15 minutos, dados antigos após falha, erro de rede, troca de preferência, contrato JSON — **sem acessar a rede** (provedor e localização simulados) |
| `src-tauri/src/media/mod.rs` | Contrato JSON, nomes das ações, volume fora da faixa recusado, posição na faixa (avança tocando, parada em pausa, limitada à duração, data de atualização inválida); e uma consulta **real** à sessão de mídia do Windows (só exige que não falhe) |
| `src/notch/NotchApp.test.tsx` (música e clima) | Aba de clima só com a função ligada, previsão por localização, capitais e dados desatualizados, sem conexão com nova tentativa, troca de capital pelas setas, abertura na aba em que estava mesmo com música tocando, controles e volume, barra de progresso (avanço pelo relógio, mudança de posição, pausada, sem permissão, sem duração), player empilhado com volume deitado nas laterais, consulta periódica só com o painel aberto |
| `src/features/settings/GeneralSection.test.tsx` | Opção de iniciar com o Windows: desligada por padrão, gravação da escolha, erro do backend sem mudar a opção |

O arrastar e soltar em si não é testado no jsdom (sem layout): testa-se a função que decide o
destino e os controles alternativos.

Os testes do timer não esperam tempo real: o relógio é injetado (`timer/clock.rs`, `FakeClock`).
A exceção é um teste da thread do ticker, que espera no máximo alguns décimos de segundo.

Última execução completa (`npm run check`, 2026-10-13): 120 testes de frontend e 174 de Rust
passando; typecheck, ESLint, Prettier, rustfmt e Clippy sem ocorrências.

## Roteiro manual — janela principal

Execute `npm run tauri dev` (ou o executável de release) e confira:

| #   | Verificação                                                               | Resultado em 2026-10-13 (Windows 11, release)        |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------- |
| 1   | A janela abre sem barra de título nem botões nativos                      | OK (captura da janela)                               |
| 2   | Moldura preta, barra lateral, painel arredondado com fundo                | OK (captura da janela)                               |
| 3   | Configurações → Sobre mostra o nome e a versão (comando `app_info`)       | OK antes da renomeação ("Focus 0.1.0"); não repetido |
| 4   | Maximizada, o botão mostra o ícone/rótulo "Restaurar" e nada fica cortado | OK (captura com a janela maximizada)                 |
| 5   | A janela fecha ao receber o pedido de fechamento e o processo termina     | OK (pedido enviado por `WM_CLOSE`)                   |
| 6   | Botão **Minimizar** minimiza                                              | Não verificado                                       |
| 7   | Botão **Fechar** fecha (clique real)                                      | Não verificado                                       |
| 8   | Arrastar pela faixa superior e pela barra lateral move a janela           | Não verificado                                       |
| 9   | Duplo clique na faixa superior maximiza/restaura                          | Não verificado                                       |
| 10  | Redimensionar pelas bordas respeita o mínimo de 900 × 600                 | Não verificado                                       |
| 11  | Escalas de DPI 125 % e 150 %                                              | Não verificado                                       |
| 12  | Windows 10 (cantos, sombra)                                               | Não verificado                                       |

Os itens 6 a 10 dependem de interação real com o mouse; as chamadas correspondentes estão
cobertas por teste unitário, mas as permissões em `capabilities/default.json` só são exercidas
no aplicativo real.

## Roteiro manual — persistência e templates

| #   | Verificação                                                                      | Resultado em 2026-10-13 (Windows 11, release)                        |
| --- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | Primeira execução cria `%APPDATA%\com.endriwmsi.compasso\compasso.db`            | OK — esquema na versão 1, tabela `settings` vazia                    |
| 2   | Com `appearance.template = matrix` gravado, o aplicativo abre no template Matriz | OK (linha inserida diretamente no banco; captura da janela)          |
| 3   | Conteúdo centralizado com largura máxima (`max-w-4xl`)                           | OK (captura da janela)                                               |
| 4   | Trocar o template em Configurações e reabrir o aplicativo mantém a escolha       | Não verificado no aplicativo real                                    |
| 5   | Alterar e salvar os tempos do Pomodoro e reabrir mantém os valores               | Não verificado no aplicativo real                                    |
| 6   | Valor fora do limite mostra o erro no campo e não grava                          | Não verificado no aplicativo real (coberto por testes automatizados) |

## Roteiro manual — timer

| #   | Verificação                                                                       | Resultado em 2026-10-13 (Windows 11, release)                       |
| --- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | Iniciar pela tela de Pomodoro faz a contagem regredir                             | OK — 24:47 cerca de 13 s após iniciar (captura da janela)           |
| 2   | Fechar a janela com a sessão rodando grava a sessão como interrompida             | OK — `interrupted`, 14 111 ms, igual ao tempo decorrido             |
| 3   | Pular grava `skipped` e avança a fase; a pausa longa zera o ciclo                 | OK — observado no banco durante uso manual                          |
| 4   | Reiniciar grava `reset` e mantém a fase                                           | OK — observado no banco durante uso manual                          |
| 5   | A posição no ciclo é gravada em `timer_state`                                     | OK                                                                  |
| 6   | Sessão completa de 25 min conclui, grava `completed` e passa à pausa              | Não verificado no aplicativo real (coberto com relógio falso)       |
| 7   | Pausar por um tempo longo e retomar continua de onde parou                        | Não verificado no aplicativo real (coberto com relógio falso)       |
| 8   | Contagem continua correta com a janela minimizada                                 | Não verificado no aplicativo real (o ticker não depende de janelas) |
| 9   | Suspender o computador durante um foco pausa a sessão sem contar o tempo suspenso | **Não verificado** — requer suspender a máquina                     |
| 10  | Matar o processo durante um foco e reabrir mostra a sessão como interrompida      | Não verificado no aplicativo real (coberto por teste do serviço)    |
| 11  | Alterar o relógio do Windows durante um foco não muda o tempo restante            | Não verificado no aplicativo real (coberto com relógio falso)       |

Como as verificações 1 e 2 foram feitas: cliques enviados por mensagem à janela do WebView e
leitura do banco em modo somente leitura, sem instrumentar o aplicativo.

## Roteiro manual — notch, bandeja e ciclo de vida

Verificações de 2026-10-13 no executável de release (Windows 11, 1920 × 1080, escala 100 %),
feitas inspecionando as janelas pela API do Windows e enviando mensagens de mouse à janela —
**sem** mouse real.

| #   | Verificação                                                                   | Resultado                                                   |
| --- | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | O notch abre recolhido, centralizado no topo do monitor principal             | OK — 132 × 12 em x = 894 (centro em 960), y = 0             |
| 2   | É sempre-no-topo e não ativável                                               | OK — estilos `WS_EX_TOPMOST` e `WS_EX_NOACTIVATE` presentes |
| 3   | Ao passar o ponteiro, expande mantendo o centro                               | OK — 320 × 108 em x = 800                                   |
| 4   | Sem o ponteiro, recolhe sozinho                                               | OK — voltou a 132 × 12 em cerca de 1 s                      |
| 5   | Expandir não rouba o foco da janela em uso                                    | OK — a janela em primeiro plano não mudou                   |
| 6   | Expandido, mostra fase, tempo e controles no template ativo                   | OK (captura da janela, template Matriz)                     |
| 7   | Fechar a janela principal a oculta; processo e notch continuam                | OK                                                          |
| 8   | Executar o aplicativo de novo reexibe a janela e não cria outro processo      | OK                                                          |
| 9   | Clicar com o mouse real em iniciar/pausar/pular/abrir no notch                | **Não verificado**                                          |
| 10  | Fixar o painel e soltá-lo com o mouse real                                    | **Não verificado**                                          |
| 11  | Bandeja: clique esquerdo e cada item do menu, inclusive Encerrar              | **Não verificado**                                          |
| 12  | O notch não aparece na barra de tarefas nem no Alt+Tab                        | **Não verificado**                                          |
| 13  | Cantos do notch transparentes; nada pintado fora dele                         | **Não verificado** (a captura não registra transparência)   |
| 14  | Cliques logo ao lado do notch recolhido chegam ao aplicativo de baixo         | **Não verificado** (decorre de a janela ter 132 × 12)       |
| 15  | Notch sobre janela maximizada, aplicativo em tela cheia e vídeo em tela cheia | **Não verificado**                                          |
| 16  | Dois monitores; trocar o monitor principal; escalas 125 % e 150 %             | **Não verificado**                                          |
| 17  | Desativar e reativar o notch em Configurações                                 | **Não verificado** no aplicativo real                       |
| 18  | Timer correndo com a janela principal oculta; conclusão registrada            | **Não verificado** no aplicativo real                       |
| 19  | Suspender e retomar o computador com o notch visível                          | **Não verificado**                                          |

### Posições do notch (2026-10-13, release, 1920 × 1080, escala 100 %)

Posição gravada diretamente no banco antes de abrir o aplicativo; ponteiro simulado.

| Posição  | Recolhido               | Expandido                | Recolhe sozinho |
| -------- | ----------------------- | ------------------------ | --------------- |
| Topo     | 148 × 12 em (886, 0)    | 368 × 108 em (776, 0)    | OK              |
| Esquerda | 12 × 148 em (0, 466)    | 176 × 208 em (0, 436)    | OK              |
| Direita  | 12 × 148 em (1908, 466) | 176 × 208 em (1744, 436) | OK              |

Não verificado: a aparência das abas curvas e sua transparência na tela (a captura de janela
não registra transparência — a forma foi conferida só na pré-visualização do navegador, em
`?window=notch`), a troca de posição pelas Configurações com o aplicativo aberto e os cliques
reais.

## Roteiro manual — avisos (Fase 5)

Nenhum item foi verificado: não há como ouvir o som nem ver a notificação a partir dos testes.

| #   | Verificação                                                                         |
| --- | ----------------------------------------------------------------------------------- |
| 1   | Configurações → Avisos → **Testar aviso** toca o som e mostra a notificação         |
| 2   | Com "Tocar um som" desmarcado, só a notificação aparece; e vice-versa               |
| 3   | Com os dois desmarcados, o botão fica desabilitado                                  |
| 4   | Ao fim de um foco real: som ascendente e notificação "Foco concluído"               |
| 5   | Ao fim de uma pausa real: som descendente e notificação "Pausa encerrada"           |
| 6   | Um único aviso por sessão, também com início automático ligado                      |
| 7   | Pular ou reiniciar uma sessão não gera aviso                                        |
| 8   | Fechar a janela principal mostra, uma vez, o aviso de que o app continua na bandeja |
| 9   | Nome e ícone com que a notificação aparece; comportamento com "Não perturbe"        |

Dica para os itens 4 a 6: em Configurações, use foco e pausas de 1 minuto.

O novo visual do template Vidro e as barras de rolagem foram conferidos apenas na
pré-visualização do navegador, não no executável. No roteiro do timer, o item 2 foi verificado
na Fase 3, quando fechar a janela encerrava o aplicativo; hoje o encerramento é pela bandeja.

## Roteiro manual — Kanban e abas do notch (Fase 6)

Observado em 2026-10-13 no executável de release, com tarefas de teste inseridas diretamente no
banco (títulos começando com `[teste]`).

| #   | Verificação                                                                     | Resultado                                                           |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1   | A tela Kanban mostra as três colunas com cartões, prioridade, prazo, pomodoros  | OK (captura da janela; prazo vencido em destaque)                   |
| 2   | Mover tarefas entre colunas mantém as posições densas e limpa/grava a conclusão | OK (banco conferido após movimentos feitos na interface)            |
| 3   | Focar em uma tarefa inicia um foco gravado com o vínculo                        | OK — sessão `focus` ativa com `task_id` da tarefa; cartão "Em foco" |
| 4   | O notch expandido mostra o seletor de abas e a aba Tarefas com Focar            | OK (captura do notch, template Matriz)                              |
| 5   | Criar e editar pelo diálogo; excluir com confirmação                            | Não verificado no aplicativo real (testes automatizados)            |
| 6   | Arrastar e soltar com o mouse; arrastar pelo teclado                            | Não verificado                                                      |
| 7   | Trocar de aba com a roda do mouse real; animação do seletor                     | Não verificado (a troca por roda é testada com eventos simulados)   |
| 8   | Concluir uma tarefa pela caixa no notch; lista rolável com muitas tarefas       | Não verificado no aplicativo real                                   |
| 9   | Abas do notch nas posições laterais                                             | Não verificado                                                      |
| 10  | Duas janelas em sincronia: mudar no quadro reflete no notch e vice-versa        | Não verificado diretamente                                          |

Os itens 2 e 3 foram observados enquanto o aplicativo era usado manualmente durante os testes.

## Roteiro manual — dashboard e ajustes da Fase 7

Observado em 2026-10-13 no executável de release (template Matriz). Para o dashboard foram
inseridas no banco cinco sessões de foco concluídas, removidas depois da captura.

| #   | Verificação                                                       | Resultado                                                                               |
| --- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | Indicadores do dia batem com as sessões gravadas                  | OK — 2 pomodoros hoje; 58 min de foco (50 das concluídas + 8 de sessões puladas no dia) |
| 2   | Gráfico semanal com o dia atual em destaque e os totais da semana | OK — segunda 3, terça 2; "5 pomodoros · 2h 13m"                                         |
| 3   | Conteúdo mais largo no dashboard e no Kanban                      | OK (capturas)                                                                           |
| 4   | Cores de prioridade nos cartões                                   | OK — alta em laranja, média em amarelo, baixa em azul                                   |
| 5   | Notch: seletor em carrossel com o ícone ativo destacado           | OK (captura; animação não observada)                                                    |
| 6   | Navegar entre semanas; virada do dia com o dashboard aberto       | Não verificado no aplicativo real                                                       |
| 7   | Meta diária: definir em Configurações e ver o progresso           | Não verificado no aplicativo real                                                       |
| 8   | Setas do campo numérico (Pomodoros, tempos, meta)                 | Não verificado no aplicativo real                                                       |
| 9   | Template Vidro: gráfico de barras e cores de prioridade           | Não verificado no aplicativo real                                                       |
| 10  | Animação "de mola" ao trocar de aba; seletor em pé nas laterais   | Não verificado                                                                          |

## Roteiro manual — música, clima e distribuição

Observado em 2026-10-13 no executável de release.

| #   | Verificação                                                                                                                                                 | Resultado                                                                                                                                    |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Aba Música mostra a faixa em reprodução, com capa                                                                                                           | OK — leu título, artista e capa de uma faixa tocando no Spotify                                                                              |
| 2   | Aba Clima (sem localização) mostra as cinco capitais com dados reais                                                                                        | OK — consulta real ao Open-Meteo                                                                                                             |
| 3   | Instalador é gerado                                                                                                                                         | OK — `Compasso_0.1.0_x64-setup.exe`, 2,7 MB                                                                                                  |
| 11  | Layouts do notch: aba Música compacta (428 × 216) com volume vertical e os cinco controles; outra aba expandida (588 × 216) com o player compacto à direita | OK (capturas; a troca de aba fez a janela crescer de 428 para 588)                                                                           |
| 12  | Volume lido é o do aplicativo de música                                                                                                                     | OK — `volumeScope: app` para o Spotify, que tocava em uma saída de áudio diferente da padrão                                                 |
| 13  | Calendário do dashboard: mês, hoje em destaque, marcadores de prazo                                                                                         | OK (captura; dois prazos de tarefas de teste marcados)                                                                                       |
| 14  | Marcadores de foco e de tarefa concluída no calendário; navegação entre meses                                                                               | Não verificado no aplicativo real                                                                                                            |
| 15  | Arrastar o controle de volume; aleatório e repetição                                                                                                        | Não verificado (evitou-se interferir na música em reprodução)                                                                                |
| 4   | Tocar/pausar, anterior e próxima acionados pelo notch                                                                                                       | Não verificado (evitou-se interferir na música em reprodução)                                                                                |
| 5   | Ajuste de volume pelo notch                                                                                                                                 | Ajuste não verificado. A leitura acompanhou o sistema: 0 em uma captura e 100 % em outra, depois de o volume ser alterado fora do aplicativo |
| 6   | Com música tocando, o notch abre na aba em que estava (não pula para a Música)                                                                              | OK — com uma faixa tocando, abriu na aba Timer; a primeira troca pela roda levou a Tarefas (captura)                                         |
| 7   | Clima pela localização do computador                                                                                                                        | OK — um lugar só ("Sua localização", longe de capitais), temperatura, condição, vento, umidade e seis horários (captura)                     |
| 16  | Barra de progresso: tempo decorrido e total da faixa do Spotify, na aba Música e no player compacto                                                         | OK (capturas: 0:54 de 3:36)                                                                                                                  |
| 17  | Mudar a posição na faixa arrastando a barra                                                                                                                 | Não verificado (evitou-se interferir na música em reprodução)                                                                                |
| 18  | Notch na lateral direita, expandido (260 × 428): aba Timer e player compacto com progresso abaixo                                                           | OK (captura)                                                                                                                                 |
| 19  | Aba Música na lateral: player empilhado, volume deitado abaixo dos controles                                                                                | **Não verificado no aplicativo real** — a automação não conseguiu abrir o painel nas tentativas seguintes; coberto por teste de componente   |
| 20  | Nome "Região de …" perto de uma capital; setas de troca de capital                                                                                          | Não verificado no aplicativo real (testes de Rust e de componente)                                                                           |
| 22  | Instalador: páginas de apresentação, boas-vindas, licença e pasta de destino, em português                                                                  | OK (capturas em `docs/images/instalador-*.png`); a instalação não foi executada                                                              |
| 23  | Notch aberto pelo mouse real; troca de aba pela roda (Timer → Tarefas → Música → Clima)                                                                     | OK — o cursor foi posicionado sobre o puxador e a roda girada de verdade (capturas em `docs/images/notch-*.png`)                             |
| 21  | Iniciar com o Windows: marcar a opção, sair e entrar na sessão                                                                                              | **Não verificado** — nem a gravação no registro nem a abertura no login foram exercitadas                                                    |
| 8   | Clima sem internet: aviso e dados anteriores                                                                                                                | Não verificado no aplicativo real                                                                                                            |
| 9   | Caixa de erro ao iniciar com banco inválido                                                                                                                 | Não verificado no aplicativo real                                                                                                            |
| 10  | Executar o instalador; atualizar por cima; desinstalar                                                                                                      | Não verificado                                                                                                                               |

## Linha de base de recursos

Medições únicas e informais do executável de release.

| Métrica                                      | Fase 1  | Fase 2  | Fase 8 (2026-10-13)                                           |
| -------------------------------------------- | ------- | ------- | ------------------------------------------------------------- |
| Tamanho do executável                        | 3,0 MB  | 4,1 MB  | 6,1 MB                                                        |
| Tamanho do instalador                        | —       | —       | 2,7 MB                                                        |
| Tempo até a janela principal existir         | —       | —       | cerca de 0,3 s                                                |
| Memória privada do processo principal        | —       | —       | 8,5 MB                                                        |
| Working set do processo principal            | 26,7 MB | 29,3 MB | 39,9 MB                                                       |
| Memória privada somada (app + WebView2)      | —       | —       | cerca de 252 MB, em 8 processos                               |
| Working set somado dos processos do WebView2 | ~396 MB | ~354 MB | não medido                                                    |
| CPU em repouso                               | —       | —       | 1,9 s de CPU em 30 s (0,4 % da máquina de 16 núcleos lógicos) |

Como ler estes números:

- A memória é quase toda do WebView2 (dois WebViews: janela principal e notch). O processo do
  próprio aplicativo é pequeno.
- A medição de CPU foi feita com o timer parado e as duas janelas abertas, mas **sem garantia
  de que o notch estivesse recolhido o tempo todo** nem de que ninguém estivesse usando o
  aplicativo; trate como limite superior grosseiro, não como o consumo em repouso verdadeiro.
- O tempo de inicialização é até a janela existir, não até a interface estar pintada.
- As somas de "working set" das fases anteriores contavam páginas compartilhadas mais de uma
  vez; a memória privada, medida agora, é a comparação mais honesta.

Falta medir com método (várias amostras, notch recolhido, sem interação) — pendência da Fase 8.

## Roteiros futuros

Os cenários obrigatórios de timer, banco, Kanban, dashboard e notch (suspensão do sistema,
múltiplos monitores, troca de monitor principal, cliques fora do overlay) serão detalhados aqui
quando cada fase for implementada.
