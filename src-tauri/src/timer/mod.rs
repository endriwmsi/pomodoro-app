//! Timer do Pomodoro: estado autoritativo, persistência e ticker.
//!
//! - [`engine`]: máquina de estados pura.
//! - [`store`]: SQL das sessões e da posição no ciclo.
//! - [`TimerService`]: junta os dois, grava os efeitos e avisa as janelas.
//!
//! Ver `docs/TIMER_ENGINE.md`.

pub mod clock;
pub mod engine;
pub mod store;

use std::sync::mpsc::{self, Receiver, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use clock::{Clock, Tick};
use engine::{Effect, Engine, Outcome, Phase, TimerSnapshot};

use crate::database::Database;
use crate::error::AppError;
use crate::settings::{self, TimerSettings};

/// Intervalo do ticker enquanto uma sessão roda. Parado ou pausado, o ticker
/// dorme até ser acordado por um comando.
const TICK_INTERVAL: Duration = Duration::from_millis(250);

/// Quem é avisado do que acontece no timer (as janelas e os avisos sonoros e
/// visuais). As chamadas vêm da thread do ticker ou de um comando, com o
/// estado já gravado, e não devem bloquear.
pub trait Notifier: Send + Sync {
    fn state_changed(&self, snapshot: &TimerSnapshot);

    /// Uma sessão chegou ao fim do tempo planejado. Chamado exatamente uma
    /// vez por sessão concluída; nunca para sessões puladas, reiniciadas ou
    /// interrompidas. `next` é o estado logo após a conclusão.
    fn session_completed(&self, finished: Phase, next: &TimerSnapshot);
}

struct State {
    engine: Engine,
    /// ID, no banco, da sessão em andamento.
    session_id: Option<i64>,
    last_notified: Option<Notified>,
}

/// O que as janelas já viram: só se notifica de novo quando isto muda.
#[derive(PartialEq, Eq)]
struct Notified {
    snapshot: TimerSnapshot,
    remaining_secs: u64,
}

pub struct TimerService {
    db: Arc<Database>,
    clock: Arc<dyn Clock>,
    notifier: Box<dyn Notifier>,
    state: Mutex<State>,
    wake: Sender<()>,
}

impl TimerService {
    /// Recupera o estado persistido e cria o serviço, parado. Uma sessão que
    /// tenha ficado em andamento é encerrada como interrompida — nunca é
    /// contada como concluída nem retomada às cegas.
    ///
    /// O `Receiver` devolvido deve ser entregue a [`TimerService::run_ticker`].
    pub fn new(
        db: Arc<Database>,
        clock: Arc<dyn Clock>,
        notifier: Box<dyn Notifier>,
    ) -> Result<(Arc<Self>, Receiver<()>), AppError> {
        let (settings, (phase, cycle_position), task_id) = db.with_conn(|conn| {
            store::interrupt_active(conn)?;
            Ok((
                settings::store::load(conn)?.timer,
                store::load_rotation(conn)?,
                store::load_active_task(conn)?,
            ))
        })?;
        let (wake, wake_rx) = mpsc::channel();
        let service = Arc::new(Self {
            db,
            clock,
            notifier,
            state: Mutex::new(State {
                engine: Engine::new(settings, phase, cycle_position, task_id),
                session_id: None,
                last_notified: None,
            }),
            wake,
        });
        Ok((service, wake_rx))
    }

    pub fn snapshot(&self) -> Result<TimerSnapshot, AppError> {
        self.apply(|engine, now| engine.sync(now))
    }

    /// Inicia a fase atual ou retoma a sessão pausada.
    pub fn start(&self) -> Result<TimerSnapshot, AppError> {
        self.command(|engine, now| engine.start(now))
    }

    pub fn pause(&self) -> Result<TimerSnapshot, AppError> {
        self.command(|engine, now| engine.pause(now))
    }

    pub fn skip(&self) -> Result<TimerSnapshot, AppError> {
        self.command(|engine, now| engine.skip(now))
    }

    pub fn reset(&self) -> Result<TimerSnapshot, AppError> {
        self.command(|engine, now| engine.reset(now))
    }

    /// Escolhe a tarefa a que os focos são dedicados (ou nenhuma). Se houver
    /// um foco em andamento, ele passa a pertencer à tarefa escolhida.
    pub fn set_task(&self, task_id: Option<i64>) -> Result<TimerSnapshot, AppError> {
        self.command(|engine, now| {
            let effects = engine.sync(now);
            engine.set_task(task_id);
            effects
        })
    }

    /// Escolhe a tarefa e vai direto para um foco nela (ver [`Engine::focus`]).
    pub fn focus_task(&self, task_id: i64) -> Result<TimerSnapshot, AppError> {
        self.command(|engine, now| {
            engine.set_task(Some(task_id));
            engine.focus(now)
        })
    }

    /// Deve ser chamado quando uma tarefa é excluída ou concluída: se era a
    /// escolhida, o timer fica sem tarefa (a sessão em andamento continua).
    pub fn task_unavailable(&self, task_id: i64) -> Result<TimerSnapshot, AppError> {
        self.command(|engine, now| {
            let effects = engine.sync(now);
            if engine.task_id() == Some(task_id) {
                engine.set_task(None);
            }
            effects
        })
    }

    /// Deve ser chamado depois que novas configurações forem gravadas.
    pub fn settings_changed(&self, settings: TimerSettings) -> Result<TimerSnapshot, AppError> {
        self.command(|engine, now| {
            let effects = engine.sync(now);
            engine.set_settings(settings);
            effects
        })
    }

    /// Encerramento ordenado do aplicativo: registra a sessão em andamento
    /// como interrompida, com o tempo exato até aqui.
    pub fn shutdown(&self) {
        if let Err(error) = self.apply(|engine, now| engine.shutdown(now)) {
            eprintln!("falha ao encerrar a sessão em andamento: {error}");
        }
    }

    /// Laço do ticker; roda em uma thread própria até o serviço ser destruído.
    pub fn run_ticker(self: Arc<Self>, wake: Receiver<()>) {
        // Só uma referência fraca: a thread não mantém o serviço vivo.
        let service = Arc::downgrade(&self);
        drop(self);
        loop {
            let Some(service) = service.upgrade() else {
                return;
            };
            let running = service.is_running();
            if running {
                if let Err(error) = service.apply(|engine, now| engine.sync(now)) {
                    // O estado em memória não mudou; a próxima volta tenta de novo.
                    eprintln!("falha ao atualizar o timer: {error}");
                }
            }
            drop(service);

            let woke = if running {
                match wake.recv_timeout(TICK_INTERVAL) {
                    Ok(()) | Err(RecvTimeoutError::Timeout) => true,
                    Err(RecvTimeoutError::Disconnected) => false,
                }
            } else {
                wake.recv().is_ok()
            };
            if !woke {
                return;
            }
        }
    }

    fn is_running(&self) -> bool {
        self.lock().engine.is_running()
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Como [`Self::apply`], e acorda o ticker para que ele reavalie se deve
    /// rodar. (O próprio ticker usa `apply`; acordar a si mesmo viraria um
    /// laço sem pausa.)
    fn command(
        &self,
        operation: impl FnOnce(&mut Engine, Tick) -> Vec<Effect>,
    ) -> Result<TimerSnapshot, AppError> {
        let snapshot = self.apply(operation)?;
        let _ = self.wake.send(());
        Ok(snapshot)
    }

    /// Executa `operation` sobre uma cópia da engine, grava os efeitos em uma
    /// única transação e só então adota a cópia. Se a gravação falhar, o
    /// estado em memória continua igual ao que está no banco.
    fn apply(
        &self,
        operation: impl FnOnce(&mut Engine, Tick) -> Vec<Effect>,
    ) -> Result<TimerSnapshot, AppError> {
        let mut state = self.lock();
        let now = self.clock.now();

        let mut engine = state.engine.clone();
        let effects = operation(&mut engine, now);
        let mut session_id = state.session_id;
        let rotation = (engine.phase(), engine.cycle_position());
        let rotation_changed = rotation != (state.engine.phase(), state.engine.cycle_position());
        let task = engine.task_id();
        let task_changed = task != state.engine.task_id();
        let in_focus_session = engine.in_focus_session();

        if !effects.is_empty() || rotation_changed || task_changed {
            self.db.with_conn(|conn| {
                let tx = conn.transaction()?;
                let mut started = false;
                for effect in &effects {
                    match *effect {
                        Effect::Started {
                            phase,
                            planned_ms,
                            at_ms,
                            task_id,
                        } => {
                            session_id = Some(store::insert_session(
                                &tx, phase, planned_ms, at_ms, task_id,
                            )?);
                            started = true;
                        }
                        Effect::Checkpoint { elapsed_ms, at_ms } => {
                            store::checkpoint(&tx, active(session_id)?, elapsed_ms, at_ms)?;
                        }
                        Effect::Finished {
                            outcome,
                            elapsed_ms,
                            at_ms,
                            ..
                        } => {
                            store::finish(&tx, active(session_id)?, outcome, elapsed_ms, at_ms)?;
                            session_id = None;
                        }
                    }
                }
                if rotation_changed {
                    store::save_rotation(&tx, rotation.0, rotation.1)?;
                }
                if task_changed {
                    store::save_active_task(&tx, task)?;
                    // Um foco que já estava em andamento passa para a nova
                    // tarefa; um recém-iniciado já nasceu com ela.
                    if let (false, true, Some(id)) = (started, in_focus_session, session_id) {
                        store::assign_task(&tx, id, task)?;
                    }
                }
                tx.commit()?;
                Ok(())
            })?;
        }

        state.engine = engine;
        state.session_id = session_id;

        let snapshot = state.engine.snapshot();
        let notified = Notified {
            snapshot: TimerSnapshot {
                // Comparado em segundos inteiros, abaixo.
                remaining_ms: 0,
                ..snapshot
            },
            remaining_secs: snapshot.remaining_secs(),
        };
        if state.last_notified.as_ref() != Some(&notified) {
            state.last_notified = Some(notified);
            self.notifier.state_changed(&snapshot);
        }
        // Só aqui, com a conclusão já gravada: se a escrita falhar, o efeito
        // é descartado junto com a cópia da engine e ninguém é avisado.
        for effect in &effects {
            if let Effect::Finished {
                phase,
                outcome: Outcome::Completed,
                ..
            } = *effect
            {
                self.notifier.session_completed(phase, &snapshot);
            }
        }
        Ok(snapshot)
    }
}

fn active(session_id: Option<i64>) -> Result<i64, AppError> {
    session_id.ok_or_else(|| AppError::Database {
        message: "não há sessão em andamento para atualizar".into(),
    })
}

#[cfg(test)]
mod tests {
    use super::clock::fake::FakeClock;
    use super::engine::Status;
    use super::store::testing::{sessions, SessionRow};
    use super::*;
    use crate::settings::Settings;

    #[derive(Default)]
    struct Recorder(
        Mutex<Vec<TimerSnapshot>>,
        Mutex<Vec<(Phase, TimerSnapshot)>>,
    );

    impl Notifier for Arc<Recorder> {
        fn state_changed(&self, snapshot: &TimerSnapshot) {
            self.0.lock().unwrap().push(*snapshot);
        }

        fn session_completed(&self, finished: Phase, next: &TimerSnapshot) {
            self.1.lock().unwrap().push((finished, *next));
        }
    }

    struct Harness {
        db: Arc<Database>,
        clock: Arc<FakeClock>,
        recorder: Arc<Recorder>,
        service: Arc<TimerService>,
    }

    impl Harness {
        fn new() -> Self {
            Self::with_db(Arc::new(Database::open_in_memory().unwrap()))
        }

        /// Simula abrir o aplicativo sobre um banco já existente.
        fn with_db(db: Arc<Database>) -> Self {
            let clock = Arc::new(FakeClock::new());
            let recorder = Arc::new(Recorder::default());
            let (service, _wake) =
                TimerService::new(db.clone(), clock.clone(), Box::new(recorder.clone())).unwrap();
            Self {
                db,
                clock,
                recorder,
                service,
            }
        }

        /// Deixa o tempo passar com o ticker "rodando" a cada segundo.
        fn run_secs(&self, secs: u64) {
            for _ in 0..secs {
                self.clock.advance_secs(1);
                self.service.snapshot().unwrap();
            }
        }

        fn sessions(&self) -> Vec<SessionRow> {
            self.db.with_conn(|conn| Ok(sessions(conn))).unwrap()
        }

        fn notifications(&self) -> Vec<TimerSnapshot> {
            self.recorder.0.lock().unwrap().clone()
        }

        fn completions(&self) -> Vec<(Phase, TimerSnapshot)> {
            self.recorder.1.lock().unwrap().clone()
        }
    }

    const FOCUS_SECS: u64 = 25 * 60;

    #[test]
    fn starting_records_an_active_session() {
        let h = Harness::new();

        let snapshot = h.service.start().unwrap();

        assert_eq!(snapshot.status, Status::Running);
        let rows = h.sessions();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].status, "active");
        assert_eq!(rows[0].kind, "focus");
        assert_eq!(rows[0].planned_ms, (FOCUS_SECS * 1_000) as i64);
        assert_eq!(rows[0].ended_at_ms, None);
    }

    #[test]
    fn a_completed_focus_is_recorded_once_however_long_the_ticker_keeps_running() {
        let h = Harness::new();
        h.service.start().unwrap();

        h.run_secs(FOCUS_SECS + 600);

        let rows = h.sessions();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].status, "completed");
        assert_eq!(rows[0].elapsed_ms, rows[0].planned_ms);
        assert_eq!(
            rows[0].ended_at_ms,
            Some(rows[0].started_at_ms + (FOCUS_SECS * 1_000) as i64)
        );
        let snapshot = h.service.snapshot().unwrap();
        assert_eq!(snapshot.status, Status::Idle);
        assert_eq!(snapshot.phase, Phase::ShortBreak);
    }

    #[test]
    fn pause_and_resume_keep_a_single_session_with_only_the_active_time() {
        let h = Harness::new();
        h.service.start().unwrap();
        h.run_secs(60);

        h.service.pause().unwrap();
        h.clock.advance_secs(3_600);
        let paused = h.sessions();
        h.service.start().unwrap();
        h.run_secs(FOCUS_SECS - 60);

        assert_eq!(paused[0].status, "active");
        assert_eq!(paused[0].elapsed_ms, 60_000);
        let rows = h.sessions();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].status, "completed");
        assert_eq!(rows[0].elapsed_ms, (FOCUS_SECS * 1_000) as i64);
    }

    #[test]
    fn skip_and_reset_are_recorded_with_their_own_outcomes() {
        let h = Harness::new();
        h.service.start().unwrap();
        h.run_secs(30);
        h.service.reset().unwrap();
        h.service.start().unwrap();
        h.run_secs(45);

        h.service.skip().unwrap();

        let rows = h.sessions();
        assert_eq!(
            rows.iter()
                .map(|row| (row.status.as_str(), row.elapsed_ms))
                .collect::<Vec<_>>(),
            vec![("reset", 30_000), ("skipped", 45_000)]
        );
    }

    #[test]
    fn progress_is_saved_while_running() {
        let h = Harness::new();
        h.service.start().unwrap();

        h.run_secs(25);

        assert_eq!(h.sessions()[0].elapsed_ms, 20_000);
        assert_eq!(
            h.sessions()[0].updated_at_ms,
            h.sessions()[0].started_at_ms + 20_000
        );
    }

    #[test]
    fn a_session_left_running_by_a_crash_is_interrupted_on_the_next_launch() {
        let h = Harness::new();
        h.service.start().unwrap();
        h.run_secs(95);
        // O processo morre aqui: nada de shutdown. Um novo serviço abre o mesmo banco.

        let relaunched = Harness::with_db(h.db.clone());

        let rows = relaunched.sessions();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].status, "interrupted");
        assert_eq!(rows[0].elapsed_ms, 90_000, "último progresso gravado");
        assert_eq!(rows[0].ended_at_ms, Some(rows[0].started_at_ms + 90_000));
        let snapshot = relaunched.service.snapshot().unwrap();
        assert_eq!(snapshot.status, Status::Idle);
        assert_eq!(snapshot.phase, Phase::Focus);
        assert_eq!(snapshot.remaining_ms, FOCUS_SECS * 1_000);
    }

    #[test]
    fn an_orderly_shutdown_records_the_exact_elapsed_time() {
        let h = Harness::new();
        h.service.start().unwrap();
        h.run_secs(95);

        h.service.shutdown();
        let relaunched = Harness::with_db(h.db.clone());

        let rows = relaunched.sessions();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].status, "interrupted");
        assert_eq!(rows[0].elapsed_ms, 95_000);
    }

    #[test]
    fn the_cycle_position_survives_a_restart() {
        let h = Harness::new();
        h.service.start().unwrap();
        h.run_secs(FOCUS_SECS);

        let relaunched = Harness::with_db(h.db.clone());

        let snapshot = relaunched.service.snapshot().unwrap();
        assert_eq!(snapshot.phase, Phase::ShortBreak);
        assert_eq!(snapshot.cycle_position, 1);
    }

    #[test]
    fn the_service_starts_with_the_saved_settings_and_follows_changes() {
        let db = Arc::new(Database::open_in_memory().unwrap());
        let mut saved = Settings::default();
        saved.timer.focus_minutes = 50;
        db.with_conn(|conn| settings::store::save(conn, &saved))
            .unwrap();

        let h = Harness::with_db(db);
        let initial = h.service.snapshot().unwrap();
        saved.timer.focus_minutes = 10;
        let changed = h.service.settings_changed(saved.timer).unwrap();

        assert_eq!(initial.remaining_ms, 50 * 60_000);
        assert_eq!(changed.remaining_ms, 10 * 60_000);
    }

    #[test]
    fn windows_are_notified_once_per_displayed_second() {
        let h = Harness::new();
        h.service.start().unwrap();

        // Quatro leituras por segundo, como o ticker real.
        for _ in 0..12 {
            h.clock.advance_ms(250);
            h.service.snapshot().unwrap();
        }

        let seconds: Vec<u64> = h
            .notifications()
            .iter()
            .map(TimerSnapshot::remaining_secs)
            .collect();
        assert_eq!(
            seconds,
            vec![FOCUS_SECS, FOCUS_SECS - 1, FOCUS_SECS - 2, FOCUS_SECS - 3]
        );
    }

    #[test]
    fn a_completed_session_is_announced_exactly_once() {
        let h = Harness::new();
        h.service.start().unwrap();

        h.run_secs(FOCUS_SECS + 600);

        let completions = h.completions();
        assert_eq!(completions.len(), 1);
        let (finished, next) = completions[0];
        assert_eq!(finished, Phase::Focus);
        assert_eq!(next.phase, Phase::ShortBreak);
        assert_eq!(next.status, Status::Idle);
    }

    #[test]
    fn each_session_of_an_automatic_cycle_is_announced_once() {
        let db = Arc::new(Database::open_in_memory().unwrap());
        let mut saved = Settings::default();
        saved.timer.auto_start_breaks = true;
        saved.timer.auto_start_focus = true;
        db.with_conn(|conn| settings::store::save(conn, &saved))
            .unwrap();
        let h = Harness::with_db(db);
        h.service.start().unwrap();

        // Foco (25 min) + pausa curta (5 min) + parte do foco seguinte.
        h.run_secs(FOCUS_SECS + 5 * 60 + 30);

        let announced: Vec<(Phase, Phase, Status)> = h
            .completions()
            .iter()
            .map(|(finished, next)| (*finished, next.phase, next.status))
            .collect();
        assert_eq!(
            announced,
            vec![
                (Phase::Focus, Phase::ShortBreak, Status::Running),
                (Phase::ShortBreak, Phase::Focus, Status::Running),
            ]
        );
    }

    #[test]
    fn skipped_reset_and_interrupted_sessions_are_not_announced() {
        let h = Harness::new();
        h.service.start().unwrap();
        h.run_secs(30);
        h.service.reset().unwrap();
        h.service.start().unwrap();
        h.run_secs(30);
        h.service.skip().unwrap();
        h.service.start().unwrap();
        h.run_secs(30);
        h.service.shutdown();

        assert!(h.completions().is_empty());
    }

    #[test]
    fn a_completion_that_could_not_be_saved_is_not_announced() {
        let h = Harness::new();
        h.service.start().unwrap();
        h.run_secs(FOCUS_SECS - 1);
        h.db.with_conn(|conn| {
            conn.execute("DROP TABLE timer_state", [])?;
            Ok(())
        })
        .unwrap();

        h.clock.advance_secs(1);
        let result = h.service.snapshot();

        assert!(result.is_err());
        assert!(h.completions().is_empty());
        assert_eq!(h.sessions()[0].status, "active", "a transação foi desfeita");
    }

    /// Cria uma tarefa diretamente no banco e devolve seu ID.
    fn task(h: &Harness, title: &str) -> i64 {
        use crate::tasks::{self, Priority, TaskInput};
        h.db.with_conn(|conn| {
            tasks::store::create(
                conn,
                TaskInput {
                    title: title.into(),
                    description: String::new(),
                    priority: Priority::Medium,
                    due_date: None,
                    estimated_pomodoros: None,
                },
                0,
            )
        })
        .unwrap()
    }

    #[test]
    fn focusing_a_task_starts_a_focus_session_dedicated_to_it() {
        let h = Harness::new();
        let report = task(&h, "Relatório");

        let snapshot = h.service.focus_task(report).unwrap();

        assert_eq!(snapshot.status, Status::Running);
        assert_eq!(snapshot.phase, Phase::Focus);
        assert_eq!(snapshot.task_id, Some(report));
        assert_eq!(h.sessions()[0].task_id, Some(report));
    }

    #[test]
    fn breaks_are_never_dedicated_to_a_task() {
        let db = Arc::new(Database::open_in_memory().unwrap());
        let mut saved = Settings::default();
        saved.timer.auto_start_breaks = true;
        db.with_conn(|conn| settings::store::save(conn, &saved))
            .unwrap();
        let h = Harness::with_db(db);
        let report = task(&h, "Relatório");
        h.service.focus_task(report).unwrap();

        h.run_secs(FOCUS_SECS + 10);

        let rows = h.sessions();
        assert_eq!(
            rows.iter()
                .map(|row| (row.kind.as_str(), row.task_id))
                .collect::<Vec<_>>(),
            vec![("focus", Some(report)), ("short_break", None)]
        );
    }

    #[test]
    fn choosing_another_task_reassigns_the_focus_in_progress() {
        let h = Harness::new();
        let first = task(&h, "Primeira");
        let second = task(&h, "Segunda");
        h.service.focus_task(first).unwrap();
        h.run_secs(60);

        h.service.set_task(Some(second)).unwrap();
        let reassigned = h.sessions();
        h.service.set_task(None).unwrap();

        assert_eq!(reassigned.len(), 1, "a sessão é a mesma");
        assert_eq!(reassigned[0].task_id, Some(second));
        assert_eq!(h.sessions()[0].task_id, None);
        assert_eq!(h.service.snapshot().unwrap().status, Status::Running);
    }

    #[test]
    fn focusing_a_task_during_a_break_skips_the_break() {
        let h = Harness::new();
        let report = task(&h, "Relatório");
        h.service.start().unwrap();
        h.run_secs(FOCUS_SECS);
        h.service.start().unwrap();
        h.run_secs(30);

        h.service.focus_task(report).unwrap();

        let rows = h.sessions();
        assert_eq!(
            rows.iter()
                .map(|row| (row.kind.as_str(), row.status.as_str(), row.task_id))
                .collect::<Vec<_>>(),
            vec![
                ("focus", "completed", None),
                ("short_break", "skipped", None),
                ("focus", "active", Some(report)),
            ]
        );
    }

    #[test]
    fn the_chosen_task_survives_a_restart() {
        let h = Harness::new();
        let report = task(&h, "Relatório");
        h.service.set_task(Some(report)).unwrap();

        let relaunched = Harness::with_db(h.db.clone());

        assert_eq!(relaunched.service.snapshot().unwrap().task_id, Some(report));
    }

    #[test]
    fn a_task_that_became_unavailable_is_dropped_but_the_session_goes_on() {
        let h = Harness::new();
        let report = task(&h, "Relatório");
        let other = task(&h, "Outra");
        h.service.focus_task(report).unwrap();

        let unrelated = h.service.task_unavailable(other).unwrap();
        let dropped = h.service.task_unavailable(report).unwrap();

        assert_eq!(unrelated.task_id, Some(report));
        assert_eq!(dropped.task_id, None);
        assert_eq!(dropped.status, Status::Running);
    }

    #[test]
    fn deleting_the_chosen_task_never_leaves_a_dangling_reference() {
        let h = Harness::new();
        let report = task(&h, "Relatório");
        h.service.focus_task(report).unwrap();
        h.run_secs(FOCUS_SECS);

        h.db.with_conn(|conn| crate::tasks::store::delete(conn, report))
            .unwrap();
        h.service.task_unavailable(report).unwrap();
        let relaunched = Harness::with_db(h.db.clone());

        assert_eq!(h.sessions()[0].status, "completed");
        assert_eq!(h.sessions()[0].task_id, None);
        assert_eq!(relaunched.service.snapshot().unwrap().task_id, None);
    }

    #[test]
    fn focusing_a_task_that_does_not_exist_changes_nothing() {
        let h = Harness::new();

        let result = h.service.focus_task(999);

        assert!(result.is_err());
        let snapshot = h.service.snapshot().unwrap();
        assert_eq!(snapshot.status, Status::Idle);
        assert_eq!(snapshot.task_id, None);
        assert!(h.sessions().is_empty());
    }

    #[test]
    fn nothing_is_notified_while_idle_or_paused() {
        let h = Harness::new();
        h.service.snapshot().unwrap();
        h.service.start().unwrap();
        h.service.pause().unwrap();
        let before = h.notifications().len();

        h.run_secs(120);

        assert_eq!(h.notifications().len(), before);
    }

    #[test]
    fn a_failed_write_leaves_the_timer_unchanged() {
        let h = Harness::new();
        h.db.with_conn(|conn| {
            conn.execute("DROP TABLE pomodoro_sessions", [])?;
            Ok(())
        })
        .unwrap();

        let result = h.service.start();

        assert!(matches!(result, Err(AppError::Database { .. })));
        assert_eq!(h.service.snapshot().unwrap().status, Status::Idle);
    }

    #[test]
    fn a_suspend_gap_pauses_the_session_and_saves_the_progress() {
        let h = Harness::new();
        h.service.start().unwrap();
        h.run_secs(65);

        h.clock.advance_secs(2 * 3_600);
        let snapshot = h.service.snapshot().unwrap();

        assert_eq!(snapshot.status, Status::Paused);
        assert_eq!(snapshot.remaining_ms, (FOCUS_SECS - 65) * 1_000);
        let rows = h.sessions();
        assert_eq!(rows[0].status, "active");
        assert_eq!(rows[0].elapsed_ms, 65_000);
    }

    #[test]
    fn the_ticker_thread_drives_completion_and_stops_with_the_service() {
        // Relógio real, sessão de 1 minuto encurtada avançando um relógio falso
        // a partir de outra thread seria frágil; aqui só se verifica que o
        // ticker acorda com um comando, lê o relógio e termina sem travar.
        let db = Arc::new(Database::open_in_memory().unwrap());
        let clock = Arc::new(FakeClock::new());
        let recorder = Arc::new(Recorder::default());
        let (service, wake) =
            TimerService::new(db, clock.clone(), Box::new(recorder.clone())).unwrap();
        let ticker = std::thread::spawn({
            let service = service.clone();
            move || service.run_ticker(wake)
        });

        service.start().unwrap();
        clock.advance_secs(5);
        // Espera o ticker (250 ms por volta) observar o avanço.
        let deadline = std::time::Instant::now() + Duration::from_secs(5);
        while recorder.0.lock().unwrap().len() < 2 && std::time::Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(20));
        }
        let seen = recorder.0.lock().unwrap().last().copied();
        drop(service);
        ticker.join().unwrap();

        assert_eq!(
            seen.map(|snapshot| snapshot.remaining_secs()),
            Some(FOCUS_SECS - 5)
        );
    }
}
