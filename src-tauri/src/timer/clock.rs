//! Fontes de tempo da engine. Ver `docs/TIMER_ENGINE.md` ("Tempo").

use std::time::{Instant, SystemTime, UNIX_EPOCH};

/// Leitura simultânea dos dois relógios.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Tick {
    /// Relógio monotônico, em ms desde uma origem arbitrária do processo.
    /// É o único usado para medir tempo decorrido.
    pub mono_ms: u64,
    /// Relógio de calendário, em ms desde a época Unix (UTC). Usado para
    /// carimbar registros e para detectar suspensão; pode saltar.
    pub wall_ms: i64,
}

pub trait Clock: Send + Sync {
    fn now(&self) -> Tick;
}

pub struct SystemClock {
    origin: Instant,
}

impl SystemClock {
    pub fn new() -> Self {
        Self {
            origin: Instant::now(),
        }
    }
}

impl Clock for SystemClock {
    fn now(&self) -> Tick {
        let wall = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|since_epoch| since_epoch.as_millis())
            .unwrap_or(0);
        Tick {
            mono_ms: u64::try_from(self.origin.elapsed().as_millis()).unwrap_or(u64::MAX),
            wall_ms: i64::try_from(wall).unwrap_or(i64::MAX),
        }
    }
}

/// Diferença entre o horário local e o UTC. As rotinas e o expediente são
/// horários locais; o resto do timer usa UTC.
pub trait UtcOffset: Send + Sync {
    /// Quanto somar ao horário UTC para obter o local, em ms.
    fn offset_ms(&self) -> i64;
}

/// O fuso configurado no sistema, com horário de verão.
pub struct SystemUtcOffset;

impl UtcOffset for SystemUtcOffset {
    #[cfg(windows)]
    fn offset_ms(&self) -> i64 {
        use windows_sys::Win32::System::Time::{GetTimeZoneInformation, TIME_ZONE_INFORMATION};

        /// Valores de retorno de `GetTimeZoneInformation`.
        const DAYLIGHT: u32 = 2;
        const INVALID: u32 = u32::MAX;

        // SAFETY: a estrutura é só números e texto UTF-16 de tamanho fixo, para
        // a qual zeros são um valor válido; a função a preenche por inteiro.
        let (state, zone) = unsafe {
            let mut zone: TIME_ZONE_INFORMATION = std::mem::zeroed();
            (GetTimeZoneInformation(&mut zone), zone)
        };
        if state == INVALID {
            return 0;
        }
        // O Windows informa o contrário: quantos minutos somar ao local para dar UTC.
        let bias_minutes = zone.Bias
            + if state == DAYLIGHT {
                zone.DaylightBias
            } else {
                zone.StandardBias
            };
        -i64::from(bias_minutes) * 60_000
    }

    #[cfg(not(windows))]
    fn offset_ms(&self) -> i64 {
        0
    }
}

#[cfg(test)]
pub mod fake {
    use std::sync::Mutex;

    use super::{Clock, Tick, UtcOffset};

    /// Fuso fixo. Com zero, o `FakeClock` começa em uma sexta-feira, às 8h.
    pub struct FixedOffset(pub i64);

    impl UtcOffset for FixedOffset {
        fn offset_ms(&self) -> i64 {
            self.0
        }
    }

    /// Relógio controlado pelos testes: o tempo só passa quando mandado.
    pub struct FakeClock(Mutex<Tick>);

    impl FakeClock {
        pub fn new() -> Self {
            Self(Mutex::new(Tick {
                mono_ms: 1_000,
                wall_ms: 1_800_000_000_000,
            }))
        }

        /// Avança os dois relógios, como no funcionamento normal.
        pub fn advance_ms(&self, ms: u64) {
            let mut tick = self.0.lock().unwrap();
            tick.mono_ms += ms;
            tick.wall_ms += ms as i64;
        }

        pub fn advance_secs(&self, secs: u64) {
            self.advance_ms(secs * 1_000);
        }
    }

    impl Clock for FakeClock {
        fn now(&self) -> Tick {
            *self.0.lock().unwrap()
        }
    }
}
