/** Segundos a exibir para `ms` restantes — mesmo arredondamento do backend. */
export function remainingSeconds(ms: number): number {
  return Math.ceil(Math.max(ms, 0) / 1000);
}

/** `1500` → `"25:00"`. Minutos não são convertidos em horas (`"180:00"`). */
export function formatClock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function plural(value: number, singular: string, pluralForm: string): string {
  return `${value} ${value === 1 ? singular : pluralForm}`;
}

/** `1499` → `"24 minutos e 59 segundos"`, para leitores de tela. */
export function describeDuration(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const parts = [];
  if (minutes > 0) parts.push(plural(minutes, 'minuto', 'minutos'));
  if (seconds > 0 || minutes === 0) parts.push(plural(seconds, 'segundo', 'segundos'));
  return parts.join(' e ');
}

/** Tempo de foco acumulado: `0m`, `25m`, `1h 05m`. Arredonda para o minuto mais próximo. */
export function formatFocusTime(ms: number): string {
  const totalMinutes = Math.round(Math.max(ms, 0) / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours === 0 ? `${minutes}m` : `${hours}h ${String(minutes).padStart(2, '0')}m`;
}
