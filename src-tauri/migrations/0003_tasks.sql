-- Tarefas do Kanban. Horários em milissegundos desde a época Unix (UTC).
CREATE TABLE tasks (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    title               TEXT    NOT NULL CHECK (length(trim(title)) > 0),
    description         TEXT    NOT NULL DEFAULT '',
    priority            TEXT    NOT NULL CHECK (priority IN ('low', 'medium', 'high')),
    -- Coluna do quadro.
    status              TEXT    NOT NULL CHECK (status IN ('todo', 'doing', 'done')),
    -- Ordem dentro da coluna: 0, 1, 2… sem buracos.
    position            INTEGER NOT NULL CHECK (position >= 0),
    -- Prazo, como data local do usuário (AAAA-MM-DD), sem hora.
    due_date            TEXT    CHECK (
        due_date IS NULL
        OR due_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
    ),
    estimated_pomodoros INTEGER CHECK (
        estimated_pomodoros IS NULL OR estimated_pomodoros BETWEEN 1 AND 99
    ),
    created_at_ms       INTEGER NOT NULL,
    updated_at_ms       INTEGER NOT NULL,
    completed_at_ms     INTEGER,
    CHECK ((status = 'done') = (completed_at_ms IS NOT NULL))
) STRICT;

CREATE INDEX idx_tasks_status_position ON tasks (status, position);

-- Tarefa a que uma sessão de foco foi dedicada. Excluir a tarefa preserva a
-- sessão (ela continua contando nas estatísticas), só perde o vínculo.
ALTER TABLE pomodoro_sessions
    ADD COLUMN task_id INTEGER REFERENCES tasks (id) ON DELETE SET NULL;

CREATE INDEX idx_pomodoro_sessions_task ON pomodoro_sessions (task_id);

-- Tarefa escolhida para os próximos focos.
ALTER TABLE timer_state
    ADD COLUMN active_task_id INTEGER REFERENCES tasks (id) ON DELETE SET NULL;
