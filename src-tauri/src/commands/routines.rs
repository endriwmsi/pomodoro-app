//! Comandos das rotinas. O expediente é uma seção das configurações
//! (`workday`, em `update_settings`).

use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, State};

use crate::database::Database;
use crate::error::AppError;
use crate::routines::{store, Routine, RoutineInput};
use crate::settings;
use crate::timer::engine::TimerSnapshot;
use crate::timer::TimerService;

/// Evento emitido a todas as janelas quando as rotinas mudam (sem payload:
/// quem recebe busca a lista de novo).
pub const ROUTINES_CHANGED_EVENT: &str = "routines:changed";

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

/// Depois de gravar: o timer passa a seguir as novas rotinas e as janelas
/// são avisadas. Devolve a lista atualizada.
fn applied(app: &AppHandle, db: &Database, timer: &TimerService) -> Result<Vec<Routine>, AppError> {
    let (routines, workday) =
        db.with_conn(|conn| Ok((store::list(conn)?, settings::store::load(conn)?.workday)))?;
    timer.agenda_changed(routines.clone(), workday)?;
    if let Err(error) = app.emit(ROUTINES_CHANGED_EVENT, ()) {
        eprintln!("falha ao emitir {ROUTINES_CHANGED_EVENT}: {error}");
    }
    Ok(routines)
}

/// As rotinas, na ordem em que acontecem ao longo do dia.
#[tauri::command]
pub async fn routines_list(db: State<'_, Arc<Database>>) -> Result<Vec<Routine>, AppError> {
    db.with_conn(|conn| store::list(conn))
}

#[tauri::command]
pub async fn routine_create(
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    timer: State<'_, Arc<TimerService>>,
    input: RoutineInput,
) -> Result<Vec<Routine>, AppError> {
    db.with_conn(|conn| store::create(conn, input, now_ms()))?;
    applied(&app, &db, &timer)
}

#[tauri::command]
pub async fn routine_update(
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    timer: State<'_, Arc<TimerService>>,
    id: i64,
    input: RoutineInput,
) -> Result<Vec<Routine>, AppError> {
    db.with_conn(|conn| store::update(conn, id, input))?;
    applied(&app, &db, &timer)
}

#[tauri::command]
pub async fn routine_delete(
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    timer: State<'_, Arc<TimerService>>,
    id: i64,
) -> Result<Vec<Routine>, AppError> {
    db.with_conn(|conn| store::delete(conn, id))?;
    applied(&app, &db, &timer)
}

/// Pula a rotina em andamento — só a ocorrência de hoje — e retoma o que ela
/// tinha interrompido. Sem rotina em andamento, não faz nada.
#[tauri::command]
pub async fn routine_skip(timer: State<'_, Arc<TimerService>>) -> Result<TimerSnapshot, AppError> {
    timer.skip_routine()
}
