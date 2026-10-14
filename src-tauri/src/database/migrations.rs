//! Migrations versionadas por `PRAGMA user_version`.
//!
//! Regras: migrations já publicadas nunca são editadas nem removidas; mudanças
//! de esquema entram como um novo arquivo em `src-tauri/migrations/` e uma
//! nova entrada, com a versão seguinte, em [`MIGRATIONS`].

use rusqlite::Connection;

use super::DatabaseError;

pub(super) struct Migration {
    /// Valor de `user_version` depois de aplicada. Sequencial, começando em 1.
    version: u32,
    sql: &'static str,
}

const MIGRATIONS: &[Migration] = &[
    Migration {
        version: 1,
        sql: include_str!("../../migrations/0001_settings.sql"),
    },
    Migration {
        version: 2,
        sql: include_str!("../../migrations/0002_pomodoro_sessions.sql"),
    },
    Migration {
        version: 3,
        sql: include_str!("../../migrations/0003_tasks.sql"),
    },
    Migration {
        version: 4,
        sql: include_str!("../../migrations/0004_analytics_index.sql"),
    },
    Migration {
        version: 5,
        sql: include_str!("../../migrations/0005_routines.sql"),
    },
];

pub(super) fn run(conn: &mut Connection) -> Result<(), DatabaseError> {
    apply(conn, MIGRATIONS)
}

/// Aplica, em ordem, as migrations com versão acima da registrada no banco.
/// Cada uma roda em sua própria transação, junto com a atualização de
/// `user_version`: ou a migration inteira é aplicada, ou nada muda.
fn apply(conn: &mut Connection, migrations: &[Migration]) -> Result<(), DatabaseError> {
    let current = schema_version(conn)?;
    let supported = migrations.last().map_or(0, |m| m.version);
    if current > supported {
        return Err(DatabaseError::SchemaTooNew {
            found: current,
            supported,
        });
    }

    for migration in migrations.iter().filter(|m| m.version > current) {
        let tx = conn.transaction()?;
        tx.execute_batch(migration.sql)?;
        tx.pragma_update(None, "user_version", migration.version)?;
        tx.commit()?;
    }
    Ok(())
}

fn schema_version(conn: &Connection) -> Result<u32, DatabaseError> {
    Ok(conn.query_row("PRAGMA user_version", [], |row| row.get(0))?)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table_exists(conn: &Connection, name: &str) -> bool {
        conn.query_row(
            "SELECT EXISTS (SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?1)",
            [name],
            |row| row.get(0),
        )
        .unwrap()
    }

    #[test]
    fn migration_versions_are_sequential_from_one() {
        for (index, migration) in MIGRATIONS.iter().enumerate() {
            assert_eq!(migration.version as usize, index + 1);
        }
    }

    #[test]
    fn fresh_database_reaches_the_latest_schema() {
        let mut conn = Connection::open_in_memory().unwrap();

        run(&mut conn).unwrap();

        assert_eq!(
            schema_version(&conn).unwrap(),
            MIGRATIONS.last().unwrap().version
        );
        assert!(table_exists(&conn, "settings"));
        assert!(table_exists(&conn, "pomodoro_sessions"));
        assert!(table_exists(&conn, "timer_state"));
        assert!(table_exists(&conn, "tasks"));
    }

    #[test]
    fn sessions_recorded_before_tasks_existed_survive_the_upgrade() {
        let mut conn = Connection::open_in_memory().unwrap();
        apply(&mut conn, &MIGRATIONS[..2]).unwrap();
        conn.execute(
            "INSERT INTO pomodoro_sessions
                 (kind, planned_ms, elapsed_ms, started_at_ms, updated_at_ms, ended_at_ms, status)
             VALUES ('focus', 1000, 1000, 0, 1000, 1000, 'completed')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO timer_state (id, phase, cycle_position) VALUES (1, 'short_break', 2)",
            [],
        )
        .unwrap();

        run(&mut conn).unwrap();

        let (status, task): (String, Option<i64>) = conn
            .query_row("SELECT status, task_id FROM pomodoro_sessions", [], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .unwrap();
        let (phase, active): (String, Option<i64>) = conn
            .query_row("SELECT phase, active_task_id FROM timer_state", [], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .unwrap();
        assert_eq!((status.as_str(), task), ("completed", None));
        assert_eq!((phase.as_str(), active), ("short_break", None));
    }

    #[test]
    fn a_database_from_the_first_release_is_upgraded_keeping_its_settings() {
        let mut conn = Connection::open_in_memory().unwrap();
        apply(&mut conn, &MIGRATIONS[..1]).unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('timer', '{\"focusMinutes\": 50}')",
            [],
        )
        .unwrap();

        run(&mut conn).unwrap();

        let stored: String = conn
            .query_row(
                "SELECT value FROM settings WHERE key = 'timer'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(stored, "{\"focusMinutes\": 50}");
        assert!(table_exists(&conn, "pomodoro_sessions"));
    }

    #[test]
    fn only_one_session_can_be_active() {
        let mut conn = Connection::open_in_memory().unwrap();
        run(&mut conn).unwrap();
        let insert = "INSERT INTO pomodoro_sessions
                          (kind, planned_ms, started_at_ms, updated_at_ms, status)
                      VALUES ('focus', 1000, 0, 0, 'active')";
        conn.execute(insert, []).unwrap();

        assert!(conn.execute(insert, []).is_err());
    }

    #[test]
    fn a_finished_session_requires_an_end_time() {
        let mut conn = Connection::open_in_memory().unwrap();
        run(&mut conn).unwrap();

        let result = conn.execute(
            "INSERT INTO pomodoro_sessions
                 (kind, planned_ms, started_at_ms, updated_at_ms, status)
             VALUES ('focus', 1000, 0, 0, 'completed')",
            [],
        );

        assert!(result.is_err());
    }

    #[test]
    fn running_twice_keeps_existing_data() {
        let mut conn = Connection::open_in_memory().unwrap();
        run(&mut conn).unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('probe', '{}')",
            [],
        )
        .unwrap();

        run(&mut conn).unwrap();

        let rows: i64 = conn
            .query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))
            .unwrap();
        assert_eq!(rows, 1);
    }

    #[test]
    fn only_pending_migrations_are_applied() {
        let first = Migration {
            version: 1,
            sql: "CREATE TABLE a (id INTEGER PRIMARY KEY);",
        };
        let second = Migration {
            version: 2,
            sql: "CREATE TABLE b (id INTEGER PRIMARY KEY);",
        };
        let mut conn = Connection::open_in_memory().unwrap();
        apply(&mut conn, &[first]).unwrap();
        conn.execute("INSERT INTO a (id) VALUES (7)", []).unwrap();

        // Reaplicar a primeira falharia ("table a already exists").
        let first_again = Migration {
            version: 1,
            sql: "CREATE TABLE a (id INTEGER PRIMARY KEY);",
        };
        apply(&mut conn, &[first_again, second]).unwrap();

        assert_eq!(schema_version(&conn).unwrap(), 2);
        assert!(table_exists(&conn, "b"));
        let kept: i64 = conn
            .query_row("SELECT id FROM a", [], |row| row.get(0))
            .unwrap();
        assert_eq!(kept, 7);
    }

    #[test]
    fn a_failing_migration_is_rolled_back_entirely() {
        let good = Migration {
            version: 1,
            sql: "CREATE TABLE a (id INTEGER PRIMARY KEY);",
        };
        let broken = Migration {
            version: 2,
            sql: "CREATE TABLE half_done (id INTEGER PRIMARY KEY); ISTO NAO E SQL;",
        };
        let mut conn = Connection::open_in_memory().unwrap();

        let result = apply(&mut conn, &[good, broken]);

        assert!(matches!(result, Err(DatabaseError::Sqlite(_))));
        assert_eq!(schema_version(&conn).unwrap(), 1);
        assert!(table_exists(&conn, "a"));
        assert!(!table_exists(&conn, "half_done"));
    }

    #[test]
    fn a_database_from_a_newer_app_is_refused_and_left_untouched() {
        let mut conn = Connection::open_in_memory().unwrap();
        let newer = MIGRATIONS.last().unwrap().version + 1;
        conn.pragma_update(None, "user_version", newer).unwrap();

        let result = run(&mut conn);

        assert!(matches!(
            result,
            Err(DatabaseError::SchemaTooNew { found, .. }) if found == newer
        ));
        assert_eq!(schema_version(&conn).unwrap(), newer);
        assert!(!table_exists(&conn, "settings"));
    }

    #[test]
    fn settings_table_rejects_values_that_are_not_json() {
        let mut conn = Connection::open_in_memory().unwrap();
        run(&mut conn).unwrap();

        let result = conn.execute(
            "INSERT INTO settings (key, value) VALUES ('timer', 'não é json')",
            [],
        );

        assert!(result.is_err());
    }
}
