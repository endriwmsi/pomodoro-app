//! Camada de acesso ao SQLite. Nenhum outro módulo abre conexões.
//!
//! Ver `docs/DATABASE.md`.

mod migrations;

use std::fmt;
use std::path::Path;
use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use rusqlite::Connection;

use crate::error::AppError;

/// Nome do arquivo do banco dentro do diretório de dados do aplicativo.
pub const DATABASE_FILE: &str = "compasso.db";

const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug)]
pub enum DatabaseError {
    Io(std::io::Error),
    Sqlite(rusqlite::Error),
    /// O arquivo foi criado por uma versão mais nova do aplicativo. Ele não é
    /// modificado: abrir com um esquema desconhecido poderia corromper dados.
    SchemaTooNew {
        found: u32,
        supported: u32,
    },
}

impl fmt::Display for DatabaseError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Io(error) => write!(f, "falha de E/S: {error}"),
            Self::Sqlite(error) => write!(f, "falha do SQLite: {error}"),
            Self::SchemaTooNew { found, supported } => write!(
                f,
                "o banco está na versão {found} do esquema, mas este aplicativo só conhece até a \
                 versão {supported}; atualize o aplicativo"
            ),
        }
    }
}

impl std::error::Error for DatabaseError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(error) => Some(error),
            Self::Sqlite(error) => Some(error),
            Self::SchemaTooNew { .. } => None,
        }
    }
}

impl From<std::io::Error> for DatabaseError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<rusqlite::Error> for DatabaseError {
    fn from(error: rusqlite::Error) -> Self {
        Self::Sqlite(error)
    }
}

/// Conexão única com o banco local, compartilhada como estado do Tauri.
///
/// Um `Mutex` basta: o aplicativo tem um único usuário e operações curtas.
pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// Abre (criando, se preciso) o banco em `path` e aplica as migrations
    /// pendentes.
    pub fn open(path: &Path) -> Result<Self, DatabaseError> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        Self::prepare(Connection::open(path)?)
    }

    #[cfg(test)]
    pub fn open_in_memory() -> Result<Self, DatabaseError> {
        Self::prepare(Connection::open_in_memory()?)
    }

    fn prepare(mut conn: Connection) -> Result<Self, DatabaseError> {
        conn.busy_timeout(BUSY_TIMEOUT)?;
        // WAL: leituras não bloqueiam a escrita e um encerramento abrupto não
        // deixa o arquivo principal pela metade. (Bancos em memória ignoram.)
        conn.pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get::<_, String>(0))?;
        conn.pragma_update(None, "synchronous", "NORMAL")?;
        conn.pragma_update(None, "foreign_keys", "ON")?;
        migrations::run(&mut conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    /// Executa `f` com acesso exclusivo à conexão.
    pub fn with_conn<T>(
        &self,
        f: impl FnOnce(&mut Connection) -> Result<T, AppError>,
    ) -> Result<T, AppError> {
        // Um pânico anterior não invalida a conexão: transações abertas são
        // desfeitas no `Drop`, então é seguro continuar usando-a.
        let mut conn = self.conn.lock().unwrap_or_else(PoisonError::into_inner);
        f(&mut conn)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_creates_missing_directories_and_the_database_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("nested").join("data").join(DATABASE_FILE);

        Database::open(&path).unwrap();

        assert!(path.is_file());
    }

    #[test]
    fn open_enables_foreign_keys_and_wal() {
        let dir = tempfile::tempdir().unwrap();
        let db = Database::open(&dir.path().join(DATABASE_FILE)).unwrap();

        let (foreign_keys, journal_mode) = db
            .with_conn(|conn| {
                let fk: i64 = conn.query_row("PRAGMA foreign_keys", [], |row| row.get(0))?;
                let mode: String = conn.query_row("PRAGMA journal_mode", [], |row| row.get(0))?;
                Ok((fk, mode))
            })
            .unwrap();

        assert_eq!(foreign_keys, 1);
        assert_eq!(journal_mode, "wal");
    }

    #[test]
    fn open_refuses_a_file_that_is_not_a_database() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(DATABASE_FILE);
        std::fs::write(&path, "isto não é um banco SQLite, é só texto").unwrap();

        let result = Database::open(&path);

        assert!(matches!(result, Err(DatabaseError::Sqlite(_))));
    }
}
