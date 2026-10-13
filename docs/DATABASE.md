# Banco de dados

SQLite local, acessado **somente** pelo backend Rust (`src-tauri/src/database/`). A escolha da
biblioteca está em [ADR-003](decisions/ADR-003-DATABASE-LAYER.md).

## Localização

| Item       | Valor                                                           |
| ---------- | --------------------------------------------------------------- |
| Diretório  | `app_data_dir()` do Tauri → `%APPDATA%\com.endriwmsi.compasso\` |
| Arquivo    | `compasso.db` (constante `DATABASE_FILE`)                       |
| Auxiliares | `compasso.db-wal` e `compasso.db-shm` (modo WAL)                |

O diretório é criado na primeira execução. Nada é gravado na pasta de instalação, então
reinstalar ou atualizar o aplicativo não toca nos dados. Para um backup manual, copie os três
arquivos com o aplicativo fechado. Não há rotina automática de backup.

## Abertura

`Database::open` é chamado no `setup` do Tauri (`src-tauri/src/lib.rs`), antes de qualquer
janela usar comandos:

1. cria o diretório, se necessário;
2. abre a conexão e configura:
   - `busy_timeout` de 5 s;
   - `journal_mode = WAL` — um encerramento abrupto não deixa o arquivo principal pela metade;
   - `synchronous = NORMAL` — seguro com WAL; no pior caso (queda de energia) perde-se a
     última transação, sem corromper o banco;
   - `foreign_keys = ON`;
3. aplica as migrations pendentes.

A conexão única fica em `Database { conn: Mutex<Connection> }`, registrada como estado do Tauri.
Os módulos de domínio usam `db.with_conn(|conn| ...)`; nenhum outro código abre conexões.

**Se a abertura falhar** (arquivo corrompido, sem permissão, esquema mais novo), o `setup`
retorna erro, o aplicativo mostra uma caixa de erro nativa com o motivo
(`report_startup_failure`, em `lib.rs`) e encerra. O arquivo não é modificado.

## Migrations

- Arquivos SQL em `src-tauri/migrations/NNNN_nome.sql`, embutidos no executável com
  `include_str!` e listados em `MIGRATIONS` (`src-tauri/src/database/migrations.rs`).
- A versão do esquema é o `PRAGMA user_version` do arquivo.
- Na abertura, cada migration com versão maior que a registrada roda **em sua própria
  transação, junto com a atualização de `user_version`**: ou é aplicada por inteiro, ou nada
  muda.
- Se o arquivo tiver uma versão **maior** que a conhecida pelo executável (downgrade do
  aplicativo), a abertura é recusada com `DatabaseError::SchemaTooNew` e o arquivo não é
  modificado.

Regras para evoluir o esquema:

1. Nunca edite nem remova uma migration já publicada.
2. Crie o próximo arquivo numerado e acrescente a entrada em `MIGRATIONS` com a versão seguinte
   (um teste garante que as versões são sequenciais a partir de 1).
3. Atualize este documento e adicione testes para o que mudou.

| Versão | Arquivo                      | Conteúdo                                                                                         |
| ------ | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| 1      | `0001_settings.sql`          | Tabela `settings`                                                                                |
| 2      | `0002_pomodoro_sessions.sql` | Tabelas `pomodoro_sessions` e `timer_state`                                                      |
| 3      | `0003_tasks.sql`             | Tabela `tasks`; colunas `pomodoro_sessions.task_id` e `timer_state.active_task_id`               |
| 4      | `0004_analytics_index.sql`   | Índices `idx_pomodoro_sessions_ended_at` e `idx_tasks_completed_at` (consultas das estatísticas) |

A tabela de tarefas (Fase 6) será criada pela migration da respectiva fase, junto com o código
que a utiliza — ver a nota no
[ROADMAP.md](ROADMAP.md#fase-2--persistência-local-).

## Esquema

### `settings`

Uma linha por **seção** de configuração. `STRICT`, `WITHOUT ROWID`.

| Coluna       | Tipo | Restrições                            | Descrição                       |
| ------------ | ---- | ------------------------------------- | ------------------------------- |
| `key`        | TEXT | PRIMARY KEY, NOT NULL                 | Nome da seção                   |
| `value`      | TEXT | NOT NULL, `CHECK (json_valid(value))` | JSON da seção                   |
| `updated_at` | TEXT | NOT NULL, padrão = agora              | UTC, ISO 8601 com milissegundos |

Seções existentes (`src-tauri/src/settings/`):

| `key`        | Struct Rust          | JSON                                                                                                                        |
| ------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `appearance` | `AppearanceSettings` | `{ "template": "glass" \| "matrix" }`                                                                                       |
| `timer`      | `TimerSettings`      | `{ "focusMinutes", "shortBreakMinutes", "longBreakMinutes", "cyclesBeforeLongBreak", "autoStartBreaks", "autoStartFocus" }` |

### `pomodoro_sessions`

Uma linha por sessão **iniciada** (foco ou pausa), tenha ela terminado como for. `STRICT`.
Horários em milissegundos desde a época Unix (UTC), o que facilita os agrupamentos por dia da
Fase 7. Escrita apenas por `src-tauri/src/timer/store.rs`.

| Coluna          | Tipo    | Restrições                                                       | Descrição                                             |
| --------------- | ------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| `id`            | INTEGER | PRIMARY KEY AUTOINCREMENT                                        | Identificador estável; nunca reutilizado              |
| `kind`          | TEXT    | `focus` \| `short_break` \| `long_break`                         | Tipo da sessão                                        |
| `planned_ms`    | INTEGER | `> 0`                                                            | Duração planejada ao iniciar                          |
| `elapsed_ms`    | INTEGER | `>= 0` e `<= planned_ms`                                         | Tempo efetivo com o timer rodando (pausas não contam) |
| `started_at_ms` | INTEGER | NOT NULL                                                         | Início                                                |
| `updated_at_ms` | INTEGER | NOT NULL                                                         | Último instante em que `elapsed_ms` foi gravado       |
| `ended_at_ms`   | INTEGER | nulo se, e somente se, `status = 'active'`                       | Término                                               |
| `status`        | TEXT    | `active` \| `completed` \| `skipped` \| `reset` \| `interrupted` | Em andamento, ou o motivo do encerramento             |

Índices: `idx_pomodoro_sessions_started_at` (`started_at_ms`), para consultas por período; e o
índice único parcial `idx_pomodoro_sessions_single_active` (`status` onde `status = 'active'`),
que garante no máximo uma sessão em andamento.

O estado final e o motivo do encerramento são a mesma coluna (`status`). A tarefa associada
(`task_id`) será acrescentada por migration na Fase 6, junto com a tabela de tarefas.

### `tasks`

Tarefas do Kanban (migration `0003`). `STRICT`. Escrita apenas por
`src-tauri/src/tasks/store.rs`; regras em [KANBAN.md](KANBAN.md).

| Coluna                | Tipo    | Restrições                                     |
| --------------------- | ------- | ---------------------------------------------- |
| `id`                  | INTEGER | PRIMARY KEY AUTOINCREMENT                      |
| `title`               | TEXT    | NOT NULL, não vazio depois de aparado          |
| `description`         | TEXT    | NOT NULL, padrão `''`                          |
| `priority`            | TEXT    | `low` \| `medium` \| `high`                    |
| `status`              | TEXT    | `todo` \| `doing` \| `done`                    |
| `position`            | INTEGER | `>= 0`; ordem dentro da coluna                 |
| `due_date`            | TEXT    | nulo ou no formato `AAAA-MM-DD` (data local)   |
| `estimated_pomodoros` | INTEGER | nulo ou entre 1 e 99                           |
| `created_at_ms`       | INTEGER | NOT NULL                                       |
| `updated_at_ms`       | INTEGER | NOT NULL                                       |
| `completed_at_ms`     | INTEGER | preenchido se, e somente se, `status = 'done'` |

Índice `idx_tasks_status_position` (`status`, `position`). Não há restrição de unicidade sobre
(`status`, `position`): ela atrapalharia a renumeração, e a densidade das posições é garantida
pelas transações do `store` (e conferida nos testes).

A mesma migration acrescentou duas colunas a tabelas existentes, ambas
`REFERENCES tasks (id) ON DELETE SET NULL`:

- `pomodoro_sessions.task_id` — tarefa a que um foco foi dedicado (índice
  `idx_pomodoro_sessions_task`). Excluir a tarefa preserva a sessão.
- `timer_state.active_task_id` — tarefa escolhida para os próximos focos.

### `timer_state`

Linha única (`id = 1`) com a posição no ciclo, para sobreviver ao reinício.

| Coluna           | Tipo    | Restrições                               | Descrição                            |
| ---------------- | ------- | ---------------------------------------- | ------------------------------------ |
| `id`             | INTEGER | PRIMARY KEY, `CHECK (id = 1)`            | Sempre 1                             |
| `phase`          | TEXT    | `focus` \| `short_break` \| `long_break` | Fase atual (ou a próxima, se parado) |
| `cycle_position` | INTEGER | `>= 0`                                   | Focos encerrados no ciclo atual      |

As regras de gravação e recuperação estão em [TIMER_ENGINE.md](TIMER_ENGINE.md#persistência).

A tabela `settings` tem ainda as seções `notch` (`NotchSettings`):
`{ "enabled": boolean, "position": "top" | "left" | "right", "theme": "dark" | "light" | "system" }` e `alerts` (`AlertSettings`):
`{ "soundEnabled": boolean, "notificationsEnabled": boolean }` e `goals` (`GoalSettings`):
`{ "dailyPomodoros": number | null }` e `weather` (`WeatherSettings`):
`{ "enabled": boolean, "useLocation": boolean }` e `general` (`GeneralSettings`):
`{ "launchAtLogin": boolean }` (padrão `false`).

`general.launchAtLogin` tem um efeito fora do banco: ao salvar, o backend cria ou remove a
entrada do Compasso em `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
(`tauri-plugin-autostart`). Se o Windows recusar, o valor gravado é desfeito e o comando
devolve erro — o banco nunca diz "ligado" com o registro desligado. Ao iniciar, o aplicativo
reaplica a preferência (o caminho do executável pode ter mudado).

Por que JSON por seção (tabela `settings`): acrescentar uma configuração não exige migration — o campo ausente
recebe o padrão ao carregar (`#[serde(default)]`).

## Configurações: padrões, limites e regras

Fonte de verdade: `src-tauri/src/settings/mod.rs`.

| Campo                         | Padrão           | Limites (inclusive)                        |
| ----------------------------- | ---------------- | ------------------------------------------ |
| `appearance.template`         | `glass`          | `glass`, `matrix`                          |
| `timer.focusMinutes`          | 25               | 1 – 180                                    |
| `timer.shortBreakMinutes`     | 5                | 1 – 60                                     |
| `timer.longBreakMinutes`      | 15               | 1 – 120                                    |
| `timer.cyclesBeforeLongBreak` | 4                | 1 – 12                                     |
| `timer.autoStartBreaks`       | `false`          | —                                          |
| `timer.autoStartFocus`        | `false`          | —                                          |
| `notch.enabled`               | `true`           | —                                          |
| `notch.position`              | `top`            | `top`, `left`, `right`                     |
| `alerts.soundEnabled`         | `true`           | —                                          |
| `alerts.notificationsEnabled` | `true`           | —                                          |
| `goals.dailyPomodoros`        | ausente (`null`) | 1 – 50, ou `null` para nenhuma meta        |
| `weather.enabled`             | `false`          | — (liga a única função que usa a internet) |
| `weather.useLocation`         | `false`          | —                                          |

O frontend espelha padrões e limites em `src/stores/settings.ts` apenas para o primeiro quadro
e para mensagens imediatas; ao mudar um valor aqui, atualize lá também.

**Gravação** (`store::save`): valida tudo e grava todas as seções em uma única transação. Se a
validação falhar, nada é escrito e o erro identifica o campo (`timer.focusMinutes`, …).

**Leitura** (`store::load`), tolerante por desenho — uma linha danificada não pode impedir o
aplicativo de abrir:

- seção ausente → padrões;
- campo ausente (gravado por versão anterior) → padrão daquele campo;
- JSON com formato inesperado → padrões da seção, sem afetar as demais;
- valores do timer fora dos limites → padrões do timer; meta fora dos limites → sem meta.

Nos três últimos casos um aviso vai para `stderr` e a linha original permanece até o próximo
`save`.

O efeito de cada configuração de avisos está em [NOTIFICATIONS.md](NOTIFICATIONS.md).

## Testes

`cargo test` (ver [TESTING.md](TESTING.md)) cobre: criação do arquivo e dos diretórios, pragmas,
recusa de arquivo que não é SQLite, aplicação e idempotência das migrations, aplicação apenas
das pendentes, rollback de migration com falha, recusa de esquema mais novo, restrição
`json_valid`, ida e volta das configurações, persistência após fechar e reabrir o arquivo,
rejeição de valores inválidos sem escrita e os quatro casos de leitura tolerante.
