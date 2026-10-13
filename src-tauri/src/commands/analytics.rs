use std::sync::Arc;

use tauri::State;

use crate::analytics::{self, Dashboard, PeriodStats};
use crate::database::Database;
use crate::error::AppError;

/// Indicadores de hoje e totais por dia de uma semana.
///
/// Os limites são instantes em milissegundos (UTC) calculados pela interface
/// no fuso do usuário: `today_start_ms`/`today_end_ms` são a meia-noite local
/// de hoje e a de amanhã; `week_boundaries_ms` tem as oito meias-noites que
/// delimitam os sete dias da semana pedida.
#[tauri::command]
pub async fn analytics_dashboard(
    db: State<'_, Arc<Database>>,
    today_start_ms: i64,
    today_end_ms: i64,
    week_boundaries_ms: Vec<i64>,
) -> Result<Dashboard, AppError> {
    db.with_conn(|conn| {
        analytics::dashboard(conn, today_start_ms, today_end_ms, &week_boundaries_ms)
    })
}

/// Totais de cada período delimitado por limites consecutivos — por exemplo,
/// cada dia de um mês, para o calendário do dashboard.
#[tauri::command]
pub async fn analytics_periods(
    db: State<'_, Arc<Database>>,
    boundaries_ms: Vec<i64>,
) -> Result<Vec<PeriodStats>, AppError> {
    db.with_conn(|conn| analytics::periods(conn, &boundaries_ms))
}
