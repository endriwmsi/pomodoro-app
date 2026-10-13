//! Comandos Tauri expostos ao frontend.
//!
//! Os handlers ficam finos: validam a entrada, delegam ao módulo de domínio e
//! convertem o resultado. Todo comando novo deve ser registrado em
//! `lib.rs` e documentado em `docs/ARCHITECTURE.md`.

pub mod analytics;
pub mod app;
pub mod notch;
pub mod settings;
pub mod tasks;
pub mod timer;
pub mod window;
