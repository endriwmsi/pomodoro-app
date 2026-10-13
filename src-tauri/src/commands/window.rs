use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::notifications::Alerts;
use crate::windows;
use crate::windows::notch::Layout;

/// Ajusta a janela do notch ao que ele vai mostrar: recolhido, expandido ou
/// compacto. A interface chama antes de animar um crescimento e depois de
/// animar uma redução, para a janela nunca ser menor que o desenho.
#[tauri::command]
pub fn notch_set_layout(app: AppHandle, layout: Layout) -> Result<(), AppError> {
    Ok(windows::notch::set_layout(&app, layout)?)
}

/// Toca o som e mostra a notificação de exemplo (conforme as preferências),
/// para o usuário conferir os avisos nas Configurações.
#[tauri::command]
pub fn preview_alerts(alerts: State<'_, Arc<Alerts>>) {
    alerts.preview();
}

/// Mostra a janela principal; `view`, se informado, é a tela a abrir.
#[tauri::command]
pub fn show_main_window(app: AppHandle, view: Option<String>) {
    windows::show_main(&app, view.as_deref());
}
