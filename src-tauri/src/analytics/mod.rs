//! Estatísticas do dashboard, sempre calculadas a partir do que está gravado
//! (sessões e tarefas) — nenhum contador é mantido em memória.
//!
//! O backend não conhece fusos horários: quem chama informa os limites dos
//! períodos (meia-noite local de cada dia) em milissegundos UTC. As definições
//! das métricas estão em `docs/ANALYTICS.md`.

use rusqlite::Connection;
use serde::Serialize;

use crate::error::AppError;

/// Máximo de limites aceitos em uma consulta (uma semana usa 8).
const MAX_BOUNDARIES: usize = 64;

/// Totais de um período `[start_ms, end_ms)`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PeriodStats {
    pub start_ms: i64,
    pub end_ms: i64,
    /// Sessões de foco concluídas que terminaram no período.
    pub completed_pomodoros: u32,
    /// Tempo efetivo de todas as sessões de foco que terminaram no período,
    /// concluídas ou não.
    pub focus_ms: u64,
    /// Tarefas cuja conclusão foi registrada no período.
    pub tasks_completed: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodayStats {
    pub completed_pomodoros: u32,
    pub focus_ms: u64,
    /// Tarefas cuja conclusão foi registrada no período.
    pub tasks_completed: u32,
    /// Tarefas na coluna "Em andamento" agora (independe do período).
    pub tasks_in_progress: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Dashboard {
    pub today: TodayStats,
    /// Um item por dia da semana pedida, na ordem dos limites.
    pub week: Vec<PeriodStats>,
}

/// Totais de foco de um período.
fn period(conn: &Connection, start_ms: i64, end_ms: i64) -> Result<PeriodStats, AppError> {
    let (completed_pomodoros, focus_ms): (u32, i64) = conn.query_row(
        "SELECT COUNT(*) FILTER (WHERE status = 'completed' AND short = 0),
                COALESCE(SUM(elapsed_ms), 0)
           FROM pomodoro_sessions
          WHERE kind = 'focus' AND ended_at_ms >= ?1 AND ended_at_ms < ?2",
        (start_ms, end_ms),
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    Ok(PeriodStats {
        start_ms,
        end_ms,
        completed_pomodoros,
        focus_ms: u64::try_from(focus_ms).unwrap_or(0),
        tasks_completed: conn.query_row(
            "SELECT COUNT(*) FROM tasks WHERE completed_at_ms >= ?1 AND completed_at_ms < ?2",
            (start_ms, end_ms),
            |row| row.get(0),
        )?,
    })
}

/// Um período para cada par de limites consecutivos.
pub fn periods(conn: &Connection, boundaries_ms: &[i64]) -> Result<Vec<PeriodStats>, AppError> {
    if boundaries_ms.len() < 2 || boundaries_ms.len() > MAX_BOUNDARIES {
        return Err(AppError::validation(
            "weekBoundariesMs",
            format!("Informe de 2 a {MAX_BOUNDARIES} limites de período."),
        ));
    }
    if boundaries_ms.windows(2).any(|pair| pair[0] >= pair[1]) {
        return Err(AppError::validation(
            "weekBoundariesMs",
            "Os limites dos períodos precisam estar em ordem crescente.",
        ));
    }
    boundaries_ms
        .windows(2)
        .map(|pair| period(conn, pair[0], pair[1]))
        .collect()
}

/// Indicadores de "hoje" (`[today_start_ms, today_end_ms)`) e os totais por
/// dia da semana delimitada por `week_boundaries_ms`.
pub fn dashboard(
    conn: &Connection,
    today_start_ms: i64,
    today_end_ms: i64,
    week_boundaries_ms: &[i64],
) -> Result<Dashboard, AppError> {
    if today_start_ms >= today_end_ms {
        return Err(AppError::validation(
            "todayStartMs",
            "O início do dia precisa ser anterior ao fim.",
        ));
    }
    let week = periods(conn, week_boundaries_ms)?;
    let focus = period(conn, today_start_ms, today_end_ms)?;
    let tasks_in_progress: u32 = conn.query_row(
        "SELECT COUNT(*) FROM tasks WHERE status = 'doing'",
        [],
        |row| row.get(0),
    )?;
    Ok(Dashboard {
        today: TodayStats {
            completed_pomodoros: focus.completed_pomodoros,
            focus_ms: focus.focus_ms,
            tasks_completed: focus.tasks_completed,
            tasks_in_progress,
        },
        week,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::Database;
    use crate::tasks::{self, Priority, Status, TaskInput};
    use crate::timer::engine::{Outcome, Phase};
    use crate::timer::store as sessions;

    const MINUTE: i64 = 60_000;
    const HOUR: i64 = 60 * MINUTE;
    const DAY: i64 = 24 * HOUR;
    /// Uma "segunda-feira, 00:00" qualquer; os dias seguem a cada 24 h.
    const MONDAY: i64 = 1_800_000_000_000;

    fn week() -> Vec<i64> {
        (0..=7).map(|day| MONDAY + day * DAY).collect()
    }

    fn with_db<T>(f: impl FnOnce(&mut Connection) -> T) -> T {
        let db = Database::open_in_memory().unwrap();
        db.with_conn(|conn| Ok(f(conn))).unwrap()
    }

    /// Grava uma sessão que termina em `ended_at_ms` depois de `minutes` ativos.
    fn session(conn: &Connection, phase: Phase, outcome: Outcome, minutes: i64, ended_at_ms: i64) {
        let elapsed = minutes * MINUTE;
        let id = sessions::insert_session(
            conn,
            phase,
            (25 * MINUTE) as u64,
            ended_at_ms - elapsed,
            None,
            false,
        )
        .unwrap();
        sessions::finish(conn, id, outcome, elapsed as u64, ended_at_ms).unwrap();
    }

    fn task(conn: &mut Connection, title: &str) -> i64 {
        tasks::store::create(
            conn,
            TaskInput {
                title: title.into(),
                description: String::new(),
                priority: Priority::Medium,
                due_date: None,
                estimated_pomodoros: None,
            },
            MONDAY,
        )
        .unwrap()
    }

    fn pomodoros(stats: &[PeriodStats]) -> Vec<u32> {
        stats.iter().map(|day| day.completed_pomodoros).collect()
    }

    #[test]
    fn an_empty_database_yields_zeros_for_every_day() {
        with_db(|conn| {
            let stats = dashboard(conn, MONDAY, MONDAY + DAY, &week()).unwrap();

            assert_eq!(stats.week.len(), 7);
            assert_eq!(pomodoros(&stats.week), [0; 7]);
            assert!(stats.week.iter().all(|day| day.focus_ms == 0));
            assert_eq!(
                stats.today,
                TodayStats {
                    completed_pomodoros: 0,
                    focus_ms: 0,
                    tasks_completed: 0,
                    tasks_in_progress: 0,
                }
            );
            assert_eq!(
                (stats.week[0].start_ms, stats.week[0].end_ms),
                (MONDAY, MONDAY + DAY)
            );
        });
    }

    #[test]
    fn completed_focus_sessions_are_counted_on_the_day_they_ended() {
        with_db(|conn| {
            session(
                conn,
                Phase::Focus,
                Outcome::Completed,
                25,
                MONDAY + 10 * HOUR,
            );
            session(
                conn,
                Phase::Focus,
                Outcome::Completed,
                25,
                MONDAY + 11 * HOUR,
            );
            session(
                conn,
                Phase::Focus,
                Outcome::Completed,
                25,
                MONDAY + 2 * DAY + 9 * HOUR,
            );
            session(
                conn,
                Phase::Focus,
                Outcome::Completed,
                25,
                MONDAY + 6 * DAY + 23 * HOUR,
            );

            let stats = periods(conn, &week()).unwrap();

            assert_eq!(pomodoros(&stats), [2, 0, 1, 0, 0, 0, 1]);
            assert_eq!(stats[0].focus_ms, (50 * MINUTE) as u64);
        });
    }

    #[test]
    fn unfinished_focus_adds_time_but_not_pomodoros() {
        with_db(|conn| {
            session(
                conn,
                Phase::Focus,
                Outcome::Completed,
                25,
                MONDAY + 9 * HOUR,
            );
            session(conn, Phase::Focus, Outcome::Skipped, 10, MONDAY + 10 * HOUR);
            session(conn, Phase::Focus, Outcome::Reset, 4, MONDAY + 11 * HOUR);
            session(
                conn,
                Phase::Focus,
                Outcome::Interrupted,
                6,
                MONDAY + 12 * HOUR,
            );

            let monday = periods(conn, &week()).unwrap()[0];

            assert_eq!(monday.completed_pomodoros, 1);
            assert_eq!(monday.focus_ms, (45 * MINUTE) as u64);
        });
    }

    #[test]
    fn breaks_are_ignored() {
        with_db(|conn| {
            session(
                conn,
                Phase::ShortBreak,
                Outcome::Completed,
                5,
                MONDAY + 9 * HOUR,
            );
            session(
                conn,
                Phase::LongBreak,
                Outcome::Completed,
                15,
                MONDAY + 10 * HOUR,
            );

            let monday = periods(conn, &week()).unwrap()[0];

            assert_eq!((monday.completed_pomodoros, monday.focus_ms), (0, 0));
        });
    }

    #[test]
    fn a_session_still_in_progress_is_not_counted() {
        with_db(|conn| {
            sessions::insert_session(conn, Phase::Focus, 1_500_000, MONDAY + HOUR, None, false)
                .unwrap();

            let monday = periods(conn, &week()).unwrap()[0];

            assert_eq!((monday.completed_pomodoros, monday.focus_ms), (0, 0));
        });
    }

    #[test]
    fn day_limits_include_the_start_and_exclude_the_end() {
        with_db(|conn| {
            // Termina exatamente à meia-noite que abre a terça: pertence à terça.
            session(conn, Phase::Focus, Outcome::Completed, 25, MONDAY + DAY);
            // Termina 1 ms antes: ainda é segunda.
            session(conn, Phase::Focus, Outcome::Completed, 25, MONDAY + DAY - 1);
            // Termina exatamente no início da semana e no fim dela (fora).
            session(conn, Phase::Focus, Outcome::Completed, 25, MONDAY);
            session(conn, Phase::Focus, Outcome::Completed, 25, MONDAY + 7 * DAY);

            let stats = periods(conn, &week()).unwrap();

            assert_eq!(pomodoros(&stats), [2, 1, 0, 0, 0, 0, 0]);
        });
    }

    #[test]
    fn a_session_that_crosses_midnight_belongs_entirely_to_the_day_it_ended() {
        with_db(|conn| {
            // Começa segunda às 23:50 e termina terça à 00:15.
            session(
                conn,
                Phase::Focus,
                Outcome::Completed,
                25,
                MONDAY + DAY + 15 * MINUTE,
            );

            let stats = periods(conn, &week()).unwrap();

            assert_eq!(pomodoros(&stats), [0, 1, 0, 0, 0, 0, 0]);
            assert_eq!(stats[0].focus_ms, 0);
            assert_eq!(stats[1].focus_ms, (25 * MINUTE) as u64);
        });
    }

    #[test]
    fn days_do_not_need_to_have_24_hours() {
        with_db(|conn| {
            // Dia de 23 h (entrada no horário de verão) seguido de um de 25 h.
            let boundaries = [MONDAY, MONDAY + 23 * HOUR, MONDAY + 48 * HOUR];
            session(
                conn,
                Phase::Focus,
                Outcome::Completed,
                25,
                MONDAY + 23 * HOUR + MINUTE,
            );

            let stats = periods(conn, &boundaries).unwrap();

            assert_eq!(pomodoros(&stats), [0, 1]);
        });
    }

    #[test]
    fn the_week_adds_up_to_the_same_sessions_seen_as_a_single_period() {
        with_db(|conn| {
            for day in 0..7 {
                for hour in [9, 13, 20] {
                    let outcome = if (day + hour) % 3 == 0 {
                        Outcome::Skipped
                    } else {
                        Outcome::Completed
                    };
                    session(
                        conn,
                        Phase::Focus,
                        outcome,
                        20,
                        MONDAY + day * DAY + hour * HOUR,
                    );
                }
            }

            let by_day = periods(conn, &week()).unwrap();
            let whole = periods(conn, &[MONDAY, MONDAY + 7 * DAY]).unwrap()[0];

            assert_eq!(
                by_day.iter().map(|d| d.completed_pomodoros).sum::<u32>(),
                whole.completed_pomodoros
            );
            assert_eq!(
                by_day.iter().map(|d| d.focus_ms).sum::<u64>(),
                whole.focus_ms
            );
            assert_eq!(whole.focus_ms, (21 * 20 * MINUTE) as u64);
        });
    }

    #[test]
    fn today_reports_tasks_completed_in_the_day_and_tasks_in_progress_now() {
        with_db(|conn| {
            let today = MONDAY + 2 * DAY;
            let done_today = task(conn, "Hoje");
            let done_yesterday = task(conn, "Ontem");
            let doing = task(conn, "Fazendo");
            task(conn, "A fazer");
            tasks::store::move_to(conn, done_today, Status::Done, 0, today + 3 * HOUR).unwrap();
            tasks::store::move_to(conn, done_yesterday, Status::Done, 0, today - HOUR).unwrap();
            tasks::store::move_to(conn, doing, Status::Doing, 0, today + HOUR).unwrap();
            session(conn, Phase::Focus, Outcome::Completed, 25, today + 4 * HOUR);
            session(conn, Phase::Focus, Outcome::Completed, 25, today - 2 * HOUR);

            let stats = dashboard(conn, today, today + DAY, &week()).unwrap();

            assert_eq!(
                stats.today,
                TodayStats {
                    completed_pomodoros: 1,
                    focus_ms: (25 * MINUTE) as u64,
                    tasks_completed: 1,
                    tasks_in_progress: 1,
                }
            );
            // O mesmo dia, visto pelo gráfico semanal, dá o mesmo número.
            assert_eq!(
                stats.week[2].completed_pomodoros,
                stats.today.completed_pomodoros
            );
        });
    }

    #[test]
    fn each_period_reports_the_tasks_completed_in_it() {
        with_db(|conn| {
            let monday_task = task(conn, "Segunda");
            let wednesday_a = task(conn, "Quarta A");
            let wednesday_b = task(conn, "Quarta B");
            tasks::store::move_to(conn, monday_task, Status::Done, 0, MONDAY + HOUR).unwrap();
            tasks::store::move_to(conn, wednesday_a, Status::Done, 0, MONDAY + 2 * DAY).unwrap();
            tasks::store::move_to(conn, wednesday_b, Status::Done, 0, MONDAY + 3 * DAY - 1)
                .unwrap();

            let stats = periods(conn, &week()).unwrap();

            assert_eq!(
                stats
                    .iter()
                    .map(|day| day.tasks_completed)
                    .collect::<Vec<_>>(),
                [1, 0, 2, 0, 0, 0, 0]
            );
        });
    }

    #[test]
    fn a_reopened_task_no_longer_counts_as_completed() {
        with_db(|conn| {
            let id = task(conn, "Vai e volta");
            tasks::store::move_to(conn, id, Status::Done, 0, MONDAY + HOUR).unwrap();
            tasks::store::move_to(conn, id, Status::Todo, 0, MONDAY + 2 * HOUR).unwrap();

            let stats = dashboard(conn, MONDAY, MONDAY + DAY, &week()).unwrap();

            assert_eq!(stats.today.tasks_completed, 0);
        });
    }

    #[test]
    fn invalid_limits_are_rejected() {
        with_db(|conn| {
            let field = |result: Result<Dashboard, AppError>| match result {
                Err(AppError::Validation { field, .. }) => field,
                other => panic!("esperava erro de validação, obtive {other:?}"),
            };

            assert_eq!(
                field(dashboard(conn, MONDAY, MONDAY, &week())),
                "todayStartMs"
            );
            assert_eq!(
                field(dashboard(conn, MONDAY, MONDAY + DAY, &[MONDAY])),
                "weekBoundariesMs"
            );
            assert_eq!(
                field(dashboard(
                    conn,
                    MONDAY,
                    MONDAY + DAY,
                    &[MONDAY + DAY, MONDAY]
                )),
                "weekBoundariesMs"
            );
            assert_eq!(
                field(dashboard(conn, MONDAY, MONDAY + DAY, &[MONDAY, MONDAY])),
                "weekBoundariesMs"
            );
            let too_many: Vec<i64> = (0..=MAX_BOUNDARIES as i64).collect();
            assert_eq!(
                field(dashboard(conn, MONDAY, MONDAY + DAY, &too_many)),
                "weekBoundariesMs"
            );
        });
    }

    #[test]
    fn dashboard_serializes_with_the_frontend_contract() {
        with_db(|conn| {
            let stats = dashboard(conn, 0, 10, &[0, 10]).unwrap();

            assert_eq!(
                serde_json::to_value(&stats).unwrap(),
                serde_json::json!({
                    "today": {
                        "completedPomodoros": 0,
                        "focusMs": 0,
                        "tasksCompleted": 0,
                        "tasksInProgress": 0
                    },
                    "week": [
                        {
                            "startMs": 0,
                            "endMs": 10,
                            "completedPomodoros": 0,
                            "focusMs": 0,
                            "tasksCompleted": 0
                        }
                    ]
                })
            );
        });
    }
}
