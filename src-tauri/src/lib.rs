//! Backend nativo do Compasso.
//!
//! Cada domínio (timer, tarefas, banco, janelas…) ganha um módulo próprio à
//! medida que é implementado; `commands` reúne apenas a superfície exposta ao
//! frontend. Ver `docs/ARCHITECTURE.md`.

mod analytics;
mod background;
mod commands;
mod database;
mod error;
mod media;
mod notifications;
mod routines;
mod settings;
mod tasks;
mod timer;
mod tray;
mod weather;
mod windows;

use std::sync::Arc;

use tauri::{AppHandle, Emitter, Manager, RunEvent, WindowEvent};

use database::{Database, DATABASE_FILE};
use notifications::Alerts;
use timer::clock::{SystemClock, SystemUtcOffset};
use timer::engine::Phase;
use timer::engine::TimerSnapshot;
use timer::{Notifier, TimerService};
use weather::{HttpFetcher, SystemLocator, WeatherService};
use windows::notch::NotchState;

/// Variável de ambiente que substitui o diretório de dados do aplicativo.
const DATA_DIR_VARIABLE: &str = "COMPASSO_DATA_DIR";

/// Evento emitido a todas as janelas quando o estado exibível do timer muda.
const TIMER_STATE_EVENT: &str = "timer:state";

/// Liga o timer ao resto do aplicativo: janelas e avisos.
struct AppNotifier {
    app: AppHandle,
    alerts: Arc<Alerts>,
}

impl Notifier for AppNotifier {
    fn state_changed(&self, snapshot: &TimerSnapshot) {
        if let Err(error) = self.app.emit(TIMER_STATE_EVENT, snapshot) {
            eprintln!("falha ao emitir {TIMER_STATE_EVENT}: {error}");
        }
    }

    fn session_completed(&self, finished: Phase, next: &TimerSnapshot) {
        self.alerts.session_completed(finished, next);
        if finished == Phase::Focus {
            // A contagem de pomodoros da tarefa mudou.
            commands::tasks::announce_change(&self.app);
        }
    }

    fn routine_started(&self, routine: &routines::Routine) {
        self.alerts.routine_started(routine);
    }

    fn workday_ended(&self) {
        self.alerts.workday_ended();
    }
}

/// Liga ou desliga o início do aplicativo junto com o Windows (entrada em
/// "Executar" do registro do usuário, gerenciada pelo plugin de autostart).
/// Só escreve quando o estado atual difere do desejado.
pub(crate) fn apply_launch_at_login(app: &AppHandle, enabled: bool) -> Result<(), error::AppError> {
    use tauri_plugin_autostart::ManagerExt;

    let failure = |error: tauri_plugin_autostart::Error| error::AppError::Internal {
        message: format!("não foi possível ajustar o início com o Windows: {error}"),
    };
    let autostart = app.autolaunch();
    if autostart.is_enabled().map_err(failure)? == enabled {
        return Ok(());
    }
    if enabled {
        autostart.enable().map_err(failure)
    } else {
        autostart.disable().map_err(failure)
    }
}

/// Mostra uma caixa de erro nativa quando a inicialização falha. Sem ela, em
/// builds de release (que não têm console) o aplicativo simplesmente não
/// abriria, sem explicação.
fn report_startup_failure(error: &dyn std::error::Error) {
    eprintln!("falha ao iniciar: {error}");
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

        let wide = |text: &str| -> Vec<u16> { text.encode_utf16().chain(Some(0)).collect() };
        let text = wide(&format!(
            "O Compasso não conseguiu iniciar.\n\n{error}\n\nSeus dados não foram alterados. \
             Consulte docs/TROUBLESHOOTING.md."
        ));
        let title = wide("Compasso");
        // SAFETY: os dois ponteiros apontam para buffers UTF-16 terminados em
        // zero que vivem até a chamada retornar; janela-mãe nula é permitida.
        unsafe {
            MessageBoxW(
                std::ptr::null_mut(),
                text.as_ptr(),
                title.as_ptr(),
                MB_OK | MB_ICONERROR,
            );
        }
    }
}

/// Monta e executa a aplicação Tauri. Só retorna quando o processo encerra.
pub fn run() {
    let app = tauri::Builder::default()
        // Precisa ser o primeiro plugin. Uma segunda execução apenas traz a
        // janela da instância existente: dois processos disputariam o banco e
        // criariam dois notches.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            windows::show_main(app, None);
        }))
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let started = (|| -> Result<(), Box<dyn std::error::Error>> {
                // Dados do usuário ficam no diretório de dados do aplicativo
                // (%APPDATA%\<identifier>), nunca na pasta de instalação.
                // `COMPASSO_DATA_DIR` troca a pasta — para demonstrações e capturas
                // de tela com dados de exemplo, sem tocar nos dados reais.
                let data_dir = match std::env::var_os(DATA_DIR_VARIABLE) {
                    Some(dir) if !dir.is_empty() => std::path::PathBuf::from(dir),
                    _ => app.path().app_data_dir()?,
                };
                let database = Arc::new(Database::open(&data_dir.join(DATABASE_FILE))?);
                let settings = database.with_conn(|conn| settings::store::load(conn))?;

                let clock = Arc::new(SystemClock::new());
                let alerts = Arc::new(Alerts::new(app.handle().clone(), database.clone()));
                let (timer, wake) = TimerService::new(
                    database.clone(),
                    clock.clone(),
                    Arc::new(SystemUtcOffset),
                    Box::new(AppNotifier {
                        app: app.handle().clone(),
                        alerts: alerts.clone(),
                    }),
                )?;
                std::thread::Builder::new()
                    .name("timer-ticker".into())
                    .spawn({
                        let timer = timer.clone();
                        move || timer.run_ticker(wake)
                    })?;

                app.manage(Arc::new(background::BackgroundStore::new(data_dir.clone())));
                app.manage(database);
                app.manage(timer);
                app.manage(alerts);
                app.manage(Arc::new(WeatherService::new(
                    Box::new(HttpFetcher),
                    Box::new(SystemLocator),
                    clock,
                )));
                app.manage(NotchState::default());

                tray::build(app.handle())?;
                windows::notch::configure(app.handle(), &settings.notch)?;
                // Reaplica a preferência: o registro do Windows guarda o caminho do
                // executável, que pode ter mudado (reinstalação em outra pasta).
                if let Err(error) =
                    apply_launch_at_login(app.handle(), settings.general.launch_at_login)
                {
                    eprintln!("falha ao ajustar o início com o Windows: {error}");
                }
                Ok(())
            })();
            if let Err(error) = &started {
                report_startup_failure(error.as_ref());
            }
            started
        })
        .on_window_event(|window, event| match event {
            // Fechar a janela principal a envia para a bandeja.
            WindowEvent::CloseRequested { api, .. } if window.label() == windows::MAIN => {
                api.prevent_close();
                windows::hide_main(window.app_handle());
                window.state::<Arc<Alerts>>().window_hidden_to_tray();
            }
            // O Windows pode mover ou redimensionar o notch quando a resolução,
            // a escala ou o monitor principal mudam: recoloca-o no lugar.
            WindowEvent::Moved(_) | WindowEvent::ScaleFactorChanged { .. }
                if window.label() == windows::NOTCH =>
            {
                if let Err(error) = windows::notch::apply(window.app_handle()) {
                    eprintln!("falha ao reposicionar o notch: {error}");
                }
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            commands::analytics::analytics_dashboard,
            commands::analytics::analytics_periods,
            commands::app::app_info,
            commands::background::background_get_custom,
            commands::background::background_set_custom,
            commands::notch::weather_get,
            commands::notch::media_get_state,
            commands::notch::media_control,
            commands::notch::media_get_artwork,
            commands::notch::media_seek,
            commands::notch::media_set_volume,
            commands::routines::routines_list,
            commands::routines::routine_create,
            commands::routines::routine_update,
            commands::routines::routine_delete,
            commands::routines::routine_skip,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::timer::timer_get_state,
            commands::timer::timer_start,
            commands::timer::timer_pause,
            commands::timer::timer_skip,
            commands::timer::timer_reset,
            commands::tasks::tasks_list,
            commands::tasks::task_create,
            commands::tasks::task_update,
            commands::tasks::task_delete,
            commands::tasks::task_move,
            commands::tasks::timer_set_task,
            commands::tasks::timer_focus_task,
            commands::window::notch_set_layout,
            commands::window::preview_alerts,
            commands::window::show_main_window,
        ])
        .build(tauri::generate_context!())
        .expect("falha ao iniciar a aplicação Tauri");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            // Encerramento ordenado: a sessão em andamento fica registrada
            // como interrompida, com o tempo exato. Uma queda do processo é
            // tratada na próxima abertura (`TimerService::new`).
            if let Some(timer) = app.try_state::<Arc<TimerService>>() {
                timer.shutdown();
            }
        }
    });
}
