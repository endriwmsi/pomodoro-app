//! Localização do computador pelo serviço de localização do Windows.

/// Latitude e longitude atuais, ou `None` se o serviço de localização estiver
/// desligado, o acesso for negado ou a leitura demorar demais. Bloqueia por
/// alguns segundos — chame fora da thread principal.
#[cfg(windows)]
pub fn current() -> Option<(f64, f64)> {
    use windows::Devices::Geolocation::{GeolocationAccessStatus, Geolocator};
    use windows::Foundation::TimeSpan;

    /// `TimeSpan` conta em unidades de 100 ns.
    const SECOND: i64 = 10_000_000;

    let read = || -> windows::core::Result<Option<(f64, f64)>> {
        if Geolocator::RequestAccessAsync()?.join()? != GeolocationAccessStatus::Allowed {
            return Ok(None);
        }
        // Aceita uma leitura de até uma hora atrás e desiste após 8 s.
        let position = Geolocator::new()?
            .GetGeopositionAsyncWithAgeAndTimeout(
                TimeSpan {
                    Duration: 3_600 * SECOND,
                },
                TimeSpan {
                    Duration: 8 * SECOND,
                },
            )?
            .join()?;
        let point = position.Coordinate()?.Point()?.Position()?;
        Ok(Some((point.Latitude, point.Longitude)))
    };

    match read() {
        Ok(position) => position,
        Err(error) => {
            eprintln!("localização indisponível: {error}");
            None
        }
    }
}

#[cfg(not(windows))]
pub fn current() -> Option<(f64, f64)> {
    None
}
