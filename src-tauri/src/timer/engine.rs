//! Máquina de estados do Pomodoro: pura, sem E/S e sem relógio próprio.
//!
//! Cada operação recebe o instante atual ([`Tick`]) e devolve os [`Effect`]s
//! que o serviço deve persistir. Ver `docs/TIMER_ENGINE.md`.

use serde::Serialize;

use super::clock::Tick;
use crate::settings::TimerSettings;

/// Intervalo entre duas leituras acima do qual se presume que o computador
/// foi suspenso (ou o processo ficou parado). Esse intervalo não conta como
/// tempo trabalhado e a sessão é pausada.
pub const SUSPEND_GAP_MS: u64 = 30_000;

/// Tempo ativo entre gravações do progresso da sessão em andamento.
pub const CHECKPOINT_INTERVAL_MS: u64 = 10_000;

/// Tipo de sessão. Independe de estar rodando ou pausada.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Phase {
    Focus,
    ShortBreak,
    LongBreak,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    /// Nenhuma sessão em andamento; `phase` é a próxima a iniciar.
    Idle,
    Running,
    Paused,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum PauseReason {
    User,
    /// Pausa automática após um salto de tempo (suspensão do computador).
    Suspend,
}

/// Como uma sessão terminou.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Outcome {
    /// O tempo ativo atingiu a duração planejada.
    Completed,
    Skipped,
    Reset,
    /// O aplicativo foi encerrado com a sessão em andamento.
    Interrupted,
}

/// Mudança que precisa ser persistida. Os efeitos de uma mesma operação são
/// gravados juntos, na ordem em que aparecem.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Effect {
    Started {
        phase: Phase,
        planned_ms: u64,
        at_ms: i64,
        /// Tarefa a que a sessão é dedicada (só sessões de foco têm tarefa).
        task_id: Option<i64>,
    },
    /// Progresso da sessão em andamento.
    Checkpoint { elapsed_ms: u64, at_ms: i64 },
    Finished {
        /// Tipo da sessão que terminou.
        phase: Phase,
        outcome: Outcome,
        elapsed_ms: u64,
        at_ms: i64,
    },
}

/// Estado exposto ao frontend (evento `timer:state` e retorno dos comandos).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerSnapshot {
    pub phase: Phase,
    pub status: Status,
    pub remaining_ms: u64,
    pub planned_ms: u64,
    /// Focos já encerrados (concluídos ou pulados) no ciclo atual.
    pub cycle_position: u32,
    pub cycles_before_long_break: u32,
    pub pause_reason: Option<PauseReason>,
    /// Tarefa escolhida para os focos (a engine só a guarda e repassa).
    pub task_id: Option<i64>,
}

impl TimerSnapshot {
    /// Segundos a exibir. Arredonda para cima: a contagem começa em 25:00 e
    /// só mostra 00:00 quando o tempo realmente acabou.
    pub fn remaining_secs(&self) -> u64 {
        self.remaining_ms.div_ceil(1_000)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Session {
    planned_ms: u64,
    /// Tempo ativo acumulado até a última leitura do relógio.
    elapsed_ms: u64,
    /// Valor de `elapsed_ms` no último `Checkpoint` emitido.
    checkpointed_ms: u64,
}

#[derive(Debug, Clone)]
pub struct Engine {
    settings: TimerSettings,
    phase: Phase,
    cycle_position: u32,
    status: Status,
    pause_reason: Option<PauseReason>,
    /// `Some` se, e somente se, `status != Idle`.
    session: Option<Session>,
    /// Última leitura do relógio com a sessão rodando.
    last_tick: Option<Tick>,
    /// Tarefa escolhida para os focos.
    task_id: Option<i64>,
}

fn minutes_to_ms(minutes: u32) -> u64 {
    u64::from(minutes) * 60_000
}

impl Engine {
    /// Cria a engine parada na fase e na posição de ciclo informadas.
    pub fn new(
        settings: TimerSettings,
        phase: Phase,
        cycle_position: u32,
        task_id: Option<i64>,
    ) -> Self {
        Self {
            task_id,
            settings,
            phase,
            cycle_position,
            status: Status::Idle,
            pause_reason: None,
            session: None,
            last_tick: None,
        }
    }

    pub fn phase(&self) -> Phase {
        self.phase
    }

    pub fn cycle_position(&self) -> u32 {
        self.cycle_position
    }

    pub fn task_id(&self) -> Option<i64> {
        self.task_id
    }

    /// Há uma sessão de foco em andamento (rodando ou pausada).
    pub fn in_focus_session(&self) -> bool {
        self.session.is_some() && self.phase == Phase::Focus
    }

    /// Escolhe a tarefa dos focos (ou nenhuma). Não altera o andamento do timer.
    pub fn set_task(&mut self, task_id: Option<i64>) {
        self.task_id = task_id;
    }

    pub fn is_running(&self) -> bool {
        self.status == Status::Running
    }

    pub fn snapshot(&self) -> TimerSnapshot {
        let (planned_ms, remaining_ms) = match self.session {
            Some(session) => (
                session.planned_ms,
                session.planned_ms.saturating_sub(session.elapsed_ms),
            ),
            None => {
                let planned = self.planned_for(self.phase);
                (planned, planned)
            }
        };
        TimerSnapshot {
            phase: self.phase,
            status: self.status,
            remaining_ms,
            planned_ms,
            cycle_position: self.cycle_position,
            cycles_before_long_break: self.settings.cycles_before_long_break,
            pause_reason: self.pause_reason,
            task_id: self.task_id,
        }
    }

    /// Novas configurações valem a partir da próxima sessão iniciada; a
    /// sessão em andamento mantém a duração com que começou.
    pub fn set_settings(&mut self, settings: TimerSettings) {
        self.settings = settings;
    }

    /// Atualiza o tempo decorrido até `now`. É chamada periodicamente e no
    /// início de toda operação, de modo que nenhuma decisão use tempo velho.
    pub fn sync(&mut self, now: Tick) -> Vec<Effect> {
        let mut effects = Vec::new();
        if self.status != Status::Running {
            return effects;
        }
        // Cópia de trabalho; é gravada de volta antes de qualquer transição.
        let Some(mut session) = self.session else {
            return effects;
        };

        if let Some(last) = self.last_tick.replace(now) {
            let mono_delta = now.mono_ms.saturating_sub(last.mono_ms);
            let wall_delta = u64::try_from(now.wall_ms.saturating_sub(last.wall_ms)).unwrap_or(0);
            if mono_delta.max(wall_delta) > SUSPEND_GAP_MS {
                // O intervalo não é creditado, tenha o relógio monotônico
                // avançado durante a suspensão ou não.
                session.checkpointed_ms = session.elapsed_ms;
                self.session = Some(session);
                effects.push(Effect::Checkpoint {
                    elapsed_ms: session.elapsed_ms,
                    at_ms: last.wall_ms,
                });
                self.status = Status::Paused;
                self.pause_reason = Some(PauseReason::Suspend);
                self.last_tick = None;
                return effects;
            }
            session.elapsed_ms = session.elapsed_ms.saturating_add(mono_delta);
        }

        let checkpoint_due = session.elapsed_ms - session.checkpointed_ms >= CHECKPOINT_INTERVAL_MS;
        if checkpoint_due {
            session.checkpointed_ms = session.elapsed_ms;
        }
        self.session = Some(session);

        if session.elapsed_ms >= session.planned_ms {
            self.finish(Outcome::Completed, now, &mut effects);
            self.advance();
            if self.auto_starts(self.phase) {
                self.begin(now, &mut effects);
            }
        } else if checkpoint_due {
            effects.push(Effect::Checkpoint {
                elapsed_ms: session.elapsed_ms,
                at_ms: now.wall_ms,
            });
        }
        effects
    }

    /// Inicia a fase atual ou retoma a sessão pausada.
    pub fn start(&mut self, now: Tick) -> Vec<Effect> {
        let (mut effects, settled) = self.sync_for_command(now);
        if settled {
            return effects;
        }
        match self.status {
            Status::Idle => self.begin(now, &mut effects),
            Status::Paused => {
                self.status = Status::Running;
                self.pause_reason = None;
                self.last_tick = Some(now);
            }
            Status::Running => {}
        }
        effects
    }

    pub fn pause(&mut self, now: Tick) -> Vec<Effect> {
        let (mut effects, settled) = self.sync_for_command(now);
        if settled {
            return effects;
        }
        if self.status == Status::Running {
            if let Some(session) = self.session.as_mut() {
                session.checkpointed_ms = session.elapsed_ms;
                effects.push(Effect::Checkpoint {
                    elapsed_ms: session.elapsed_ms,
                    at_ms: now.wall_ms,
                });
            }
            self.status = Status::Paused;
            self.pause_reason = Some(PauseReason::User);
            self.last_tick = None;
        }
        effects
    }

    /// Encerra a sessão atual (se houver) como pulada e passa à fase seguinte.
    pub fn skip(&mut self, now: Tick) -> Vec<Effect> {
        let (mut effects, settled) = self.sync_for_command(now);
        if settled {
            return effects;
        }
        if self.session.is_some() {
            self.finish(Outcome::Skipped, now, &mut effects);
        }
        self.advance();
        if self.auto_starts(self.phase) {
            self.begin(now, &mut effects);
        }
        effects
    }

    /// Vai direto para um foco em andamento: retoma o foco pausado, inicia o
    /// foco parado ou encerra a pausa atual (como pulada) e começa o foco
    /// seguinte. Um foco que já está rodando segue como está.
    pub fn focus(&mut self, now: Tick) -> Vec<Effect> {
        let (mut effects, settled) = self.sync_for_command(now);
        if settled {
            return effects;
        }
        if self.phase != Phase::Focus {
            if self.session.is_some() {
                self.finish(Outcome::Skipped, now, &mut effects);
            }
            self.advance();
        }
        match self.status {
            Status::Idle => self.begin(now, &mut effects),
            Status::Paused => {
                self.status = Status::Running;
                self.pause_reason = None;
                self.last_tick = Some(now);
            }
            Status::Running => {}
        }
        effects
    }

    /// Abandona a sessão atual e volta ao início da mesma fase, parado.
    pub fn reset(&mut self, now: Tick) -> Vec<Effect> {
        let (mut effects, settled) = self.sync_for_command(now);
        if settled {
            return effects;
        }
        if self.session.is_some() {
            self.finish(Outcome::Reset, now, &mut effects);
        }
        effects
    }

    /// Encerramento do aplicativo: a sessão em andamento vira interrompida.
    pub fn shutdown(&mut self, now: Tick) -> Vec<Effect> {
        let (mut effects, settled) = self.sync_for_command(now);
        if settled {
            return effects;
        }
        if self.session.is_some() {
            self.finish(Outcome::Interrupted, now, &mut effects);
        }
        effects
    }

    /// Sincroniza antes de um comando. O segundo valor é `true` quando a
    /// própria sincronização concluiu a sessão: o comando foi emitido para
    /// uma sessão que já não existe e não deve atingir a seguinte.
    fn sync_for_command(&mut self, now: Tick) -> (Vec<Effect>, bool) {
        let effects = self.sync(now);
        let settled = effects
            .iter()
            .any(|effect| matches!(effect, Effect::Finished { .. }));
        (effects, settled)
    }

    fn begin(&mut self, now: Tick, effects: &mut Vec<Effect>) {
        let planned_ms = self.planned_for(self.phase);
        self.session = Some(Session {
            planned_ms,
            elapsed_ms: 0,
            checkpointed_ms: 0,
        });
        self.status = Status::Running;
        self.pause_reason = None;
        self.last_tick = Some(now);
        effects.push(Effect::Started {
            phase: self.phase,
            planned_ms,
            at_ms: now.wall_ms,
            task_id: (self.phase == Phase::Focus)
                .then_some(self.task_id)
                .flatten(),
        });
    }

    fn finish(&mut self, outcome: Outcome, now: Tick, effects: &mut Vec<Effect>) {
        if let Some(session) = self.session.take() {
            effects.push(Effect::Finished {
                phase: self.phase,
                outcome,
                elapsed_ms: session.elapsed_ms.min(session.planned_ms),
                at_ms: now.wall_ms,
            });
        }
        self.status = Status::Idle;
        self.pause_reason = None;
        self.last_tick = None;
    }

    /// Passa à fase seguinte. Todo foco encerrado (concluído ou pulado)
    /// avança a posição no ciclo; a pausa longa a zera.
    fn advance(&mut self) {
        match self.phase {
            Phase::Focus => {
                self.cycle_position += 1;
                self.phase = if self.cycle_position >= self.settings.cycles_before_long_break {
                    Phase::LongBreak
                } else {
                    Phase::ShortBreak
                };
            }
            Phase::ShortBreak => self.phase = Phase::Focus,
            Phase::LongBreak => {
                self.cycle_position = 0;
                self.phase = Phase::Focus;
            }
        }
    }

    fn auto_starts(&self, phase: Phase) -> bool {
        match phase {
            Phase::Focus => self.settings.auto_start_focus,
            Phase::ShortBreak | Phase::LongBreak => self.settings.auto_start_breaks,
        }
    }

    fn planned_for(&self, phase: Phase) -> u64 {
        minutes_to_ms(match phase {
            Phase::Focus => self.settings.focus_minutes,
            Phase::ShortBreak => self.settings.short_break_minutes,
            Phase::LongBreak => self.settings.long_break_minutes,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SECOND: u64 = 1_000;
    const MINUTE: u64 = 60 * SECOND;
    const WALL_ORIGIN: i64 = 1_800_000_000_000;

    fn at(mono_ms: u64) -> Tick {
        Tick {
            mono_ms,
            wall_ms: WALL_ORIGIN + mono_ms as i64,
        }
    }

    fn engine() -> Engine {
        Engine::new(TimerSettings::default(), Phase::Focus, 0, None)
    }

    /// Avança `duration` em passos de 1 s (como o ticker faria) a partir de
    /// `from`, devolvendo os efeitos gerados e o instante final.
    fn run(engine: &mut Engine, from: u64, duration: u64) -> (Vec<Effect>, u64) {
        let mut effects = Vec::new();
        let mut now = from;
        let end = from + duration;
        while now < end {
            now = (now + SECOND).min(end);
            effects.extend(engine.sync(at(now)));
        }
        (effects, now)
    }

    fn finished(effects: &[Effect]) -> Vec<(Outcome, u64)> {
        effects
            .iter()
            .filter_map(|effect| match effect {
                Effect::Finished {
                    outcome,
                    elapsed_ms,
                    ..
                } => Some((*outcome, *elapsed_ms)),
                _ => None,
            })
            .collect()
    }

    fn started(effects: &[Effect]) -> Vec<Phase> {
        effects
            .iter()
            .filter_map(|effect| match effect {
                Effect::Started { phase, .. } => Some(*phase),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn starts_idle_showing_the_full_focus_duration() {
        let snapshot = engine().snapshot();

        assert_eq!(snapshot.status, Status::Idle);
        assert_eq!(snapshot.phase, Phase::Focus);
        assert_eq!(snapshot.remaining_ms, 25 * MINUTE);
        assert_eq!(snapshot.planned_ms, 25 * MINUTE);
        assert_eq!(snapshot.cycle_position, 0);
        assert_eq!(snapshot.cycles_before_long_break, 4);
        assert_eq!(snapshot.pause_reason, None);
    }

    #[test]
    fn start_begins_a_session_and_time_counts_down() {
        let mut engine = engine();

        let effects = engine.start(at(0));
        run(&mut engine, 0, 10 * MINUTE);

        assert_eq!(
            effects,
            vec![Effect::Started {
                phase: Phase::Focus,
                planned_ms: 25 * MINUTE,
                at_ms: WALL_ORIGIN,
                task_id: None,
            }]
        );
        assert_eq!(engine.snapshot().status, Status::Running);
        assert_eq!(engine.snapshot().remaining_ms, 15 * MINUTE);
    }

    #[test]
    fn paused_time_does_not_count_and_the_session_stays_a_focus_session() {
        let mut engine = engine();
        engine.start(at(0));
        let (_, now) = run(&mut engine, 0, 5 * MINUTE);

        let effects = engine.pause(at(now));
        // Uma hora parado: nenhuma leitura, depois retoma.
        let resumed_at = now + 60 * MINUTE;
        let paused = engine.snapshot();
        let resume_effects = engine.start(at(resumed_at));
        run(&mut engine, resumed_at, 5 * MINUTE);

        assert_eq!(
            effects,
            vec![Effect::Checkpoint {
                elapsed_ms: 5 * MINUTE,
                at_ms: WALL_ORIGIN + now as i64,
            }]
        );
        assert_eq!(paused.status, Status::Paused);
        assert_eq!(paused.phase, Phase::Focus);
        assert_eq!(paused.pause_reason, Some(PauseReason::User));
        assert_eq!(paused.remaining_ms, 20 * MINUTE);
        assert!(resume_effects.is_empty(), "retomar não cria outra sessão");
        assert_eq!(engine.snapshot().status, Status::Running);
        assert_eq!(engine.snapshot().pause_reason, None);
        assert_eq!(engine.snapshot().remaining_ms, 15 * MINUTE);
    }

    #[test]
    fn a_focus_session_completes_into_an_idle_short_break() {
        let mut engine = engine();
        engine.start(at(0));

        let (effects, _) = run(&mut engine, 0, 25 * MINUTE);

        assert_eq!(finished(&effects), vec![(Outcome::Completed, 25 * MINUTE)]);
        assert!(started(&effects).is_empty());
        let snapshot = engine.snapshot();
        assert_eq!(snapshot.status, Status::Idle);
        assert_eq!(snapshot.phase, Phase::ShortBreak);
        assert_eq!(snapshot.remaining_ms, 5 * MINUTE);
        assert_eq!(snapshot.cycle_position, 1);
    }

    #[test]
    fn completion_happens_exactly_once() {
        let mut engine = engine();
        engine.start(at(0));
        let (first, now) = run(&mut engine, 0, 25 * MINUTE);

        let (later, _) = run(&mut engine, now, 10 * MINUTE);

        assert_eq!(finished(&first).len(), 1);
        assert!(later.is_empty());
    }

    #[test]
    fn a_late_reading_never_records_more_than_the_planned_time() {
        let mut engine = engine();
        engine.start(at(0));
        let (_, now) = run(&mut engine, 0, 25 * MINUTE - SECOND);

        // Leitura atrasada em 20 s (abaixo do limite de suspensão).
        let effects = engine.sync(at(now + 20 * SECOND));

        assert_eq!(finished(&effects), vec![(Outcome::Completed, 25 * MINUTE)]);
    }

    #[test]
    fn the_long_break_comes_after_the_configured_number_of_focus_sessions() {
        let mut engine = engine();
        let mut now = 0;
        let mut phases = Vec::new();

        for _ in 0..9 {
            phases.push(engine.snapshot().phase);
            engine.start(at(now));
            let planned = engine.snapshot().planned_ms;
            now = run(&mut engine, now, planned).1;
        }

        use Phase::{Focus, LongBreak, ShortBreak};
        assert_eq!(
            phases,
            vec![Focus, ShortBreak, Focus, ShortBreak, Focus, ShortBreak, Focus, LongBreak, Focus]
        );
        assert_eq!(
            engine.snapshot().cycle_position,
            1,
            "novo ciclo após a pausa longa"
        );
    }

    #[test]
    fn skipping_a_running_focus_records_it_as_skipped_and_moves_on() {
        let mut engine = engine();
        engine.start(at(0));
        let (_, now) = run(&mut engine, 0, 7 * MINUTE);

        let effects = engine.skip(at(now));

        assert_eq!(finished(&effects), vec![(Outcome::Skipped, 7 * MINUTE)]);
        let snapshot = engine.snapshot();
        assert_eq!(snapshot.status, Status::Idle);
        assert_eq!(snapshot.phase, Phase::ShortBreak);
        assert_eq!(snapshot.cycle_position, 1);
    }

    #[test]
    fn skipping_while_idle_only_changes_the_phase() {
        let mut engine = engine();

        let effects = engine.skip(at(0));

        assert!(effects.is_empty());
        assert_eq!(engine.snapshot().phase, Phase::ShortBreak);
        assert_eq!(engine.snapshot().status, Status::Idle);
    }

    #[test]
    fn reset_abandons_the_session_and_restores_the_same_phase() {
        let mut engine = engine();
        engine.start(at(0));
        let (_, now) = run(&mut engine, 0, 12 * MINUTE);
        engine.pause(at(now));

        let effects = engine.reset(at(now + MINUTE));

        assert_eq!(finished(&effects), vec![(Outcome::Reset, 12 * MINUTE)]);
        let snapshot = engine.snapshot();
        assert_eq!(snapshot.status, Status::Idle);
        assert_eq!(snapshot.phase, Phase::Focus);
        assert_eq!(snapshot.remaining_ms, 25 * MINUTE);
        assert_eq!(snapshot.cycle_position, 0);
    }

    #[test]
    fn commands_that_do_not_apply_are_ignored() {
        let mut engine = engine();

        assert!(engine.pause(at(0)).is_empty());
        assert!(engine.reset(at(0)).is_empty());
        assert_eq!(engine.snapshot().status, Status::Idle);

        engine.start(at(0));
        let again = engine.start(at(SECOND));

        assert!(again.is_empty(), "iniciar duas vezes não cria duas sessões");
        assert_eq!(engine.snapshot().remaining_ms, 25 * MINUTE - SECOND);
    }

    #[test]
    fn breaks_start_automatically_when_configured() {
        let mut engine = Engine::new(
            TimerSettings {
                auto_start_breaks: true,
                ..TimerSettings::default()
            },
            Phase::Focus,
            0,
            None,
        );
        engine.start(at(0));

        let (effects, now) = run(&mut engine, 0, 25 * MINUTE);
        let (after_break, _) = run(&mut engine, now, 5 * MINUTE);

        assert_eq!(finished(&effects), vec![(Outcome::Completed, 25 * MINUTE)]);
        assert_eq!(started(&effects), vec![Phase::ShortBreak]);
        // O foco seguinte não inicia sozinho: `auto_start_focus` está desligado.
        assert_eq!(
            finished(&after_break),
            vec![(Outcome::Completed, 5 * MINUTE)]
        );
        assert!(started(&after_break).is_empty());
        assert_eq!(engine.snapshot().status, Status::Idle);
        assert_eq!(engine.snapshot().phase, Phase::Focus);
    }

    #[test]
    fn the_next_focus_starts_automatically_when_configured() {
        let mut engine = Engine::new(
            TimerSettings {
                auto_start_focus: true,
                ..TimerSettings::default()
            },
            Phase::ShortBreak,
            1,
            None,
        );
        engine.start(at(0));

        let (effects, _) = run(&mut engine, 0, 5 * MINUTE);

        assert_eq!(started(&effects), vec![Phase::Focus]);
        assert_eq!(engine.snapshot().status, Status::Running);
    }

    #[test]
    fn a_command_issued_as_the_session_completes_does_not_hit_the_next_one() {
        let mut engine = Engine::new(
            TimerSettings {
                auto_start_breaks: true,
                ..TimerSettings::default()
            },
            Phase::Focus,
            0,
            None,
        );
        engine.start(at(0));
        let (_, now) = run(&mut engine, 0, 25 * MINUTE - SECOND);

        // O usuário clica em "pular" no mesmo instante em que o foco termina.
        let effects = engine.skip(at(now + SECOND));

        assert_eq!(finished(&effects), vec![(Outcome::Completed, 25 * MINUTE)]);
        assert_eq!(started(&effects), vec![Phase::ShortBreak]);
        assert_eq!(engine.snapshot().phase, Phase::ShortBreak);
        assert_eq!(engine.snapshot().status, Status::Running);
    }

    #[test]
    fn new_settings_apply_from_the_next_session() {
        let mut engine = engine();
        engine.start(at(0));
        let (_, now) = run(&mut engine, 0, MINUTE);

        engine.set_settings(TimerSettings {
            focus_minutes: 50,
            short_break_minutes: 10,
            ..TimerSettings::default()
        });

        assert_eq!(engine.snapshot().planned_ms, 25 * MINUTE);
        assert_eq!(engine.snapshot().remaining_ms, 24 * MINUTE);
        run(&mut engine, now, 24 * MINUTE);
        assert_eq!(engine.snapshot().phase, Phase::ShortBreak);
        assert_eq!(engine.snapshot().remaining_ms, 10 * MINUTE);
    }

    #[test]
    fn idle_duration_follows_the_current_settings() {
        let mut engine = engine();

        engine.set_settings(TimerSettings {
            focus_minutes: 40,
            ..TimerSettings::default()
        });

        assert_eq!(engine.snapshot().remaining_ms, 40 * MINUTE);
    }

    #[test]
    fn a_suspend_that_advances_the_monotonic_clock_pauses_without_counting() {
        let mut engine = engine();
        engine.start(at(0));
        let (_, now) = run(&mut engine, 0, 10 * MINUTE);

        // Duas horas sem leituras: os dois relógios avançaram.
        let effects = engine.sync(at(now + 120 * MINUTE));

        assert_eq!(
            effects,
            vec![Effect::Checkpoint {
                elapsed_ms: 10 * MINUTE,
                at_ms: WALL_ORIGIN + now as i64,
            }]
        );
        let snapshot = engine.snapshot();
        assert_eq!(snapshot.status, Status::Paused);
        assert_eq!(snapshot.pause_reason, Some(PauseReason::Suspend));
        assert_eq!(snapshot.remaining_ms, 15 * MINUTE);
    }

    #[test]
    fn a_suspend_that_freezes_the_monotonic_clock_also_pauses() {
        let mut engine = engine();
        engine.start(at(0));
        let (_, now) = run(&mut engine, 0, 10 * MINUTE);

        // O monotônico andou 1 s; o calendário, duas horas.
        let effects = engine.sync(Tick {
            mono_ms: now + SECOND,
            wall_ms: WALL_ORIGIN + (now + 120 * MINUTE) as i64,
        });

        assert_eq!(finished(&effects), vec![]);
        assert_eq!(engine.snapshot().status, Status::Paused);
        assert_eq!(engine.snapshot().pause_reason, Some(PauseReason::Suspend));
        assert_eq!(engine.snapshot().remaining_ms, 15 * MINUTE);
    }

    #[test]
    fn a_session_paused_by_suspend_resumes_from_where_it_stopped() {
        let mut engine = engine();
        engine.start(at(0));
        let (_, now) = run(&mut engine, 0, 10 * MINUTE);
        let woke = now + 120 * MINUTE;
        engine.sync(at(woke));

        engine.start(at(woke));
        let (effects, _) = run(&mut engine, woke, 15 * MINUTE);

        assert_eq!(finished(&effects), vec![(Outcome::Completed, 25 * MINUTE)]);
    }

    #[test]
    fn setting_the_system_clock_back_does_not_affect_the_countdown() {
        let mut engine = engine();
        engine.start(at(0));
        let (_, now) = run(&mut engine, 0, 10 * MINUTE);

        // O calendário volta um dia; o monotônico segue normalmente.
        let effects = engine.sync(Tick {
            mono_ms: now + SECOND,
            wall_ms: WALL_ORIGIN - 86_400_000,
        });

        assert!(effects.is_empty());
        assert_eq!(engine.snapshot().status, Status::Running);
        assert_eq!(engine.snapshot().remaining_ms, 15 * MINUTE - SECOND);
    }

    #[test]
    fn progress_is_checkpointed_periodically_while_running() {
        let mut engine = engine();
        engine.start(at(0));

        let (effects, _) = run(&mut engine, 0, 35 * SECOND);

        let checkpoints: Vec<u64> = effects
            .iter()
            .filter_map(|effect| match effect {
                Effect::Checkpoint { elapsed_ms, .. } => Some(*elapsed_ms),
                _ => None,
            })
            .collect();
        assert_eq!(checkpoints, vec![10 * SECOND, 20 * SECOND, 30 * SECOND]);
    }

    #[test]
    fn shutdown_marks_the_running_session_as_interrupted() {
        let mut engine = engine();
        engine.start(at(0));
        let (_, now) = run(&mut engine, 0, 3 * MINUTE);

        let effects = engine.shutdown(at(now));

        assert_eq!(finished(&effects), vec![(Outcome::Interrupted, 3 * MINUTE)]);
        assert_eq!(engine.snapshot().phase, Phase::Focus, "a fase não avança");
        assert!(engine.shutdown(at(now)).is_empty());
    }

    #[test]
    fn displayed_seconds_round_up() {
        let mut engine = engine();
        engine.start(at(0));
        assert_eq!(engine.snapshot().remaining_secs(), 25 * 60);

        engine.sync(at(1));
        assert_eq!(engine.snapshot().remaining_secs(), 25 * 60);

        engine.sync(at(SECOND));
        assert_eq!(engine.snapshot().remaining_secs(), 25 * 60 - 1);
    }

    #[test]
    fn snapshot_serializes_with_the_frontend_contract() {
        let mut engine = engine();
        engine.start(at(0));
        engine.pause(at(SECOND));

        assert_eq!(
            serde_json::to_value(engine.snapshot()).unwrap(),
            serde_json::json!({
                "phase": "focus",
                "status": "paused",
                "remainingMs": 25 * MINUTE - SECOND,
                "plannedMs": 25 * MINUTE,
                "cyclePosition": 0,
                "cyclesBeforeLongBreak": 4,
                "pauseReason": "user",
                "taskId": null
            })
        );
        assert_eq!(
            serde_json::to_value(Phase::ShortBreak).unwrap(),
            serde_json::json!("shortBreak")
        );
    }

    fn task_of_started(effects: &[Effect]) -> Vec<Option<i64>> {
        effects
            .iter()
            .filter_map(|effect| match effect {
                Effect::Started { task_id, .. } => Some(*task_id),
                _ => None,
            })
            .collect()
    }

    #[test]
    fn focus_sessions_carry_the_chosen_task_and_breaks_carry_none() {
        let mut engine = Engine::new(
            TimerSettings {
                auto_start_breaks: true,
                ..TimerSettings::default()
            },
            Phase::Focus,
            0,
            Some(7),
        );

        let focus = engine.start(at(0));
        let (after, _) = run(&mut engine, 0, 25 * MINUTE);

        assert_eq!(task_of_started(&focus), vec![Some(7)]);
        assert_eq!(started(&after), vec![Phase::ShortBreak]);
        assert_eq!(task_of_started(&after), vec![None]);
        assert_eq!(engine.snapshot().task_id, Some(7), "a escolha permanece");
    }

    #[test]
    fn choosing_a_task_does_not_disturb_the_timer() {
        let mut engine = engine();
        engine.start(at(0));
        let (_, now) = run(&mut engine, 0, MINUTE);

        engine.set_task(Some(3));
        engine.sync(at(now + SECOND));

        assert_eq!(engine.snapshot().task_id, Some(3));
        assert_eq!(engine.snapshot().status, Status::Running);
        assert_eq!(engine.snapshot().remaining_ms, 24 * MINUTE - SECOND);
        assert!(engine.in_focus_session());
    }

    #[test]
    fn focus_starts_an_idle_focus_and_resumes_a_paused_one() {
        let mut engine = engine();

        let effects = engine.focus(at(0));
        assert_eq!(started(&effects), vec![Phase::Focus]);

        engine.pause(at(MINUTE));
        let resumed = engine.focus(at(2 * MINUTE));

        assert!(resumed.is_empty(), "retomar não cria outra sessão");
        assert_eq!(engine.snapshot().status, Status::Running);
        assert!(engine.focus(at(2 * MINUTE + SECOND)).is_empty());
    }

    #[test]
    fn focus_during_a_break_skips_it_and_begins_the_next_focus() {
        let mut engine = Engine::new(TimerSettings::default(), Phase::ShortBreak, 1, None);
        engine.start(at(0));
        let (_, now) = run(&mut engine, 0, MINUTE);

        let effects = engine.focus(at(now));

        assert_eq!(finished(&effects), vec![(Outcome::Skipped, MINUTE)]);
        assert_eq!(started(&effects), vec![Phase::Focus]);
        assert_eq!(engine.snapshot().phase, Phase::Focus);
        assert_eq!(engine.snapshot().cycle_position, 1);
    }

    #[test]
    fn focus_from_an_idle_long_break_begins_a_new_cycle() {
        let mut engine = Engine::new(TimerSettings::default(), Phase::LongBreak, 4, None);

        let effects = engine.focus(at(0));

        assert!(finished(&effects).is_empty(), "nenhuma pausa foi iniciada");
        assert_eq!(started(&effects), vec![Phase::Focus]);
        assert_eq!(engine.snapshot().cycle_position, 0);
    }
}
