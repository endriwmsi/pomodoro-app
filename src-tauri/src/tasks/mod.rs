//! Tarefas do Kanban: modelo, limites e validação. A persistência fica em
//! [`store`]. Ver `docs/KANBAN.md`.

pub mod store;

use serde::{Deserialize, Serialize};

use crate::error::AppError;

pub const TITLE_MAX_CHARS: usize = 200;
pub const DESCRIPTION_MAX_CHARS: usize = 4_000;
pub const ESTIMATE_MAX: u32 = 99;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Priority {
    Low,
    Medium,
    High,
}

/// Coluna do quadro.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Status {
    Todo,
    Doing,
    Done,
}

#[cfg(test)]
impl Status {
    pub const ALL: [Status; 3] = [Status::Todo, Status::Doing, Status::Done];
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Task {
    pub id: i64,
    pub title: String,
    pub description: String,
    pub priority: Priority,
    pub status: Status,
    /// Ordem dentro da coluna, a partir de 0.
    pub position: u32,
    /// Prazo como data local, `AAAA-MM-DD`.
    pub due_date: Option<String>,
    pub estimated_pomodoros: Option<u32>,
    pub created_at_ms: i64,
    pub updated_at_ms: i64,
    pub completed_at_ms: Option<i64>,
    /// Sessões de foco **concluídas** dedicadas a esta tarefa.
    pub completed_pomodoros: u32,
}

/// Campos editáveis pelo usuário, na criação e na edição.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskInput {
    pub title: String,
    #[serde(default)]
    pub description: String,
    pub priority: Priority,
    #[serde(default)]
    pub due_date: Option<String>,
    #[serde(default)]
    pub estimated_pomodoros: Option<u32>,
}

impl TaskInput {
    /// Valida e normaliza: apara espaços do título e da descrição e trata
    /// prazo vazio como ausente.
    pub fn normalized(mut self) -> Result<Self, AppError> {
        self.title = self.title.trim().to_owned();
        self.description = self.description.trim().to_owned();
        self.due_date = self
            .due_date
            .map(|date| date.trim().to_owned())
            .filter(|date| !date.is_empty());

        if self.title.is_empty() {
            return Err(AppError::validation("title", "Informe um título."));
        }
        if self.title.chars().count() > TITLE_MAX_CHARS {
            return Err(AppError::validation(
                "title",
                format!("O título pode ter até {TITLE_MAX_CHARS} caracteres."),
            ));
        }
        if self.description.chars().count() > DESCRIPTION_MAX_CHARS {
            return Err(AppError::validation(
                "description",
                format!("A descrição pode ter até {DESCRIPTION_MAX_CHARS} caracteres."),
            ));
        }
        if let Some(date) = &self.due_date {
            if !is_valid_date(date) {
                return Err(AppError::validation(
                    "dueDate",
                    "O prazo precisa ser uma data válida.",
                ));
            }
        }
        if let Some(estimate) = self.estimated_pomodoros {
            if !(1..=ESTIMATE_MAX).contains(&estimate) {
                return Err(AppError::validation(
                    "estimatedPomodoros",
                    format!("A estimativa deve ficar entre 1 e {ESTIMATE_MAX} pomodoros."),
                ));
            }
        }
        Ok(self)
    }
}

/// `AAAA-MM-DD` existente no calendário (considera anos bissextos).
fn is_valid_date(text: &str) -> bool {
    let bytes = text.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let number = |range: std::ops::Range<usize>| -> Option<u32> {
        let digits = &text[range];
        digits
            .bytes()
            .all(|b| b.is_ascii_digit())
            .then(|| digits.parse().ok())
            .flatten()
    };
    let (Some(year), Some(month), Some(day)) = (number(0..4), number(5..7), number(8..10)) else {
        return false;
    };
    let leap = (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
    let days_in_month = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if leap => 29,
        2 => 28,
        _ => return false,
    };
    year >= 1 && (1..=days_in_month).contains(&day)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn input(title: &str) -> TaskInput {
        TaskInput {
            title: title.into(),
            description: String::new(),
            priority: Priority::Medium,
            due_date: None,
            estimated_pomodoros: None,
        }
    }

    fn invalid_field(input: TaskInput) -> &'static str {
        match input.normalized() {
            Err(AppError::Validation { field, .. }) => field,
            other => panic!("esperava erro de validação, obtive {other:?}"),
        }
    }

    #[test]
    fn text_is_trimmed_and_an_empty_due_date_means_none() {
        let normalized = TaskInput {
            description: "  detalhes \n".into(),
            due_date: Some("   ".into()),
            ..input("  Escrever relatório  ")
        }
        .normalized()
        .unwrap();

        assert_eq!(normalized.title, "Escrever relatório");
        assert_eq!(normalized.description, "detalhes");
        assert_eq!(normalized.due_date, None);
    }

    #[test]
    fn the_title_is_required_and_limited() {
        assert_eq!(invalid_field(input("   ")), "title");
        assert_eq!(
            invalid_field(input(&"x".repeat(TITLE_MAX_CHARS + 1))),
            "title"
        );
        input(&"ã".repeat(TITLE_MAX_CHARS)).normalized().unwrap();
    }

    #[test]
    fn the_description_is_limited() {
        let long = TaskInput {
            description: "x".repeat(DESCRIPTION_MAX_CHARS + 1),
            ..input("Tarefa")
        };

        assert_eq!(invalid_field(long), "description");
    }

    #[test]
    fn due_dates_must_exist_in_the_calendar() {
        for valid in ["2026-10-13", "2024-02-29", "2000-02-29", "2026-12-31"] {
            assert!(is_valid_date(valid), "{valid} deveria ser válida");
        }
        for invalid in [
            "2026-02-29",
            "1900-02-29",
            "2026-13-01",
            "2026-00-10",
            "2026-04-31",
            "2026-1-5",
            "13/10/2026",
            "2026-10-1x",
            "0000-01-01",
            "",
        ] {
            assert!(!is_valid_date(invalid), "{invalid} deveria ser inválida");
        }
        let with_bad_date = TaskInput {
            due_date: Some("2026-02-30".into()),
            ..input("Tarefa")
        };
        assert_eq!(invalid_field(with_bad_date), "dueDate");
    }

    #[test]
    fn the_estimate_must_be_between_one_and_the_maximum() {
        for bad in [0, ESTIMATE_MAX + 1] {
            let task = TaskInput {
                estimated_pomodoros: Some(bad),
                ..input("Tarefa")
            };
            assert_eq!(invalid_field(task), "estimatedPomodoros");
        }
        TaskInput {
            estimated_pomodoros: Some(ESTIMATE_MAX),
            ..input("Tarefa")
        }
        .normalized()
        .unwrap();
    }

    #[test]
    fn input_deserializes_with_optional_fields_omitted() {
        let parsed: TaskInput =
            serde_json::from_str(r#"{ "title": "Ler", "priority": "high" }"#).unwrap();

        assert_eq!(
            parsed,
            TaskInput {
                priority: Priority::High,
                ..input("Ler")
            }
        );
    }
}
