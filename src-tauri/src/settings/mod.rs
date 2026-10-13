//! Configurações do usuário: modelo, limites e validação.
//!
//! Este módulo é a fonte de verdade dos padrões e dos limites. A persistência
//! fica em [`store`]. Ver `docs/DATABASE.md` e `docs/THEMING.md`.

pub mod store;

use std::ops::RangeInclusive;

use serde::{Deserialize, Serialize};

use crate::error::AppError;

pub const FOCUS_MINUTES: RangeInclusive<u32> = 1..=180;
pub const SHORT_BREAK_MINUTES: RangeInclusive<u32> = 1..=60;
pub const LONG_BREAK_MINUTES: RangeInclusive<u32> = 1..=120;
pub const CYCLES_BEFORE_LONG_BREAK: RangeInclusive<u32> = 1..=12;
pub const DAILY_POMODOROS_GOAL: RangeInclusive<u32> = 1..=50;

/// Template de estilização da interface. Acrescentar um template exige uma
/// variante aqui, uma entrada em `src/app/templates.ts` e um bloco de tokens
/// em `src/styles/globals.css`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Template {
    /// Superfícies translúcidas sobre a imagem de fundo.
    #[default]
    Glass,
    /// Painéis escuros, tipografia monoespaçada e elementos em matriz de pontos.
    Matrix,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppearanceSettings {
    pub template: Template,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct TimerSettings {
    pub focus_minutes: u32,
    pub short_break_minutes: u32,
    pub long_break_minutes: u32,
    pub cycles_before_long_break: u32,
    pub auto_start_breaks: bool,
    pub auto_start_focus: bool,
}

impl Default for TimerSettings {
    fn default() -> Self {
        Self {
            focus_minutes: 25,
            short_break_minutes: 5,
            long_break_minutes: 15,
            cycles_before_long_break: 4,
            auto_start_breaks: false,
            auto_start_focus: false,
        }
    }
}

impl TimerSettings {
    pub fn validate(&self) -> Result<(), AppError> {
        check_range(
            "timer.focusMinutes",
            "A duração do foco",
            self.focus_minutes,
            &FOCUS_MINUTES,
            "minutos",
        )?;
        check_range(
            "timer.shortBreakMinutes",
            "A pausa curta",
            self.short_break_minutes,
            &SHORT_BREAK_MINUTES,
            "minutos",
        )?;
        check_range(
            "timer.longBreakMinutes",
            "A pausa longa",
            self.long_break_minutes,
            &LONG_BREAK_MINUTES,
            "minutos",
        )?;
        check_range(
            "timer.cyclesBeforeLongBreak",
            "A quantidade de ciclos antes da pausa longa",
            self.cycles_before_long_break,
            &CYCLES_BEFORE_LONG_BREAK,
            "ciclos",
        )
    }
}

fn check_range(
    field: &'static str,
    subject: &str,
    value: u32,
    range: &RangeInclusive<u32>,
    unit: &str,
) -> Result<(), AppError> {
    if range.contains(&value) {
        return Ok(());
    }
    Err(AppError::validation(
        field,
        format!(
            "{subject} deve ficar entre {} e {} {unit}.",
            range.start(),
            range.end()
        ),
    ))
}

/// Borda do monitor principal em que o notch fica.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotchPosition {
    #[default]
    Top,
    Left,
    Right,
}

/// Cor do notch. Não depende do template.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NotchTheme {
    /// Preto, com texto claro.
    Dark,
    /// Branco, com texto escuro.
    Light,
    /// Acompanha o modo claro ou escuro do Windows.
    #[default]
    System,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct NotchSettings {
    /// Mostra o notch no monitor principal.
    pub enabled: bool,
    pub theme: NotchTheme,
    pub position: NotchPosition,
}

impl Default for NotchSettings {
    fn default() -> Self {
        Self {
            enabled: true,
            position: NotchPosition::Top,
            theme: NotchTheme::System,
        }
    }
}

/// Metas do usuário, exibidas no dashboard.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GoalSettings {
    /// Pomodoros concluídos por dia; `None` significa "sem meta".
    pub daily_pomodoros: Option<u32>,
}

impl GoalSettings {
    pub fn validate(&self) -> Result<(), AppError> {
        match self.daily_pomodoros {
            Some(goal) => check_range(
                "goals.dailyPomodoros",
                "A meta diária",
                goal,
                &DAILY_POMODOROS_GOAL,
                "pomodoros",
            ),
            None => Ok(()),
        }
    }
}

/// Comportamento geral do aplicativo.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct GeneralSettings {
    /// Abrir o aplicativo (na janela principal) ao entrar no Windows.
    pub launch_at_login: bool,
}

/// Previsão do tempo no notch. É a única funcionalidade que usa a internet;
/// por isso começa desligada.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct WeatherSettings {
    pub enabled: bool,
    /// Usar a localização do computador; sem ela, mostram-se capitais.
    pub use_location: bool,
}

/// Avisos ao concluir uma sessão.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AlertSettings {
    pub sound_enabled: bool,
    pub notifications_enabled: bool,
}

impl Default for AlertSettings {
    fn default() -> Self {
        Self {
            sound_enabled: true,
            notifications_enabled: true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub appearance: AppearanceSettings,
    pub timer: TimerSettings,
    pub notch: NotchSettings,
    pub alerts: AlertSettings,
    pub goals: GoalSettings,
    pub weather: WeatherSettings,
    pub general: GeneralSettings,
}

impl Settings {
    pub fn validate(&self) -> Result<(), AppError> {
        self.timer.validate()?;
        self.goals.validate()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn invalid_field(timer: TimerSettings) -> &'static str {
        match timer.validate() {
            Err(AppError::Validation { field, .. }) => field,
            other => panic!("esperava erro de validação, obtive {other:?}"),
        }
    }

    #[test]
    fn defaults_follow_the_classic_pomodoro_and_are_valid() {
        let settings = Settings::default();

        assert_eq!(settings.appearance.template, Template::Glass);
        assert_eq!(settings.timer.focus_minutes, 25);
        assert_eq!(settings.timer.short_break_minutes, 5);
        assert_eq!(settings.timer.long_break_minutes, 15);
        assert_eq!(settings.timer.cycles_before_long_break, 4);
        assert!(!settings.timer.auto_start_breaks);
        assert!(!settings.timer.auto_start_focus);
        assert!(settings.notch.enabled);
        assert_eq!(settings.notch.position, NotchPosition::Top);
        assert!(settings.alerts.sound_enabled);
        assert!(settings.alerts.notifications_enabled);
        settings.validate().unwrap();
    }

    #[test]
    fn range_limits_are_inclusive() {
        let lowest = TimerSettings {
            focus_minutes: *FOCUS_MINUTES.start(),
            short_break_minutes: *SHORT_BREAK_MINUTES.start(),
            long_break_minutes: *LONG_BREAK_MINUTES.start(),
            cycles_before_long_break: *CYCLES_BEFORE_LONG_BREAK.start(),
            ..TimerSettings::default()
        };
        let highest = TimerSettings {
            focus_minutes: *FOCUS_MINUTES.end(),
            short_break_minutes: *SHORT_BREAK_MINUTES.end(),
            long_break_minutes: *LONG_BREAK_MINUTES.end(),
            cycles_before_long_break: *CYCLES_BEFORE_LONG_BREAK.end(),
            ..TimerSettings::default()
        };

        lowest.validate().unwrap();
        highest.validate().unwrap();
    }

    #[test]
    fn each_out_of_range_value_names_its_field() {
        let base = TimerSettings::default();

        assert_eq!(
            invalid_field(TimerSettings {
                focus_minutes: 0,
                ..base
            }),
            "timer.focusMinutes"
        );
        assert_eq!(
            invalid_field(TimerSettings {
                focus_minutes: 181,
                ..base
            }),
            "timer.focusMinutes"
        );
        assert_eq!(
            invalid_field(TimerSettings {
                short_break_minutes: 61,
                ..base
            }),
            "timer.shortBreakMinutes"
        );
        assert_eq!(
            invalid_field(TimerSettings {
                long_break_minutes: 0,
                ..base
            }),
            "timer.longBreakMinutes"
        );
        assert_eq!(
            invalid_field(TimerSettings {
                cycles_before_long_break: 13,
                ..base
            }),
            "timer.cyclesBeforeLongBreak"
        );
    }

    #[test]
    fn settings_serialize_with_the_frontend_contract() {
        let json = serde_json::to_value(Settings::default()).unwrap();

        assert_eq!(
            json,
            serde_json::json!({
                "appearance": { "template": "glass" },
                "timer": {
                    "focusMinutes": 25,
                    "shortBreakMinutes": 5,
                    "longBreakMinutes": 15,
                    "cyclesBeforeLongBreak": 4,
                    "autoStartBreaks": false,
                    "autoStartFocus": false
                },
                "notch": { "enabled": true, "position": "top", "theme": "system" },
                "alerts": { "soundEnabled": true, "notificationsEnabled": true },
                "goals": { "dailyPomodoros": null },
                "weather": { "enabled": false, "useLocation": false },
                "general": { "launchAtLogin": false }
            })
        );
    }

    #[test]
    fn the_daily_goal_is_optional_but_limited_when_present() {
        let with_goal = |goal| Settings {
            goals: GoalSettings {
                daily_pomodoros: goal,
            },
            ..Settings::default()
        };

        with_goal(None).validate().unwrap();
        with_goal(Some(1)).validate().unwrap();
        with_goal(Some(50)).validate().unwrap();
        for bad in [0, 51] {
            assert!(matches!(
                with_goal(Some(bad)).validate(),
                Err(AppError::Validation {
                    field: "goals.dailyPomodoros",
                    ..
                })
            ));
        }
    }

    #[test]
    fn missing_fields_fall_back_to_their_defaults() {
        let timer: TimerSettings = serde_json::from_str(r#"{ "focusMinutes": 50 }"#).unwrap();

        assert_eq!(
            timer,
            TimerSettings {
                focus_minutes: 50,
                ..TimerSettings::default()
            }
        );
    }

    #[test]
    fn unknown_templates_are_rejected() {
        let result = serde_json::from_str::<AppearanceSettings>(r#"{ "template": "neon" }"#);

        assert!(result.is_err());
    }
}
