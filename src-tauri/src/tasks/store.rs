//! Persistência das tarefas (`tasks`).
//!
//! Toda operação que altera a ordem roda em uma transação e deixa as
//! posições de cada coluna densas (0, 1, 2…), de modo que uma falha no meio
//! nunca deixa o quadro com buracos ou posições repetidas.

use rusqlite::{Connection, OptionalExtension, Row};

use super::{Priority, Status, Task, TaskInput};
use crate::error::AppError;

fn priority_to_db(priority: Priority) -> &'static str {
    match priority {
        Priority::Low => "low",
        Priority::Medium => "medium",
        Priority::High => "high",
    }
}

fn status_to_db(status: Status) -> &'static str {
    match status {
        Status::Todo => "todo",
        Status::Doing => "doing",
        Status::Done => "done",
    }
}

fn invalid(column: usize, value: String) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(
        column,
        rusqlite::types::Type::Text,
        format!("valor inesperado: {value}").into(),
    )
}

fn task_from_row(row: &Row<'_>) -> rusqlite::Result<Task> {
    let priority: String = row.get(3)?;
    let status: String = row.get(4)?;
    Ok(Task {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        priority: match priority.as_str() {
            "low" => Priority::Low,
            "medium" => Priority::Medium,
            "high" => Priority::High,
            _ => return Err(invalid(3, priority)),
        },
        status: match status.as_str() {
            "todo" => Status::Todo,
            "doing" => Status::Doing,
            "done" => Status::Done,
            _ => return Err(invalid(4, status)),
        },
        position: row.get(5)?,
        due_date: row.get(6)?,
        estimated_pomodoros: row.get(7)?,
        created_at_ms: row.get(8)?,
        updated_at_ms: row.get(9)?,
        completed_at_ms: row.get(10)?,
        completed_pomodoros: row.get(11)?,
    })
}

/// Todas as tarefas, na ordem do quadro: A fazer, Em andamento, Concluído, e
/// pela posição dentro de cada coluna.
pub fn list(conn: &Connection) -> Result<Vec<Task>, AppError> {
    let mut statement = conn.prepare(
        "SELECT t.id, t.title, t.description, t.priority, t.status, t.position, t.due_date,
                t.estimated_pomodoros, t.created_at_ms, t.updated_at_ms, t.completed_at_ms,
                (SELECT COUNT(*) FROM pomodoro_sessions s
                  WHERE s.task_id = t.id AND s.kind = 'focus' AND s.status = 'completed' AND s.short = 0)
           FROM tasks t
          ORDER BY CASE t.status WHEN 'todo' THEN 0 WHEN 'doing' THEN 1 ELSE 2 END,
                   t.position, t.id",
    )?;
    let tasks = statement
        .query_map([], task_from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(tasks)
}

/// Cria a tarefa no fim da coluna "A fazer" e devolve seu ID.
pub fn create(conn: &mut Connection, input: TaskInput, now_ms: i64) -> Result<i64, AppError> {
    let input = input.normalized()?;
    let tx = conn.transaction()?;
    let position: u32 = tx.query_row(
        "SELECT COUNT(*) FROM tasks WHERE status = 'todo'",
        [],
        |row| row.get(0),
    )?;
    tx.execute(
        "INSERT INTO tasks (title, description, priority, status, position, due_date,
                            estimated_pomodoros, created_at_ms, updated_at_ms)
         VALUES (?1, ?2, ?3, 'todo', ?4, ?5, ?6, ?7, ?7)",
        (
            &input.title,
            &input.description,
            priority_to_db(input.priority),
            position,
            &input.due_date,
            input.estimated_pomodoros,
            now_ms,
        ),
    )?;
    let id = tx.last_insert_rowid();
    tx.commit()?;
    Ok(id)
}

/// Altera os campos editáveis; coluna e ordem não mudam.
pub fn update(conn: &Connection, id: i64, input: TaskInput, now_ms: i64) -> Result<(), AppError> {
    let input = input.normalized()?;
    let updated = conn.execute(
        "UPDATE tasks
            SET title = ?2, description = ?3, priority = ?4, due_date = ?5,
                estimated_pomodoros = ?6, updated_at_ms = ?7
          WHERE id = ?1",
        (
            id,
            &input.title,
            &input.description,
            priority_to_db(input.priority),
            &input.due_date,
            input.estimated_pomodoros,
            now_ms,
        ),
    )?;
    found(updated, id)
}

/// Exclui a tarefa e fecha o buraco na coluna. As sessões dedicadas a ela
/// são preservadas, sem o vínculo.
pub fn delete(conn: &mut Connection, id: i64) -> Result<(), AppError> {
    let tx = conn.transaction()?;
    let status = status_of(&tx, id)?;
    tx.execute("DELETE FROM tasks WHERE id = ?1", [id])?;
    let remaining = column_ids(&tx, &status, None)?;
    renumber(&tx, &remaining)?;
    tx.commit()?;
    Ok(())
}

/// Move a tarefa para a coluna `status`, na posição `index` (contada sem a
/// própria tarefa; valores além do fim significam "no fim"). Entrar em
/// "Concluído" registra a data de conclusão; sair a apaga.
pub fn move_to(
    conn: &mut Connection,
    id: i64,
    status: Status,
    index: usize,
    now_ms: i64,
) -> Result<(), AppError> {
    let tx = conn.transaction()?;
    let source = status_of(&tx, id)?;
    let target = status_to_db(status);

    let mut target_ids = column_ids(&tx, target, Some(id))?;
    target_ids.insert(index.min(target_ids.len()), id);

    if source != target {
        tx.execute(
            "UPDATE tasks
                SET status = ?2,
                    completed_at_ms = CASE WHEN ?2 = 'done' THEN ?3 ELSE NULL END,
                    updated_at_ms = ?3
              WHERE id = ?1",
            (id, target, now_ms),
        )?;
        let source_ids = column_ids(&tx, &source, None)?;
        renumber(&tx, &source_ids)?;
    }
    renumber(&tx, &target_ids)?;
    tx.commit()?;
    Ok(())
}

/// Coluna de uma tarefa que ainda pode receber foco. Falha se a tarefa não
/// existe ou já está concluída.
pub fn open_task_status(conn: &Connection, id: i64) -> Result<Status, AppError> {
    match status_of(conn, id)?.as_str() {
        "todo" => Ok(Status::Todo),
        "doing" => Ok(Status::Doing),
        _ => Err(AppError::validation(
            "taskId",
            "Esta tarefa já está concluída. Reabra-a para focar nela.",
        )),
    }
}

fn status_of(conn: &Connection, id: i64) -> Result<String, AppError> {
    conn.query_row("SELECT status FROM tasks WHERE id = ?1", [id], |row| {
        row.get(0)
    })
    .optional()?
    .ok_or_else(|| not_found(id))
}

/// IDs de uma coluna na ordem atual, opcionalmente sem uma tarefa.
fn column_ids(conn: &Connection, status: &str, except: Option<i64>) -> Result<Vec<i64>, AppError> {
    let mut statement = conn
        .prepare("SELECT id FROM tasks WHERE status = ?1 AND id IS NOT ?2 ORDER BY position, id")?;
    let ids = statement
        .query_map((status, except), |row| row.get(0))?
        .collect::<Result<Vec<i64>, _>>()?;
    Ok(ids)
}

fn renumber(conn: &Connection, ids: &[i64]) -> Result<(), AppError> {
    let mut statement = conn.prepare("UPDATE tasks SET position = ?2 WHERE id = ?1")?;
    for (position, id) in ids.iter().enumerate() {
        statement.execute((id, position as i64))?;
    }
    Ok(())
}

fn found(updated: usize, id: i64) -> Result<(), AppError> {
    if updated == 1 {
        Ok(())
    } else {
        Err(not_found(id))
    }
}

fn not_found(id: i64) -> AppError {
    AppError::NotFound {
        message: format!("A tarefa {id} não existe mais."),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{Database, DATABASE_FILE};
    use crate::timer::engine::{Outcome, Phase};
    use crate::timer::store as sessions;

    fn input(title: &str) -> TaskInput {
        TaskInput {
            title: title.into(),
            description: String::new(),
            priority: Priority::Medium,
            due_date: None,
            estimated_pomodoros: None,
        }
    }

    /// Cria as tarefas A, B, C… em "A fazer" e devolve seus IDs.
    fn seed(conn: &mut Connection, titles: &[&str]) -> Vec<i64> {
        titles
            .iter()
            .map(|title| create(conn, input(title), 1_000).unwrap())
            .collect()
    }

    /// O quadro como `(coluna, [títulos na ordem])`, conferindo que as
    /// posições de cada coluna são 0, 1, 2…
    fn board(conn: &Connection) -> Vec<(Status, Vec<String>)> {
        let tasks = list(conn).unwrap();
        Status::ALL
            .into_iter()
            .map(|status| {
                let column: Vec<&Task> = tasks.iter().filter(|t| t.status == status).collect();
                for (expected, task) in column.iter().enumerate() {
                    assert_eq!(
                        task.position as usize, expected,
                        "posição de {}",
                        task.title
                    );
                }
                (status, column.iter().map(|t| t.title.clone()).collect())
            })
            .collect()
    }

    fn titles(conn: &Connection, status: Status) -> Vec<String> {
        board(conn)
            .into_iter()
            .find(|(column, _)| *column == status)
            .unwrap()
            .1
    }

    fn with_db<T>(f: impl FnOnce(&mut Connection) -> T) -> T {
        let db = Database::open_in_memory().unwrap();
        db.with_conn(|conn| Ok(f(conn))).unwrap()
    }

    #[test]
    fn new_tasks_go_to_the_end_of_the_todo_column() {
        with_db(|conn| {
            let id = create(
                conn,
                TaskInput {
                    description: "  com detalhes ".into(),
                    priority: Priority::High,
                    due_date: Some("2026-11-01".into()),
                    estimated_pomodoros: Some(3),
                    ..input("  Primeira ")
                },
                5_000,
            )
            .unwrap();
            seed(conn, &["Segunda"]);

            let tasks = list(conn).unwrap();
            assert_eq!(titles(conn, Status::Todo), ["Primeira", "Segunda"]);
            let first = &tasks[0];
            assert_eq!(first.id, id);
            assert_eq!(first.description, "com detalhes");
            assert_eq!(first.priority, Priority::High);
            assert_eq!(first.due_date.as_deref(), Some("2026-11-01"));
            assert_eq!(first.estimated_pomodoros, Some(3));
            assert_eq!((first.created_at_ms, first.updated_at_ms), (5_000, 5_000));
            assert_eq!(first.completed_at_ms, None);
            assert_eq!(first.completed_pomodoros, 0);
        });
    }

    #[test]
    fn invalid_input_creates_nothing() {
        with_db(|conn| {
            let result = create(conn, input("   "), 1_000);

            assert!(matches!(
                result,
                Err(AppError::Validation { field: "title", .. })
            ));
            assert!(list(conn).unwrap().is_empty());
        });
    }

    #[test]
    fn editing_changes_the_fields_but_not_the_place_on_the_board() {
        with_db(|conn| {
            let ids = seed(conn, &["A", "B", "C"]);

            update(
                conn,
                ids[1],
                TaskInput {
                    priority: Priority::Low,
                    ..input("B editada")
                },
                9_000,
            )
            .unwrap();

            assert_eq!(titles(conn, Status::Todo), ["A", "B editada", "C"]);
            let edited = &list(conn).unwrap()[1];
            assert_eq!(edited.priority, Priority::Low);
            assert_eq!((edited.created_at_ms, edited.updated_at_ms), (1_000, 9_000));
        });
    }

    #[test]
    fn reordering_within_a_column() {
        with_db(|conn| {
            let ids = seed(conn, &["A", "B", "C", "D"]);

            move_to(conn, ids[0], Status::Todo, 2, 2_000).unwrap();
            assert_eq!(titles(conn, Status::Todo), ["B", "C", "A", "D"]);

            move_to(conn, ids[3], Status::Todo, 0, 2_000).unwrap();
            assert_eq!(titles(conn, Status::Todo), ["D", "B", "C", "A"]);

            // Índice além do fim: vai para o fim.
            move_to(conn, ids[3], Status::Todo, 99, 2_000).unwrap();
            assert_eq!(titles(conn, Status::Todo), ["B", "C", "A", "D"]);
        });
    }

    #[test]
    fn moving_between_columns_keeps_both_columns_dense() {
        with_db(|conn| {
            let ids = seed(conn, &["A", "B", "C", "D"]);

            move_to(conn, ids[1], Status::Doing, 0, 2_000).unwrap();
            move_to(conn, ids[3], Status::Doing, 0, 2_000).unwrap();
            move_to(conn, ids[0], Status::Doing, 1, 2_000).unwrap();

            assert_eq!(
                board(conn),
                vec![
                    (Status::Todo, vec!["C".to_owned()]),
                    (
                        Status::Doing,
                        vec!["D".to_owned(), "A".to_owned(), "B".to_owned()]
                    ),
                    (Status::Done, vec![]),
                ]
            );
        });
    }

    #[test]
    fn the_completion_date_follows_the_done_column() {
        with_db(|conn| {
            let ids = seed(conn, &["A"]);

            move_to(conn, ids[0], Status::Done, 0, 7_000).unwrap();
            let done = list(conn).unwrap().remove(0);
            move_to(conn, ids[0], Status::Doing, 0, 8_000).unwrap();
            let reopened = list(conn).unwrap().remove(0);

            assert_eq!(done.completed_at_ms, Some(7_000));
            assert_eq!(reopened.completed_at_ms, None);
            assert_eq!(reopened.updated_at_ms, 8_000);
        });
    }

    #[test]
    fn reordering_inside_done_keeps_the_original_completion_date() {
        with_db(|conn| {
            let ids = seed(conn, &["A", "B"]);
            move_to(conn, ids[0], Status::Done, 0, 7_000).unwrap();
            move_to(conn, ids[1], Status::Done, 0, 8_000).unwrap();

            move_to(conn, ids[0], Status::Done, 0, 9_000).unwrap();

            let tasks = list(conn).unwrap();
            assert_eq!(titles(conn, Status::Done), ["A", "B"]);
            assert_eq!(tasks[0].completed_at_ms, Some(7_000));
        });
    }

    #[test]
    fn only_open_tasks_can_receive_focus() {
        with_db(|conn| {
            let ids = seed(conn, &["A", "B", "C"]);
            move_to(conn, ids[1], Status::Doing, 0, 2_000).unwrap();
            move_to(conn, ids[2], Status::Done, 0, 2_000).unwrap();

            assert_eq!(open_task_status(conn, ids[0]).unwrap(), Status::Todo);
            assert_eq!(open_task_status(conn, ids[1]).unwrap(), Status::Doing);
            assert!(matches!(
                open_task_status(conn, ids[2]),
                Err(AppError::Validation {
                    field: "taskId",
                    ..
                })
            ));
            assert!(matches!(
                open_task_status(conn, 999),
                Err(AppError::NotFound { .. })
            ));
        });
    }

    #[test]
    fn deleting_closes_the_gap() {
        with_db(|conn| {
            let ids = seed(conn, &["A", "B", "C"]);

            delete(conn, ids[1]).unwrap();

            assert_eq!(titles(conn, Status::Todo), ["A", "C"]);
        });
    }

    #[test]
    fn operations_on_a_missing_task_fail_without_side_effects() {
        with_db(|conn| {
            seed(conn, &["A", "B"]);

            assert!(matches!(
                move_to(conn, 999, Status::Done, 0, 2_000),
                Err(AppError::NotFound { .. })
            ));
            assert!(matches!(
                update(conn, 999, input("x"), 2_000),
                Err(AppError::NotFound { .. })
            ));
            assert!(matches!(delete(conn, 999), Err(AppError::NotFound { .. })));
            assert_eq!(titles(conn, Status::Todo), ["A", "B"]);
        });
    }

    #[test]
    fn many_quick_moves_never_leave_gaps_or_duplicates() {
        with_db(|conn| {
            let ids = seed(conn, &["A", "B", "C", "D", "E", "F"]);

            // Sequência pseudoaleatória determinística de movimentos.
            let mut seed = 12_345_u32;
            for _ in 0..200 {
                seed = seed.wrapping_mul(1_103_515_245).wrapping_add(12_345);
                let id = ids[(seed >> 8) as usize % ids.len()];
                let status = Status::ALL[(seed >> 16) as usize % 3];
                let index = (seed >> 24) as usize % 7;
                move_to(conn, id, status, index, 2_000).unwrap();
            }

            // `board` confere a densidade das posições de cada coluna.
            let total: usize = board(conn).iter().map(|(_, column)| column.len()).sum();
            assert_eq!(total, ids.len());
        });
    }

    #[test]
    fn the_order_survives_closing_and_reopening_the_database() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DATABASE_FILE);
        {
            let db = Database::open(&path).unwrap();
            db.with_conn(|conn| {
                let ids = seed(conn, &["A", "B", "C"]);
                move_to(conn, ids[2], Status::Todo, 0, 2_000)?;
                move_to(conn, ids[0], Status::Doing, 0, 2_000)
            })
            .unwrap();
        }

        let reopened = Database::open(&path).unwrap();

        reopened
            .with_conn(|conn| {
                assert_eq!(titles(conn, Status::Todo), ["C", "B"]);
                assert_eq!(titles(conn, Status::Doing), ["A"]);
                Ok(())
            })
            .unwrap();
    }

    #[test]
    fn only_completed_focus_sessions_count_as_pomodoros_of_a_task() {
        with_db(|conn| {
            let ids = seed(conn, &["Com sessões", "Sem sessões"]);
            let task = Some(ids[0]);
            let session = |phase, outcome| {
                let id = sessions::insert_session(conn, phase, 60_000, 0, task, false).unwrap();
                sessions::finish(conn, id, outcome, 60_000, 60_000).unwrap();
            };
            session(Phase::Focus, Outcome::Completed);
            session(Phase::Focus, Outcome::Completed);
            session(Phase::Focus, Outcome::Skipped);
            session(Phase::Focus, Outcome::Interrupted);
            session(Phase::ShortBreak, Outcome::Completed);

            let tasks = list(conn).unwrap();

            assert_eq!(tasks[0].completed_pomodoros, 2);
            assert_eq!(tasks[1].completed_pomodoros, 0);
        });
    }

    #[test]
    fn deleting_a_task_keeps_its_sessions_without_the_link() {
        with_db(|conn| {
            let ids = seed(conn, &["A"]);
            let session =
                sessions::insert_session(conn, Phase::Focus, 60_000, 0, Some(ids[0]), false)
                    .unwrap();
            sessions::finish(conn, session, Outcome::Completed, 60_000, 60_000).unwrap();

            delete(conn, ids[0]).unwrap();

            let (count, task): (i64, Option<i64>) = conn
                .query_row(
                    "SELECT COUNT(*), MAX(task_id) FROM pomodoro_sessions",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )
                .unwrap();
            assert_eq!((count, task), (1, None));
        });
    }

    #[test]
    fn a_session_cannot_point_to_a_task_that_does_not_exist() {
        with_db(|conn| {
            let result = sessions::insert_session(conn, Phase::Focus, 60_000, 0, Some(999), false);

            assert!(result.is_err());
        });
    }
}
