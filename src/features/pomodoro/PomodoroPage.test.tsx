import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PomodoroPage } from '@/features/pomodoro/PomodoroPage';
import type { TimerSnapshot } from '@/lib/commands';
import { useTimerStore } from '@/stores/timer';

type Command = () => Promise<TimerSnapshot>;

const backend = vi.hoisted(() => ({
  timerGetState: vi.fn<Command>(),
  timerStart: vi.fn<Command>(),
  timerPause: vi.fn<Command>(),
  timerSkip: vi.fn<Command>(),
  timerReset: vi.fn<Command>(),
  emit: undefined as ((snapshot: TimerSnapshot) => void) | undefined,
  unsubscribe: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@/lib/commands', () => ({
  timerGetState: backend.timerGetState,
  timerStart: backend.timerStart,
  timerPause: backend.timerPause,
  timerSkip: backend.timerSkip,
  timerReset: backend.timerReset,
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
}));
vi.mock('@/lib/events', () => ({
  subscribeTimerState: (handler: (snapshot: TimerSnapshot) => void) => {
    backend.emit = handler;
    return Promise.resolve(backend.unsubscribe);
  },
}));

const IDLE: TimerSnapshot = {
  phase: 'focus',
  status: 'idle',
  remainingMs: 25 * 60_000,
  plannedMs: 25 * 60_000,
  cyclePosition: 0,
  cyclesBeforeLongBreak: 4,
  pauseReason: null,
  taskId: null,
  routineId: null,
  routineRemainingMs: null,
  short: false,
};
const RUNNING: TimerSnapshot = { ...IDLE, status: 'running' };

/** Monta a tela já conectada ao "backend", como o App faz. */
async function renderConnected(initial: TimerSnapshot) {
  backend.timerGetState.mockResolvedValue(initial);
  let disconnect: () => void = () => undefined;
  render(<PomodoroPage />);
  await act(async () => {
    disconnect = useTimerStore.getState().connect();
    await Promise.resolve();
    await Promise.resolve();
  });
  return disconnect;
}

function emit(snapshot: TimerSnapshot) {
  act(() => {
    backend.emit?.(snapshot);
  });
}

describe('PomodoroPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backend.emit = undefined;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    useTimerStore.setState(useTimerStore.getInitialState(), true);
  });

  it('mostra a fase, o tempo e os controles do estado parado', async () => {
    await renderConnected(IDLE);

    expect(screen.getByText('Foco · Pronto')).toBeVisible();
    expect(screen.getByRole('timer', { name: '25 minutos restantes' })).toHaveTextContent('25:00');
    expect(screen.getByRole('button', { name: 'Iniciar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Pular' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reiniciar' })).toBeDisabled();
    expect(screen.getByRole('img', { name: '0 de 4 focos do ciclo' })).toBeInTheDocument();
  });

  it('inicia pelo backend e passa a oferecer a pausa', async () => {
    const user = userEvent.setup();
    backend.timerStart.mockResolvedValue(RUNNING);
    await renderConnected(IDLE);

    await user.click(screen.getByRole('button', { name: 'Iniciar' }));

    expect(backend.timerStart).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Foco · Em andamento')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Pausar' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Reiniciar' })).toBeEnabled();
  });

  it('exibe o tempo que chega pelos eventos, sem contar por conta própria', async () => {
    vi.useFakeTimers();
    try {
      await renderConnected(RUNNING);

      // O tempo local passa, mas nenhum evento chega: a tela não se mexe.
      act(() => {
        vi.advanceTimersByTime(10_000);
      });
      expect(screen.getByRole('timer')).toHaveTextContent('25:00');

      emit({ ...RUNNING, remainingMs: 24 * 60_000 + 58_400 });

      expect(
        screen.getByRole('timer', { name: '24 minutos e 59 segundos restantes' }),
      ).toHaveTextContent('24:59');
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    } finally {
      vi.useRealTimers();
    }
  });

  it('acompanha a troca de fase e a posição no ciclo', async () => {
    await renderConnected(RUNNING);

    emit({
      ...IDLE,
      phase: 'shortBreak',
      remainingMs: 5 * 60_000,
      plannedMs: 5 * 60_000,
      cyclePosition: 1,
    });

    expect(screen.getByText('Pausa curta · Pronto')).toBeVisible();
    expect(screen.getByRole('timer')).toHaveTextContent('05:00');
    expect(screen.getByRole('img', { name: '1 de 4 focos do ciclo' })).toBeInTheDocument();
  });

  it('pausa, pula e reinicia pelos comandos correspondentes', async () => {
    const user = userEvent.setup();
    backend.timerPause.mockResolvedValue({ ...RUNNING, status: 'paused', pauseReason: 'user' });
    backend.timerReset.mockResolvedValue(IDLE);
    backend.timerSkip.mockResolvedValue({ ...IDLE, phase: 'shortBreak', cyclePosition: 1 });
    await renderConnected(RUNNING);

    await user.click(screen.getByRole('button', { name: 'Pausar' }));
    expect(screen.getByRole('button', { name: 'Retomar' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Reiniciar' }));
    expect(screen.getByRole('button', { name: 'Iniciar' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Pular' }));
    expect(screen.getByText('Pausa curta · Pronto')).toBeVisible();

    expect(backend.timerPause).toHaveBeenCalledTimes(1);
    expect(backend.timerReset).toHaveBeenCalledTimes(1);
    expect(backend.timerSkip).toHaveBeenCalledTimes(1);
  });

  it('explica a pausa automática após suspensão', async () => {
    await renderConnected({ ...RUNNING, status: 'paused', pauseReason: 'suspend' });

    expect(screen.getByRole('status')).toHaveTextContent('Pausado automaticamente');
    expect(screen.getByRole('button', { name: 'Retomar' })).toBeEnabled();
  });

  it('mostra o erro quando um comando falha e mantém o estado anterior', async () => {
    const user = userEvent.setup();
    backend.timerStart.mockRejectedValue({ kind: 'database', message: 'disco cheio' });
    await renderConnected(IDLE);

    await user.click(screen.getByRole('button', { name: 'Iniciar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('disco cheio');
    expect(screen.getByText('Foco · Pronto')).toBeVisible();
  });

  it('mantém os controles desabilitados até a primeira leitura', () => {
    render(<PomodoroPage />);

    expect(screen.getByRole('button', { name: 'Iniciar' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pular' })).toBeDisabled();
  });

  it('cancela a assinatura ao desconectar', async () => {
    const disconnect = await renderConnected(IDLE);

    disconnect();

    expect(backend.unsubscribe).toHaveBeenCalledTimes(1);
  });
});
