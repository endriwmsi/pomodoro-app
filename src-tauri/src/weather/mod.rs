//! Previsão do tempo para a aba de clima do notch.
//!
//! É a única funcionalidade do aplicativo que usa a internet. Fica desligada
//! por padrão e nada aqui é chamado sem `weather.enabled`. Ver
//! `docs/WEATHER.md` e `docs/decisions/ADR-004-NETWORK-FEATURES.md`.

pub mod location;

use std::sync::{Mutex, PoisonError};
use std::time::Duration;

use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::settings::WeatherSettings;
use crate::timer::clock::Clock;

/// Intervalo mínimo entre duas consultas ao provedor.
pub const REFRESH_INTERVAL_MS: u64 = 15 * 60 * 1_000;

const FORECAST_DAYS: usize = 4;
/// Horas de previsão pedidas, a partir da hora atual.
const FORECAST_HOURS: usize = 12;
const HTTP_TIMEOUT: Duration = Duration::from_secs(10);

/// Enviado em toda requisição: o serviço de nomes de lugares exige que o
/// aplicativo se identifique.
const USER_AGENT: &str = concat!("Compasso/", env!("CARGO_PKG_VERSION"), " (desktop)");

/// Capitais dos estados e do Distrito Federal: cidade, UF, latitude e longitude.
const STATE_CAPITALS: [(&str, &str, f64, f64); 27] = [
    ("Rio Branco", "AC", -9.97, -67.81),
    ("Maceió", "AL", -9.67, -35.74),
    ("Macapá", "AP", 0.03, -51.07),
    ("Manaus", "AM", -3.12, -60.02),
    ("Salvador", "BA", -12.97, -38.50),
    ("Fortaleza", "CE", -3.73, -38.52),
    ("Brasília", "DF", -15.79, -47.88),
    ("Vitória", "ES", -20.32, -40.34),
    ("Goiânia", "GO", -16.69, -49.26),
    ("São Luís", "MA", -2.53, -44.30),
    ("Cuiabá", "MT", -15.60, -56.10),
    ("Campo Grande", "MS", -20.44, -54.65),
    ("Belo Horizonte", "MG", -19.92, -43.94),
    ("Belém", "PA", -1.46, -48.50),
    ("João Pessoa", "PB", -7.12, -34.86),
    ("Curitiba", "PR", -25.43, -49.27),
    ("Recife", "PE", -8.05, -34.88),
    ("Teresina", "PI", -5.09, -42.80),
    ("Rio de Janeiro", "RJ", -22.91, -43.17),
    ("Natal", "RN", -5.79, -35.21),
    ("Porto Alegre", "RS", -30.03, -51.23),
    ("Porto Velho", "RO", -8.76, -63.90),
    ("Boa Vista", "RR", 2.82, -60.67),
    ("Florianópolis", "SC", -27.60, -48.55),
    ("São Paulo", "SP", -23.55, -46.63),
    ("Aracaju", "SE", -10.91, -37.07),
    ("Palmas", "TO", -10.18, -48.33),
];

/// Maior capital de cada região do Brasil, mostradas quando a localização do
/// usuário não está disponível ou não foi autorizada.
const REGIONAL_CAPITALS: [&str; 5] = ["São Paulo", "Fortaleza", "Brasília", "Manaus", "Curitiba"];

const COUNTRY: &str = "Brasil";

const LOCATION_NAME: &str = "Sua localização";
/// Até que distância de uma capital a localização é descrita por ela.
const NEARBY_KM: f64 = 100.0;

/// Distância em km entre dois pontos `(latitude, longitude)`, pelo círculo máximo.
pub fn distance_km(a: (f64, f64), b: (f64, f64)) -> f64 {
    const EARTH_RADIUS_KM: f64 = 6_371.0;
    let (lat_a, lat_b) = (a.0.to_radians(), b.0.to_radians());
    let half_lat = (lat_b - lat_a) / 2.0;
    let half_lon = (b.1 - a.1).to_radians() / 2.0;
    let h = half_lat.sin().powi(2) + lat_a.cos() * lat_b.cos() * half_lon.sin().powi(2);
    2.0 * EARTH_RADIUS_KM * h.sqrt().asin()
}

/// Como um lugar é apresentado: o nome em destaque e, menor, onde ele fica.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PlaceName {
    /// A cidade.
    pub name: String,
    /// Estado e país; vazio se não se sabe.
    pub detail: String,
}

fn capital_name(city: &str, state: &str) -> PlaceName {
    PlaceName {
        name: city.to_owned(),
        detail: format!("{state}, {COUNTRY}"),
    }
}

/// Nome da localização do computador quando o serviço de nomes não responde:
/// perto de uma capital, ela serve de referência; longe, um nome genérico.
pub fn location_name(point: (f64, f64)) -> PlaceName {
    STATE_CAPITALS
        .iter()
        .map(|(city, state, lat, lon)| (*city, *state, distance_km(point, (*lat, *lon))))
        .filter(|(_, _, distance)| *distance <= NEARBY_KM)
        .min_by(|a, b| a.2.total_cmp(&b.2))
        .map_or_else(
            || PlaceName {
                name: LOCATION_NAME.to_owned(),
                detail: String::new(),
            },
            |(city, state, _)| capital_name(&format!("Região de {city}"), state),
        )
}

/// URL da consulta do nome do lugar em `point` (latitude, longitude), ao
/// Nominatim (OpenStreetMap). As coordenadas vão arredondadas como as da
/// previsão; `zoom=10` pede a cidade, não a rua.
pub fn place_name_url(point: (f64, f64)) -> String {
    format!(
        "https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat={:.2}&lon={:.2}\
         &zoom=10&addressdetails=1&accept-language=pt-BR",
        point.0, point.1
    )
}

#[derive(Deserialize)]
struct ApiPlaceName {
    address: ApiAddress,
}

#[derive(Deserialize)]
struct ApiAddress {
    city: Option<String>,
    town: Option<String>,
    village: Option<String>,
    municipality: Option<String>,
    state: Option<String>,
    country: Option<String>,
}

/// Interpreta a resposta do serviço de nomes. `None` se ela não traz uma cidade.
pub fn parse_place_name(json: &str) -> Option<PlaceName> {
    let ApiAddress {
        city,
        town,
        village,
        municipality,
        state,
        country,
    } = serde_json::from_str::<ApiPlaceName>(json).ok()?.address;
    let filled = |text: Option<String>| text.filter(|text| !text.trim().is_empty());
    let name = [city, town, village, municipality]
        .into_iter()
        .find_map(filled)?;
    let detail = [state, country]
        .into_iter()
        .filter_map(filled)
        .collect::<Vec<_>>()
        .join(", ");
    Some(PlaceName { name, detail })
}

/// Condição do tempo, simplificada a partir dos códigos WMO do provedor.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Condition {
    Clear,
    PartlyCloudy,
    Cloudy,
    Fog,
    Drizzle,
    Rain,
    Snow,
    Thunderstorm,
}

/// Traduz um código WMO (o `weather_code` do Open-Meteo).
pub fn condition(code: u32) -> Condition {
    match code {
        0 => Condition::Clear,
        1 | 2 => Condition::PartlyCloudy,
        45 | 48 => Condition::Fog,
        51..=57 => Condition::Drizzle,
        61..=67 | 80..=82 => Condition::Rain,
        71..=77 | 85 | 86 => Condition::Snow,
        95..=99 => Condition::Thunderstorm,
        _ => Condition::Cloudy,
    }
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DayForecast {
    /// Data local do lugar, `AAAA-MM-DD`.
    pub date: String,
    pub condition: Condition,
    pub min_c: f64,
    pub max_c: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HourForecast {
    /// Hora local do lugar, `AAAA-MM-DDTHH:MM`.
    pub time: String,
    pub condition: Condition,
    pub temperature_c: f64,
    /// É noite nessa hora (para escolher o ícone).
    pub night: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Place {
    pub name: String,
    /// Estado e país do lugar; vazio se não se sabe.
    pub detail: String,
    pub temperature_c: f64,
    pub condition: Condition,
    /// É noite agora no lugar.
    pub night: bool,
    pub wind_kmh: f64,
    pub humidity_percent: f64,
    /// A hora atual e as seguintes.
    pub hourly: Vec<HourForecast>,
    /// Hoje e os dias seguintes.
    pub daily: Vec<DayForecast>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Source {
    /// A localização do computador.
    Location,
    /// A lista fixa de capitais.
    Capitals,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherReport {
    pub source: Source,
    pub places: Vec<Place>,
    /// Há quanto tempo, em ms, os dados foram obtidos do provedor.
    pub age_ms: u64,
    /// `true` se a última tentativa de atualizar falhou e estes são dados antigos.
    pub stale: bool,
}

// Formato da resposta do Open-Meteo (apenas o que é usado).
#[derive(Deserialize)]
struct ApiPlace {
    current: ApiCurrent,
    hourly: ApiHourly,
    daily: ApiDaily,
}

#[derive(Deserialize)]
struct ApiCurrent {
    temperature_2m: f64,
    weather_code: u32,
    wind_speed_10m: f64,
    relative_humidity_2m: f64,
    /// 1 de dia, 0 à noite.
    is_day: u8,
}

#[derive(Deserialize)]
struct ApiHourly {
    time: Vec<String>,
    temperature_2m: Vec<f64>,
    weather_code: Vec<u32>,
    is_day: Vec<u8>,
}

#[derive(Deserialize)]
struct ApiDaily {
    time: Vec<String>,
    weather_code: Vec<u32>,
    temperature_2m_max: Vec<f64>,
    temperature_2m_min: Vec<f64>,
}

/// O provedor devolve um objeto para um ponto e uma lista para vários.
#[derive(Deserialize)]
#[serde(untagged)]
enum ApiResponse {
    Many(Vec<ApiPlace>),
    One(ApiPlace),
}

/// URL da consulta para os pontos `(latitude, longitude)`.
pub fn request_url(points: &[(f64, f64)]) -> String {
    let join = |pick: fn(&(f64, f64)) -> f64| {
        points
            .iter()
            .map(|point| format!("{:.2}", pick(point)))
            .collect::<Vec<_>>()
            .join(",")
    };
    format!(
        "https://api.open-meteo.com/v1/forecast?latitude={}&longitude={}\
         &current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,is_day\
         &hourly=temperature_2m,weather_code,is_day\
         &daily=weather_code,temperature_2m_max,temperature_2m_min\
         &timezone=auto&forecast_days={FORECAST_DAYS}&forecast_hours={FORECAST_HOURS}",
        join(|point| point.0),
        join(|point| point.1),
    )
}

/// Interpreta a resposta do provedor, na mesma ordem dos nomes pedidos.
pub fn parse(json: &str, names: &[PlaceName]) -> Result<Vec<Place>, String> {
    let response: ApiResponse =
        serde_json::from_str(json).map_err(|error| format!("resposta inesperada: {error}"))?;
    let places = match response {
        ApiResponse::Many(places) => places,
        ApiResponse::One(place) => vec![place],
    };
    if places.len() != names.len() {
        return Err(format!(
            "o provedor devolveu {} lugares; eram esperados {}",
            places.len(),
            names.len()
        ));
    }

    places
        .into_iter()
        .zip(names)
        .map(|(place, name)| {
            let ApiDaily {
                time,
                weather_code,
                temperature_2m_max,
                temperature_2m_min,
            } = place.daily;
            let days = time.len();
            if weather_code.len() != days
                || temperature_2m_max.len() != days
                || temperature_2m_min.len() != days
            {
                return Err("previsão diária incompleta".to_owned());
            }
            let hours = place.hourly.time.len();
            if place.hourly.temperature_2m.len() != hours
                || place.hourly.weather_code.len() != hours
                || place.hourly.is_day.len() != hours
            {
                return Err("previsão por hora incompleta".to_owned());
            }
            let hourly = place
                .hourly
                .time
                .into_iter()
                .enumerate()
                .map(|(hour, time)| HourForecast {
                    time,
                    condition: condition(place.hourly.weather_code[hour]),
                    temperature_c: place.hourly.temperature_2m[hour],
                    night: place.hourly.is_day[hour] == 0,
                })
                .collect();
            let daily = time
                .into_iter()
                .enumerate()
                .map(|(day, date)| DayForecast {
                    date,
                    condition: condition(weather_code[day]),
                    min_c: temperature_2m_min[day],
                    max_c: temperature_2m_max[day],
                })
                .collect();
            Ok(Place {
                name: name.name.clone(),
                detail: name.detail.clone(),
                temperature_c: place.current.temperature_2m,
                condition: condition(place.current.weather_code),
                night: place.current.is_day == 0,
                wind_kmh: place.current.wind_speed_10m,
                humidity_percent: place.current.relative_humidity_2m,
                hourly,
                daily,
            })
        })
        .collect()
}

/// Busca o texto de uma URL. Abstraído para os testes não usarem a rede.
pub trait Fetcher: Send + Sync {
    fn get(&self, url: &str) -> Result<String, String>;
}

pub struct HttpFetcher;

impl Fetcher for HttpFetcher {
    fn get(&self, url: &str) -> Result<String, String> {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_global(Some(HTTP_TIMEOUT))
            .build()
            .into();
        agent
            .get(url)
            .header("User-Agent", USER_AGENT)
            .call()
            .map_err(|error| error.to_string())?
            .body_mut()
            .read_to_string()
            .map_err(|error| error.to_string())
    }
}

/// Localização do computador, se o usuário e o sistema permitirem.
pub trait Locator: Send + Sync {
    fn locate(&self) -> Option<(f64, f64)>;
}

pub struct SystemLocator;

impl Locator for SystemLocator {
    fn locate(&self) -> Option<(f64, f64)> {
        location::current()
    }
}

struct Cached {
    /// Para quais preferências os dados foram obtidos.
    use_location: bool,
    fetched_at_mono_ms: u64,
    source: Source,
    places: Vec<Place>,
}

pub struct WeatherService {
    fetcher: Box<dyn Fetcher>,
    locator: Box<dyn Locator>,
    clock: std::sync::Arc<dyn Clock>,
    cache: Mutex<Option<Cached>>,
    /// Nome já obtido para a localização (coordenadas em centésimos de grau):
    /// enquanto o computador não sai do lugar, o serviço de nomes não é consultado de novo.
    named: Mutex<Option<((i64, i64), PlaceName)>>,
}

impl WeatherService {
    pub fn new(
        fetcher: Box<dyn Fetcher>,
        locator: Box<dyn Locator>,
        clock: std::sync::Arc<dyn Clock>,
    ) -> Self {
        Self {
            fetcher,
            locator,
            clock,
            cache: Mutex::new(None),
            named: Mutex::new(None),
        }
    }

    /// A previsão atual. Consulta o provedor no máximo uma vez a cada
    /// [`REFRESH_INTERVAL_MS`]; entre consultas devolve o que está guardado.
    /// Se a consulta falhar e houver dados anteriores, devolve-os como
    /// `stale`. Bloqueia durante a consulta — chame fora da thread principal.
    pub fn report(&self, settings: WeatherSettings) -> Result<WeatherReport, AppError> {
        if !settings.enabled {
            return Err(AppError::validation(
                "weather.enabled",
                "A previsão do tempo está desligada nas Configurações.",
            ));
        }
        let mut cache = self.cache.lock().unwrap_or_else(PoisonError::into_inner);
        let now = self.clock.now().mono_ms;

        // Mudar a preferência de localização invalida o que estava guardado.
        if cache
            .as_ref()
            .is_some_and(|cached| cached.use_location != settings.use_location)
        {
            *cache = None;
        }
        if let Some(cached) = cache.as_ref() {
            let age_ms = now.saturating_sub(cached.fetched_at_mono_ms);
            if age_ms < REFRESH_INTERVAL_MS {
                return Ok(report(cached, age_ms, false));
            }
        }

        match self.fetch(settings.use_location) {
            Ok((source, places)) => {
                let fresh = Cached {
                    use_location: settings.use_location,
                    fetched_at_mono_ms: now,
                    source,
                    places,
                };
                let result = report(&fresh, 0, false);
                *cache = Some(fresh);
                Ok(result)
            }
            Err(message) => match cache.as_ref() {
                Some(cached) => Ok(report(
                    cached,
                    now.saturating_sub(cached.fetched_at_mono_ms),
                    true,
                )),
                None => Err(AppError::Network { message }),
            },
        }
    }

    fn fetch(&self, use_location: bool) -> Result<(Source, Vec<Place>), String> {
        let located = if use_location {
            self.locator.locate()
        } else {
            None
        };
        match located {
            Some(point) => {
                let json = self.fetcher.get(&request_url(&[point]))?;
                Ok((Source::Location, parse(&json, &[self.name_of(point)])?))
            }
            None => {
                let capitals: Vec<&(&str, &str, f64, f64)> = REGIONAL_CAPITALS
                    .iter()
                    .filter_map(|wanted| STATE_CAPITALS.iter().find(|capital| capital.0 == *wanted))
                    .collect();
                let points: Vec<(f64, f64)> = capitals
                    .iter()
                    .map(|(_, _, lat, lon)| (*lat, *lon))
                    .collect();
                let names: Vec<PlaceName> = capitals
                    .iter()
                    .map(|(city, state, _, _)| capital_name(city, state))
                    .collect();
                let json = self.fetcher.get(&request_url(&points))?;
                Ok((Source::Capitals, parse(&json, &names)?))
            }
        }
    }
}

impl WeatherService {
    /// Nome da localização do computador: o do serviço de nomes, guardado
    /// enquanto as coordenadas arredondadas não mudam. Se o serviço falhar,
    /// vale a capital próxima (ou o nome genérico) e tenta-se de novo na
    /// próxima atualização.
    fn name_of(&self, point: (f64, f64)) -> PlaceName {
        let key = (
            (point.0 * 100.0).round() as i64,
            (point.1 * 100.0).round() as i64,
        );
        let mut named = self.named.lock().unwrap_or_else(PoisonError::into_inner);
        if let Some((known, name)) = named.as_ref() {
            if *known == key {
                return name.clone();
            }
        }
        let found = self
            .fetcher
            .get(&place_name_url(point))
            .ok()
            .and_then(|json| parse_place_name(&json));
        match found {
            Some(name) => {
                *named = Some((key, name.clone()));
                name
            }
            None => location_name(point),
        }
    }
}

fn report(cached: &Cached, age_ms: u64, stale: bool) -> WeatherReport {
    WeatherReport {
        source: cached.source,
        places: cached.places.clone(),
        age_ms,
        stale,
    }
}

#[cfg(test)]
mod tests {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;

    use super::*;
    use crate::timer::clock::fake::FakeClock;

    fn place_json(temperature: f64, code: u32) -> String {
        format!(
            r#"{{"latitude":-23.5,"current":{{"time":"2026-10-13T14:15","temperature_2m":{temperature},
                "weather_code":{code},"wind_speed_10m":10.4,"relative_humidity_2m":51,"is_day":1}},
                "hourly":{{"time":["2026-10-13T14:00","2026-10-13T19:00"],"temperature_2m":[27.5,21.0],
                "weather_code":[2,61],"is_day":[1,0]}},
                "daily":{{"time":["2026-10-13","2026-10-14"],"weather_code":[80,3],
                "temperature_2m_max":[28.2,27.5],"temperature_2m_min":[17.4,17.7]}}}}"#
        )
    }

    fn many_json(count: usize) -> String {
        let places: Vec<String> = (0..count).map(|i| place_json(20.0 + i as f64, 0)).collect();
        format!("[{}]", places.join(","))
    }

    /// Provedor falso: registra as URLs pedidas e pode ser posto "fora do ar".
    #[derive(Default)]
    struct FakeFetcher {
        /// Consultas de previsão.
        urls: Mutex<Vec<String>>,
        /// Consultas de nome de lugar, e o que responder a elas (`None`: falha).
        name_urls: Mutex<Vec<String>>,
        name_response: Mutex<Option<String>>,
        offline: AtomicBool,
    }

    const CAMPINAS: &str = r#"{"name":"Campinas","address":{"city":"Campinas",
        "state":"São Paulo","country":"Brasil","country_code":"br"}}"#;

    impl Fetcher for Arc<FakeFetcher> {
        fn get(&self, url: &str) -> Result<String, String> {
            let offline = self.offline.load(Ordering::Relaxed);
            if url.contains("nominatim") {
                self.name_urls.lock().unwrap().push(url.to_owned());
                return match self.name_response.lock().unwrap().clone() {
                    Some(json) if !offline => Ok(json),
                    _ => Err("sem resposta".to_owned()),
                };
            }
            self.urls.lock().unwrap().push(url.to_owned());
            if offline {
                return Err("sem conexão".to_owned());
            }
            // Um ponto na URL (sem vírgula na latitude) → objeto; vários → lista.
            let latitudes = url
                .split("latitude=")
                .nth(1)
                .unwrap()
                .split('&')
                .next()
                .unwrap();
            let count = latitudes.split(',').count();
            Ok(if count == 1 {
                place_json(27.9, 95)
            } else {
                many_json(count)
            })
        }
    }

    struct FixedLocator(Option<(f64, f64)>);

    impl Locator for FixedLocator {
        fn locate(&self) -> Option<(f64, f64)> {
            self.0
        }
    }

    struct Harness {
        fetcher: Arc<FakeFetcher>,
        clock: Arc<FakeClock>,
        service: WeatherService,
    }

    fn harness(location: Option<(f64, f64)>) -> Harness {
        let fetcher = Arc::new(FakeFetcher::default());
        let clock = Arc::new(FakeClock::new());
        let service = WeatherService::new(
            Box::new(fetcher.clone()),
            Box::new(FixedLocator(location)),
            clock.clone(),
        );
        Harness {
            fetcher,
            clock,
            service,
        }
    }

    const ON: WeatherSettings = WeatherSettings {
        enabled: true,
        use_location: false,
    };
    const ON_WITH_LOCATION: WeatherSettings = WeatherSettings {
        enabled: true,
        use_location: true,
    };

    fn names(names: &[&str]) -> Vec<PlaceName> {
        names
            .iter()
            .map(|name| PlaceName {
                name: (*name).to_owned(),
                detail: String::new(),
            })
            .collect()
    }

    fn named(name: &str, detail: &str) -> PlaceName {
        PlaceName {
            name: name.to_owned(),
            detail: detail.to_owned(),
        }
    }

    #[test]
    fn distances_follow_the_great_circle() {
        let sao_paulo = (-23.55, -46.63);
        let rio = (-22.91, -43.17);

        assert_eq!(distance_km(sao_paulo, sao_paulo), 0.0);
        // Cerca de 360 km em linha reta.
        let distance = distance_km(sao_paulo, rio);
        assert!((340.0..380.0).contains(&distance), "{distance}");
        assert_eq!(distance, distance_km(rio, sao_paulo));
    }

    #[test]
    fn the_location_is_named_after_a_nearby_capital_only() {
        // Niterói, do outro lado da baía.
        assert_eq!(
            location_name((-22.88, -43.10)),
            named("Região de Rio de Janeiro", "RJ, Brasil")
        );
        // Campinas fica a uns 85 km de São Paulo.
        assert_eq!(
            location_name((-22.91, -47.06)),
            named("Região de São Paulo", "SP, Brasil")
        );
        // Ribeirão Preto está longe de qualquer capital.
        assert_eq!(
            location_name((-21.18, -47.81)),
            named("Sua localização", "")
        );
        // Fora do Brasil.
        assert_eq!(location_name((48.85, 2.35)), named("Sua localização", ""));
    }

    #[test]
    fn every_regional_capital_is_in_the_table() {
        for wanted in REGIONAL_CAPITALS {
            assert!(STATE_CAPITALS.iter().any(|capital| capital.0 == wanted));
        }
    }

    #[test]
    fn the_place_name_request_rounds_coordinates_and_asks_for_the_city() {
        let url = place_name_url((-22.906_8, -47.061_6));

        assert!(url.starts_with("https://nominatim.openstreetmap.org/reverse?"));
        assert!(url.contains("lat=-22.91&lon=-47.06&zoom=10"));
        assert!(url.contains("accept-language=pt-BR"));
    }

    #[test]
    fn place_names_come_from_the_city_or_the_closest_thing_to_one() {
        assert_eq!(
            parse_place_name(CAMPINAS),
            Some(named("Campinas", "São Paulo, Brasil"))
        );
        // Lugares pequenos vêm como vila ou município; o estado pode faltar.
        assert_eq!(
            parse_place_name(r#"{"address":{"village":"Bichinho","country":"Brasil"}}"#),
            Some(named("Bichinho", "Brasil"))
        );
        assert_eq!(
            parse_place_name(r#"{"address":{"city":" ","municipality":"Holambra"}}"#),
            Some(named("Holambra", ""))
        );
        // Sem cidade (alto-mar) ou resposta de erro: não há nome.
        assert_eq!(
            parse_place_name(r#"{"address":{"country":"Brasil"}}"#),
            None
        );
        assert_eq!(parse_place_name(r#"{"error":"Unable to geocode"}"#), None);
        assert_eq!(parse_place_name("<html>"), None);
    }

    #[test]
    fn wmo_codes_map_to_simple_conditions() {
        assert_eq!(condition(0), Condition::Clear);
        assert_eq!(condition(2), Condition::PartlyCloudy);
        assert_eq!(condition(3), Condition::Cloudy);
        assert_eq!(condition(48), Condition::Fog);
        assert_eq!(condition(53), Condition::Drizzle);
        assert_eq!(condition(63), Condition::Rain);
        assert_eq!(condition(81), Condition::Rain);
        assert_eq!(condition(75), Condition::Snow);
        assert_eq!(condition(95), Condition::Thunderstorm);
        assert_eq!(condition(1_000), Condition::Cloudy, "código desconhecido");
    }

    #[test]
    fn the_request_rounds_coordinates_and_asks_only_what_is_shown() {
        let url = request_url(&[(-23.550_52, -46.633_31), (-3.731_86, -38.526_67)]);

        assert!(url.starts_with("https://api.open-meteo.com/v1/forecast?"));
        assert!(url.contains("latitude=-23.55,-3.73&longitude=-46.63,-38.53"));
        assert!(url.contains("forecast_days=4"));
        assert!(url.contains("forecast_hours=12"));
        assert!(url.contains("&hourly=temperature_2m,weather_code,is_day&"));
    }

    #[test]
    fn a_single_place_response_is_parsed() {
        let places = parse(&place_json(27.9, 95), &names(&["Aqui"])).unwrap();

        assert_eq!(places.len(), 1);
        let place = &places[0];
        assert_eq!(place.name, "Aqui");
        assert_eq!(place.temperature_c, 27.9);
        assert_eq!(place.condition, Condition::Thunderstorm);
        assert_eq!(place.wind_kmh, 10.4);
        assert_eq!(place.humidity_percent, 51.0);
        assert!(!place.night);
        assert_eq!(
            place.hourly,
            vec![
                HourForecast {
                    time: "2026-10-13T14:00".into(),
                    condition: Condition::PartlyCloudy,
                    temperature_c: 27.5,
                    night: false,
                },
                HourForecast {
                    time: "2026-10-13T19:00".into(),
                    condition: Condition::Rain,
                    temperature_c: 21.0,
                    night: true,
                },
            ]
        );
        assert_eq!(
            place.daily,
            vec![
                DayForecast {
                    date: "2026-10-13".into(),
                    condition: Condition::Rain,
                    min_c: 17.4,
                    max_c: 28.2,
                },
                DayForecast {
                    date: "2026-10-14".into(),
                    condition: Condition::Cloudy,
                    min_c: 17.7,
                    max_c: 27.5,
                },
            ]
        );
    }

    #[test]
    fn a_multi_place_response_keeps_the_requested_order() {
        let places = parse(&many_json(3), &names(&["A", "B", "C"])).unwrap();

        assert_eq!(
            places
                .iter()
                .map(|place| (place.name.as_str(), place.temperature_c))
                .collect::<Vec<_>>(),
            vec![("A", 20.0), ("B", 21.0), ("C", 22.0)]
        );
    }

    #[test]
    fn malformed_or_mismatched_responses_are_errors() {
        let one = names(&["A"]);
        assert!(parse("<html>erro</html>", &one).is_err());
        assert!(parse(r#"{"reason":"limite excedido","error":true}"#, &one).is_err());
        assert!(parse(&many_json(2), &names(&["A", "B", "C"])).is_err());
        let ragged_days = place_json(20.0, 0).replace("[80,3]", "[80]");
        assert!(parse(&ragged_days, &one).is_err());
        let ragged_hours = place_json(20.0, 0).replace("[1,0]", "[1]");
        assert!(parse(&ragged_hours, &one).is_err());
    }

    #[test]
    fn nothing_is_requested_while_the_feature_is_off() {
        let h = harness(Some((-23.55, -46.63)));

        let result = h.service.report(WeatherSettings {
            enabled: false,
            use_location: true,
        });

        assert!(matches!(
            result,
            Err(AppError::Validation {
                field: "weather.enabled",
                ..
            })
        ));
        assert!(h.fetcher.urls.lock().unwrap().is_empty());
    }

    #[test]
    fn without_location_the_regional_capitals_are_shown() {
        let h = harness(Some((-23.55, -46.63)));

        let report = h.service.report(ON).unwrap();

        assert_eq!(report.source, Source::Capitals);
        assert_eq!(
            report
                .places
                .iter()
                .map(|place| place.name.as_str())
                .collect::<Vec<_>>(),
            vec!["São Paulo", "Fortaleza", "Brasília", "Manaus", "Curitiba"]
        );
        assert!(!report.stale);
    }

    #[test]
    fn with_permission_the_computer_location_is_used() {
        let h = harness(Some((-22.906_8, -43.172_9)));

        let report = h.service.report(ON_WITH_LOCATION).unwrap();

        assert_eq!(report.source, Source::Location);
        assert_eq!(report.places.len(), 1);
        // Sem resposta do serviço de nomes, vale a capital próxima.
        assert_eq!(report.places[0].name, "Região de Rio de Janeiro");
        assert_eq!(report.places[0].detail, "RJ, Brasil");
        assert!(h.fetcher.name_urls.lock().unwrap()[0].contains("lat=-22.91&lon=-43.17"));
        let urls = h.fetcher.urls.lock().unwrap();
        assert!(urls[0].contains("latitude=-22.91&longitude=-43.17"));
    }

    #[test]
    fn the_location_is_named_by_the_place_name_service_once_per_place() {
        let h = harness(Some((-22.906_8, -47.061_6)));
        *h.fetcher.name_response.lock().unwrap() = Some(CAMPINAS.to_owned());

        let report = h.service.report(ON_WITH_LOCATION).unwrap();
        assert_eq!(report.places[0].name, "Campinas");
        assert_eq!(report.places[0].detail, "São Paulo, Brasil");

        // Nas atualizações seguintes, no mesmo lugar, o nome não é pedido de novo.
        h.clock.advance_secs(16 * 60);
        let refreshed = h.service.report(ON_WITH_LOCATION).unwrap();
        assert_eq!(refreshed.places[0].name, "Campinas");
        assert_eq!(h.fetcher.urls.lock().unwrap().len(), 2);
        assert_eq!(h.fetcher.name_urls.lock().unwrap().len(), 1);
    }

    #[test]
    fn a_failed_place_name_is_asked_again_on_the_next_refresh() {
        let h = harness(Some((-21.18, -47.81)));

        let report = h.service.report(ON_WITH_LOCATION).unwrap();
        assert_eq!(report.places[0].name, "Sua localização");
        assert_eq!(report.places[0].detail, "");

        h.clock.advance_secs(16 * 60);
        h.service.report(ON_WITH_LOCATION).unwrap();
        assert_eq!(h.fetcher.name_urls.lock().unwrap().len(), 2);
    }

    #[test]
    fn the_capitals_never_ask_the_place_name_service() {
        let h = harness(Some((-22.9, -43.2)));

        let report = h.service.report(ON).unwrap();

        assert_eq!(report.places[0].detail, "SP, Brasil");
        assert!(h.fetcher.name_urls.lock().unwrap().is_empty());
    }

    #[test]
    fn if_the_location_is_unavailable_the_capitals_are_the_fallback() {
        let h = harness(None);

        let report = h.service.report(ON_WITH_LOCATION).unwrap();

        assert_eq!(report.source, Source::Capitals);
        assert_eq!(report.places.len(), 5);
    }

    #[test]
    fn the_provider_is_asked_at_most_once_every_fifteen_minutes() {
        let h = harness(None);
        h.service.report(ON).unwrap();

        h.clock.advance_secs(14 * 60 + 59);
        let cached = h.service.report(ON).unwrap();
        assert_eq!(h.fetcher.urls.lock().unwrap().len(), 1);
        assert_eq!(cached.age_ms, (14 * 60 + 59) * 1_000);

        h.clock.advance_secs(1);
        let refreshed = h.service.report(ON).unwrap();
        assert_eq!(h.fetcher.urls.lock().unwrap().len(), 2);
        assert_eq!(refreshed.age_ms, 0);
    }

    #[test]
    fn a_failed_refresh_keeps_the_previous_data_marked_as_stale() {
        let h = harness(None);
        h.service.report(ON).unwrap();
        h.clock.advance_secs(20 * 60);
        h.fetcher.offline.store(true, Ordering::Relaxed);

        let report = h.service.report(ON).unwrap();

        assert!(report.stale);
        assert_eq!(report.places.len(), 5);
        assert_eq!(report.age_ms, 20 * 60 * 1_000);
    }

    #[test]
    fn without_connection_and_without_previous_data_it_is_a_network_error() {
        let h = harness(None);
        h.fetcher.offline.store(true, Ordering::Relaxed);

        let result = h.service.report(ON);

        assert!(matches!(result, Err(AppError::Network { .. })));
    }

    #[test]
    fn changing_the_location_preference_discards_the_cached_data() {
        let h = harness(Some((-22.9, -43.2)));
        h.service.report(ON).unwrap();

        let report = h.service.report(ON_WITH_LOCATION).unwrap();

        assert_eq!(report.source, Source::Location);
        assert_eq!(h.fetcher.urls.lock().unwrap().len(), 2);
    }

    #[test]
    fn the_report_serializes_with_the_frontend_contract() {
        let h = harness(Some((-22.9, -43.2)));

        let json = serde_json::to_value(h.service.report(ON_WITH_LOCATION).unwrap()).unwrap();

        assert_eq!(json["source"], "location");
        assert_eq!(json["stale"], false);
        assert_eq!(json["ageMs"], 0);
        assert_eq!(json["places"][0]["temperatureC"], 27.9);
        assert_eq!(json["places"][0]["condition"], "thunderstorm");
        assert_eq!(json["places"][0]["name"], "Região de Rio de Janeiro");
        assert_eq!(json["places"][0]["detail"], "RJ, Brasil");
        assert_eq!(json["places"][0]["humidityPercent"], 51.0);
        assert_eq!(json["places"][0]["night"], false);
        assert_eq!(json["places"][0]["hourly"][1]["time"], "2026-10-13T19:00");
        assert_eq!(json["places"][0]["hourly"][1]["temperatureC"], 21.0);
        assert_eq!(json["places"][0]["hourly"][1]["night"], true);
        assert_eq!(json["places"][0]["daily"][0]["minC"], 17.4);
        assert_eq!(json["places"][0]["daily"][1]["condition"], "cloudy");
    }
}
