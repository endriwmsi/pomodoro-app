//! Avisos ao usuário: som e notificação do Windows ao concluir uma sessão.
//!
//! Tudo aqui é "melhor esforço": uma falha é registrada e ignorada, nunca
//! chega ao timer. Ver `docs/NOTIFICATIONS.md`.

pub mod sound;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

use crate::database::Database;
use crate::routines::Routine;
use crate::settings::{self, AlertSettings};
use crate::timer::engine::{Phase, Status, TimerSnapshot};
use sound::Chime;

/// Título e texto da notificação de conclusão. `next` é o estado do timer
/// logo após a sessão terminar (a próxima fase, já iniciada ou não).
pub fn completion_message(finished: Phase, next: &TimerSnapshot) -> (String, String) {
    let title = match finished {
        Phase::Focus => "Foco concluído",
        Phase::ShortBreak | Phase::LongBreak => "Pausa encerrada",
    };
    let invitation = match next.phase {
        Phase::Focus => "Hora de voltar ao foco",
        Phase::ShortBreak => "Hora de uma pausa curta",
        Phase::LongBreak => "Hora de uma pausa longa",
    };
    let minutes = next.planned_ms.div_ceil(60_000);
    let ending = if next.status == Status::Running {
        " — já começou."
    } else {
        "."
    };
    (
        title.to_owned(),
        format!("{invitation} ({minutes} min){ending}"),
    )
}

/// Título e texto da notificação de início de rotina.
pub fn routine_message(routine: &Routine) -> (String, String) {
    (
        routine.name.clone(),
        format!(
            "Hora da sua rotina ({} min). O timer volta ao foco depois dela.",
            routine.duration_minutes
        ),
    )
}

pub struct Alerts {
    app: AppHandle,
    db: Arc<Database>,
    tray_notice_shown: AtomicBool,
}

impl Alerts {
    pub fn new(app: AppHandle, db: Arc<Database>) -> Self {
        Self {
            app,
            db,
            tray_notice_shown: AtomicBool::new(false),
        }
    }

    /// Avisa que uma sessão foi concluída, conforme as preferências atuais.
    pub fn session_completed(&self, finished: Phase, next: &TimerSnapshot) {
        let settings = self.settings();
        if settings.sound_enabled {
            self.play(match finished {
                Phase::Focus => Chime::FocusEnd,
                Phase::ShortBreak | Phase::LongBreak => Chime::BreakEnd,
            });
        }
        if settings.notifications_enabled {
            let (title, body) = completion_message(finished, next);
            self.notify(title, body);
        }
    }

    /// Avisa que uma rotina começou, conforme as preferências atuais.
    pub fn routine_started(&self, routine: &Routine) {
        let settings = self.settings();
        if settings.sound_enabled {
            self.play(Chime::FocusEnd);
        }
        if settings.notifications_enabled {
            let (title, body) = routine_message(routine);
            self.notify(title, body);
        }
    }

    /// Avisa que o expediente acabou.
    pub fn workday_ended(&self) {
        let settings = self.settings();
        if settings.sound_enabled {
            self.play(Chime::BreakEnd);
        }
        if settings.notifications_enabled {
            self.notify(
                "Expediente encerrado".to_owned(),
                "Nada mais começa sozinho hoje. Bom descanso!".to_owned(),
            );
        }
    }

    /// Reproduz um aviso de exemplo, para o usuário conferir som e
    /// notificação nas Configurações. Respeita as preferências atuais.
    pub fn preview(&self) {
        let settings = self.settings();
        if settings.sound_enabled {
            self.play(Chime::FocusEnd);
        }
        if settings.notifications_enabled {
            self.notify(
                "Compasso".to_owned(),
                "É assim que você será avisado ao concluir uma sessão.".to_owned(),
            );
        }
    }

    /// Na primeira vez (por execução) em que a janela principal é fechada,
    /// lembra que o aplicativo continua na bandeja.
    pub fn window_hidden_to_tray(&self) {
        if self.tray_notice_shown.swap(true, Ordering::Relaxed) {
            return;
        }
        if self.settings().notifications_enabled {
            self.notify(
                "O Compasso continua aberto".to_owned(),
                "Ele fica na bandeja do sistema. Para sair, use Encerrar no menu do ícone."
                    .to_owned(),
            );
        }
    }

    /// Preferências atuais; os padrões se o banco não puder ser lido.
    fn settings(&self) -> AlertSettings {
        self.db
            .with_conn(|conn| settings::store::load(conn))
            .map(|settings| settings.alerts)
            .unwrap_or_else(|error| {
                eprintln!("falha ao ler as preferências de avisos: {error}");
                AlertSettings::default()
            })
    }

    fn play(&self, chime: Chime) {
        if !sound::play(chime) {
            eprintln!("o sistema não reproduziu o som de aviso");
        }
    }

    /// Mostra a notificação em outra thread: a chamada ao sistema pode
    /// demorar e quem avisa (o ticker do timer) não deve esperar por ela.
    fn notify(&self, title: String, body: String) {
        let app = self.app.clone();
        std::thread::spawn(move || {
            let shown = app.notification().builder().title(title).body(body).show();
            if let Err(error) = shown {
                eprintln!("falha ao mostrar a notificação: {error}");
            }
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn next(phase: Phase, status: Status, minutes: u64) -> TimerSnapshot {
        TimerSnapshot {
            phase,
            status,
            remaining_ms: minutes * 60_000,
            planned_ms: minutes * 60_000,
            cycle_position: 1,
            cycles_before_long_break: 4,
            pause_reason: None,
            task_id: None,
            routine_id: None,
            routine_remaining_ms: None,
            short: false,
        }
    }

    #[test]
    fn a_routine_is_announced_by_its_name_and_length() {
        let routine = Routine {
            id: 1,
            name: "Hora do café".to_owned(),
            start_minute: 615,
            duration_minutes: 15,
            weekdays: crate::routines::EVERY_DAY,
            enabled: true,
        };

        assert_eq!(
            routine_message(&routine),
            (
                "Hora do café".to_owned(),
                "Hora da sua rotina (15 min). O timer volta ao foco depois dela.".to_owned()
            )
        );
    }

    #[test]
    fn a_finished_focus_invites_to_the_break_that_follows() {
        let short = completion_message(Phase::Focus, &next(Phase::ShortBreak, Status::Idle, 5));
        let long = completion_message(Phase::Focus, &next(Phase::LongBreak, Status::Idle, 15));

        assert_eq!(
            short,
            (
                "Foco concluído".to_owned(),
                "Hora de uma pausa curta (5 min).".to_owned()
            )
        );
        assert_eq!(long.1, "Hora de uma pausa longa (15 min).");
    }

    #[test]
    fn a_finished_break_invites_back_to_focus() {
        for finished in [Phase::ShortBreak, Phase::LongBreak] {
            let message = completion_message(finished, &next(Phase::Focus, Status::Idle, 25));

            assert_eq!(
                message,
                (
                    "Pausa encerrada".to_owned(),
                    "Hora de voltar ao foco (25 min).".to_owned()
                )
            );
        }
    }

    #[test]
    fn the_message_says_when_the_next_session_started_by_itself() {
        let message =
            completion_message(Phase::Focus, &next(Phase::ShortBreak, Status::Running, 5));

        assert_eq!(message.1, "Hora de uma pausa curta (5 min) — já começou.");
    }
}
