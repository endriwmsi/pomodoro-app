-- Rotinas: atividades que se repetem em horário fixo ("Hora do café").
-- Horários em minutos desde a meia-noite, no fuso local do computador.
CREATE TABLE routines (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    start_minute     INTEGER NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 240),
    -- Dias em que vale: um bit por dia, do 1 (segunda) ao 64 (domingo).
    weekdays         INTEGER NOT NULL CHECK (weekdays BETWEEN 1 AND 127),
    enabled          INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
    created_at_ms    INTEGER NOT NULL,
    -- A rotina termina no mesmo dia em que começa.
    CHECK (start_minute + duration_minutes <= 1440)
) STRICT;

-- Foco encurtado para caber antes de uma rotina ou do fim do expediente.
-- O tempo conta como foco, mas a sessão não soma um pomodoro concluído.
ALTER TABLE pomodoro_sessions
    ADD COLUMN short INTEGER NOT NULL DEFAULT 0 CHECK (short IN (0, 1));
