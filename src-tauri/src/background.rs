//! Imagem de fundo enviada pelo usuário.
//!
//! A imagem escolhida é **copiada** para o diretório de dados do aplicativo:
//! continua valendo mesmo que o arquivo original seja movido ou apagado. Só
//! existe uma por vez — enviar outra substitui a anterior. As imagens que vêm
//! com o aplicativo ficam no frontend (`src/assets/backgrounds/`). Ver
//! `docs/THEMING.md`.

use std::fs;
use std::io;
use std::path::PathBuf;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;

use crate::error::AppError;

/// Maior imagem aceita. Fotos de tela inteira em JPEG ou WebP ficam bem abaixo.
pub const MAX_IMAGE_BYTES: usize = 12 * 1024 * 1024;

const FILE_NAME: &str = "background-image";

/// Formato reconhecido pelos primeiros bytes do arquivo — a extensão e o tipo
/// informado pelo frontend não são levados em conta.
fn mime_of(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]) {
        Some("image/png")
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        Some("image/jpeg")
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        Some("image/webp")
    } else {
        None
    }
}

fn invalid(message: &str) -> AppError {
    AppError::validation("image", message)
}

fn failure(context: &str, error: &io::Error) -> AppError {
    AppError::Internal {
        message: format!("{context}: {error}"),
    }
}

/// Decodifica uma `data:` URL em base64 e confere tamanho e formato.
fn decode(data_url: &str) -> Result<Vec<u8>, AppError> {
    let encoded = data_url
        .strip_prefix("data:")
        .and_then(|rest| rest.split_once(";base64,"))
        .map(|(_, encoded)| encoded)
        .ok_or_else(|| invalid("A imagem não pôde ser lida."))?;
    // Em base64, cada 3 bytes viram 4 caracteres: recusa antes de decodificar.
    if encoded.len() / 4 * 3 > MAX_IMAGE_BYTES + 3 {
        return Err(invalid("A imagem é grande demais (o limite é 12 MB)."));
    }
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|_| invalid("A imagem não pôde ser lida."))?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(invalid("A imagem é grande demais (o limite é 12 MB)."));
    }
    if mime_of(&bytes).is_none() {
        return Err(invalid("Use uma imagem PNG, JPEG ou WebP."));
    }
    Ok(bytes)
}

/// Onde a imagem do usuário fica guardada. Registrado como estado do Tauri.
pub struct BackgroundStore {
    dir: PathBuf,
}

impl BackgroundStore {
    pub fn new(dir: PathBuf) -> Self {
        Self { dir }
    }

    fn path(&self) -> PathBuf {
        self.dir.join(FILE_NAME)
    }

    /// Guarda a imagem recebida como `data:` URL, substituindo a anterior.
    pub fn save(&self, data_url: &str) -> Result<(), AppError> {
        let bytes = decode(data_url)?;
        fs::create_dir_all(&self.dir)
            .map_err(|error| failure("não foi possível criar a pasta de dados", &error))?;
        // Grava ao lado e troca de nome: uma falha no meio não corrompe a anterior.
        let partial = self.dir.join(format!("{FILE_NAME}.tmp"));
        fs::write(&partial, bytes)
            .and_then(|()| fs::rename(&partial, self.path()))
            .map_err(|error| failure("não foi possível guardar a imagem", &error))
    }

    /// A imagem guardada como `data:` URL, ou `None` se não há (ou se o
    /// arquivo deixou de ser uma imagem válida).
    pub fn load(&self) -> Result<Option<String>, AppError> {
        let bytes = match fs::read(self.path()) {
            Ok(bytes) => bytes,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(None),
            Err(error) => return Err(failure("não foi possível ler a imagem de fundo", &error)),
        };
        Ok(mime_of(&bytes).map(|mime| format!("data:{mime};base64,{}", STANDARD.encode(&bytes))))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const PNG: [u8; 12] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A, 1, 2, 3, 4];
    const JPEG: [u8; 6] = [0xFF, 0xD8, 0xFF, 0xE0, 1, 2];

    fn data_url(bytes: &[u8]) -> String {
        // O tipo declarado é ignorado de propósito.
        format!(
            "data:application/octet-stream;base64,{}",
            STANDARD.encode(bytes)
        )
    }

    fn store() -> (tempfile::TempDir, BackgroundStore) {
        let dir = tempfile::tempdir().unwrap();
        let store = BackgroundStore::new(dir.path().join("dados"));
        (dir, store)
    }

    fn invalid_message(result: Result<(), AppError>) -> String {
        match result {
            Err(AppError::Validation {
                field: "image",
                message,
            }) => message,
            other => panic!("esperava erro de validação, obtive {other:?}"),
        }
    }

    #[test]
    fn formats_are_recognized_by_content() {
        assert_eq!(mime_of(&PNG), Some("image/png"));
        assert_eq!(mime_of(&JPEG), Some("image/jpeg"));
        assert_eq!(mime_of(b"RIFF\x10\0\0\0WEBPVP8 "), Some("image/webp"));
        assert_eq!(mime_of(b"GIF89a"), None);
        assert_eq!(mime_of(b"<svg xmlns"), None);
        assert_eq!(mime_of(&[]), None);
    }

    #[test]
    fn nothing_is_stored_at_first() {
        let (_dir, store) = store();

        assert_eq!(store.load().unwrap(), None);
    }

    #[test]
    fn a_saved_image_comes_back_with_its_real_type() {
        let (_dir, store) = store();

        store.save(&data_url(&PNG)).unwrap();

        assert_eq!(
            store.load().unwrap(),
            Some(format!("data:image/png;base64,{}", STANDARD.encode(PNG)))
        );
    }

    #[test]
    fn a_new_image_replaces_the_previous_one() {
        let (_dir, store) = store();
        store.save(&data_url(&PNG)).unwrap();

        store.save(&data_url(&JPEG)).unwrap();

        assert!(store
            .load()
            .unwrap()
            .unwrap()
            .starts_with("data:image/jpeg;base64,"));
    }

    #[test]
    fn what_is_not_an_image_is_refused_and_keeps_the_previous_one() {
        let (_dir, store) = store();
        store.save(&data_url(&PNG)).unwrap();

        assert_eq!(
            invalid_message(store.save(&data_url(b"<svg onload=alert(1)>"))),
            "Use uma imagem PNG, JPEG ou WebP."
        );
        assert_eq!(
            invalid_message(store.save("C:\\fotos\\praia.png")),
            "A imagem não pôde ser lida."
        );
        assert_eq!(
            invalid_message(store.save("data:image/png;base64,@@@")),
            "A imagem não pôde ser lida."
        );
        assert!(store.load().unwrap().unwrap().starts_with("data:image/png"));
    }

    #[test]
    fn oversized_images_are_refused() {
        let (_dir, store) = store();
        let mut huge = PNG.to_vec();
        huge.resize(MAX_IMAGE_BYTES + 1, 0);

        assert_eq!(
            invalid_message(store.save(&data_url(&huge))),
            "A imagem é grande demais (o limite é 12 MB)."
        );
        assert_eq!(store.load().unwrap(), None);
    }

    #[test]
    fn a_stored_file_that_is_no_longer_an_image_is_ignored() {
        let (_dir, store) = store();
        store.save(&data_url(&PNG)).unwrap();
        fs::write(store.path(), b"corrompido").unwrap();

        assert_eq!(store.load().unwrap(), None);
    }
}
