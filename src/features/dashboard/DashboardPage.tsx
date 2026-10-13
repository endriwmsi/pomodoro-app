import { isTauri } from '@tauri-apps/api/core';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useState } from 'react';

import { MetricValue } from '@/components/ui/MetricValue';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { PanelLabel } from '@/components/ui/PanelLabel';
import { MonthCalendar } from '@/features/dashboard/MonthCalendar';
import { WeekChart } from '@/features/dashboard/WeekChart';
import {
  addDays,
  formatWeekRange,
  mondayBasedWeekday,
  startOfDay,
  startOfWeek,
  weekBoundaries,
} from '@/lib/calendar';
import { analyticsDashboard, type Dashboard } from '@/lib/commands';
import { formatFocusTime } from '@/lib/format';
import { useSettingsStore } from '@/stores/settings';
import { useTasksStore } from '@/stores/tasks';
import { useTimerStore } from '@/stores/timer';

const dateFormatter = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

const NAV_BUTTON =
  'flex size-7 items-center justify-center rounded-md text-ink-muted outline-none transition-colors duration-150 hover:bg-white/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-white/70 disabled:pointer-events-none disabled:opacity-25';

/**
 * O dia de hoje (meia-noite local), atualizado sozinho quando o dia vira — o
 * dashboard pode ficar aberto de um dia para o outro.
 */
function useToday(): Date {
  const [today, setToday] = useState(() => startOfDay(new Date()));

  useEffect(() => {
    const untilMidnight = addDays(today, 1).getTime() - Date.now();
    const timer = window.setTimeout(
      () => {
        setToday(startOfDay(new Date()));
      },
      Math.max(untilMidnight, 0) + 1_000,
    );
    return () => {
      window.clearTimeout(timer);
    };
  }, [today]);

  return today;
}

export function DashboardPage() {
  const today = useToday();
  /** 0 = semana atual; -1 = semana passada… */
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData] = useState<Dashboard | null>(null);
  const [failed, setFailed] = useState(false);

  const goal = useSettingsStore((state) => state.settings.goals.dailyPomodoros);
  // Mudanças que alteram os números: o quadro (inclui o fim de um foco) e as
  // transições do timer (um foco pulado ou reiniciado soma tempo de foco).
  const tasks = useTasksStore((state) => state.tasks);
  const timerStatus = useTimerStore((state) => state.snapshot?.status);
  const timerPhase = useTimerStore((state) => state.snapshot?.phase);

  const weekStart = addDays(startOfWeek(today), weekOffset * 7);
  const todayMs = today.getTime();
  const weekStartMs = weekStart.getTime();

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    analyticsDashboard(
      todayMs,
      addDays(new Date(todayMs), 1).getTime(),
      weekBoundaries(new Date(weekStartMs)),
    )
      .then((dashboard) => {
        if (cancelled) return;
        setData(dashboard);
        setFailed(false);
      })
      .catch((error: unknown) => {
        console.error('Falha ao calcular as estatísticas', error);
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [todayMs, weekStartMs, tasks, timerStatus, timerPhase]);

  const stats = data?.today ?? null;
  const pomodoros = stats?.completedPomodoros ?? null;
  const goalProgress = goal !== null && pomodoros !== null ? Math.min(pomodoros / goal, 1) : null;

  const week = data?.week.map((day) => day.completedPomodoros) ?? [0, 0, 0, 0, 0, 0, 0];
  const weekPomodoros = week.reduce((total, value) => total + value, 0);
  const weekFocusMs = data?.week.reduce((total, day) => total + day.focusMs, 0) ?? 0;

  const indicators: readonly { label: string; value: string | null }[] = [
    {
      label: 'Pomodoros concluídos',
      value: pomodoros === null ? null : goal === null ? String(pomodoros) : `${pomodoros}/${goal}`,
    },
    { label: 'Tempo de foco', value: stats ? formatFocusTime(stats.focusMs) : null },
    { label: 'Tarefas concluídas', value: stats ? String(stats.tasksCompleted) : null },
    { label: 'Tarefas em andamento', value: stats ? String(stats.tasksInProgress) : null },
  ];

  return (
    <>
      <PageHeader title="Dashboard" subtitle={dateFormatter.format(today)} />

      {failed ? (
        <p role="alert" className="panel mb-3 border-accent px-4 py-3 text-sm">
          Não foi possível calcular as estatísticas.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {indicators.map(({ label, value }, position) => (
          <Panel key={label} aria-label={label} className="px-5 py-4">
            <PanelLabel index={position + 1}>{label}</PanelLabel>
            <MetricValue value={value} />
            {position === 0 && goalProgress !== null && goal !== null ? (
              <div
                role="progressbar"
                aria-label="Progresso da meta diária"
                aria-valuemin={0}
                aria-valuemax={goal}
                aria-valuenow={Math.min(pomodoros ?? 0, goal)}
                className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/15"
              >
                <div
                  style={{ width: `${goalProgress * 100}%` }}
                  className="h-full rounded-full bg-linear-to-r from-accent/50 to-accent transition-[width] duration-300 ease-out"
                />
              </div>
            ) : null}
          </Panel>
        ))}
      </div>

      <div className="mt-3 grid items-start gap-3 lg:grid-cols-3">
        <Panel aria-label="Pomodoros por dia da semana" className="px-5 py-4 lg:col-span-2">
          <div className="flex items-center justify-between gap-3">
            <PanelLabel as="h2" index={indicators.length + 1}>
              Semana
            </PanelLabel>
            <div className="flex items-center gap-1">
              <span className="mr-1 text-xs text-ink-muted matrix:tracking-wider matrix:uppercase">
                {formatWeekRange(weekStart)}
              </span>
              <button
                type="button"
                aria-label="Semana anterior"
                title="Semana anterior"
                onClick={() => {
                  setWeekOffset((offset) => offset - 1);
                }}
                className={NAV_BUTTON}
              >
                <ChevronLeft size={16} aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Próxima semana"
                title="Próxima semana"
                disabled={weekOffset === 0}
                onClick={() => {
                  setWeekOffset((offset) => Math.min(offset + 1, 0));
                }}
                className={NAV_BUTTON}
              >
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="px-2 pt-7 pb-2">
            <WeekChart
              values={week}
              today={weekOffset === 0 ? mondayBasedWeekday(today) : undefined}
            />
          </div>

          <p className="mt-4 text-center text-xs text-ink-muted matrix:tracking-widest matrix:uppercase">
            {data === null
              ? isTauri()
                ? 'Calculando…'
                : 'Pré-visualização: as estatísticas só existem dentro do aplicativo desktop.'
              : weekPomodoros === 0
                ? 'Nenhum pomodoro concluído nesta semana.'
                : `${weekPomodoros} ${weekPomodoros === 1 ? 'pomodoro' : 'pomodoros'} · ${formatFocusTime(weekFocusMs)} de foco na semana`}
          </p>
        </Panel>

        <Panel aria-label="Calendário" className="px-5 py-4">
          <MonthCalendar today={today} index={indicators.length + 2} />
        </Panel>
      </div>
    </>
  );
}
