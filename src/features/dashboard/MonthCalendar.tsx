import { isTauri } from '@tauri-apps/api/core';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';

import { PanelLabel } from '@/components/ui/PanelLabel';
import { addDays, mondayBasedWeekday } from '@/lib/calendar';
import { analyticsPeriods, type PeriodStats } from '@/lib/commands';
import { useTasksStore } from '@/stores/tasks';
import { useTimerStore } from '@/stores/timer';

const WEEKDAY_INITIALS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'] as const;

const monthTitle = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const dayTitle = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long' });

/** Tipos de marcador de um dia, na ordem em que os pontos aparecem. */
const MARKERS = [
  { key: 'focus', label: 'Foco concluído', dot: 'bg-accent' },
  { key: 'done', label: 'Tarefa concluída', dot: 'bg-priority-low' },
  { key: 'due', label: 'Prazo de tarefa', dot: 'bg-priority-medium' },
] as const;

type MarkerKey = (typeof MARKERS)[number]['key'];

const NAV_BUTTON =
  'flex size-7 items-center justify-center rounded-md text-ink-muted outline-none transition-colors duration-150 hover:bg-white/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-white/70';

function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(2, '0')}`;
}

function plural(count: number, singular: string, many: string): string {
  return `${count} ${count === 1 ? singular : many}`;
}

interface MonthCalendarProps {
  /** Hoje, à meia-noite local. */
  today: Date;
  /** Numeração do painel no template Matriz. */
  index: number;
}

/**
 * Calendário do mês com marcadores por dia: focos concluídos, tarefas
 * concluídas (ambos calculados pelo backend) e prazos de tarefas abertas.
 */
export function MonthCalendar({ today, index }: MonthCalendarProps) {
  /** 0 = mês atual; -1 = mês passado; 1 = próximo mês… */
  const [monthOffset, setMonthOffset] = useState(0);
  const [stats, setStats] = useState<PeriodStats[] | null>(null);

  const tasks = useTasksStore((state) => state.tasks);
  const timerStatus = useTimerStore((state) => state.snapshot?.status);

  const monthStart = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const nextMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);
  const dayCount = Math.round((nextMonth.getTime() - monthStart.getTime()) / 86_400_000);
  const monthStartMs = monthStart.getTime();

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    // Uma meia-noite local por dia do mês, mais a do dia 1 seguinte.
    const start = new Date(monthStartMs);
    const boundaries = Array.from({ length: dayCount + 1 }, (_, day) =>
      addDays(start, day).getTime(),
    );
    analyticsPeriods(boundaries)
      .then((periods) => {
        if (!cancelled) setStats(periods);
      })
      .catch((error: unknown) => {
        console.error('Falha ao calcular o calendário', error);
        if (!cancelled) setStats(null);
      });
    return () => {
      cancelled = true;
    };
  }, [monthStartMs, dayCount, tasks, timerStatus]);

  /** Prazos de tarefas ainda abertas, por data. */
  const dueByDate = new Map<string, number>();
  for (const task of tasks) {
    if (task.dueDate && task.status !== 'done') {
      dueByDate.set(task.dueDate, (dueByDate.get(task.dueDate) ?? 0) + 1);
    }
  }

  const todayIso = isoDate(today);
  const days = Array.from({ length: dayCount }, (_, offset) => {
    const date = addDays(monthStart, offset);
    const iso = isoDate(date);
    const period = stats?.[offset];
    const counts: Record<MarkerKey, number> = {
      focus: period?.completedPomodoros ?? 0,
      done: period?.tasksCompleted ?? 0,
      due: dueByDate.get(iso) ?? 0,
    };
    const details = [
      counts.focus > 0 ? plural(counts.focus, 'pomodoro concluído', 'pomodoros concluídos') : null,
      counts.done > 0 ? plural(counts.done, 'tarefa concluída', 'tarefas concluídas') : null,
      counts.due > 0 ? plural(counts.due, 'prazo', 'prazos') : null,
    ].filter((detail) => detail !== null);
    return {
      iso,
      day: date.getDate(),
      isToday: iso === todayIso,
      counts,
      label: [`${dayTitle.format(date)}${iso === todayIso ? ' (hoje)' : ''}`, ...details].join(
        ', ',
      ),
    };
  });

  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <PanelLabel as="h2" index={index}>
          <span className="first-letter:uppercase">{monthTitle.format(monthStart)}</span>
        </PanelLabel>
        <div className="flex items-center">
          <button
            type="button"
            aria-label="Mês anterior"
            title="Mês anterior"
            onClick={() => {
              setMonthOffset((offset) => offset - 1);
            }}
            className={NAV_BUTTON}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Próximo mês"
            title="Próximo mês"
            onClick={() => {
              setMonthOffset((offset) => offset + 1);
            }}
            className={NAV_BUTTON}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div aria-hidden="true" className="mt-4 grid grid-cols-7 text-center text-xs text-ink-muted">
        {WEEKDAY_INITIALS.map((initial, column) => (
          <span key={column}>{initial}</span>
        ))}
      </div>

      <ul aria-label="Dias do mês" className="mt-1.5 grid grid-cols-7 gap-y-1">
        {days.map(({ iso, day, isToday, counts, label }, offset) => (
          <li
            key={iso}
            aria-label={label}
            aria-current={isToday ? 'date' : undefined}
            // O dia 1 começa na coluna do seu dia da semana (segunda = 1).
            style={
              offset === 0 ? { gridColumnStart: mondayBasedWeekday(monthStart) + 1 } : undefined
            }
            className="flex flex-col items-center gap-0.5 py-0.5"
          >
            <span
              className={`flex size-7 items-center justify-center rounded-lg text-xs tabular-nums ${
                isToday ? 'bg-accent font-semibold text-accent-ink' : 'text-ink'
              }`}
            >
              {day}
            </span>
            <span className="flex h-1 items-center gap-0.5">
              {MARKERS.map(({ key, dot }) =>
                counts[key] > 0 ? (
                  <span key={key} data-marker={key} className={`size-1 rounded-full ${dot}`} />
                ) : null,
              )}
            </span>
          </li>
        ))}
      </ul>

      <ul className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-[0.6875rem] text-ink-muted">
        {MARKERS.map(({ key, label, dot }) => (
          <li key={key} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-1.5 rounded-full ${dot}`} />
            {label}
          </li>
        ))}
      </ul>
    </>
  );
}
