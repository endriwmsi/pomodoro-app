# ADR-004 — Funções que usam a internet e APIs nativas do Windows

- **Status:** aceita (decisão do usuário em 2026-10-13)
- **Data:** 2026-10-13

## Contexto

O Compasso foi definido como aplicativo local: sem conta, sem servidor e sem depender de
internet. Duas abas pedidas para o notch saem desse perímetro:

- **Clima** precisa de um provedor de previsão do tempo — isto é, de rede e de um serviço
  externo.
- **Música** precisa conversar com outros aplicativos e com o áudio do sistema, o que o Tauri
  não oferece.

## Decisão

### Rede: uma exceção, opcional e desligada por padrão

1. **Só a previsão do tempo usa a internet.** Todo o resto continua funcionando sem rede.
2. A função nasce **desligada** (`weather.enabled = false`). Desligada, nenhuma requisição é
   feita e a aba de clima nem aparece.
3. O provedor é o **Open-Meteo** (`api.open-meteo.com`): não exige conta nem chave, então não
   há segredo a guardar no aplicativo.
4. A requisição parte **do backend Rust** (crate `ureq`), não do WebView. A CSP da interface
   continua sem nenhum destino de rede.
5. **No máximo uma consulta a cada 15 minutos**, regra imposta no backend
   (`weather::REFRESH_INTERVAL_MS`) independentemente de quantas vezes a interface peça.
6. **Localização é uma segunda permissão** (`weather.useLocation`, também desligada por
   padrão). Com ela, usa-se o serviço de localização do Windows e enviam-se ao provedor as
   coordenadas **arredondadas a duas casas decimais** (cerca de 1 km). Sem ela — ou se o
   Windows negar ou não souber a localização — mostram-se as maiores capitais de cada região
   do Brasil, e nenhuma informação do usuário sai do computador além do endereço IP da
   requisição.
7. **Nome da cidade (revisão de 2026-10-13, a pedido do usuário):** com `weather.useLocation`,
   as mesmas coordenadas arredondadas vão também ao **Nominatim**
   (`nominatim.openstreetmap.org`, OpenStreetMap), para mostrar cidade, estado e país no lugar
   de "Sua localização". Não exige conta nem chave; a política de uso pede identificação por
   `User-Agent` e poucas requisições — o nome é guardado e só é pedido de novo se o computador
   mudar de lugar. É um segundo destino de rede, mas dentro da mesma permissão e do mesmo
   módulo (`weather/`); o texto da opção nas Configurações cita os dois serviços. Alternativas
   descartadas: geocodificação reversa do Windows (`MapLocationFinder`; não testada —
   depende do serviço de mapas da Microsoft, também pela rede) e um campo para digitar o nome (não acompanha o computador).
8. Falha de rede nunca é erro do aplicativo: mostram-se os últimos dados, marcados como
   desatualizados, ou uma mensagem de "sem conexão".

### APIs nativas do Windows

Usa-se o crate `windows` (bindings oficiais da Microsoft) para o que o Tauri não cobre:

| Necessidade                          | API                                                                                                       |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Mídia em reprodução e seus controles | `GlobalSystemMediaTransportControlsSessionManager` (WinRT)                                                |
| Volume do aplicativo que toca        | `IAudioSessionManager2` / `ISimpleAudioVolume` (Core Audio, COM); `IAudioEndpointVolume` como alternativa |
| Localização                          | `Windows.Devices.Geolocation.Geolocator` (WinRT)                                                          |

O crate `windows-sys`, já usado para o som de aviso, cobre também a caixa de erro da
inicialização (`MessageBoxW`).

## Alternativas consideradas

- **Não ter clima** — mantinha o aplicativo 100 % offline; descartado a pedido do usuário.
- **Requisição pelo WebView (`fetch`)** — sem dependência nova, mas abriria a CSP para a rede
  e espalharia o cache e a regra dos 15 minutos por duas janelas.
- **Localização por IP** — dispensaria a permissão do Windows, mas exigiria um segundo serviço
  externo e é menos transparente para o usuário.
- **Volume geral do sistema** — foi a primeira versão, mais simples; trocada pelo volume por
  aplicativo a pedido do usuário. Ficou como alternativa para quando o player não é encontrado
  entre as sessões de áudio.
- **Eventos do sistema em vez de consulta periódica à mídia** — menos chamadas, mas mais
  estado e ciclo de vida para gerenciar; a consulta só acontece com a aba visível.

## Consequências

- "Sem internet" deixa de ser uma propriedade absoluta do aplicativo e passa a ser o padrão.
  `AGENTS.md` e o `README.md` foram ajustados; qualquer **nova** função de rede exige revisar
  este ADR.
- Novas dependências: `ureq` (com `rustls`), `windows` e `base64`. O executável cresceu de
  cerca de 4 MB para cerca de 6 MB.
- Há blocos `unsafe` em três pontos, todos chamadas diretas a APIs do Windows:
  `notifications/sound.rs`, `media/mod.rs` (volume) e `lib.rs` (caixa de erro).
- A lista de capitais é fixa e brasileira; usuários de outros países dependem da localização.
- O comportamento da localização depende das configurações de privacidade do Windows e não
  foi verificado (ver `docs/TESTING.md`).
