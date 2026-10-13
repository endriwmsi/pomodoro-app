import type { WeatherCondition } from '@/lib/commands';

/**
 * Ícones coloridos do clima: sol laranja, lua clara, nuvens cinza, chuva azul.
 * Formas cheias, desenhadas em uma grade de 24 × 24. As cores vêm dos tokens
 * `--color-weather-*` (ver `docs/THEMING.md`).
 */

const CLOUD = 'M7 18a4 4 0 0 1-.5-7.97A5.5 5.5 0 0 1 17.2 9.1 4.5 4.5 0 0 1 17.5 18Z';
const MOON = 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z';

const LIGHT = 'fill-weather-cloud';
const DARK = 'fill-weather-cloud-dark';

/** Nuvem em primeiro plano, quando há algo atrás dela (sol, lua ou outra nuvem). */
const FRONT = 'translate(0 5) scale(0.85)';
/** Nuvem no alto, com espaço embaixo para o que cai dela. */
const RAISED = 'translate(1.4 -1.5) scale(0.88)';

function Sky({ night, small }: { night: boolean; small: boolean }) {
  if (night) {
    return (
      <path
        d={MOON}
        transform={small ? 'translate(9.5 0) scale(0.55)' : undefined}
        className="fill-weather-moon"
      />
    );
  }
  return small ? (
    <circle cx="16" cy="8.5" r="5" className="fill-weather-sun" />
  ) : (
    <circle cx="12" cy="12" r="6.5" className="fill-weather-sun" />
  );
}

function Drops({ xs, length }: { xs: readonly number[]; length: number }) {
  return (
    <g className="stroke-weather-rain" strokeWidth="1.8" strokeLinecap="round">
      {xs.map((x) => (
        <line key={x} x1={x} y1="17" x2={x - length * 0.28} y2={17 + length} />
      ))}
    </g>
  );
}

function shapes(condition: WeatherCondition, night: boolean) {
  switch (condition) {
    case 'clear':
      return <Sky night={night} small={false} />;
    case 'partlyCloudy':
      return (
        <>
          <Sky night={night} small />
          <path d={CLOUD} transform={FRONT} className={LIGHT} />
        </>
      );
    case 'cloudy':
      return (
        <>
          <path d={CLOUD} transform="translate(7.5 1) scale(0.7)" className={DARK} />
          <path d={CLOUD} transform={FRONT} className={LIGHT} />
        </>
      );
    case 'fog':
      return (
        <>
          <path d={CLOUD} transform={RAISED} className={LIGHT} />
          <g className="stroke-weather-cloud-dark" strokeWidth="1.6" strokeLinecap="round">
            <line x1="5" y1="17.5" x2="19" y2="17.5" />
            <line x1="7.5" y1="20.8" x2="16.5" y2="20.8" />
          </g>
        </>
      );
    case 'drizzle':
      return (
        <>
          <path d={CLOUD} transform={RAISED} className={LIGHT} />
          <Drops xs={[10, 15.5]} length={2.2} />
        </>
      );
    case 'rain':
      return (
        <>
          <path d={CLOUD} transform={RAISED} className={LIGHT} />
          <Drops xs={[8.5, 13, 17.5]} length={3.8} />
        </>
      );
    case 'snow':
      return (
        <>
          <path d={CLOUD} transform={RAISED} className={LIGHT} />
          <g className="fill-weather-snow">
            <circle cx="8" cy="18.4" r="1.15" />
            <circle cx="12.5" cy="20.6" r="1.15" />
            <circle cx="17" cy="18.4" r="1.15" />
          </g>
        </>
      );
    case 'thunderstorm':
      return (
        <>
          <path d={CLOUD} transform={RAISED} className={DARK} />
          <path
            d="M13.2 13.5 9.6 18.6h2.6l-1 4.4 4.6-5.9h-2.7l1.3-3.6Z"
            className="fill-weather-bolt"
          />
        </>
      );
  }
}

interface WeatherIconProps {
  condition: WeatherCondition;
  /** À noite, a lua toma o lugar do sol. */
  night: boolean;
  size: number;
}

export function WeatherIcon({ condition, night, size }: WeatherIconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      data-weather-icon={night ? `${condition}-night` : condition}
      className="shrink-0"
    >
      {shapes(condition, night)}
    </svg>
  );
}
