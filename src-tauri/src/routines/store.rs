//! SQL das rotinas.

use rusqlite::Connection;

use super::{Routine, RoutineInput};
use crate::error::AppError;

/// Todas as rotinas, na ordem em que acontecem ao longo do dia.
pub fn list(conn: &Connection) -> Result<Vec<Routine>, AppError> {
    let routines = conn
        .prepare(
            "SELECT id, name, start_minute, duration_minutes, weekdays, enabled
               FROM routines ORDER BY start_minute, id",
        )?
        .query_map([], |row| {
            Ok(Routine {
                id: row.get(0)?,
                name: row.get(1)?,
                start_minute: row.get(2)?,
                duration_minutes: row.get(3)?,
                weekdays: row.get(4)?,
                enabled: row.get(5)?,
            })
        })?
        .collect::<Result<_, _>>()?;
    Ok(routines)
}

/// Duas rotinas ligadas não podem se cruzar em um mesmo dia: o timer só
/// consegue estar em uma por vez.
fn check_overlap(
    conn: &Connection,
    input: &RoutineInput,
    except: Option<i64>,
) -> Result<(), AppError> {
    if !input.enabled {
        return Ok(());
    }
    let clash = list(conn)?
        .into_iter()
        .find(|other| other.enabled && Some(other.id) != except && other.overlaps(input));
    match clash {
        Some(other) => Err(AppError::validation(
            "startMinute",
            format!("O horário coincide com a rotina \"{}\".", other.name),
        )),
        None => Ok(()),
    }
}

pub fn create(conn: &Connection, input: RoutineInput, now_ms: i64) -> Result<i64, AppError> {
    let input = input.validated()?;
    check_overlap(conn, &input, None)?;
    conn.execute(
        "INSERT INTO routines
             (name, start_minute, duration_minutes, weekdays, enabled, created_at_ms)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            &input.name,
            input.start_minute,
            input.duration_minutes,
            input.weekdays,
            input.enabled,
            now_ms,
        ),
    )?;
    Ok(conn.last_insert_rowid())
}

fn not_found() -> AppError {
    AppError::NotFound {
        message: "Esta rotina não existe mais.".to_owned(),
    }
}

pub fn update(conn: &Connection, id: i64, input: RoutineInput) -> Result<(), AppError> {
    let input = input.validated()?;
    check_overlap(conn, &input, Some(id))?;
    let updated = conn.execute(
        "UPDATE routines
            SET name = ?2, start_minute = ?3, duration_minutes = ?4, weekdays = ?5, enabled = ?6
          WHERE id = ?1",
        (
            id,
            &input.name,
            input.start_minute,
            input.duration_minutes,
            input.weekdays,
            input.enabled,
        ),
    )?;
    if updated == 0 {
        return Err(not_found());
    }
    Ok(())
}

pub fn delete(conn: &Connection, id: i64) -> Result<(), AppError> {
    if conn.execute("DELETE FROM routines WHERE id = ?1", [id])? == 0 {
        return Err(not_found());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use crate::routines::EVERY_DAY;

    fn input(name: &str, start_minute: u32, duration_minutes: u32) -> RoutineInput {
        RoutineInput {
            name: name.to_owned(),
            start_minute,
            duration_minutes,
            weekdays: EVERY_DAY,
            enabled: true,
        }
    }

    fn db() -> Database {
        Database::open_in_memory().unwrap()
    }

    #[test]
    fn routines_are_listed_in_the_order_of_the_day() {
        let db = db();
        db.with_conn(|conn| {
            create(conn, input("Lanche da tarde", 930, 15), 1)?;
            create(conn, input(" Hora do café ", 615, 15), 2)?;

            let names: Vec<String> = list(conn)?.into_iter().map(|r| r.name).collect();
            assert_eq!(names, ["Hora do café", "Lanche da tarde"]);
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn a_routine_round_trips_with_all_its_fields() {
        let db = db();
        db.with_conn(|conn| {
            let id = create(
                conn,
                RoutineInput {
                    weekdays: 0b001_0101,
                    enabled: false,
                    ..input("Academia", 420, 60)
                },
                1,
            )?;

            assert_eq!(
                list(conn)?,
                [Routine {
                    id,
                    name: "Academia".to_owned(),
                    start_minute: 420,
                    duration_minutes: 60,
                    weekdays: 0b001_0101,
                    enabled: false,
                }]
            );
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn invalid_input_is_refused_and_nothing_is_written() {
        let db = db();
        db.with_conn(|conn| {
            assert!(matches!(
                create(conn, input("", 600, 15), 1),
                Err(AppError::Validation { field: "name", .. })
            ));
            assert!(list(conn)?.is_empty());
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn overlapping_routines_are_refused_naming_the_other_one() {
        let db = db();
        db.with_conn(|conn| {
            let coffee = create(conn, input("Hora do café", 615, 15), 1)?;

            let clash = create(conn, input("Reunião", 620, 30), 2);
            assert_eq!(
                clash,
                Err(AppError::validation(
                    "startMinute",
                    "O horário coincide com a rotina \"Hora do café\"."
                ))
            );
            // Encostada no fim da outra, cabe.
            let meeting = create(conn, input("Reunião", 630, 30), 2)?;
            // Mover para cima da outra não; desligada, sim.
            assert!(update(conn, meeting, input("Reunião", 610, 30)).is_err());
            update(
                conn,
                meeting,
                RoutineInput {
                    enabled: false,
                    ..input("Reunião", 610, 30)
                },
            )?;
            // Editar a própria rotina não conflita consigo mesma.
            update(conn, coffee, input("Café", 615, 20))?;
            Ok(())
        })
        .unwrap();
    }

    #[test]
    fn updating_or_deleting_a_missing_routine_is_not_found() {
        let db = db();
        db.with_conn(|conn| {
            assert!(matches!(
                update(conn, 99, input("Café", 600, 15)),
                Err(AppError::NotFound { .. })
            ));
            assert!(matches!(delete(conn, 99), Err(AppError::NotFound { .. })));

            let id = create(conn, input("Café", 600, 15), 1)?;
            delete(conn, id)?;
            assert!(list(conn)?.is_empty());
            Ok(())
        })
        .unwrap();
    }
}
