use std::fmt;

use serde::Serialize;

use crate::database::DatabaseError;

/// Erro devolvido ao frontend pelos comandos Tauri.
///
/// Serializa como `{ "kind": "validation", "field": "...", "message": "..." }`
/// ou `{ "kind": "database", "message": "..." }`. O tipo espelhado é
/// `AppError` em `src/lib/commands.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AppError {
    /// Entrada rejeitada por uma regra de negócio. `field` usa o caminho do
    /// campo como o frontend o conhece (ex.: `timer.focusMinutes`).
    Validation {
        field: &'static str,
        message: String,
    },
    /// Falha ao ler ou gravar dados locais.
    Database { message: String },
    /// O item referido não existe (mais) — por exemplo, uma tarefa excluída
    /// em outra janela.
    NotFound { message: String },
    /// Falha ao acessar a internet (só a previsão do tempo usa a rede).
    Network { message: String },
    /// Falha do próprio aplicativo (janelas, eventos) sem relação com os dados.
    Internal { message: String },
}

impl AppError {
    pub fn validation(field: &'static str, message: impl Into<String>) -> Self {
        Self::Validation {
            field,
            message: message.into(),
        }
    }
}

impl fmt::Display for AppError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Validation { field, message } => write!(f, "{field}: {message}"),
            Self::Database { message } => write!(f, "banco de dados: {message}"),
            Self::NotFound { message } => write!(f, "{message}"),
            Self::Network { message } => write!(f, "sem conexão: {message}"),
            Self::Internal { message } => write!(f, "erro interno: {message}"),
        }
    }
}

impl std::error::Error for AppError {}

impl From<DatabaseError> for AppError {
    fn from(error: DatabaseError) -> Self {
        Self::Database {
            message: error.to_string(),
        }
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(error: rusqlite::Error) -> Self {
        DatabaseError::from(error).into()
    }
}

impl From<tauri::Error> for AppError {
    fn from(error: tauri::Error) -> Self {
        Self::Internal {
            message: error.to_string(),
        }
    }
}

impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        Self::Database {
            message: format!("falha ao codificar dados: {error}"),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validation_error_serializes_with_the_frontend_contract() {
        let error = AppError::validation("timer.focusMinutes", "fora do intervalo");

        assert_eq!(
            serde_json::to_value(&error).unwrap(),
            serde_json::json!({
                "kind": "validation",
                "field": "timer.focusMinutes",
                "message": "fora do intervalo"
            })
        );
    }

    #[test]
    fn database_error_serializes_with_the_frontend_contract() {
        let error = AppError::Database {
            message: "disco cheio".into(),
        };

        assert_eq!(
            serde_json::to_value(&error).unwrap(),
            serde_json::json!({ "kind": "database", "message": "disco cheio" })
        );
    }
}
