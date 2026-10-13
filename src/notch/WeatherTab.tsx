import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { DotMatrixText } from '@/components/ui/DotMatrixText';
import { weatherGet, type WeatherCondition, type WeatherReport } from '@/lib/commands';
import { toAppError } from '@/lib/errors';
import { WeatherIcon } from '@/notch/WeatherIcon';
import { useTemplate } from '@/stores/settings';

/**
 * Intervalo entre atualizações. O backend também impõe esse mínimo: pedir
 * antes devolve os dados guardados, sem nova consulta à internet.
 */
const REFRESH_MS = 15 * 60 * 1_000;
/** Horas mostradas na faixa de previsão, e de quantas em quantas. */
const HOURS_SHOWN = 6;
const HOUR_STEP = 2;

const CONDITION_LABEL: Record<WeatherCondition, string> = {
  clear: 'Céu limpo',
  partlyCloudy: 'Parcialmente nublado',
  cloudy: 'Nublado',
  fog: 'Neblina',
  drizzle: 'Garoa',
  rain: 'Chuva',
  snow: 'Neve',
  thunderstorm: 'Trovoadas',
};

function degrees(value: number): string {
  return `${String(Math.round(value))}°`;
}

/** `2026-10-13T14:00` → `14h`; a hora é local do lugar, sem conversão de fuso. */
function hourOf(time: string): string {
  return `${time.slice(11, 13)}h`;
}

const ARROW_BUTTON =
  'flex size-5 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors duration-150 outline-none hover:bg-white/15 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70';

/**
 * Aba de clima: o lugar no topo (cidade e, menores, estado e país), a
 * temperatura junto da condição, do vento e da umidade e, embaixo, a previsão ao longo das próximas horas. Mostra a
 * localização do usuário ou, sem ela, as capitais das regiões — uma por vez,
 * trocadas pelas setas.
 */
export function WeatherTab({ stacked }: { stacked: boolean }) {
  const template = useTemplate();
  const [report, setReport] = useState<WeatherReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);

  const refresh = useCallback(() => {
    weatherGet()
      .then((fresh) => {
        setReport(fresh);
        setError(null);
      })
      .catch((failure: unknown) => {
        const appError = toAppError(failure);
        setError(
          appError.kind === 'network' ? 'Sem conexão com o serviço de previsão.' : appError.message,
        );
      });
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, REFRESH_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [refresh]);

  const count = report?.places.length ?? 0;
  // A lista pode encolher entre uma previsão e outra (capitais → localização).
  const index = count === 0 ? 0 : selected % count;
  const place = report?.places[index];

  if (!report || !place) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-xs text-white/60" role={error ? 'alert' : undefined}>
          {error ?? 'Buscando a previsão…'}
        </p>
        {error ? (
          <button
            type="button"
            onClick={refresh}
            className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/85 transition-colors duration-150 outline-none hover:bg-white/10"
          >
            Tentar de novo
          </button>
        ) : null}
      </div>
    );
  }

  const label = CONDITION_LABEL[place.condition];
  const hours = place.hourly
    .filter((_, hour) => hour % HOUR_STEP === 0)
    .slice(0, stacked ? HOURS_SHOWN - 1 : HOURS_SHOWN);
  const step = (delta: number) => {
    setSelected((index + delta + count) % count);
  };

  const stats = (
    <dl className="flex shrink-0 items-stretch divide-x divide-white/12 text-center">
      <div className="px-3">
        <dd className="text-xs leading-tight text-white/90 tabular-nums">
          {Math.round(place.windKmh)} km/h
        </dd>
        <dt className="text-[0.625rem] leading-tight text-white/45">Vento</dt>
      </div>
      <div className="px-3">
        <dd className="text-xs leading-tight text-white/90 tabular-nums">
          {Math.round(place.humidityPercent)}%
        </dd>
        <dt className="text-[0.625rem] leading-tight text-white/45">Umidade</dt>
      </div>
    </dl>
  );
  // Abaixo do nome: estado e país — ou o aviso de dados antigos, que importa mais.
  const detail = report.stale ? 'Sem conexão — exibindo a última previsão.' : place.detail;

  return (
    <div className="flex h-full flex-col justify-between gap-1.5">
      {/* O lugar, centralizado; com várias capitais, setas para trocar. */}
      <div className="flex shrink-0 items-center justify-center gap-1.5">
        {count > 1 ? (
          <button
            type="button"
            aria-label="Lugar anterior"
            title="Lugar anterior"
            onClick={() => {
              step(-1);
            }}
            className={ARROW_BUTTON}
          >
            <ChevronLeft size={13} aria-hidden="true" />
          </button>
        ) : null}
        <div aria-live="polite" className="min-w-0 text-center">
          <h3
            className="truncate text-[0.8125rem] leading-tight font-semibold text-white"
            title={place.name}
          >
            {place.name}
          </h3>
          {detail ? (
            <p className="truncate text-[0.625rem] leading-tight text-white/50">{detail}</p>
          ) : null}
        </div>
        {count > 1 ? (
          <button
            type="button"
            aria-label="Próximo lugar"
            title="Próximo lugar"
            onClick={() => {
              step(1);
            }}
            className={ARROW_BUTTON}
          >
            <ChevronRight size={13} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {/* Temperatura, condição e, ao lado (topo) ou abaixo (laterais), vento e umidade. */}
      <div className="flex shrink-0 items-center justify-center gap-4">
        {template === 'matrix' ? (
          <DotMatrixText
            text={degrees(place.temperatureC)}
            size={34}
            label={`${String(Math.round(place.temperatureC))} graus`}
          />
        ) : (
          <span className="font-display text-[2.5rem] leading-none font-semibold tabular-nums">
            {degrees(place.temperatureC)}
          </span>
        )}
        <div className="flex min-w-0 items-center gap-2">
          <WeatherIcon condition={place.condition} night={place.night} size={38} />
          <p className="max-w-24 text-xs leading-tight text-white/90">{label}</p>
        </div>
        {stacked ? null : stats}
      </div>
      {stacked ? <div className="flex shrink-0 justify-center">{stats}</div> : null}

      {/* A previsão ao longo das próximas horas, com um separador entre elas. */}
      <ul aria-label="Próximas horas" className="flex shrink-0 divide-x divide-white/12">
        {hours.map((hour, position) => (
          <li
            key={hour.time}
            className="flex min-w-0 flex-1 flex-col items-center gap-0.5 text-[0.625rem] leading-tight"
          >
            <WeatherIcon condition={hour.condition} night={hour.night} size={20} />
            <span className="text-white/50">{position === 0 ? 'Agora' : hourOf(hour.time)}</span>
            <span className="sr-only">{CONDITION_LABEL[hour.condition]}, </span>
            <span className="text-white/90 tabular-nums">{degrees(hour.temperatureC)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
