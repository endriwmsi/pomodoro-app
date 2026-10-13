import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { addDays, startOfDay, startOfWeek, weekBoundaries } from '@/lib/calendar';
import type { Dashboard, PeriodStats, Task } from '@/lib/commands';
import { useSettingsStore } from '@/stores/settings';
import { useTasksStore } from '@/stores/tasks';

const backend = vi.hoisted(() => ({
  analyticsDashboard:
    vi.fn<(todayStartMs: number, todayEndMs: number, week: number[]) => Promise<Dashboard>>(),
  analyticsPeriods: vi.fn<(boundaries: number[]) => Promise<PeriodStats[]>>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@/lib/commands', () => ({
  analyticsDashboard: backend.analyticsDashboard,
  analyticsPeriods: backend.analyticsPeriods,
}));

const MINUTE = 60_000;

const TASK: Task = {
  id: 0,
  title: 'Tarefa',
  description: '',
  priority: 'medium',
  status: 'todo',
  position: 0,
  dueDate: null,
  estimatedPomodoros: null,
  createdAtMs: 0,
  updatedAtMs: 0,
  completedAtMs: null,
  completedPomodoros: 0,
};

function dashboard(week: number[], today: Partial<Dashboard['today']> = {}): Dashboard {
  return {
    today: {
      completedPomodoros: 3,
      focusMs: 85 * MINUTE,
      tasksCompleted: 2,
      tasksInProgress: 1,
      ...today,
    },
    week: week.map((completedPomodoros, day) => ({
      startMs: day,
      endMs: day + 1,
      completedPomodoros,
      focusMs: completedPomodoros * 25 * MINUTE,
      tasksCompleted: 0,
    })),
  };
}

async function renderDashboard() {
  render(<DashboardPage />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function indicator(name: string) {
  return screen.getByRole('region', { name });
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    backend.analyticsDashboard.mockResolvedValue(dashboard([2, 0, 3, 1, 0, 0, 0]));
    backend.analyticsPeriods.mockResolvedValue([]);
  });

  afterEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
    useTasksStore.setState(useTasksStore.getInitialState(), true);
  });

  it('pede as estatísticas de hoje e da semana atual, em limites locais', async () => {
    await renderDashboard();

    const today = startOfDay(new Date());
    expect(backend.analyticsDashboard).toHaveBeenCalledExactlyOnceWith(
      today.getTime(),
      addDays(today, 1).getTime(),
      weekBoundaries(startOfWeek(today)),
    );
  });

  it('mostra os indicadores do dia vindos do backend', async () => {
    await renderDashboard();

    expect(indicator('Pomodoros concluídos')).toHaveTextContent('3');
    expect(indicator('Tempo de foco')).toHaveTextContent('1h 25m');
    expect(indicator('Tarefas concluídas')).toHaveTextContent('2');
    expect(indicator('Tarefas em andamento')).toHaveTextContent('1');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('com meta diária, mostra o progresso em relação a ela', async () => {
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, goals: { dailyPomodoros: 8 } },
    }));

    await renderDashboard();

    expect(indicator('Pomodoros concluídos')).toHaveTextContent('3/8');
    const progress = screen.getByRole('progressbar', { name: 'Progresso da meta diária' });
    expect(progress).toHaveAttribute('aria-valuenow', '3');
    expect(progress).toHaveAttribute('aria-valuemax', '8');
  });

  it('o progresso não passa da meta quando ela é superada', async () => {
    backend.analyticsDashboard.mockResolvedValue(
      dashboard([0, 0, 0, 0, 0, 0, 0], { completedPomodoros: 11 }),
    );
    useSettingsStore.setState((state) => ({
      settings: { ...state.settings, goals: { dailyPomodoros: 8 } },
    }));

    await renderDashboard();

    expect(indicator('Pomodoros concluídos')).toHaveTextContent('11/8');
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '8');
  });

  it('descreve o gráfico semanal e soma a semana', async () => {
    await renderDashboard();

    const chart = indicator('Pomodoros por dia da semana');
    expect(
      within(chart).getByRole('img', {
        name: 'Pomodoros concluídos por dia: segunda 2, terça 0, quarta 3, quinta 1, sexta 0, sábado 0, domingo 0',
      }),
    ).toBeInTheDocument();
    expect(chart).toHaveTextContent('6 pomodoros · 2h 30m de foco na semana');
  });

  it('semana sem sessões', async () => {
    backend.analyticsDashboard.mockResolvedValue(dashboard([0, 0, 0, 0, 0, 0, 0]));

    await renderDashboard();

    expect(
      screen.getByRole('img', { name: 'Nenhum pomodoro concluído nesta semana' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Nenhum pomodoro concluído nesta semana.')).toBeVisible();
  });

  it('navega para semanas anteriores e não passa da atual', async () => {
    const user = userEvent.setup();
    await renderDashboard();
    const today = startOfDay(new Date());
    const next = screen.getByRole('button', { name: 'Próxima semana' });
    expect(next).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Semana anterior' }));

    // "Hoje" continua sendo hoje; só a semana do gráfico muda.
    expect(backend.analyticsDashboard).toHaveBeenLastCalledWith(
      today.getTime(),
      addDays(today, 1).getTime(),
      weekBoundaries(addDays(startOfWeek(today), -7)),
    );
    expect(next).toBeEnabled();

    await user.click(next);

    expect(backend.analyticsDashboard).toHaveBeenLastCalledWith(
      today.getTime(),
      addDays(today, 1).getTime(),
      weekBoundaries(startOfWeek(today)),
    );
    expect(next).toBeDisabled();
  });

  it('o calendário pede um período por dia do mês atual', async () => {
    await renderDashboard();

    const today = startOfDay(new Date());
    const first = new Date(today.getFullYear(), today.getMonth(), 1);
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const boundaries = backend.analyticsPeriods.mock.calls[0]?.[0] ?? [];
    expect(boundaries).toHaveLength(daysInMonth + 1);
    expect(boundaries[0]).toBe(first.getTime());
    expect(boundaries[daysInMonth]).toBe(
      new Date(today.getFullYear(), today.getMonth() + 1, 1).getTime(),
    );
  });

  it('marca no calendário os dias com focos, tarefas concluídas e prazos', async () => {
    const today = startOfDay(new Date());
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const iso = (day: number) =>
      `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    backend.analyticsPeriods.mockResolvedValue(
      Array.from({ length: daysInMonth }, (_, offset) => ({
        startMs: offset,
        endMs: offset + 1,
        completedPomodoros: offset === 0 ? 3 : 0,
        focusMs: 0,
        tasksCompleted: offset === 1 ? 1 : 0,
      })),
    );
    useTasksStore.setState({
      tasks: [
        { ...TASK, id: 1, dueDate: iso(2) },
        { ...TASK, id: 2, dueDate: iso(2) },
        // Concluída: o prazo deixa de ser marcado.
        { ...TASK, id: 3, dueDate: iso(3), status: 'done', completedAtMs: 1 },
      ],
    });

    await renderDashboard();

    const days = within(screen.getByRole('list', { name: 'Dias do mês' })).getAllByRole('listitem');
    expect(days).toHaveLength(daysInMonth);
    expect(days[0]).toHaveAccessibleName(/^1 de .*3 pomodoros concluídos$/);
    expect(days[1]).toHaveAccessibleName(/^2 de .*1 tarefa concluída, 2 prazos$/);
    expect(days[2]).toHaveAccessibleName(/^3 de [^,]*$/);
    expect(days[0]?.querySelectorAll('[data-marker]')).toHaveLength(1);
    expect(days[1]?.querySelectorAll('[data-marker]')).toHaveLength(2);
    expect(days[2]?.querySelectorAll('[data-marker]')).toHaveLength(0);
  });

  it('destaca o dia de hoje e navega entre os meses', async () => {
    const user = userEvent.setup();
    await renderDashboard();
    const today = startOfDay(new Date());
    const calendar = within(screen.getByRole('region', { name: 'Calendário' }));

    const current = calendar.getAllByRole('listitem').filter((day) => day.ariaCurrent === 'date');
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveAccessibleName(/\(hoje\)/);

    await user.click(calendar.getByRole('button', { name: 'Mês anterior' }));

    const previous = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    expect(backend.analyticsPeriods.mock.lastCall?.[0][0]).toBe(previous.getTime());
    expect(
      calendar.getAllByRole('listitem').filter((day) => day.ariaCurrent === 'date'),
    ).toHaveLength(0);
  });

  it('avisa quando o cálculo falha, sem inventar números', async () => {
    backend.analyticsDashboard.mockRejectedValue({ kind: 'database', message: 'falhou' });

    await renderDashboard();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível calcular as estatísticas.',
    );
    expect(within(indicator('Tempo de foco')).getByText('—')).toBeVisible();
  });
});
