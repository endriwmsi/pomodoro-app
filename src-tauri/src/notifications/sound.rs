//! Sons de conclusão de sessão. São sintetizados em memória — não há arquivo
//! de áudio nem download — e tocados pela API de som do Windows.

use std::sync::OnceLock;

const SAMPLE_RATE: u32 = 22_050;
const AMPLITUDE: f32 = 0.32;

/// Uma nota: frequência em Hz e duração em milissegundos.
type Note = (f32, u32);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Chime {
    /// Fim de um foco: três notas ascendentes.
    FocusEnd,
    /// Fim de uma pausa: duas notas descendentes.
    BreakEnd,
}

impl Chime {
    fn notes(self) -> &'static [Note] {
        match self {
            Self::FocusEnd => &[(659.25, 150), (783.99, 150), (1046.5, 380)],
            Self::BreakEnd => &[(783.99, 170), (587.33, 380)],
        }
    }

    /// WAV do som, sintetizado na primeira vez e mantido até o processo
    /// encerrar (a API de som toca de forma assíncrona a partir desta memória).
    fn wav(self) -> &'static [u8] {
        static FOCUS_END: OnceLock<Vec<u8>> = OnceLock::new();
        static BREAK_END: OnceLock<Vec<u8>> = OnceLock::new();
        let cell = match self {
            Self::FocusEnd => &FOCUS_END,
            Self::BreakEnd => &BREAK_END,
        };
        cell.get_or_init(|| synthesize(self.notes()))
    }
}

/// Gera um WAV PCM mono de 16 bits com as notas em sequência. Cada nota é uma
/// senoide com ataque curto e decaimento exponencial, para soar como um sino
/// suave e não estalar nas emendas.
fn synthesize(notes: &[Note]) -> Vec<u8> {
    let mut samples: Vec<i16> = Vec::new();
    for &(frequency, duration_ms) in notes {
        let count = (SAMPLE_RATE * duration_ms / 1_000) as usize;
        for index in 0..count {
            let time = index as f32 / SAMPLE_RATE as f32;
            let progress = index as f32 / count as f32;
            let attack = (time / 0.006).min(1.0);
            let decay = (-4.0 * progress).exp() * (1.0 - progress);
            let wave = (std::f32::consts::TAU * frequency * time).sin();
            samples.push((wave * attack * decay * AMPLITUDE * f32::from(i16::MAX)) as i16);
        }
    }

    let data_len = (samples.len() * 2) as u32;
    let mut wav = Vec::with_capacity(44 + data_len as usize);
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_len).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes()); // tamanho do bloco fmt
    wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
    wav.extend_from_slice(&1u16.to_le_bytes()); // mono
    wav.extend_from_slice(&SAMPLE_RATE.to_le_bytes());
    wav.extend_from_slice(&(SAMPLE_RATE * 2).to_le_bytes()); // bytes por segundo
    wav.extend_from_slice(&2u16.to_le_bytes()); // bytes por amostra
    wav.extend_from_slice(&16u16.to_le_bytes()); // bits por amostra
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    for sample in samples {
        wav.extend_from_slice(&sample.to_le_bytes());
    }
    wav
}

/// Toca o som sem bloquear. Devolve `false` se o sistema recusou (por exemplo,
/// sem dispositivo de áudio); isso nunca é tratado como erro do timer.
#[cfg(windows)]
pub fn play(chime: Chime) -> bool {
    use windows_sys::Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_MEMORY, SND_NODEFAULT};

    let wav = chime.wav();
    // SAFETY: com SND_MEMORY, o primeiro argumento é um ponteiro para um WAV
    // completo em memória. `wav` é 'static (vive em um OnceLock), então
    // continua válido enquanto o som toca de forma assíncrona.
    let played = unsafe {
        PlaySoundW(
            wav.as_ptr().cast(),
            std::ptr::null_mut(),
            SND_MEMORY | SND_ASYNC | SND_NODEFAULT,
        )
    };
    played != 0
}

#[cfg(not(windows))]
pub fn play(_chime: Chime) -> bool {
    false
}

#[cfg(test)]
mod tests {
    use super::*;

    fn u32_at(bytes: &[u8], offset: usize) -> u32 {
        u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap())
    }

    #[test]
    fn the_wav_header_describes_the_data_that_follows() {
        let wav = synthesize(&[(440.0, 100), (880.0, 200)]);

        let expected_samples = (SAMPLE_RATE * 100 / 1_000 + SAMPLE_RATE * 200 / 1_000) as usize;
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[8..16], b"WAVEfmt ");
        assert_eq!(u32_at(&wav, 24), SAMPLE_RATE);
        assert_eq!(&wav[36..40], b"data");
        assert_eq!(u32_at(&wav, 40) as usize, expected_samples * 2);
        assert_eq!(wav.len(), 44 + expected_samples * 2);
        assert_eq!(u32_at(&wav, 4) as usize, wav.len() - 8);
    }

    #[test]
    fn the_sound_is_audible_but_never_clips_and_ends_in_silence() {
        for chime in [Chime::FocusEnd, Chime::BreakEnd] {
            let wav = chime.wav();
            let samples: Vec<i16> = wav[44..]
                .chunks_exact(2)
                .map(|pair| i16::from_le_bytes([pair[0], pair[1]]))
                .collect();

            let peak = samples.iter().map(|s| s.unsigned_abs()).max().unwrap();
            assert!(peak > 3_000, "{chime:?} está quase mudo (pico {peak})");
            assert!(peak < 14_000, "{chime:?} está alto demais (pico {peak})");
            assert!(samples.last().unwrap().unsigned_abs() < 200);
        }
    }

    #[test]
    fn the_two_chimes_are_different_sounds() {
        assert_ne!(Chime::FocusEnd.wav(), Chime::BreakEnd.wav());
    }
}
