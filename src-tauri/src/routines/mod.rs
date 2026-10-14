//! Rotinas e expediente: os horários fixos do dia.
//!
//! Uma **rotina** é uma atividade que se repete em horário fixo ("Hora do
//! café"); o **expediente** é o intervalo em que o usuário trabalha. Para o
//! timer, os dois são âncoras: [`horizon`] diz, para um instante, o que está
//! acontecendo e quanto falta para a próxima âncora, e a engine encaixa os
//! ciclos nesse espaço. Ver `docs/ROUTINES.md`.

pub mod store;

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::settings::WorkdaySettings;

pub const NAME_MAX_CHARS: usize = 60;
pub const DURATION_MINUTES_MAX: u32 = 240;
pub const MINUTES_PER_DAY: u32 = 24 * 60;
/// Todos os dias da semana: um bit por dia, do 1 (segunda) ao 64 (domingo).
pub const EVERY_DAY: u8 = 0b111_1111;

const MS_PER_MINUTE: i64 = 60_000;
const MS_PER_DAY: i64 = 24 * 60 * MS_PER_MINUTE;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Routine {
    pub id: i64,
    pub name: String,
    /// Início, em minutos desde a meia-noite (fuso local).
    pub start_minute: u32,
    pub duration_minutes: u32,
    /// Dias em que vale; ver [`EVERY_DAY`].
    pub weekdays: u8,
    pub enabled: bool,
}

impl Routine {
    fn end_minute(&self) -> u32 {
        self.start_minute + self.duration_minutes
    }

    /// As duas valem em algum dia em comum e seus horários se cruzam.
    pub fn overlaps(&self, other: &RoutineInput) -> bool {
        self.weekdays & other.weekdays != 0
            && self.start_minute < other.start_minute + other.duration_minutes
            && other.start_minute < self.end_minute()
    }
}

/// Dados de uma rotina vindos do frontend (criação ou edição).
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoutineInput {
    pub name: String,
    pub start_minute: u32,
    pub duration_minutes: u32,
    pub weekdays: u8,
    pub enabled: bool,
}

impl RoutineInput {
    /// Confere os limites e devolve a entrada com o nome sem espaços nas pontas.
    pub fn validated(mut self) -> Result<Self, AppError> {
        self.name = self.name.trim().to_owned();
        if self.name.is_empty() {
            return Err(AppError::validation("name", "Dê um nome à rotina."));
        }
        if self.name.chars().count() > NAME_MAX_CHARS {
            return Err(AppError::validation(
                "name",
                format!("O nome pode ter até {NAME_MAX_CHARS} caracteres."),
            ));
        }
        if self.start_minute >= MINUTES_PER_DAY {
            return Err(AppError::validation("startMinute", "Horário inválido."));
        }
        if !(1..=DURATION_MINUTES_MAX).contains(&self.duration_minutes) {
            return Err(AppError::validation(
                "durationMinutes",
                format!("A duração deve ficar entre 1 e {DURATION_MINUTES_MAX} minutos."),
            ));
        }
        if self.start_minute + self.duration_minutes > MINUTES_PER_DAY {
            return Err(AppError::validation(
                "durationMinutes",
                "A rotina precisa terminar no mesmo dia em que começa.",
            ));
        }
        if self.weekdays == 0 || self.weekdays > EVERY_DAY {
            return Err(AppError::validation(
                "weekdays",
                "Escolha ao menos um dia da semana.",
            ));
        }
        Ok(self)
    }
}

/// Instante no fuso local, derivado de um horário local em ms desde a época.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LocalTime {
    /// Dias desde 1970-01-01, no fuso local. Identifica "hoje".
    pub day: i64,
    /// Bit do dia da semana, no formato de [`Routine::weekdays`].
    pub weekday_bit: u8,
    pub ms_of_day: i64,
}

impl LocalTime {
    pub fn from_local_ms(local_ms: i64) -> Self {
        let day = local_ms.div_euclid(MS_PER_DAY);
        // 1970-01-01 foi uma quinta-feira: o quarto bit (segunda = primeiro).
        let weekday = (day + 3).rem_euclid(7);
        Self {
            day,
            weekday_bit: 1 << weekday,
            ms_of_day: local_ms.rem_euclid(MS_PER_DAY),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ActiveRoutine {
    pub id: i64,
    pub remaining_ms: u64,
}

/// O que os horários fixos dizem sobre um instante.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Horizon {
    /// Rotina em andamento agora.
    pub routine: Option<ActiveRoutine>,
    /// Tempo até a próxima âncora de hoje: o início de uma rotina ou, durante
    /// o expediente, o fim dele. As sessões são dimensionadas para caber aqui.
    pub anchor_in_ms: Option<u64>,
    /// Dentro do expediente — ou sem expediente configurado.
    pub in_workday: bool,
    /// Tempo até este resultado mudar (uma rotina começar ou acabar, o
    /// expediente abrir ou fechar, o dia virar).
    pub next_change_in_ms: u64,
}

impl Horizon {
    /// Sem rotinas nem expediente: o timer se comporta como se nada disto existisse.
    pub const FREE: Self = Self {
        routine: None,
        anchor_in_ms: None,
        in_workday: true,
        next_change_in_ms: u64::MAX,
    };
}

/// Calcula o [`Horizon`] de `now`. `skipped(id)` diz se a rotina foi pulada hoje.
pub fn horizon(
    now: LocalTime,
    routines: &[Routine],
    workday: WorkdaySettings,
    skipped: impl Fn(i64) -> bool,
) -> Horizon {
    let t = now.ms_of_day;
    let ms = |minute: u32| i64::from(minute) * MS_PER_MINUTE;
    let until = |instant: i64| u64::try_from(instant - t).unwrap_or(0);

    let mut routine = None;
    let mut anchor: Option<i64> = None;
    // O dia virar sempre muda o resultado: as rotinas dependem do dia da semana.
    let mut next_change = MS_PER_DAY;
    let mut note_change = |instant: i64| {
        if instant > t {
            next_change = next_change.min(instant);
        }
    };

    for item in routines {
        if !item.enabled || item.weekdays & now.weekday_bit == 0 || skipped(item.id) {
            continue;
        }
        let (start, end) = (ms(item.start_minute), ms(item.end_minute()));
        note_change(start);
        note_change(end);
        if (start..end).contains(&t) {
            routine = Some(ActiveRoutine {
                id: item.id,
                remaining_ms: until(end),
            });
        } else if start > t {
            anchor = Some(anchor.map_or(start, |nearest| nearest.min(start)));
        }
    }

    let mut in_workday = true;
    if workday.enabled {
        let (start, end) = (ms(workday.start_minute), ms(workday.end_minute));
        note_change(start);
        note_change(end);
        in_workday = (start..end).contains(&t);
        if in_workday {
            anchor = Some(anchor.map_or(end, |nearest| nearest.min(end)));
        }
    }

    Horizon {
        routine,
        anchor_in_ms: anchor.map(until),
        in_workday,
        next_change_in_ms: until(next_change),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const MONDAY: u8 = 0b000_0001;
    const SATURDAY: u8 = 0b010_0000;
    const WEEKDAYS: u8 = 0b001_1111;

    fn routine(id: i64, start: (u32, u32), duration_minutes: u32, weekdays: u8) -> Routine {
        Routine {
            id,
            name: format!("Rotina {id}"),
            start_minute: start.0 * 60 + start.1,
            duration_minutes,
            weekdays,
            enabled: true,
        }
    }

    fn at(weekday_bit: u8, hour: i64, minute: i64) -> LocalTime {
        LocalTime {
            day: 20_000,
            weekday_bit,
            ms_of_day: (hour * 60 + minute) * MS_PER_MINUTE,
        }
    }

    const NO_WORKDAY: WorkdaySettings = WorkdaySettings {
        enabled: false,
        start_minute: 9 * 60,
        end_minute: 18 * 60,
    };
    const NINE_TO_SIX: WorkdaySettings = WorkdaySettings {
        enabled: true,
        ..NO_WORKDAY
    };

    fn minutes(value: u64) -> u64 {
        value * 60_000
    }

    fn input(name: &str, start_minute: u32, duration_minutes: u32, weekdays: u8) -> RoutineInput {
        RoutineInput {
            name: name.to_owned(),
            start_minute,
            duration_minutes,
            weekdays,
            enabled: true,
        }
    }

    fn invalid_field(input: RoutineInput) -> &'static str {
        match input.validated() {
            Err(AppError::Validation { field, .. }) => field,
            other => panic!("esperava erro de validação, obtive {other:?}"),
        }
    }

    #[test]
    fn local_time_splits_day_weekday_and_time() {
        // 1970-01-01 00:00 foi uma quinta-feira.
        let epoch = LocalTime::from_local_ms(0);
        assert_eq!(
            (epoch.day, epoch.weekday_bit, epoch.ms_of_day),
            (0, 0b000_1000, 0)
        );

        // Quatro dias e 10h30 depois: segunda-feira.
        let monday = LocalTime::from_local_ms(4 * MS_PER_DAY + 630 * MS_PER_MINUTE);
        assert_eq!(monday.day, 4);
        assert_eq!(monday.weekday_bit, MONDAY);
        assert_eq!(monday.ms_of_day, 630 * MS_PER_MINUTE);

        // Antes da época (fusos a oeste, datas antigas) também funciona.
        let before = LocalTime::from_local_ms(-1);
        assert_eq!((before.day, before.weekday_bit), (-1, 0b000_0100));
        assert_eq!(before.ms_of_day, MS_PER_DAY - 1);
    }

    #[test]
    fn valid_input_is_trimmed() {
        let routine = input("  Hora do café  ", 615, 15, EVERY_DAY)
            .validated()
            .unwrap();

        assert_eq!(routine.name, "Hora do café");
    }

    #[test]
    fn each_invalid_value_names_its_field() {
        assert_eq!(invalid_field(input("   ", 600, 15, EVERY_DAY)), "name");
        assert_eq!(
            invalid_field(input(&"x".repeat(61), 600, 15, EVERY_DAY)),
            "name"
        );
        assert_eq!(
            invalid_field(input("Café", 1440, 15, EVERY_DAY)),
            "startMinute"
        );
        assert_eq!(
            invalid_field(input("Café", 600, 0, EVERY_DAY)),
            "durationMinutes"
        );
        assert_eq!(
            invalid_field(input("Café", 600, 241, EVERY_DAY)),
            "durationMinutes"
        );
        // Das 23h30 por 45 minutos: passaria da meia-noite.
        assert_eq!(
            invalid_field(input("Ceia", 1410, 45, EVERY_DAY)),
            "durationMinutes"
        );
        assert_eq!(invalid_field(input("Café", 600, 15, 0)), "weekdays");
        assert_eq!(invalid_field(input("Café", 600, 15, 128)), "weekdays");
    }

    #[test]
    fn routines_overlap_only_on_shared_days_and_crossing_times() {
        let coffee = routine(1, (10, 15), 15, WEEKDAYS);

        assert!(coffee.overlaps(&input("Outra", 620, 30, MONDAY)));
        // Encostadas, sem cruzar.
        assert!(!coffee.overlaps(&input("Depois", 630, 30, MONDAY)));
        assert!(!coffee.overlaps(&input("Antes", 600, 15, MONDAY)));
        // Mesmo horário, em outro dia.
        assert!(!coffee.overlaps(&input("Sábado", 615, 15, SATURDAY)));
    }

    #[test]
    fn with_nothing_configured_the_day_is_free() {
        let result = horizon(at(MONDAY, 10, 0), &[], NO_WORKDAY, |_| false);

        assert_eq!(result.routine, None);
        assert_eq!(result.anchor_in_ms, None);
        assert!(result.in_workday);
        // Só a virada do dia.
        assert_eq!(result.next_change_in_ms, minutes(14 * 60));
    }

    #[test]
    fn the_next_routine_of_today_is_the_anchor() {
        let routines = [
            routine(1, (15, 30), 15, EVERY_DAY),
            routine(2, (10, 15), 15, EVERY_DAY),
        ];

        let result = horizon(at(MONDAY, 9, 0), &routines, NO_WORKDAY, |_| false);

        assert_eq!(result.routine, None);
        assert_eq!(result.anchor_in_ms, Some(minutes(75)));
        assert_eq!(result.next_change_in_ms, minutes(75));
    }

    #[test]
    fn a_routine_is_active_from_its_start_up_to_but_not_including_its_end() {
        let routines = [routine(1, (10, 15), 15, EVERY_DAY)];
        let look =
            |hour, minute| horizon(at(MONDAY, hour, minute), &routines, NO_WORKDAY, |_| false);

        assert_eq!(
            look(10, 15).routine,
            Some(ActiveRoutine {
                id: 1,
                remaining_ms: minutes(15)
            })
        );
        assert_eq!(look(10, 29).routine.unwrap().remaining_ms, minutes(1));
        assert_eq!(look(10, 29).next_change_in_ms, minutes(1));
        assert_eq!(look(10, 30).routine, None);
        // Depois dela não sobra âncora hoje.
        assert_eq!(look(10, 30).anchor_in_ms, None);
    }

    #[test]
    fn disabled_skipped_and_other_day_routines_are_ignored() {
        let mut off = routine(1, (10, 15), 15, EVERY_DAY);
        off.enabled = false;
        let routines = [
            off,
            routine(2, (11, 0), 15, SATURDAY),
            routine(3, (12, 0), 60, EVERY_DAY),
        ];

        let result = horizon(at(MONDAY, 10, 20), &routines, NO_WORKDAY, |id| id == 3);

        assert_eq!(result.routine, None);
        assert_eq!(result.anchor_in_ms, None);
    }

    #[test]
    fn during_the_workday_its_end_is_an_anchor() {
        let routines = [routine(1, (15, 30), 15, EVERY_DAY)];
        let look =
            |hour, minute| horizon(at(MONDAY, hour, minute), &routines, NINE_TO_SIX, |_| false);

        // A rotina vem antes do fim do expediente.
        assert_eq!(look(15, 0).anchor_in_ms, Some(minutes(30)));
        // Depois dela, a âncora é o fim do expediente.
        assert_eq!(look(17, 20).anchor_in_ms, Some(minutes(40)));
        assert!(look(17, 20).in_workday);
    }

    #[test]
    fn outside_the_workday_only_routines_are_anchors() {
        let routines = [routine(1, (20, 0), 30, EVERY_DAY)];
        let look =
            |hour, minute| horizon(at(MONDAY, hour, minute), &routines, NINE_TO_SIX, |_| false);

        let early = look(8, 0);
        assert!(!early.in_workday);
        assert_eq!(early.anchor_in_ms, Some(minutes(12 * 60)));
        // O expediente abrir muda o resultado.
        assert_eq!(early.next_change_in_ms, minutes(60));

        let late = look(18, 0);
        assert!(
            !late.in_workday,
            "o fim do expediente já não pertence a ele"
        );
        assert_eq!(late.anchor_in_ms, Some(minutes(120)));
    }
}
