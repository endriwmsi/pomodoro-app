use std::sync::Arc;

use tauri::State;

use crate::error::AppError;
use crate::timer::engine::TimerSnapshot;
use crate::timer::TimerService;

// Comandos que não se aplicam ao estado atual (ex.: pausar com o timer parado)
// não são erro: devolvem o estado como está. Assim, cliques repetidos ou
// vindos de janelas diferentes nunca produzem falhas espúrias.

/// Estado atual do timer.
#[tauri::command]
pub async fn timer_get_state(
    timer: State<'_, Arc<TimerService>>,
) -> Result<TimerSnapshot, AppError> {
    timer.snapshot()
}

/// Inicia a fase atual ou retoma a sessão pausada.
#[tauri::command]
pub async fn timer_start(timer: State<'_, Arc<TimerService>>) -> Result<TimerSnapshot, AppError> {
    timer.start()
}

#[tauri::command]
pub async fn timer_pause(timer: State<'_, Arc<TimerService>>) -> Result<TimerSnapshot, AppError> {
    timer.pause()
}

/// Encerra a sessão atual como pulada e passa à fase seguinte.
#[tauri::command]
pub async fn timer_skip(timer: State<'_, Arc<TimerService>>) -> Result<TimerSnapshot, AppError> {
    timer.skip()
}

/// Abandona a sessão atual e volta ao início da mesma fase.
#[tauri::command]
pub async fn timer_reset(timer: State<'_, Arc<TimerService>>) -> Result<TimerSnapshot, AppError> {
    timer.reset()
}
