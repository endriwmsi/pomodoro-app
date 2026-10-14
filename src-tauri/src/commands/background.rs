//! Comandos da imagem de fundo enviada pelo usuário.

use std::sync::Arc;

use tauri::State;

use crate::background::BackgroundStore;
use crate::error::AppError;

// `async`: ler e gravar alguns megabytes não deve travar a interface.

/// A imagem enviada pelo usuário como `data:` URL, ou `null` se não há.
#[tauri::command]
pub async fn background_get_custom(
    store: State<'_, Arc<BackgroundStore>>,
) -> Result<Option<String>, AppError> {
    store.load()
}

/// Guarda a imagem (`data:` URL em base64; PNG, JPEG ou WebP de até 12 MB) e
/// devolve o que ficou gravado. Não muda qual fundo está selecionado: isso é
/// `appearance.background`, em `update_settings`.
#[tauri::command]
pub async fn background_set_custom(
    store: State<'_, Arc<BackgroundStore>>,
    data_url: String,
) -> Result<Option<String>, AppError> {
    store.save(&data_url)?;
    store.load()
}
