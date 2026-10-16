//! Comandos de atualização do aplicativo. Ver `crate::updater`.

use std::sync::Arc;

use tauri::{AppHandle, State};

use crate::error::AppError;
use crate::updater::{self, UpdateInfo, UpdateService};

/// A atualização já encontrada nesta execução, sem consultar a rede.
#[tauri::command]
pub fn update_pending(service: State<'_, Arc<UpdateService>>) -> Option<UpdateInfo> {
    service.pending()
}

/// Consulta a Release mais recente. `null` quando esta já é a mais nova.
#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Option<UpdateInfo>, AppError> {
    updater::check(&app).await
}

/// Baixa e instala a atualização encontrada; o aplicativo reinicia sozinho.
#[tauri::command]
pub async fn update_install(app: AppHandle) -> Result<(), AppError> {
    updater::install(&app).await
}
