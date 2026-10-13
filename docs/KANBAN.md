# Kanban

Quadro de tarefas com três colunas fixas. Regras e persistência ficam no backend
(`src-tauri/src/tasks/`); a interface (`src/features/kanban/`) exibe a lista devolvida por ele.

## Modelo

| Campo                        | Tipo                        | Regra                                                                                            |
| ---------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------ |
| `id`                         | inteiro                     | Gerado pelo banco; estável, nunca reutilizado                                                    |
| `title`                      | texto                       | Obrigatório; sem espaços nas pontas; até 200 caracteres                                          |
| `description`                | texto                       | Opcional; até 4 000 caracteres                                                                   |
| `priority`                   | `low` \| `medium` \| `high` | Baixa, Média, Alta. Só informativa: não reordena o quadro. Cada uma tem uma cor (ver THEMING.md) |
| `status`                     | `todo` \| `doing` \| `done` | A coluna: A fazer, Em andamento, Concluído                                                       |
| `position`                   | inteiro ≥ 0                 | Ordem na coluna; sempre 0, 1, 2… sem buracos                                                     |
| `dueDate`                    | `AAAA-MM-DD` ou nulo        | Data **local**, sem hora nem fuso; precisa existir no calendário                                 |
| `estimatedPomodoros`         | 1–99 ou nulo                | Estimativa opcional                                                                              |
| `createdAtMs`, `updatedAtMs` | ms desde 1970 (UTC)         | `updatedAtMs` muda ao editar e ao trocar de coluna                                               |
| `completedAtMs`              | ms ou nulo                  | Preenchido se, e somente se, a tarefa está em Concluído                                          |
| `completedPomodoros`         | inteiro (calculado)         | Sessões de **foco concluídas** dedicadas à tarefa                                                |

Esquema em [DATABASE.md](DATABASE.md#tasks). `TaskInput` (criação e edição) contém `title`,
`description`, `priority`, `dueDate` e `estimatedPomodoros`; coluna e posição só mudam por
movimentação.

A validação é feita em `TaskInput::normalized` (Rust). O formulário repete as checagens
básicas para dar retorno imediato, mas o backend é quem decide.

## Operações

Comandos em `src-tauri/src/commands/tasks.rs`. Os que alteram o quadro **devolvem a lista
completa já atualizada** e emitem o evento `tasks:changed` (sem payload) para todas as janelas.

| Comando                            | Efeito                                               |
| ---------------------------------- | ---------------------------------------------------- |
| `tasks_list()`                     | Todas as tarefas, na ordem do quadro                 |
| `task_create({ input })`           | Cria no **fim** da coluna A fazer                    |
| `task_update({ id, input })`       | Altera os campos editáveis; coluna e ordem não mudam |
| `task_delete({ id })`              | Exclui e fecha o buraco na coluna                    |
| `task_move({ id, status, index })` | Move para a coluna `status`, na posição `index`      |

Erros: `validation` (com `field`: `title`, `description`, `dueDate`, `estimatedPomodoros`),
`notFound` (a tarefa foi excluída, possivelmente por outra janela) e `database`.

### Movimentação e ordem

`task_move` recebe a posição **na coluna de destino, contada sem a própria tarefa**; um índice
além do fim significa "no fim". A mesma operação serve para reordenar dentro da coluna e para
trocar de coluna.

Cada movimento roda em **uma transação** que reescreve as posições das colunas afetadas como
0, 1, 2… Assim:

- movimentos rápidos e sucessivos não acumulam erro — cada um parte do estado gravado;
- uma falha no meio desfaz tudo: não ficam buracos nem posições repetidas;
- a ordem sobrevive ao reinício (há teste que fecha e reabre o arquivo).

Entrar em Concluído grava `completedAtMs`; sair apaga. Reordenar **dentro** de Concluído
preserva a data original.

### Exclusão

Pede confirmação na interface. As sessões de foco já dedicadas à tarefa são **mantidas** (o
vínculo é anulado por `ON DELETE SET NULL`), para que as estatísticas não mudem
retroativamente.

## Tarefas e o timer

O timer pode ter uma **tarefa escolhida** (`taskId` no `TimerSnapshot`, persistida em
`timer_state.active_task_id`). Usar o timer sem tarefa continua possível.

| Comando                        | Efeito                                                                 |
| ------------------------------ | ---------------------------------------------------------------------- |
| `timer_set_task({ taskId })`   | Escolhe a tarefa (`null` para nenhuma) sem mexer no andamento do timer |
| `timer_focus_task({ taskId })` | "Focar nesta tarefa": escolhe a tarefa e vai direto para um foco       |

Regras:

- Toda sessão de **foco** nasce dedicada à tarefa escolhida naquele momento
  (`pomodoro_sessions.task_id`). Pausas nunca têm tarefa.
- Trocar a tarefa escolhida **durante um foco em andamento** passa esse foco para a nova
  tarefa (ou para nenhuma): a sessão é uma só e pertence ao que se está fazendo agora.
- `timer_focus_task`:
  - move a tarefa de A fazer para o fim de Em andamento, se for o caso;
  - foco parado → inicia; foco pausado → retoma; foco rodando → segue (só troca a tarefa);
  - durante uma pausa (ou com uma pausa por iniciar) → a pausa é encerrada como **pulada** e
    o foco seguinte começa.
- Só tarefas abertas podem ser escolhidas: uma tarefa concluída é recusada (`validation`,
  campo `taskId`).
- Concluir ou excluir a tarefa escolhida a desvincula do timer (`TimerService::task_unavailable`);
  a sessão em andamento continua, sem tarefa.
- **Pomodoros de uma tarefa** = sessões de foco com desfecho `completed` dedicadas a ela.
  Focos pulados, reiniciados ou interrompidos não contam.

Ao concluir um foco, o backend também emite `tasks:changed`, pois a contagem da tarefa mudou.

## Interface

`src/features/kanban/`:

| Arquivo          | Papel                                                                           |
| ---------------- | ------------------------------------------------------------------------------- |
| `KanbanPage.tsx` | Colunas, arrastar e soltar, confirmação de exclusão                             |
| `TaskCard.tsx`   | Cartão: título, descrição, prioridade, prazo, pomodoros, ações                  |
| `TaskDialog.tsx` | Formulário de criação e edição                                                  |
| `board.ts`       | Funções puras: agrupar por coluna, traduzir um arraste ou um passo em movimento |

`src/stores/tasks.ts` guarda a última lista recebida; assina `tasks:changed` e recarrega. Não
há atualização otimista: o cartão muda de lugar quando o backend responde.

### Mover sem arrastar

Arrastar não é a única forma de mover:

- cada cartão tem quatro botões — coluna anterior, para cima, para baixo, próxima coluna —
  desabilitados quando não há para onde ir;
- a alça de arraste também funciona pelo teclado (dnd-kit): foco na alça, Espaço para pegar,
  setas para mover, Espaço para soltar, Esc para cancelar.

### Arrastar e soltar

`@dnd-kit` com sensores de ponteiro (a partir de 6 px de movimento, para não confundir com
clique) e de teclado. Ao soltar, `resolveDrop` decide o destino:

- sobre um cartão → ocupa o lugar dele (na mesma coluna ou vindo de outra);
- sobre uma coluna, fora de qualquer cartão → fim dessa coluna;
- sobre si mesmo ou sobre a própria coluna → nada.

Durante o arraste entre colunas não há pré-visualização da posição final na coluna de destino
— apenas a coluna em destaque e o cartão fantasma seguindo o ponteiro.

### No notch

A aba **Tarefas** do notch lista as tarefas abertas (Em andamento primeiro, depois A fazer),
com um botão **Focar** e uma caixa para concluir cada uma. Ver
[WINDOW_MANAGER.md](WINDOW_MANAGER.md#abas).

## Limitações

- Colunas fixas; não há arquivamento, etiquetas, filtros nem busca.
- A prioridade não ordena as tarefas.
- Na pré-visualização do navegador (fora do aplicativo) o quadro fica vazio e desabilitado.
- O arraste com o mouse real não foi exercitado por teste automatizado (o jsdom não simula
  layout); a lógica de destino (`resolveDrop`) e os botões de movimento são testados.
