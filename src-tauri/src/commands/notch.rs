//! Comandos das abas de clima e de música do notch.

use std::sync::Arc;

use tauri::State;

use crate::database::Database;
use crate::error::AppError;
use crate::media::{self, MediaAction, MediaState};
use crate::settings;
use crate::weather::{WeatherReport, WeatherService};

/// Roda `work` em uma thread de trabalho: tanto a consulta ao provedor de
/// clima quanto as chamadas ao controle de mídia bloqueiam.
async fn blocking<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, AppError> + Send + 'static,
) -> Result<T, AppError> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| AppError::Internal {
            message: format!("a tarefa em segundo plano falhou: {error}"),
        })?
}

/// Previsão do tempo. Só consulta a internet se `weather.enabled` e, no
/// máximo, uma vez a cada 15 minutos.
#[tauri::command]
pub async fn weather_get(
    db: State<'_, Arc<Database>>,
    weather: State<'_, Arc<WeatherService>>,
) -> Result<WeatherReport, AppError> {
    let preferences = db.with_conn(|conn| settings::store::load(conn))?.weather;
    let weather = weather.inner().clone();
    blocking(move || weather.report(preferences)).await
}

/// Mídia em reprodução no sistema e volume geral.
#[tauri::command]
pub async fn media_get_state() -> Result<MediaState, AppError> {
    blocking(media::state).await
}

/// Tocar/pausar, próxima ou anterior; devolve o estado depois da ação.
#[tauri::command]
pub async fn media_control(action: MediaAction) -> Result<MediaState, AppError> {
    blocking(move || media::act(action)).await
}

/// Leva a faixa atual para a posição indicada, em ms.
#[tauri::command]
pub async fn media_seek(position_ms: u64) -> Result<MediaState, AppError> {
    blocking(move || media::seek(position_ms)).await
}

/// Capa da mídia atual como `data:` URL, ou `null`.
#[tauri::command]
pub async fn media_get_artwork() -> Result<Option<String>, AppError> {
    blocking(media::artwork).await
}

/// Ajusta o volume geral do sistema (0 a 1).
#[tauri::command]
pub async fn media_set_volume(level: f32) -> Result<MediaState, AppError> {
    blocking(move || media::set_volume(level)).await
}
