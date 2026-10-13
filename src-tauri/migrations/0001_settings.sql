-- Configurações do usuário, uma linha por seção (ex.: 'appearance', 'timer').
-- `value` guarda o JSON da seção; campos ausentes recebem o padrão ao carregar,
-- então acrescentar uma configuração não exige migration.
CREATE TABLE settings (
    key        TEXT PRIMARY KEY NOT NULL,
    value      TEXT NOT NULL CHECK (json_valid(value)),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
) STRICT, WITHOUT ROWID;
