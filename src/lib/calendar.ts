/**
 * Calendário **local** do usuário. As estatísticas são agrupadas por dia
 * local: estes limites são calculados aqui (o backend não conhece fusos) e
 * enviados como instantes em milissegundos. Ver docs/ANALYTICS.md.
 *
 * Tudo é construído com `new Date(ano, mês, dia)`, que devolve a meia-noite
 * local daquele dia mesmo quando o dia tem 23 ou 25 horas (horário de verão).
 */

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Meia-noite local `days` dias depois (ou antes, se negativo). */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** A segunda-feira (00:00 local) da semana que contém `date`. */
export function startOfWeek(date: Date): Date {
  const day = startOfDay(date);
  return addDays(day, -mondayBasedWeekday(day));
}

/** Índice do dia na semana começando na segunda-feira (0) até domingo (6). */
export function mondayBasedWeekday(date: Date): number {
  return (date.getDay() + 6) % 7;
}

/** As oito meias-noites que delimitam os sete dias da semana iniciada em `weekStart`. */
export function weekBoundaries(weekStart: Date): number[] {
  return Array.from({ length: 8 }, (_, day) => addDays(weekStart, day).getTime());
}

const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });

/** `12 de out. – 18 de out.` para a semana iniciada em `weekStart`. */
export function formatWeekRange(weekStart: Date): string {
  return `${dayMonth.format(weekStart)} – ${dayMonth.format(addDays(weekStart, 6))}`;
}
