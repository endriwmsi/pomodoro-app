import { useEffect, useState } from 'react';

import type { Routine } from '@/lib/commands';

/**
 * Leitura das rotinas para exibição: rótulos, horários e "o que vem a seguir".
 * Nada aqui decide o comportamento do timer — isso é do backend
 * (`src-tauri/src/routines/`); a interface só mostra.
 */

/** Rótulos na ordem dos bits de `Routine.weekdays`: 1 = segunda … 64 = domingo. */
export const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;
export const WEEKDAY_NAMES = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
] as const;

export const EVERY_DAY = 0b111_1111;
const WORKING_DAYS = 0b001_1111;
const WEEKEND = 0b110_0000;

/** Bit do dia da semana de `date` (o `getDay()` do JavaScript começa no domingo). */
export function weekdayBit(date: Date): number {
  return 1 << ((date.getDay() + 6) % 7);
}

export function minuteOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

/** `615` → `10:15`. */
export function formatMinute(minute: number): string {
  const hours = Math.floor(minute / 60);
  return `${String(hours).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
}

/** `10:15` → `615`; `null` se o texto não for um horário. */
export function parseTime(text: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const [hours, minutes] = [Number(match[1]), Number(match[2])];
  return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
}

export function describeWeekdays(mask: number): string {
  if (mask === EVERY_DAY) return 'Todos os dias';
  if (mask === WORKING_DAYS) return 'Dias úteis';
  if (mask === WEEKEND) return 'Fins de semana';
  return WEEKDAY_LABELS.filter((_, day) => mask & (1 << day)).join(', ');
}

/** As rotinas ligadas que valem no dia de `date`, na ordem em que acontecem. */
export function routinesOn(routines: readonly Routine[], date: Date): Routine[] {
  const bit = weekdayBit(date);
  return routines
    .filter((routine) => routine.enabled && (routine.weekdays & bit) !== 0)
    .sort((a, b) => a.startMinute - b.startMinute);
}

/** A próxima rotina de hoje que ainda não começou e quantos minutos faltam. */
export function nextRoutine(
  routines: readonly Routine[],
  date: Date,
): { routine: Routine; inMinutes: number } | null {
  const now = minuteOfDay(date);
  const next = routinesOn(routines, date).find((routine) => routine.startMinute > now);
  return next ? { routine: next, inMinutes: next.startMinute - now } : null;
}

/** A hora atual, relida de tempos em tempos — para rótulos, não para contagens. */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [intervalMs]);
  return now;
}
