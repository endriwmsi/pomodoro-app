import { describe, expect, it } from 'vitest';

import {
  addDays,
  formatWeekRange,
  mondayBasedWeekday,
  startOfDay,
  startOfWeek,
  weekBoundaries,
} from '@/lib/calendar';
import { formatFocusTime } from '@/lib/format';

function ymd(date: Date): string {
  return [date.getFullYear(), date.getMonth() + 1, date.getDate()].join('-');
}

describe('calendário local', () => {
  it('startOfDay zera a hora sem mudar o dia', () => {
    const start = startOfDay(new Date(2026, 9, 13, 23, 59, 59));

    expect(ymd(start)).toBe('2026-10-13');
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0]);
  });

  it('a semana começa na segunda-feira', () => {
    // 13/10/2026 é terça; 18/10 é domingo; 19/10 é segunda.
    expect(ymd(startOfWeek(new Date(2026, 9, 13, 15)))).toBe('2026-10-12');
    expect(ymd(startOfWeek(new Date(2026, 9, 12)))).toBe('2026-10-12');
    expect(ymd(startOfWeek(new Date(2026, 9, 18, 23, 59)))).toBe('2026-10-12');
    expect(ymd(startOfWeek(new Date(2026, 9, 19)))).toBe('2026-10-19');
  });

  it('numera os dias de segunda (0) a domingo (6)', () => {
    expect(mondayBasedWeekday(new Date(2026, 9, 12))).toBe(0);
    expect(mondayBasedWeekday(new Date(2026, 9, 17))).toBe(5);
    expect(mondayBasedWeekday(new Date(2026, 9, 18))).toBe(6);
  });

  it('addDays atravessa meses e anos', () => {
    expect(ymd(addDays(new Date(2026, 0, 31), 1))).toBe('2026-2-1');
    expect(ymd(addDays(new Date(2026, 0, 1), -1))).toBe('2025-12-31');
    expect(ymd(addDays(new Date(2024, 1, 28), 1))).toBe('2024-2-29');
  });

  it('weekBoundaries devolve oito meias-noites locais consecutivas', () => {
    const boundaries = weekBoundaries(new Date(2026, 9, 12));

    expect(boundaries).toHaveLength(8);
    expect(boundaries.map((ms) => ymd(new Date(ms)))).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
      '2026-10-19',
    ]);
    for (const ms of boundaries) {
      expect(new Date(ms).getHours()).toBe(0);
    }
    expect([...boundaries].sort((a, b) => a - b)).toEqual(boundaries);
  });

  it('formata o intervalo da semana', () => {
    expect(formatWeekRange(new Date(2026, 9, 12))).toMatch(/^12 de out\.? – 18 de out/);
  });
});

describe('formatFocusTime', () => {
  it('usa minutos até uma hora e horas com minutos depois', () => {
    expect(formatFocusTime(0)).toBe('0m');
    expect(formatFocusTime(25 * 60_000)).toBe('25m');
    expect(formatFocusTime(59 * 60_000 + 29_000)).toBe('59m');
    expect(formatFocusTime(60 * 60_000)).toBe('1h 00m');
    expect(formatFocusTime(125 * 60_000)).toBe('2h 05m');
  });

  it('arredonda para o minuto mais próximo e nunca fica negativo', () => {
    expect(formatFocusTime(89_000)).toBe('1m');
    expect(formatFocusTime(91_000)).toBe('2m');
    expect(formatFocusTime(-5_000)).toBe('0m');
  });
});
