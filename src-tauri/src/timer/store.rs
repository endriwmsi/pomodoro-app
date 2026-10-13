//! Persistência das sessões (`pomodoro_sessions`) e da posição no ciclo
//! (`timer_state`).

use rusqlite::{Connection, OptionalExtension};

use super::engine::{Outcome, Phase};
use crate::error::AppError;

fn phase_to_db(phase: Phase) -> &'static str {
    match phase {
        Phase::Focus => "focus",
        Phase::ShortBreak => "short_break",
        Phase::LongBreak => "long_break",
    }
}

fn phase_from_db(value: &str) -> Option<Phase> {
    match value {
        "focus" => Some(Phase::Focus),
        "short_break" => Some(Phase::ShortBreak),
        "long_break" => Some(Phase::LongBreak),
        _ => None,
    }
}

fn outcome_to_db(outcome: Outcome) -> &'static str {
    match outcome {
        Outcome::Completed => "completed",
        Outcome::Skipped => "skipped",
        Outcome::Reset => "reset",
        Outcome::Interrupted => "interrupted",
    }
}

/// O SQLite guarda inteiros com sinal; durações nunca chegam perto do limite.
fn ms_to_db(ms: u64) -> i64 {
    i64::try_from(ms).unwrap_or(i64::MAX)
}

/// Encerra como interrompida qualquer sessão que tenha ficado em andamento
/// (o processo terminou sem avisar). O fim registrado é o último progresso
/// gravado: é tudo o que se sabe com certeza. Retorna quantas foram fechadas.
pub fn interrupt_active(conn: &Connection) -> Result<usize, AppError> {
    Ok(conn.execute(
        "UPDATE pomodoro_sessions
            SET status = 'interrupted', ended_at_ms = updated_at_ms
          WHERE status = 'active'",
        [],
    )?)
}

/// Fase e posição no ciclo gravadas; foco na posição 0 se não houver nada.
pub fn load_rotation(conn: &Connection) -> Result<(Phase, u32), AppError> {
    let stored: Option<(String, u32)> = conn
        .query_row(
            "SELECT phase, cycle_position FROM timer_state WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    Ok(stored
        .and_then(|(phase, position)| Some((phase_from_db(&phase)?, position)))
        .unwrap_or((Phase::Focus, 0)))
}

pub fn save_rotation(conn: &Connection, phase: Phase, cycle_position: u32) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO timer_state (id, phase, cycle_position) VALUES (1, ?1, ?2)
         ON CONFLICT (id) DO UPDATE SET
             phase = excluded.phase,
             cycle_position = excluded.cycle_position",
        (phase_to_db(phase), cycle_position),
    )?;
    Ok(())
}

/// Tarefa escolhida para os focos, se houver (e se ainda existir).
pub fn load_active_task(conn: &Connection) -> Result<Option<i64>, AppError> {
    let stored: Option<Option<i64>> = conn
        .query_row(
            "SELECT active_task_id FROM timer_state WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    Ok(stored.flatten())
}

pub fn save_active_task(conn: &Connection, task_id: Option<i64>) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO timer_state (id, phase, cycle_position, active_task_id)
         VALUES (1, 'focus', 0, ?1)
         ON CONFLICT (id) DO UPDATE SET active_task_id = excluded.active_task_id",
        [task_id],
    )?;
    Ok(())
}

/// Registra o início de uma sessão e devolve seu ID. `task_id` é a tarefa a
/// que um foco é dedicado.
pub fn insert_session(
    conn: &Connection,
    phase: Phase,
    planned_ms: u64,
    at_ms: i64,
    task_id: Option<i64>,
) -> Result<i64, AppError> {
    conn.execute(
        "INSERT INTO pomodoro_sessions
             (kind, planned_ms, started_at_ms, updated_at_ms, status, task_id)
         VALUES (?1, ?2, ?3, ?3, 'active', ?4)",
        (phase_to_db(phase), ms_to_db(planned_ms), at_ms, task_id),
    )?;
    Ok(conn.last_insert_rowid())
}

/// Passa a sessão em andamento para outra tarefa (ou para nenhuma).
pub fn assign_task(conn: &Connection, id: i64, task_id: Option<i64>) -> Result<(), AppError> {
    let updated = conn.execute(
        "UPDATE pomodoro_sessions SET task_id = ?2 WHERE id = ?1 AND status = 'active'",
        (id, task_id),
    )?;
    expect_active(updated, id)
}

pub fn checkpoint(conn: &Connection, id: i64, elapsed_ms: u64, at_ms: i64) -> Result<(), AppError> {
    let updated = conn.execute(
        "UPDATE pomodoro_sessions SET elapsed_ms = ?2, updated_at_ms = ?3
          WHERE id = ?1 AND status = 'active'",
        (id, ms_to_db(elapsed_ms), at_ms),
    )?;
    expect_active(updated, id)
}

/// Encerra a sessão. Só afeta uma sessão ainda em andamento: encerrar duas
/// vezes a mesma sessão é um erro, nunca um segundo registro.
pub fn finish(
    conn: &Connection,
    id: i64,
    outcome: Outcome,
    elapsed_ms: u64,
    at_ms: i64,
) -> Result<(), AppError> {
    let updated = conn.execute(
        "UPDATE pomodoro_sessions
            SET status = ?2, elapsed_ms = ?3, updated_at_ms = ?4, ended_at_ms = ?4
          WHERE id = ?1 AND status = 'active'",
        (id, outcome_to_db(outcome), ms_to_db(elapsed_ms), at_ms),
    )?;
    expect_active(updated, id)
}

fn expect_active(updated: usize, id: i64) -> Result<(), AppError> {
    if updated == 1 {
        Ok(())
    } else {
        Err(AppError::Database {
            message: format!("a sessão {id} não está em andamento"),
        })
    }
}

#[cfg(test)]
pub mod testing {
    use rusqlite::Connection;

    /// Linha de `pomodoro_sessions`, para asserções nos testes.
    #[derive(Debug, Clone, PartialEq, Eq)]
    pub struct SessionRow {
        pub id: i64,
        pub kind: String,
        pub planned_ms: i64,
        pub elapsed_ms: i64,
        pub started_at_ms: i64,
        pub updated_at_ms: i64,
        pub ended_at_ms: Option<i64>,
        pub status: String,
        pub task_id: Option<i64>,
    }

    pub fn sessions(conn: &Connection) -> Vec<SessionRow> {
        conn.prepare(
            "SELECT id, kind, planned_ms, elapsed_ms, started_at_ms, updated_at_ms,
                    ended_at_ms, status, task_id
               FROM pomodoro_sessions ORDER BY id",
        )
        .unwrap()
        .query_map([], |row| {
            Ok(SessionRow {
                id: row.get(0)?,
                kind: row.get(1)?,
                planned_ms: row.get(2)?,
                elapsed_ms: row.get(3)?,
                started_at_ms: row.get(4)?,
                updated_at_ms: row.get(5)?,
                ended_at_ms: row.get(6)?,
                status: row.get(7)?,
                task_id: row.get(8)?,
            })
        })
        .unwrap()
        .collect::<Result<_, _>>()
        .unwrap()
    }
}

#[cfg(test)]
mod tests {
    use super::testing::sessions;
    use super::*;
    use crate::database::Database;

    fn with_db<T>(f: impl FnOnce(&mut Connection) -> T) -> T {
        let db = Database::open_in_memory().unwrap();
        db.with_conn(|conn| Ok(f(conn))).unwrap()
    }

    #[test]
    fn a_session_is_recorded_from_start_to_finish() {
        with_db(|conn| {
            let id = insert_session(conn, Phase::Focus, 1_500_000, 1_000, None).unwrap();
            checkpoint(conn, id, 10_000, 11_000).unwrap();
            finish(conn, id, Outcome::Completed, 1_500_000, 1_501_000).unwrap();

            let rows = sessions(conn);
            assert_eq!(rows.len(), 1);
            let row = &rows[0];
            assert_eq!(row.kind, "focus");
            assert_eq!(row.planned_ms, 1_500_000);
            assert_eq!(row.elapsed_ms, 1_500_000);
            assert_eq!(row.started_at_ms, 1_000);
            assert_eq!(row.ended_at_ms, Some(1_501_000));
            assert_eq!(row.status, "completed");
        });
    }

    #[test]
    fn finishing_twice_is_an_error_and_keeps_the_first_result() {
        with_db(|conn| {
            let id = insert_session(conn, Phase::Focus, 60_000, 0, None).unwrap();
            finish(conn, id, Outcome::Completed, 60_000, 60_000).unwrap();

            let second = finish(conn, id, Outcome::Skipped, 1, 99_999);

            assert!(matches!(second, Err(AppError::Database { .. })));
            assert_eq!(sessions(conn)[0].status, "completed");
            assert_eq!(sessions(conn)[0].ended_at_ms, Some(60_000));
        });
    }

    #[test]
    fn a_second_active_session_is_refused() {
        with_db(|conn| {
            insert_session(conn, Phase::Focus, 60_000, 0, None).unwrap();

            let second = insert_session(conn, Phase::ShortBreak, 60_000, 1, None);

            assert!(second.is_err());
            assert_eq!(sessions(conn).len(), 1);
        });
    }

    #[test]
    fn leftover_active_sessions_are_closed_at_their_last_checkpoint() {
        with_db(|conn| {
            let id = insert_session(conn, Phase::Focus, 1_500_000, 1_000, None).unwrap();
            checkpoint(conn, id, 40_000, 41_000).unwrap();

            let closed = interrupt_active(conn).unwrap();

            assert_eq!(closed, 1);
            let row = &sessions(conn)[0];
            assert_eq!(row.status, "interrupted");
            assert_eq!(row.elapsed_ms, 40_000);
            assert_eq!(row.ended_at_ms, Some(41_000));
            assert_eq!(interrupt_active(conn).unwrap(), 0);
        });
    }

    #[test]
    fn rotation_defaults_to_the_first_focus_and_round_trips() {
        with_db(|conn| {
            assert_eq!(load_rotation(conn).unwrap(), (Phase::Focus, 0));

            save_rotation(conn, Phase::LongBreak, 4).unwrap();
            assert_eq!(load_rotation(conn).unwrap(), (Phase::LongBreak, 4));

            save_rotation(conn, Phase::Focus, 0).unwrap();
            assert_eq!(load_rotation(conn).unwrap(), (Phase::Focus, 0));
        });
    }
}
