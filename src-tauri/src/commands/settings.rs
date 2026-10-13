use std::sync::Arc;

use tauri::{AppHandle, Emitter, State};

use crate::database::Database;
use crate::error::AppError;
use crate::settings::{store, Settings};
use crate::timer::TimerService;
use crate::windows;

/// Evento emitido a todas as janelas quando as configurações mudam.
pub const SETTINGS_CHANGED_EVENT: &str = "settings:changed";

// Os comandos são `async` para rodarem fora da thread principal: o acesso ao
// banco nunca deve travar a interface.

/// Retorna as configurações persistidas (ou os padrões).
#[tauri::command]
pub async fn get_settings(db: State<'_, Arc<Database>>) -> Result<Settings, AppError> {
    db.with_conn(|conn| store::load(conn))
}

/// Valida e substitui todas as configurações; retorna o que ficou gravado.
/// Em seguida aplica os efeitos: o início com o Windows é ligado ou desligado, o timer usa os novos valores a partir da
/// próxima sessão, o notch é mostrado ou escondido e as janelas são avisadas.
#[tauri::command]
pub async fn update_settings(
    app: AppHandle,
    db: State<'_, Arc<Database>>,
    timer: State<'_, Arc<TimerService>>,
    settings: Settings,
) -> Result<Settings, AppError> {
    let saved = db.with_conn(|conn| {
        store::save(conn, &settings)?;
        store::load(conn)
    })?;
    // Se o Windows recusar, a opção gravada volta a refletir o que vale de fato.
    if let Err(error) = crate::apply_launch_at_login(&app, saved.general.launch_at_login) {
        let mut actual = saved;
        actual.general.launch_at_login = !saved.general.launch_at_login;
        db.with_conn(|conn| store::save(conn, &actual))?;
        return Err(error);
    }
    timer.settings_changed(saved.timer)?;
    windows::notch::configure(&app, saved.notch)?;
    app.emit(SETTINGS_CHANGED_EVENT, saved)?;
    Ok(saved)
}
