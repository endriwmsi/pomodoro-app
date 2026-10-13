//! Persistência das configurações na tabela `settings`.

use rusqlite::{Connection, OptionalExtension};
use serde::de::DeserializeOwned;
use serde::Serialize;

use super::{
    AlertSettings, AppearanceSettings, GeneralSettings, GoalSettings, NotchSettings, Settings,
    TimerSettings, WeatherSettings,
};
use crate::error::AppError;

const KEY_APPEARANCE: &str = "appearance";
const KEY_TIMER: &str = "timer";
const KEY_NOTCH: &str = "notch";
const KEY_ALERTS: &str = "alerts";
const KEY_GOALS: &str = "goals";
const KEY_WEATHER: &str = "weather";
const KEY_GENERAL: &str = "general";

/// Carrega as configurações. Seções ausentes, ilegíveis ou fora dos limites
/// voltam ao padrão: uma linha danificada não pode impedir o aplicativo de
/// abrir. A linha original só é sobrescrita no próximo [`save`].
pub fn load(conn: &Connection) -> Result<Settings, AppError> {
    let appearance: AppearanceSettings = load_section(conn, KEY_APPEARANCE)?;
    let mut timer: TimerSettings = load_section(conn, KEY_TIMER)?;
    if let Err(error) = timer.validate() {
        eprintln!("configurações do timer inválidas no banco; usando o padrão ({error})");
        timer = TimerSettings::default();
    }
    let notch: NotchSettings = load_section(conn, KEY_NOTCH)?;
    let alerts: AlertSettings = load_section(conn, KEY_ALERTS)?;
    let mut goals: GoalSettings = load_section(conn, KEY_GOALS)?;
    if let Err(error) = goals.validate() {
        eprintln!("metas inválidas no banco; usando o padrão ({error})");
        goals = GoalSettings::default();
    }
    Ok(Settings {
        appearance,
        timer,
        notch,
        alerts,
        goals,
        weather: load_section::<WeatherSettings>(conn, KEY_WEATHER)?,
        general: load_section::<GeneralSettings>(conn, KEY_GENERAL)?,
    })
}

/// Valida e grava todas as seções em uma única transação.
pub fn save(conn: &mut Connection, settings: &Settings) -> Result<(), AppError> {
    settings.validate()?;
    let tx = conn.transaction()?;
    save_section(&tx, KEY_APPEARANCE, &settings.appearance)?;
    save_section(&tx, KEY_TIMER, &settings.timer)?;
    save_section(&tx, KEY_NOTCH, &settings.notch)?;
    save_section(&tx, KEY_ALERTS, &settings.alerts)?;
    save_section(&tx, KEY_GOALS, &settings.goals)?;
    save_section(&tx, KEY_WEATHER, &settings.weather)?;
    save_section(&tx, KEY_GENERAL, &settings.general)?;
    tx.commit()?;
    Ok(())
}

fn load_section<T: DeserializeOwned + Default>(
    conn: &Connection,
    key: &str,
) -> Result<T, AppError> {
    let stored: Option<String> = conn
        .query_row("SELECT value FROM settings WHERE key = ?1", [key], |row| {
            row.get(0)
        })
        .optional()?;
    let Some(json) = stored else {
        return Ok(T::default());
    };
    Ok(serde_json::from_str(&json).unwrap_or_else(|error| {
        eprintln!("seção '{key}' ilegível no banco; usando o padrão ({error})");
        T::default()
    }))
}

fn save_section<T: Serialize>(conn: &Connection, key: &str, value: &T) -> Result<(), AppError> {
    conn.execute(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT (key) DO UPDATE SET
             value = excluded.value,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        (key, serde_json::to_string(value)?),
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{Database, DATABASE_FILE};
    use crate::settings::Template;

    fn custom() -> Settings {
        Settings {
            appearance: AppearanceSettings {
                template: Template::Matrix,
            },
            timer: TimerSettings {
                focus_minutes: 50,
                short_break_minutes: 10,
                long_break_minutes: 30,
                cycles_before_long_break: 2,
                auto_start_breaks: true,
                auto_start_focus: false,
            },
            notch: NotchSettings {
                enabled: false,
                position: crate::settings::NotchPosition::Right,
                theme: crate::settings::NotchTheme::Light,
            },
            alerts: AlertSettings {
                sound_enabled: false,
                notifications_enabled: true,
            },
            goals: GoalSettings {
                daily_pomodoros: Some(8),
            },
            weather: WeatherSettings {
                enabled: true,
                use_location: true,
            },
            general: GeneralSettings {
                launch_at_login: true,
            },
        }
    }

    fn stored_rows(db: &Database) -> i64 {
        db.with_conn(|conn| {
            Ok(conn.query_row("SELECT COUNT(*) FROM settings", [], |row| row.get(0))?)
        })
        .unwrap()
    }

    #[test]
    fn an_empty_database_yields_the_defaults() {
        let db = Database::open_in_memory().unwrap();

        let loaded = db.with_conn(|conn| load(conn)).unwrap();

        assert_eq!(loaded, Settings::default());
    }

    #[test]
    fn saved_settings_are_loaded_back() {
        let db = Database::open_in_memory().unwrap();

        db.with_conn(|conn| save(conn, &custom())).unwrap();

        assert_eq!(db.with_conn(|conn| load(conn)).unwrap(), custom());
    }

    #[test]
    fn saving_again_replaces_the_previous_values() {
        let db = Database::open_in_memory().unwrap();
        db.with_conn(|conn| save(conn, &custom())).unwrap();

        db.with_conn(|conn| save(conn, &Settings::default()))
            .unwrap();

        assert_eq!(
            db.with_conn(|conn| load(conn)).unwrap(),
            Settings::default()
        );
        assert_eq!(stored_rows(&db), 7);
    }

    #[test]
    fn settings_survive_closing_and_reopening_the_database() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DATABASE_FILE);
        {
            let db = Database::open(&path).unwrap();
            db.with_conn(|conn| save(conn, &custom())).unwrap();
        }

        let reopened = Database::open(&path).unwrap();

        assert_eq!(reopened.with_conn(|conn| load(conn)).unwrap(), custom());
    }

    #[test]
    fn invalid_settings_are_rejected_and_nothing_is_written() {
        let db = Database::open_in_memory().unwrap();
        db.with_conn(|conn| save(conn, &custom())).unwrap();
        let mut invalid = Settings::default();
        invalid.timer.focus_minutes = 0;

        let result = db.with_conn(|conn| save(conn, &invalid));

        assert!(matches!(
            result,
            Err(AppError::Validation {
                field: "timer.focusMinutes",
                ..
            })
        ));
        assert_eq!(db.with_conn(|conn| load(conn)).unwrap(), custom());
    }

    #[test]
    fn an_unreadable_section_falls_back_without_affecting_the_others() {
        let db = Database::open_in_memory().unwrap();
        db.with_conn(|conn| save(conn, &custom())).unwrap();
        db.with_conn(|conn| {
            // JSON válido (passa no CHECK), mas com o formato errado.
            conn.execute(
                "UPDATE settings SET value = '{\"template\": 42}' WHERE key = 'appearance'",
                [],
            )?;
            Ok(())
        })
        .unwrap();

        let loaded = db.with_conn(|conn| load(conn)).unwrap();

        assert_eq!(loaded.appearance, AppearanceSettings::default());
        assert_eq!(loaded.timer, custom().timer);
    }

    #[test]
    fn out_of_range_values_in_the_database_fall_back_to_the_defaults() {
        let db = Database::open_in_memory().unwrap();
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO settings (key, value) VALUES ('timer', '{\"focusMinutes\": 9999}')",
                [],
            )?;
            Ok(())
        })
        .unwrap();

        let loaded = db.with_conn(|conn| load(conn)).unwrap();

        assert_eq!(loaded.timer, TimerSettings::default());
    }

    #[test]
    fn a_section_stored_by_an_older_version_gets_defaults_for_new_fields() {
        let db = Database::open_in_memory().unwrap();
        db.with_conn(|conn| {
            conn.execute(
                "INSERT INTO settings (key, value) VALUES ('timer', '{\"focusMinutes\": 40}')",
                [],
            )?;
            Ok(())
        })
        .unwrap();

        let loaded = db.with_conn(|conn| load(conn)).unwrap();

        assert_eq!(
            loaded.timer,
            TimerSettings {
                focus_minutes: 40,
                ..TimerSettings::default()
            }
        );
    }
}
