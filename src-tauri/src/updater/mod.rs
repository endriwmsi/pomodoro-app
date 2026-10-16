//! Atualização do próprio aplicativo.
//!
//! Consulta o `latest.json` da última Release do GitHub (endpoint em
//! `tauri.conf.json`), baixa o instalador e só o executa se a assinatura bater
//! com a chave pública gravada no aplicativo — a verificação é do plugin
//! `tauri-plugin-updater`. Com `updates.autoUpdate`, a consulta acontece uma
//! vez, pouco depois de o aplicativo abrir. Ver `docs/RELEASING.md` e
//! `docs/decisions/ADR-004-NETWORK-FEATURES.md`.

use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::database::Database;
use crate::error::AppError;
use crate::settings::{self, UpdateSettings};
use crate::timer::engine::Status;
use crate::timer::TimerService;

/// Espera depois da abertura antes de consultar a Release: a interface e o
/// timer não competem com a rede durante a inicialização.
const STARTUP_DELAY: Duration = Duration::from_secs(8);

/// Uma versão mais nova que a instalada. Espelha `UpdateInfo` em
/// `src/lib/commands.ts`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub version: String,
    /// Texto da Release, se houver.
    pub notes: Option<String>,
}

/// A atualização encontrada e ainda não instalada.
#[derive(Default)]
pub struct UpdateService {
    pending: Mutex<Option<Update>>,
}

impl UpdateService {
    fn store(&self, update: Option<Update>) -> Option<UpdateInfo> {
        let info = update.as_ref().map(info_of);
        *self.pending.lock().unwrap_or_else(PoisonError::into_inner) = update;
        info
    }

    fn take(&self) -> Option<Update> {
        self.pending
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .take()
    }

    /// A última atualização encontrada, sem consultar a rede.
    pub fn pending(&self) -> Option<UpdateInfo> {
        self.pending
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .as_ref()
            .map(info_of)
    }
}

fn info_of(update: &Update) -> UpdateInfo {
    UpdateInfo {
        version: update.version.clone(),
        notes: update.body.clone().filter(|notes| !notes.trim().is_empty()),
    }
}

fn network_error(error: impl std::fmt::Display) -> AppError {
    AppError::Network {
        message: error.to_string(),
    }
}

/// Consulta a Release mais recente e guarda o resultado. `None` significa que
/// esta já é a versão mais nova.
pub async fn check(app: &AppHandle) -> Result<Option<UpdateInfo>, AppError> {
    let updater = app.updater().map_err(network_error)?;
    let found = updater.check().await.map_err(network_error)?;
    Ok(app.state::<Arc<UpdateService>>().store(found))
}

/// Baixa a atualização guardada por [`check`], instala e reinicia o
/// aplicativo. Só retorna em caso de falha.
///
/// A sessão do timer é encerrada de forma ordenada antes do instalador: no
/// Windows o plugin termina o processo com `exit(0)`, sem passar por
/// `RunEvent::Exit`. Por isso a instalação é recusada com o timer em andamento.
pub async fn install(app: &AppHandle) -> Result<(), AppError> {
    let timer = app.state::<Arc<TimerService>>();
    if timer.snapshot()?.status != Status::Idle {
        return Err(AppError::validation(
            "update",
            "Há uma sessão em andamento. Reinicie ou conclua o timer antes de atualizar.",
        ));
    }
    let service = app.state::<Arc<UpdateService>>();
    let Some(update) = service.take() else {
        return Err(AppError::NotFound {
            message: "Nenhuma atualização foi encontrada. Verifique de novo.".to_owned(),
        });
    };

    let result = async {
        let bytes = update
            .download(|_chunk, _total| {}, || {})
            .await
            .map_err(network_error)?;
        timer.shutdown();
        update.install(bytes).map_err(|error| AppError::Internal {
            message: format!("não foi possível instalar a atualização: {error}"),
        })
    }
    .await;

    match result {
        Ok(()) => {
            // Windows já terminou o processo; macOS e Linux precisam reabrir.
            app.restart()
        }
        Err(error) => {
            service.store(Some(update));
            Err(error)
        }
    }
}

/// Deve haver consulta automática ao abrir? Builds de desenvolvimento nunca
/// atualizam: sobrescreveriam o executável de teste pela versão publicada.
pub fn should_check_at_startup(debug_build: bool, settings: &UpdateSettings) -> bool {
    !debug_build && settings.auto_update
}

/// Agenda a consulta automática, se as configurações pedirem. Falhas (sem
/// internet, sem Release ainda) só vão para o log: não incomodam o usuário.
pub fn spawn_startup_check(app: &AppHandle) {
    let preferences = match app
        .state::<Arc<Database>>()
        .with_conn(|conn| settings::store::load(conn))
    {
        Ok(settings) => settings.updates,
        Err(error) => {
            eprintln!("atualização automática ignorada: {error}");
            return;
        }
    };
    if !should_check_at_startup(cfg!(debug_assertions), &preferences) {
        return;
    }
    let app = app.clone();
    let spawned = std::thread::Builder::new()
        .name("updater".into())
        .spawn(move || {
            std::thread::sleep(STARTUP_DELAY);
            let outcome = tauri::async_runtime::block_on(async {
                match check(&app).await? {
                    Some(_) => install(&app).await,
                    None => Ok(()),
                }
            });
            if let Err(error) = outcome {
                eprintln!("atualização automática: {error}");
            }
        });
    if let Err(error) = spawned {
        eprintln!("não foi possível iniciar a atualização automática: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn startup_check_needs_a_release_build_and_the_option_on() {
        let on = UpdateSettings { auto_update: true };
        let off = UpdateSettings { auto_update: false };

        assert!(should_check_at_startup(false, &on));
        assert!(!should_check_at_startup(false, &off));
        assert!(!should_check_at_startup(true, &on));
    }

    #[test]
    fn nothing_is_pending_before_the_first_check() {
        assert_eq!(UpdateService::default().pending(), None);
    }
}
