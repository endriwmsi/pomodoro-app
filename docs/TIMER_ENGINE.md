# Engine do timer

O timer vive inteiramente no backend Rust (`src-tauri/src/timer/`). As janelas apenas exibem o
último estado recebido e enviam comandos. As decisões de projeto estão em
[ADR-002](decisions/ADR-002-TIMER-ENGINE.md); este documento descreve a implementação.

## Componentes

| Arquivo           | Papel                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| `timer/engine.rs` | Máquina de estados **pura**: sem E/S e sem relógio. Recebe o instante atual e devolve `Effect`s. |
| `timer/clock.rs`  | Trait `Clock` e `SystemClock`; `FakeClock` para testes.                                          |
| `timer/store.rs`  | SQL de `pomodoro_sessions` e `timer_state`.                                                      |
| `timer/mod.rs`    | `TimerService`: aplica a engine, grava os efeitos, notifica as janelas e roda o ticker.          |

## Modelo de estado

Duas dimensões independentes:

- **Fase** (`Phase`) — o tipo da sessão: `focus`, `shortBreak`, `longBreak`.
- **Situação** (`Status`) — `idle`, `running`, `paused`.

Uma sessão de foco pausada continua sendo `focus` + `paused`. Em `idle` não há sessão em
andamento e a fase indica a **próxima** sessão a iniciar.

Além disso, `cyclePosition` conta os focos já encerrados no ciclo atual e decide quando vem a
pausa longa.

### Transições

| Comando / evento      | `idle`                                 | `running`                                        | `paused`                                |
| --------------------- | -------------------------------------- | ------------------------------------------------ | --------------------------------------- |
| `start`               | inicia uma sessão da fase atual        | sem efeito                                       | retoma a mesma sessão                   |
| `pause`               | sem efeito                             | pausa (`pauseReason: user`)                      | sem efeito                              |
| `skip`                | avança a fase (nenhuma sessão gravada) | encerra como **pulada** e avança a fase          | encerra como **pulada** e avança a fase |
| `reset`               | sem efeito                             | encerra como **reiniciada**; mesma fase, `idle`  | idem                                    |
| tempo esgotado        | —                                      | encerra como **concluída** e avança a fase       | —                                       |
| salto de tempo        | —                                      | pausa (`pauseReason: suspend`)                   | —                                       |
| encerrar o aplicativo | —                                      | encerra como **interrompida**; a fase não avança | idem                                    |

Comandos "sem efeito" não são erro: devolvem o estado atual. Cliques repetidos ou vindos de
janelas diferentes nunca falham por isso.

**Avanço de fase:** `focus` → `shortBreak` (ou `longBreak`, se `cyclePosition` alcançou
`cyclesBeforeLongBreak`); `shortBreak` → `focus`; `longBreak` → `focus`, zerando
`cyclePosition`.

**Início automático:** depois de avançar a fase (por conclusão **ou** por `skip`), a nova fase
inicia sozinha se a configuração correspondente estiver ligada — `autoStartBreaks` para pausas,
`autoStartFocus` para focos. Caso contrário o timer fica em `idle`.

**Comando simultâneo à conclusão:** todo comando primeiro sincroniza o tempo. Se essa
sincronização concluir a sessão, o comando é descartado — ele se referia a uma sessão que já
terminou e não deve atingir a seguinte (ex.: um "pular" clicado no instante final não pula a
pausa que acabou de começar).

### Regras de negócio

- **Pomodoro concluído** = sessão `focus` com desfecho `completed`, isto é, cujo tempo ativo
  atingiu a duração planejada. Sessões puladas, reiniciadas ou interrompidas ficam registradas,
  mas não contam como concluídas.
- **Posição no ciclo:** todo foco encerrado por conclusão ou por `skip` avança
  `cyclePosition`. Pular um foco, portanto, aproxima a pausa longa, embora não conte como
  pomodoro concluído. `reset` e interrupção não avançam.
- **Mudança de configurações:** vale a partir da próxima sessão iniciada. A sessão em andamento
  mantém a duração com que começou; em `idle`, o tempo exibido passa a refletir a nova duração
  imediatamente.
- O tempo registrado de uma sessão nunca excede o planejado.

## Tempo

`Clock::now()` devolve um `Tick` com duas leituras:

| Campo     | Fonte                          | Uso                                                           |
| --------- | ------------------------------ | ------------------------------------------------------------- |
| `mono_ms` | `Instant` (monotônico)         | **Único** usado para medir tempo decorrido                    |
| `wall_ms` | `SystemTime` (calendário, UTC) | Carimbar início/fim das sessões e ajudar a detectar suspensão |

O tempo restante não é decrementado: a cada leitura (`Engine::sync`), o tempo ativo acumulado
da sessão cresce pela diferença monotônica desde a leitura anterior, e
`restante = planejado − acumulado`. Atrasar ou adiantar o relógio do sistema não altera a
contagem.

### Suspensão do computador

A documentação do Rust não garante se `Instant` avança durante a suspensão, então a engine
cobre os dois casos: se, entre duas leituras consecutivas com a sessão rodando, **qualquer um**
dos relógios avançar mais que `SUSPEND_GAP_MS` (30 s), o intervalo inteiro é descartado — não
conta como tempo trabalhado — e a sessão é **pausada** com `pauseReason: suspend`. O usuário
retoma de onde parou.

Consequências aceitas:

- adiantar manualmente o relógio do sistema em mais de 30 s durante uma sessão também a pausa
  (inofensivo: nenhum tempo é perdido nem inventado);
- se o processo ficar mais de 30 s sem ler o relógio por outro motivo, a sessão é pausada.

**Não medido:** o comportamento real de `Instant` em uma suspensão do Windows não foi
observado; a lógica acima foi verificada apenas com relógio falso (ver
[TESTING.md](TESTING.md)).

## Ticker

`TimerService::run_ticker` roda em uma thread própria (`timer-ticker`):

- com uma sessão **rodando**, sincroniza a engine a cada 250 ms;
- **parado ou pausado**, a thread dorme bloqueada em um canal e só acorda quando um comando
  chega — não há consumo periódico de CPU em repouso.

O ticker não depende de nenhuma janela: a contagem e a conclusão acontecem mesmo com a janela
minimizada ou oculta.

## Persistência

Esquema em [DATABASE.md](DATABASE.md#pomodoro_sessions). Cada operação da engine devolve
efeitos, gravados **em uma única transação**:

| Efeito       | Quando                                                        | Gravação                                    |
| ------------ | ------------------------------------------------------------- | ------------------------------------------- |
| `Started`    | uma sessão começa                                             | nova linha com `status = 'active'`          |
| `Checkpoint` | a cada 10 s de tempo ativo, ao pausar e ao detectar suspensão | atualiza `elapsed_ms` e `updated_at_ms`     |
| `Finished`   | conclusão, `skip`, `reset`, encerramento                      | `status` final, `elapsed_ms`, `ended_at_ms` |

A fase e a posição no ciclo são gravadas em `timer_state` sempre que mudam.

**Consistência memória × banco:** `TimerService::apply` executa a operação sobre uma _cópia_ da
engine, grava os efeitos e só então adota a cópia. Se a gravação falhar, o estado em memória
permanece o anterior e o comando devolve erro (`kind: 'database'`); no ticker, a tentativa se
repete na volta seguinte.

**Sem duplicação:** a conclusão é uma transição da engine, feita sob o lock do serviço — ticks
posteriores não encontram mais a sessão. No banco, `store::finish` só atualiza uma linha ainda
`active`, e um índice único impede duas sessões `active`.

### Recuperação

| Situação                              | O que acontece                                                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Aplicativo fechado normalmente        | `RunEvent::Exit` → `TimerService::shutdown`: a sessão vira `interrupted` com o tempo exato.                                                                                  |
| Processo morto (queda, energia, kill) | Na abertura seguinte, `TimerService::new` fecha a linha `active` como `interrupted`, com o tempo e o horário do último checkpoint (perde-se no máximo ~10 s de tempo ativo). |

Em ambos os casos o timer reabre em `idle`, na mesma fase e posição de ciclo, com a duração
cheia. Uma sessão interrompida **nunca** é contada como concluída nem retomada automaticamente.

Enquanto não houver bandeja do sistema (Fase 4), fechar a janela principal encerra o
aplicativo e, portanto, interrompe a sessão em andamento.

## Contrato com o frontend

Comandos (`src-tauri/src/commands/timer.rs`), todos devolvendo `TimerSnapshot`:

| Comando           | Efeito                                            |
| ----------------- | ------------------------------------------------- |
| `timer_get_state` | Estado atual (sincronizado no momento da chamada) |
| `timer_start`     | Inicia a fase atual ou retoma a sessão pausada    |
| `timer_pause`     | Pausa                                             |
| `timer_skip`      | Pula para a fase seguinte                         |
| `timer_reset`     | Abandona a sessão e volta ao início da fase       |

```ts
interface TimerSnapshot {
  phase: 'focus' | 'shortBreak' | 'longBreak';
  status: 'idle' | 'running' | 'paused';
  remainingMs: number;
  plannedMs: number;
  cyclePosition: number;
  cyclesBeforeLongBreak: number;
  pauseReason: 'user' | 'suspend' | null;
  taskId: number | null; // tarefa escolhida para os focos
}
```

Evento **`timer:state`** (payload: `TimerSnapshot`), emitido a todas as janelas quando o estado
exibível muda: qualquer transição e, com a sessão rodando, uma vez por segundo exibido. Parado
ou pausado, nenhum evento é emitido.

Segundos exibidos = `ceil(remainingMs / 1000)`: a contagem começa em `25:00` e só mostra
`00:00` quando o tempo acabou. O frontend usa o mesmo arredondamento (`src/lib/format.ts`).

### No frontend

- `src/stores/timer.ts` guarda o último snapshot. `connect()` assina o evento e **depois** lê
  o estado inicial, para não perder mudanças; é chamado em `App.tsx`, de modo que o estado
  segue atualizado em qualquer tela.
- Não há `setInterval` nem cálculo de tempo na interface: o que aparece é sempre o último
  snapshot do backend.
- `src/features/pomodoro/PomodoroPage.tsx` exibe fase, situação, tempo, progresso, posição no
  ciclo e os controles. Fora do aplicativo desktop mostra uma pré-visualização parada, com os
  controles desabilitados.

## Tarefa do foco

A engine guarda uma tarefa escolhida (`task_id`), sem regras próprias sobre ela: apenas a
repassa no `TimerSnapshot` e no efeito `Started` das sessões de foco. As regras — quem pode ser
escolhida, o que acontece ao concluir ou excluir a tarefa — estão em
[KANBAN.md](KANBAN.md#tarefas-e-o-timer).

- `Engine::focus` ("ir direto para um foco"): inicia o foco parado, retoma o pausado, mantém o
  que está rodando e, se a fase atual é uma pausa, encerra-a como pulada (se havia sessão) e
  começa o foco seguinte.
- `TimerService::set_task`, `focus_task` e `task_unavailable` gravam a escolha em
  `timer_state.active_task_id` na mesma transação dos demais efeitos; se um foco já estava em
  andamento, a linha da sessão é reatribuída (`store::assign_task`).
- Comandos: `timer_set_task({ taskId })` e `timer_focus_task({ taskId })`
  (`commands/tasks.rs`), ambos devolvendo `TimerSnapshot`.

## Pendências

- Medir o comportamento de `Instant` durante a suspensão no Windows.
- Notificação e som ao concluir (Fase 5) — devem ser disparados a partir do efeito `Finished`
  com desfecho `Completed`, que ocorre uma única vez por sessão.
- Atalhos de teclado para os controles.
