# Clima

Aba do notch com a previsão do tempo. É a **única função do aplicativo que usa a internet** e
fica **desligada por padrão** — a decisão e seus limites estão em
[ADR-004](decisions/ADR-004-NETWORK-FEATURES.md).

Código: `src-tauri/src/weather/` e `src/notch/WeatherTab.tsx`.

## Configurações

**Configurações → Previsão do tempo** (seção `weather`, ver [DATABASE.md](DATABASE.md)):

| Campo                 | Padrão  | Efeito                                                                                      |
| --------------------- | ------- | ------------------------------------------------------------------------------------------- |
| `weather.enabled`     | `false` | Liga a função. Desligada, não há requisição e a aba não existe                              |
| `weather.useLocation` | `false` | Usa a localização do computador (e consulta o nome da cidade); sem ela, mostram-se capitais |

## O que é mostrado

| Situação                                                   | Conteúdo                                                                                                                            |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Localização permitida e disponível                         | Um lugar só: a localização do computador                                                                                            |
| Localização desligada, negada pelo Windows ou indisponível | As maiores capitais de cada região — São Paulo, Fortaleza, Brasília, Manaus e Curitiba —, **uma por vez**, trocadas pelas setas ‹ › |
| Atualização falhou, mas há dados anteriores                | Os dados anteriores, com o aviso "Sem conexão — exibindo a última previsão"                                                         |
| Sem conexão e sem dados anteriores                         | Mensagem de sem conexão e botão "Tentar de novo"                                                                                    |

O desenho é o mesmo nos dois casos (`WeatherTab`):

- **no topo, centralizado**, a cidade e, abaixo, menores, o estado e o país ("Campinas" /
  "São Paulo, Brasil"). Se os dados estão desatualizados, o aviso ocupa essa segunda linha;
- **no meio, juntos e centralizados**: a temperatura atual, grande; o ícone e o nome da
  condição; e vento e umidade, cada um com seu rótulo, separados por uma linha (nas laterais,
  vento e umidade descem para a linha de baixo);
- **embaixo, a previsão ao longo do dia**: seis horários de duas em duas horas a partir de
  agora (cinco nas laterais), cada um com o ícone da condição, a hora e a temperatura, com um
  separador vertical entre eles.

Os ícones são desenhos próprios, coloridos (`WeatherIcon`): sol laranja, nuvens cinza (clara
na frente, escura atrás ou em trovoadas), gotas de chuva azuis, neve clara e raio amarelo. À
noite, céu limpo e parcialmente nublado trocam o sol pela lua.

O provedor devolve doze horas de previsão por hora e quatro dias (hoje e os três seguintes;
os dias vêm no contrato, mas a aba não os mostra). As condições são oito categorias
simplificadas dos códigos WMO do provedor (`weather::condition`): céu limpo, parcialmente
nublado, nublado, neblina, garoa, chuva, neve e trovoadas; códigos desconhecidos viram
"nublado".

## Provedor e dados enviados

- **Open-Meteo**, `https://api.open-meteo.com/v1/forecast`, sem chave nem conta.
- Uma requisição leva: as coordenadas dos pontos (arredondadas a duas casas, cerca de 1 km), os
  campos pedidos, `timezone=auto`, `forecast_days=4` e `forecast_hours=12`. Nada mais — nenhum identificador do usuário ou do
  aplicativo.
- No modo capitais, as coordenadas enviadas são as das cinco cidades, iguais para todos os
  usuários.
- **Nominatim** (OpenStreetMap), `https://nominatim.openstreetmap.org/reverse`, sem chave nem
  conta — **só com `weather.useLocation`**, para saber o nome da cidade. Leva as mesmas
  coordenadas arredondadas, `zoom=10` (nível de cidade) e `accept-language=pt-BR`.
- Toda requisição se identifica com `User-Agent: Compasso/<versão> (desktop)`, como a política
  de uso do Nominatim exige.

## Frequência

`WeatherService::report` guarda o último resultado e só consulta o provedor de novo depois de
**15 minutos** (`REFRESH_INTERVAL_MS`), medidos pelo relógio monotônico. Dentro desse intervalo,
qualquer pedido devolve os dados guardados, com `ageMs` indicando a idade. A interface pede ao
abrir a aba pela primeira vez e, daí em diante, a cada 15 minutos enquanto o aplicativo estiver
aberto com a função ligada.

Mudar a preferência de localização descarta os dados guardados (eles se referem a outros
lugares).

## Localização

`weather/location.rs` usa `Windows.Devices.Geolocation.Geolocator`: pede acesso, aceita uma
leitura de até uma hora atrás e desiste após 8 segundos. Qualquer falha — serviço de
localização desligado, acesso negado, tempo esgotado — resulta em "sem localização", e o
aplicativo cai nas capitais. Para liberar: Configurações do Windows → Privacidade e segurança →
Localização → permitir para aplicativos de desktop.

### Nome do lugar

O Open-Meteo não devolve o nome do lugar. Com a localização em uso, `WeatherService::name_of`
pergunta ao Nominatim e usa a cidade (ou vila, ou município) como nome e "estado, país" como
detalhe (`parse_place_name`). O nome fica guardado enquanto as coordenadas arredondadas não
mudam: um computador parado gera **uma** consulta de nome por execução do aplicativo.

Se o serviço de nomes falhar ou não souber a cidade, vale `location_name`, que usa uma tabela
fixa com as 27 capitais brasileiras: a até **100 km** de uma delas, "Região de \<capital\>" com
"\<UF\>, Brasil"; fora disso, "Sua localização", sem detalhe. Nesse caso tenta-se o serviço de
novo na atualização seguinte (15 minutos depois). A falha do nome nunca impede a previsão.

No modo capitais o nome vem da tabela ("São Paulo" / "SP, Brasil") e o Nominatim não é
consultado.

## Contrato

Comando `weather_get()` (`src-tauri/src/commands/notch.rs`), sem argumentos — lê as
preferências do banco.

```ts
interface WeatherReport {
  source: 'location' | 'capitals';
  places: {
    name: string; // a cidade
    detail: string; // estado e país; vazio se não se sabe
    temperatureC: number;
    condition:
      'clear' | 'partlyCloudy' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunderstorm';
    night: boolean; // é noite agora no lugar
    windKmh: number;
    humidityPercent: number;
    // A hora atual e as seguintes; `time` é AAAA-MM-DDTHH:MM, local do lugar.
    hourly: { time: string; condition: /* idem */ string; temperatureC: number; night: boolean }[];
    daily: { date: string; condition: /* idem */ string; minC: number; maxC: number }[];
  }[];
  ageMs: number; // idade dos dados
  stale: boolean; // a última atualização falhou
}
```

Erros: `validation` (campo `weather.enabled`) se a função estiver desligada; `network` se não
houver conexão nem dados anteriores.

A consulta bloqueia por até 10 segundos (tempo limite do HTTP) mais até 8 segundos da
localização; por isso roda em uma thread de trabalho (`spawn_blocking`), nunca na principal.

## Testes

A rede e a localização são abstraídas (`Fetcher`, `Locator`) e substituídas nos testes: nenhum
teste automatizado acessa a internet. Cobertura: tradução dos códigos, montagem da URL
(arredondamento, horas pedidas), leitura da resposta para um e vários lugares (com a previsão
por hora), respostas malformadas, distância e nome do lugar pela capital próxima, consulta do nome (URL,
leitura da resposta, uma vez por lugar, nova tentativa após falha, nunca no modo capitais), função
desligada sem requisição, capitais como padrão e como alternativa, uso da localização, limite
de 15 minutos, dados antigos após falha, erro de rede sem dados e troca de preferência.

Uma consulta real foi feita uma vez, manualmente (ver [TESTING.md](TESTING.md)).

## Limitações

- Lista de capitais fixa e brasileira.
- Temperatura sempre em °C e vento em km/h.
- Sem alertas meteorológicos nem busca de cidade.
- O nome da cidade depende do Nominatim; sem resposta dele, só há nome perto de uma capital
  brasileira.
- A consulta do nome acrescenta até 10 segundos de espera, no pior caso, à primeira previsão.
