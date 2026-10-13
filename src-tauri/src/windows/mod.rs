//! Janelas do aplicativo: a principal e o notch. Ver `docs/WINDOW_MANAGER.md`.

pub mod notch;

use tauri::{AppHandle, Emitter, Manager};

pub const MAIN: &str = "main";
pub const NOTCH: &str = "notch";

/// Evento enviado à janela principal para trocar de tela (payload: nome da tela).
pub const NAVIGATE_EVENT: &str = "app:navigate";

/// Traz a janela principal para a frente — ela pode estar oculta na bandeja
/// ou minimizada — e, opcionalmente, pede que abra uma tela.
pub fn show_main(app: &AppHandle, view: Option<&str>) {
    let Some(window) = app.get_webview_window(MAIN) else {
        return;
    };
    // Falhas aqui não têm consequência além de a janela não aparecer.
    let _ = window.show();
    let _ = window.unminimize();
    let _ = window.set_focus();
    if let Some(view) = view {
        let _ = app.emit_to(MAIN, NAVIGATE_EVENT, view);
    }
}

/// Fechar a janela principal apenas a oculta: timer, notch e bandeja seguem
/// ativos. O aplicativo só encerra pela bandeja ("Encerrar").
pub fn hide_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(MAIN) {
        let _ = window.hide();
    }
}
