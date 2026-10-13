//! Ícone e menu na bandeja do sistema. Ver `docs/WINDOW_MANAGER.md`.

use std::sync::Arc;

use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::error::AppError;
use crate::timer::engine::TimerSnapshot;
use crate::timer::TimerService;
use crate::windows;

const OPEN: &str = "open";
const START: &str = "start";
const PAUSE: &str = "pause";
const SKIP: &str = "skip";
const SETTINGS: &str = "settings";
const QUIT: &str = "quit";

pub fn build(app: &AppHandle) -> tauri::Result<()> {
    let menu = MenuBuilder::new(app)
        .text(OPEN, "Abrir Compasso")
        .separator()
        .text(START, "Iniciar ou retomar")
        .text(PAUSE, "Pausar")
        .text(SKIP, "Pular sessão")
        .separator()
        .text(SETTINGS, "Configurações")
        .separator()
        .text(QUIT, "Encerrar")
        .build()?;

    let mut tray = TrayIconBuilder::with_id("main")
        .tooltip("Compasso")
        .menu(&menu)
        // Clique esquerdo abre a janela; o menu fica no clique direito.
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            OPEN => windows::show_main(app, None),
            START => timer_action(app, TimerService::start),
            PAUSE => timer_action(app, TimerService::pause),
            SKIP => timer_action(app, TimerService::skip),
            SETTINGS => windows::show_main(app, Some("settings")),
            // `exit` dispara `RunEvent::Exit`, que registra a sessão em andamento.
            QUIT => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                windows::show_main(tray.app_handle(), None);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

fn timer_action(
    app: &AppHandle,
    action: impl FnOnce(&TimerService) -> Result<TimerSnapshot, AppError>,
) {
    let timer = app.state::<Arc<TimerService>>();
    if let Err(error) = action(&timer) {
        eprintln!("falha em uma ação do timer pela bandeja: {error}");
    }
}
