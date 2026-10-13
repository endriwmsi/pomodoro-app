use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, Emitter, State};

use crate::database::Database;
use crate::error::AppError;
use crate::tasks::{store, Status, Task, TaskInput};
use crate::timer::engine::TimerSnapshot;
use crate::timer::TimerService;

/// Evento emitido a todas as janelas quando o quadro muda (sem payload: quem
/// recebe busca a lista de novo).
pub const TASKS_CHANGED_EVENT: &str = "tasks:changed";

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX))
        .unwrap_or(0)
}

/// Avisa as janelas; uma falha aqui não desfaz o que já foi gravado.
pub fn announce_change(app: &AppHandle) {
    if let Err(error) = app.emit(TASKS_CHANGED_EVENT, ()) {
        eprintln!("falha ao emitir {TASKS_CHANGED_EVENT}: {error}");
    }
}

// Os comandos que alteram o quadro devolvem a lista completa já atualizada,
// de modo que a interface nunca precisa adivinhar o resultado.

#[tauri::command]
pub async fn tasks_list(db: State<'_, Arc<Database>>) -> Result<Vec<Task>, AppError> {
    db.with_conn(|conn| store::list(conn))
}

/// Cria uma tarefa no fim da coluna "A fazer".
#[tauri::command]
pub async fn task_create(
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    input: TaskInput,
) -> Result<Vec<Task>, AppError> {
    let tasks = db.with_conn(|conn| {
        store::create(conn, input, now_ms())?;
        store::list(conn)
    })?;
    announce_change(&app);
    Ok(tasks)
}

#[tauri::command]
pub async fn task_update(
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    id: i64,
    input: TaskInput,
) -> Result<Vec<Task>, AppError> {
    let tasks = db.with_conn(|conn| {
        store::update(conn, id, input, now_ms())?;
        store::list(conn)
    })?;
    announce_change(&app);
    Ok(tasks)
}

/// Exclui a tarefa. As sessões dedicadas a ela são mantidas, sem o vínculo.
#[tauri::command]
pub async fn task_delete(
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    timer: State<'_, Arc<TimerService>>,
    id: i64,
) -> Result<Vec<Task>, AppError> {
    let tasks = db.with_conn(|conn| {
        store::delete(conn, id)?;
        store::list(conn)
    })?;
    timer.task_unavailable(id)?;
    announce_change(&app);
    Ok(tasks)
}

/// Move a tarefa para a coluna `status`, na posição `index` (contada sem a
/// própria tarefa). Concluir a tarefa escolhida no timer a desvincula dele.
#[tauri::command]
pub async fn task_move(
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    timer: State<'_, Arc<TimerService>>,
    id: i64,
    status: Status,
    index: usize,
) -> Result<Vec<Task>, AppError> {
    let tasks = db.with_conn(|conn| {
        store::move_to(conn, id, status, index, now_ms())?;
        store::list(conn)
    })?;
    if status == Status::Done {
        timer.task_unavailable(id)?;
    }
    announce_change(&app);
    Ok(tasks)
}

/// Escolhe a tarefa a que os focos são dedicados; `null` para nenhuma.
#[tauri::command]
pub async fn timer_set_task(
    db: State<'_, Arc<Database>>,
    timer: State<'_, Arc<TimerService>>,
    task_id: Option<i64>,
) -> Result<TimerSnapshot, AppError> {
    if let Some(id) = task_id {
        db.with_conn(|conn| store::open_task_status(conn, id))?;
    }
    timer.set_task(task_id)
}

/// "Focar nesta tarefa": escolhe a tarefa, passa-a de "A fazer" para "Em
/// andamento" se for o caso e vai direto para um foco.
#[tauri::command]
pub async fn timer_focus_task(
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    timer: State<'_, Arc<TimerService>>,
    task_id: i64,
) -> Result<TimerSnapshot, AppError> {
    let moved = db.with_conn(|conn| {
        if store::open_task_status(conn, task_id)? == Status::Todo {
            store::move_to(conn, task_id, Status::Doing, usize::MAX, now_ms())?;
            return Ok(true);
        }
        Ok(false)
    })?;
    let snapshot = timer.focus_task(task_id)?;
    if moved {
        announce_change(&app);
    }
    Ok(snapshot)
}
