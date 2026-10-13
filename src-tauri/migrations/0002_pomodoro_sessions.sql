-- Uma linha por sessão iniciada (foco ou pausa), concluída ou não.
-- Horários em milissegundos desde a época Unix (UTC).
CREATE TABLE pomodoro_sessions (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    kind          TEXT    NOT NULL CHECK (kind IN ('focus', 'short_break', 'long_break')),
    planned_ms    INTEGER NOT NULL CHECK (planned_ms > 0),
    -- Tempo efetivamente decorrido com o timer rodando (pausas não contam).
    elapsed_ms    INTEGER NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0 AND elapsed_ms <= planned_ms),
    started_at_ms INTEGER NOT NULL,
    -- Último instante em que `elapsed_ms` foi gravado; base da recuperação.
    updated_at_ms INTEGER NOT NULL,
    ended_at_ms   INTEGER,
    -- 'active' enquanto em andamento; os demais são o motivo do encerramento.
    status        TEXT    NOT NULL
        CHECK (status IN ('active', 'completed', 'skipped', 'reset', 'interrupted')),
    CHECK ((status = 'active') = (ended_at_ms IS NULL))
) STRICT;

CREATE INDEX idx_pomodoro_sessions_started_at ON pomodoro_sessions (started_at_ms);

-- No máximo uma sessão em andamento.
CREATE UNIQUE INDEX idx_pomodoro_sessions_single_active
    ON pomodoro_sessions (status) WHERE status = 'active';

-- Posição no ciclo foco/pausas, para sobreviver ao reinício do aplicativo.
CREATE TABLE timer_state (
    id             INTEGER PRIMARY KEY CHECK (id = 1),
    phase          TEXT    NOT NULL CHECK (phase IN ('focus', 'short_break', 'long_break')),
    cycle_position INTEGER NOT NULL CHECK (cycle_position >= 0)
) STRICT;
