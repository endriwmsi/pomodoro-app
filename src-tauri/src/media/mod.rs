//! Controle da mídia em reprodução em outros aplicativos (Spotify, Apple
//! Music, navegadores…), pelo controle de mídia do Windows — o mesmo que
//! alimenta as teclas de mídia do teclado. Ver `docs/MEDIA.md`.
//!
//! Todas as funções bloqueiam por alguns milissegundos em chamadas ao
//! sistema: devem ser chamadas fora da thread principal.

use serde::{Deserialize, Serialize};

use crate::error::AppError;

/// Repetição da reprodução.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Repeat {
    None,
    /// Repete a faixa atual.
    Track,
    /// Repete a lista.
    List,
}

impl Repeat {
    /// Ordem em que o botão de repetição alterna os modos.
    pub fn next(self) -> Self {
        match self {
            Self::None => Self::List,
            Self::List => Self::Track,
            Self::Track => Self::None,
        }
    }
}

/// A que o controle de volume se refere.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum VolumeScope {
    /// Só o aplicativo que está tocando (como no Mixer de volume do Windows).
    App,
    /// O volume geral do sistema — usado quando o aplicativo não foi
    /// encontrado entre as sessões de áudio.
    #[default]
    System,
}

/// Estado da mídia atual. Sem nenhuma sessão de mídia, `available` é `false`
/// e os demais campos vêm vazios.
#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaState {
    pub available: bool,
    pub playing: bool,
    pub title: String,
    pub artist: String,
    /// Identificador do aplicativo de origem (ex.: `Spotify.exe`).
    pub app: String,
    pub can_previous: bool,
    pub can_next: bool,
    pub can_shuffle: bool,
    pub can_repeat: bool,
    /// `None` se o aplicativo não informa.
    pub shuffle: Option<bool>,
    pub repeat: Option<Repeat>,
    /// De 0 a 1; `None` se não houver saída de áudio.
    pub volume: Option<f32>,
    pub volume_scope: VolumeScope,
    /// Posição na faixa e duração dela, em ms; `None` se o aplicativo não informa.
    pub position_ms: Option<u64>,
    pub duration_ms: Option<u64>,
    /// O aplicativo aceita mudar a posição da faixa.
    pub can_seek: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MediaAction {
    PlayPause,
    Next,
    Previous,
    ToggleShuffle,
    /// Alterna: sem repetição → lista → faixa → sem repetição.
    CycleRepeat,
}

/// Capas maiores que isto são ignoradas (o notch mostra uma miniatura).
#[cfg(windows)]
const MAX_ARTWORK_BYTES: u64 = 4 * 1024 * 1024;

/// O processo `process_stem` (nome do executável, sem `.exe`) pertence ao
/// aplicativo de mídia identificado por `app`? O identificador pode ser o
/// próprio executável (`Spotify.exe`), um ID de aplicativo da loja
/// (`SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify`) ou um nome (`Chrome`).
pub fn belongs_to_app(app: &str, process_stem: &str) -> bool {
    let app = app.to_lowercase();
    let stem = process_stem.to_lowercase();
    // Nomes muito curtos casariam com quase tudo.
    stem.len() >= 3 && app.contains(&stem)
}

/// Unidades de 100 ns (a medida de tempo das APIs do Windows) por milissegundo.
const TICKS_PER_MS: i64 = 10_000;

/// Posição atual na faixa, em ms. O aplicativo só publica a posição de vez em
/// quando (`position_ticks`, válida em `updated_ticks`); enquanto toca, o
/// tempo decorrido desde então é somado. Tudo em unidades de 100 ns.
pub fn current_position_ms(
    position_ticks: i64,
    updated_ticks: i64,
    now_ticks: i64,
    duration_ticks: i64,
    playing: bool,
) -> u64 {
    let since_update = now_ticks - updated_ticks;
    // Uma data de atualização ausente ou no futuro não é confiável.
    let advanced = if playing && updated_ticks > 0 && since_update > 0 {
        position_ticks.saturating_add(since_update)
    } else {
        position_ticks
    };
    (advanced.clamp(0, duration_ticks.max(0)) / TICKS_PER_MS) as u64
}

fn failure(context: &str, error: impl std::fmt::Display) -> AppError {
    AppError::Internal {
        message: format!("{context}: {error}"),
    }
}

#[cfg(windows)]
mod platform {
    use base64::Engine;
    use windows::core::{Interface, Result, PWSTR};
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session,
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
    };
    use windows::Media::MediaPlaybackAutoRepeatMode as RepeatMode;
    use windows::Storage::Streams::DataReader;
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
    use windows::Win32::Media::Audio::{
        eMultimedia, eRender, IAudioSessionControl, IAudioSessionControl2, IAudioSessionManager2,
        IMMDevice, IMMDeviceEnumerator, ISimpleAudioVolume, MMDeviceEnumerator,
        DEVICE_STATE_ACTIVE,
    };
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED,
    };
    use windows::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32,
        PROCESS_QUERY_LIMITED_INFORMATION,
    };

    use super::{
        belongs_to_app, current_position_ms, MediaAction, MediaState, Repeat, VolumeScope,
        MAX_ARTWORK_BYTES, TICKS_PER_MS,
    };

    /// A sessão de mídia que o Windows considera a atual, se houver.
    fn current_session() -> Result<Option<Session>> {
        let manager = Manager::RequestAsync()?.join()?;
        // Sem sessão, a chamada devolve um erro "vazio" em vez de um objeto.
        Ok(manager.GetCurrentSession().ok())
    }

    fn repeat_of(session: &Session) -> Option<Repeat> {
        let mode = session
            .GetPlaybackInfo()
            .ok()?
            .AutoRepeatMode()
            .ok()?
            .Value()
            .ok()?;
        Some(match mode {
            RepeatMode::Track => Repeat::Track,
            RepeatMode::List => Repeat::List,
            _ => Repeat::None,
        })
    }

    fn shuffle_of(session: &Session) -> Option<bool> {
        session
            .GetPlaybackInfo()
            .ok()?
            .IsShuffleActive()
            .ok()?
            .Value()
            .ok()
    }

    pub fn state() -> Result<MediaState> {
        let Some(session) = current_session()? else {
            return Ok(MediaState {
                volume: master_volume().ok(),
                ..MediaState::default()
            });
        };
        let app = session.SourceAppUserModelId()?.to_string();
        let properties = session.TryGetMediaPropertiesAsync()?.join()?;
        let playback = session.GetPlaybackInfo()?;
        let playing = playback.PlaybackStatus()? == PlaybackStatus::Playing;
        let (position_ms, duration_ms) = match timeline(&session, playing) {
            Some((position, duration)) => (Some(position), Some(duration)),
            None => (None, None),
        };
        let controls = playback.Controls()?;
        let (volume, volume_scope) = match volume_for(&app) {
            Ok((level, scope)) => (Some(level), scope),
            Err(_) => (None, VolumeScope::System),
        };
        Ok(MediaState {
            available: true,
            playing,
            title: properties.Title()?.to_string(),
            artist: properties.Artist()?.to_string(),
            app,
            can_previous: controls.IsPreviousEnabled()?,
            can_next: controls.IsNextEnabled()?,
            can_shuffle: controls.IsShuffleEnabled()?,
            can_repeat: controls.IsRepeatEnabled()?,
            can_seek: duration_ms.is_some() && controls.IsPlaybackPositionEnabled()?,
            position_ms,
            duration_ms,
            shuffle: shuffle_of(&session),
            repeat: repeat_of(&session),
            volume,
            volume_scope,
        })
    }

    /// Agora, na escala das datas do Windows (100 ns desde 1601).
    fn now_ticks() -> i64 {
        /// Entre 1601 e 1970, a época do Unix.
        const UNIX_EPOCH_TICKS: i64 = 116_444_736_000_000_000;
        let since_unix = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|elapsed| elapsed.as_nanos() / 100)
            .unwrap_or(0);
        UNIX_EPOCH_TICKS + i64::try_from(since_unix).unwrap_or(0)
    }

    /// Posição atual e duração da faixa, em ms, se o aplicativo as publica.
    fn timeline(session: &Session, playing: bool) -> Option<(u64, u64)> {
        let timeline = session.GetTimelineProperties().ok()?;
        let start = timeline.StartTime().ok()?.Duration;
        let duration = timeline.EndTime().ok()?.Duration - start;
        if duration <= 0 {
            return None;
        }
        let position = current_position_ms(
            timeline.Position().ok()?.Duration - start,
            timeline.LastUpdatedTime().ok()?.UniversalTime,
            now_ticks(),
            duration,
            playing,
        );
        Some((position, (duration / TICKS_PER_MS) as u64))
    }

    /// Leva a faixa para `position_ms`. `false` se não havia sessão ou se o
    /// aplicativo recusou.
    pub fn seek(position_ms: u64) -> Result<bool> {
        let Some(session) = current_session()? else {
            return Ok(false);
        };
        let start = session.GetTimelineProperties()?.StartTime()?.Duration;
        let target =
            start + i64::try_from(position_ms).unwrap_or(i64::MAX / TICKS_PER_MS) * TICKS_PER_MS;
        session.TryChangePlaybackPositionAsync(target)?.join()
    }

    /// Devolve `false` se não havia sessão ou se o aplicativo recusou.
    pub fn act(action: MediaAction) -> Result<bool> {
        let Some(session) = current_session()? else {
            return Ok(false);
        };
        match action {
            MediaAction::PlayPause => session.TryTogglePlayPauseAsync()?.join(),
            MediaAction::Next => session.TrySkipNextAsync()?.join(),
            MediaAction::Previous => session.TrySkipPreviousAsync()?.join(),
            MediaAction::ToggleShuffle => {
                let active = shuffle_of(&session).unwrap_or(false);
                session.TryChangeShuffleActiveAsync(!active)?.join()
            }
            MediaAction::CycleRepeat => {
                let mode = match repeat_of(&session).unwrap_or(Repeat::None).next() {
                    Repeat::None => RepeatMode::None,
                    Repeat::Track => RepeatMode::Track,
                    Repeat::List => RepeatMode::List,
                };
                session.TryChangeAutoRepeatModeAsync(mode)?.join()
            }
        }
    }

    /// Capa da mídia atual como `data:` URL, se o aplicativo a publicar.
    pub fn artwork() -> Result<Option<String>> {
        let Some(session) = current_session()? else {
            return Ok(None);
        };
        let properties = session.TryGetMediaPropertiesAsync()?.join()?;
        let Ok(thumbnail) = properties.Thumbnail() else {
            return Ok(None);
        };
        let stream = thumbnail.OpenReadAsync()?.join()?;
        let size = stream.Size()?;
        if size == 0 || size > MAX_ARTWORK_BYTES {
            return Ok(None);
        }
        let reader = DataReader::CreateDataReader(&stream)?;
        reader.LoadAsync(size as u32)?.join()?;
        let mut bytes = vec![0u8; size as usize];
        reader.ReadBytes(&mut bytes)?;

        let content_type = stream.ContentType()?.to_string();
        let content_type = if content_type.starts_with("image/") {
            content_type
        } else {
            "image/png".to_owned()
        };
        Ok(Some(format!(
            "data:{content_type};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        )))
    }

    /// Saída de áudio padrão.
    fn default_output() -> Result<IMMDevice> {
        // SAFETY: chamadas COM comuns. `CoInitializeEx` pode ser repetida na
        // mesma thread (devolve S_FALSE); os ponteiros de interface são
        // gerenciados pelos tipos do crate `windows`, que os liberam no Drop.
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            enumerator.GetDefaultAudioEndpoint(eRender, eMultimedia)
        }
    }

    fn endpoint_volume() -> Result<IAudioEndpointVolume> {
        let device = default_output()?;
        // SAFETY: `device` é uma interface COM válida, recém-obtida.
        unsafe { device.Activate::<IAudioEndpointVolume>(CLSCTX_ALL, None) }
    }

    fn master_volume() -> Result<f32> {
        let endpoint = endpoint_volume()?;
        // SAFETY: `endpoint` é uma interface COM válida, recém-obtida.
        unsafe { endpoint.GetMasterVolumeLevelScalar() }
    }

    /// Nome do executável de um processo, sem a extensão.
    fn process_stem(pid: u32) -> Option<String> {
        let mut buffer = [0u16; 512];
        let mut length = buffer.len() as u32;
        // SAFETY: o handle é fechado logo após o uso; o buffer e seu tamanho
        // são passados de forma consistente e a função escreve no máximo
        // `length` unidades, devolvendo em `length` quantas escreveu.
        let written = unsafe {
            let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid).ok()?;
            let result = QueryFullProcessImageNameW(
                handle,
                PROCESS_NAME_WIN32,
                PWSTR(buffer.as_mut_ptr()),
                &mut length,
            );
            let _ = CloseHandle(handle);
            result.ok()?;
            length as usize
        };
        let path = String::from_utf16_lossy(&buffer[..written]);
        std::path::Path::new(&path)
            .file_stem()
            .map(|stem| stem.to_string_lossy().into_owned())
    }

    /// Todas as saídas de áudio ativas. O aplicativo de mídia pode estar
    /// tocando em uma que não é a padrão (fones escolhidos no próprio player).
    fn active_outputs() -> Result<Vec<IMMDevice>> {
        // SAFETY: como em `default_output`; cada índice pedido está abaixo de
        // `GetCount`.
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let devices = enumerator.EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE)?;
            (0..devices.GetCount()?)
                .map(|index| devices.Item(index))
                .collect()
        }
    }

    /// Percorre as sessões de áudio de todas as saídas ativas, entregando a
    /// `visit` o controle de cada uma e o ID do processo dono.
    fn for_each_audio_session(mut visit: impl FnMut(&IAudioSessionControl, u32)) -> Result<()> {
        for device in active_outputs()? {
            // SAFETY: interfaces COM válidas, obtidas nesta função; cada
            // índice pedido está abaixo de `GetCount`.
            unsafe {
                let Ok(manager) = device.Activate::<IAudioSessionManager2>(CLSCTX_ALL, None) else {
                    continue;
                };
                let sessions = manager.GetSessionEnumerator()?;
                for index in 0..sessions.GetCount()? {
                    let Ok(control) = sessions.GetSession(index) else {
                        continue;
                    };
                    let Ok(pid) = control
                        .cast::<IAudioSessionControl2>()
                        .and_then(|details| details.GetProcessId())
                    else {
                        continue;
                    };
                    visit(&control, pid);
                }
            }
        }
        Ok(())
    }

    /// Controles de volume das sessões de áudio que pertencem ao aplicativo
    /// de mídia `app` (um navegador, por exemplo, costuma ter várias).
    fn app_volumes(app: &str) -> Result<Vec<ISimpleAudioVolume>> {
        let mut volumes = Vec::new();
        for_each_audio_session(|control, pid| {
            if process_stem(pid).is_some_and(|stem| belongs_to_app(app, &stem)) {
                if let Ok(volume) = control.cast::<ISimpleAudioVolume>() {
                    volumes.push(volume);
                }
            }
        })?;
        Ok(volumes)
    }

    /// Processos com sessão de áudio em alguma saída (diagnóstico dos testes).
    #[cfg(test)]
    pub fn audio_processes() -> Result<Vec<(u32, Option<String>)>> {
        let mut found = Vec::new();
        for_each_audio_session(|_, pid| found.push((pid, process_stem(pid))))?;
        Ok(found)
    }

    /// Volume do aplicativo `app`; se ele não tiver sessão de áudio
    /// reconhecível, o volume geral do sistema.
    fn volume_for(app: &str) -> Result<(f32, VolumeScope)> {
        if let Some(first) = app_volumes(app)?.first() {
            // SAFETY: interface COM válida, recém-obtida.
            return Ok((unsafe { first.GetMasterVolume()? }, VolumeScope::App));
        }
        Ok((master_volume()?, VolumeScope::System))
    }

    /// Ajusta o volume do aplicativo da sessão de mídia atual; sem sessão de
    /// áudio correspondente, ajusta o volume geral.
    pub fn set_volume(level: f32) -> Result<()> {
        let app = match current_session()? {
            Some(session) => session.SourceAppUserModelId()?.to_string(),
            None => String::new(),
        };
        let volumes = if app.is_empty() {
            Vec::new()
        } else {
            app_volumes(&app)?
        };
        if volumes.is_empty() {
            let endpoint = endpoint_volume()?;
            // SAFETY: interface válida; o contexto de evento nulo é permitido.
            return unsafe { endpoint.SetMasterVolumeLevelScalar(level, std::ptr::null()) };
        }
        for volume in volumes {
            // SAFETY: idem.
            unsafe { volume.SetMasterVolume(level, std::ptr::null())? };
        }
        Ok(())
    }
}

#[cfg(windows)]
pub fn state() -> Result<MediaState, AppError> {
    platform::state().map_err(|error| failure("falha ao consultar a mídia", error))
}

#[cfg(windows)]
pub fn act(action: MediaAction) -> Result<MediaState, AppError> {
    platform::act(action).map_err(|error| failure("falha ao controlar a mídia", error))?;
    state()
}

#[cfg(windows)]
pub fn artwork() -> Result<Option<String>, AppError> {
    platform::artwork().map_err(|error| failure("falha ao obter a capa", error))
}

/// Ajusta o volume (0 a 1) do aplicativo que está tocando ou, se ele não for
/// encontrado entre as sessões de áudio, o volume geral do sistema.
#[cfg(windows)]
pub fn set_volume(level: f32) -> Result<MediaState, AppError> {
    if !(0.0..=1.0).contains(&level) {
        return Err(AppError::validation(
            "level",
            "O volume deve ficar entre 0 e 1.",
        ));
    }
    platform::set_volume(level).map_err(|error| failure("falha ao ajustar o volume", error))?;
    state()
}

/// Leva a faixa atual para `position_ms`.
#[cfg(windows)]
pub fn seek(position_ms: u64) -> Result<MediaState, AppError> {
    let accepted =
        platform::seek(position_ms).map_err(|error| failure("falha ao mudar a posição", error))?;
    let mut state = state()?;
    // O aplicativo aceitou, mas costuma demorar a publicar a nova posição:
    // até lá, vale a que foi pedida.
    if let (true, Some(duration)) = (accepted, state.duration_ms) {
        state.position_ms = Some(position_ms.min(duration));
    }
    Ok(state)
}

#[cfg(not(windows))]
pub fn seek(_position_ms: u64) -> Result<MediaState, AppError> {
    state()
}

#[cfg(not(windows))]
pub fn state() -> Result<MediaState, AppError> {
    Ok(MediaState::default())
}

#[cfg(not(windows))]
pub fn act(_action: MediaAction) -> Result<MediaState, AppError> {
    state()
}

#[cfg(not(windows))]
pub fn artwork() -> Result<Option<String>, AppError> {
    Ok(None)
}

#[cfg(not(windows))]
pub fn set_volume(_level: f32) -> Result<MediaState, AppError> {
    Err(failure("volume", "indisponível nesta plataforma"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_state_serializes_with_the_frontend_contract() {
        let state = MediaState {
            available: true,
            playing: true,
            title: "Faixa".into(),
            artist: "Artista".into(),
            app: "Spotify.exe".into(),
            can_previous: false,
            can_next: true,
            can_shuffle: true,
            can_repeat: true,
            shuffle: Some(false),
            repeat: Some(Repeat::List),
            volume: Some(0.5),
            volume_scope: VolumeScope::App,
            position_ms: Some(42_000),
            duration_ms: Some(195_000),
            can_seek: true,
        };

        assert_eq!(
            serde_json::to_value(&state).unwrap(),
            serde_json::json!({
                "available": true,
                "playing": true,
                "title": "Faixa",
                "artist": "Artista",
                "app": "Spotify.exe",
                "canPrevious": false,
                "canNext": true,
                "canShuffle": true,
                "canRepeat": true,
                "shuffle": false,
                "repeat": "list",
                "volume": 0.5,
                "volumeScope": "app",
                "positionMs": 42_000,
                "durationMs": 195_000,
                "canSeek": true
            })
        );
    }

    #[test]
    fn actions_deserialize_from_the_frontend_names() {
        let parse = |text: &str| serde_json::from_str::<MediaAction>(text).unwrap();

        assert_eq!(parse(r#""playPause""#), MediaAction::PlayPause);
        assert_eq!(parse(r#""next""#), MediaAction::Next);
        assert_eq!(parse(r#""previous""#), MediaAction::Previous);
        assert_eq!(parse(r#""toggleShuffle""#), MediaAction::ToggleShuffle);
        assert_eq!(parse(r#""cycleRepeat""#), MediaAction::CycleRepeat);
    }

    #[test]
    fn the_position_advances_while_playing_and_stays_put_while_paused() {
        const SECOND: i64 = 10_000_000;
        let duration = 200 * SECOND;

        // Publicada aos 30 s, há 12 s.
        assert_eq!(
            current_position_ms(30 * SECOND, 1_000 * SECOND, 1_012 * SECOND, duration, true),
            42_000
        );
        assert_eq!(
            current_position_ms(30 * SECOND, 1_000 * SECOND, 1_012 * SECOND, duration, false),
            30_000
        );
        // Nunca passa do fim nem fica negativa.
        assert_eq!(
            current_position_ms(190 * SECOND, 1_000 * SECOND, 1_060 * SECOND, duration, true),
            200_000
        );
        assert_eq!(current_position_ms(-5 * SECOND, 0, 0, duration, false), 0);
        // Sem data de atualização confiável, vale a posição publicada.
        assert_eq!(
            current_position_ms(30 * SECOND, 0, 1_012 * SECOND, duration, true),
            30_000
        );
        assert_eq!(
            current_position_ms(30 * SECOND, 2_000 * SECOND, 1_012 * SECOND, duration, true),
            30_000
        );
    }

    #[test]
    fn repeat_cycles_through_list_and_track_back_to_none() {
        assert_eq!(Repeat::None.next(), Repeat::List);
        assert_eq!(Repeat::List.next(), Repeat::Track);
        assert_eq!(Repeat::Track.next(), Repeat::None);
    }

    #[test]
    fn audio_processes_are_matched_to_the_media_app() {
        assert!(belongs_to_app("Spotify.exe", "Spotify"));
        assert!(belongs_to_app(
            "SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify",
            "Spotify"
        ));
        assert!(belongs_to_app("Chrome", "chrome"));
        assert!(belongs_to_app("MSEdge", "msedge"));
        assert!(belongs_to_app(
            "AppleInc.AppleMusicWin_nzyj5cx40ttqa!App",
            "AppleMusic"
        ));

        assert!(!belongs_to_app("Spotify.exe", "chrome"));
        assert!(!belongs_to_app("Chrome", "firefox"));
        assert!(!belongs_to_app("Spotify.exe", "sp"), "nome curto demais");
        assert!(!belongs_to_app("", "spotify"));
    }

    #[cfg(windows)]
    #[test]
    fn a_volume_outside_the_range_is_rejected_before_touching_the_system() {
        for level in [-0.1, 1.5, f32::NAN] {
            assert!(matches!(
                set_volume(level),
                Err(AppError::Validation { field: "level", .. })
            ));
        }
    }

    /// Consulta de verdade o controle de mídia do Windows: o resultado depende
    /// do que estiver tocando, então só se exige que a chamada não falhe e
    /// que o estado seja coerente.
    #[cfg(windows)]
    #[test]
    fn querying_the_system_media_session_does_not_fail() {
        let state = state().unwrap();
        eprintln!("estado da mídia: {state:?}");
        eprintln!("sessões de áudio: {:?}", platform::audio_processes());

        if !state.available {
            assert!(!state.playing);
            assert!(state.title.is_empty());
            assert_eq!(state.volume_scope, VolumeScope::System);
        }
        if let (Some(position), Some(duration)) = (state.position_ms, state.duration_ms) {
            assert!(position <= duration);
        }
        if let Some(volume) = state.volume {
            assert!((0.0..=1.0).contains(&volume));
        }
        // A capa pode existir ou não; a chamada não pode falhar.
        artwork().unwrap();
    }
}
