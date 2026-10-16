import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  MediaAction,
  MediaState,
  NotchLayout,
  Routine,
  Settings,
  Task,
  TaskStatus,
  TimerSnapshot,
  WeatherReport,
} from '@/lib/commands';
import { NotchApp } from '@/notch/NotchApp';
import { DEFAULT_NOTCH_BORDER, DEFAULT_TIMER_SETTINGS, useSettingsStore } from '@/stores/settings';
import { useMediaStore } from '@/stores/media';
import { useRoutinesStore } from '@/stores/routines';
import { useTasksStore } from '@/stores/tasks';
import { useTimerStore } from '@/stores/timer';

const backend = vi.hoisted(() => ({
  notchSetLayout: vi.fn<(layout: NotchLayout) => Promise<void>>(),
  showMainWindow: vi.fn<() => Promise<void>>(),
  timerGetState: vi.fn<() => Promise<TimerSnapshot>>(),
  timerStart: vi.fn<() => Promise<TimerSnapshot>>(),
  timerPause: vi.fn<() => Promise<TimerSnapshot>>(),
  timerSkip: vi.fn<() => Promise<TimerSnapshot>>(),
  getSettings: vi.fn<() => Promise<Settings>>(),
  tasksList: vi.fn<() => Promise<Task[]>>(),
  taskMove: vi.fn<(id: number, status: TaskStatus, index: number) => Promise<Task[]>>(),
  timerFocusTask: vi.fn<(id: number) => Promise<TimerSnapshot>>(),
  mediaGetState: vi.fn<() => Promise<MediaState>>(),
  mediaControl: vi.fn<(action: MediaAction) => Promise<MediaState>>(),
  mediaGetArtwork: vi.fn<() => Promise<string | null>>(),
  mediaSetVolume: vi.fn<(level: number) => Promise<MediaState>>(),
  mediaSeek: vi.fn<(positionMs: number) => Promise<MediaState>>(),
  routinesList: vi.fn<() => Promise<Routine[]>>(),
  routineSkip: vi.fn<() => Promise<TimerSnapshot>>(),
  weatherGet: vi.fn<() => Promise<WeatherReport>>(),
  emitTimer: undefined as ((snapshot: TimerSnapshot) => void) | undefined,
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@/lib/commands', () => ({
  notchSetLayout: backend.notchSetLayout,
  showMainWindow: backend.showMainWindow,
  timerGetState: backend.timerGetState,
  timerStart: backend.timerStart,
  timerPause: backend.timerPause,
  timerSkip: backend.timerSkip,
  timerReset: vi.fn(),
  getSettings: backend.getSettings,
  updateSettings: vi.fn(),
  tasksList: backend.tasksList,
  taskMove: backend.taskMove,
  timerFocusTask: backend.timerFocusTask,
  mediaGetState: backend.mediaGetState,
  mediaControl: backend.mediaControl,
  mediaGetArtwork: backend.mediaGetArtwork,
  mediaSetVolume: backend.mediaSetVolume,
  mediaSeek: backend.mediaSeek,
  routinesList: backend.routinesList,
  routineSkip: backend.routineSkip,
  weatherGet: backend.weatherGet,
}));
vi.mock('@/lib/events', () => ({
  subscribeTimerState: (handler: (snapshot: TimerSnapshot) => void) => {
    backend.emitTimer = handler;
    return Promise.resolve(() => undefined);
  },
  subscribeSettingsChanged: () => Promise.resolve(() => undefined),
  subscribeTasksChanged: () => Promise.resolve(() => undefined),
  subscribeRoutinesChanged: () => Promise.resolve(() => undefined),
}));

const RUNNING: TimerSnapshot = {
  phase: 'focus',
  status: 'running',
  remainingMs: 24 * 60_000 + 30_000,
  plannedMs: 25 * 60_000,
  cyclePosition: 0,
  cyclesBeforeLongBreak: 4,
  pauseReason: null,
  taskId: null,
  routineId: null,
  routineRemainingMs: null,
  short: false,
};

function task(id: number, title: string, status: TaskStatus, position: number): Task {
  return {
    id,
    title,
    description: '',
    priority: 'medium',
    status,
    position,
    dueDate: null,
    estimatedPomodoros: null,
    createdAtMs: 0,
    updatedAtMs: 0,
    completedAtMs: status === 'done' ? 1 : null,
    completedPomodoros: 0,
  };
}

const TASKS: Task[] = [
  task(1, 'Escrever relatório', 'todo', 0),
  task(2, 'Preparar reunião', 'doing', 0),
  task(3, 'Enviar proposta', 'done', 0),
];

const SILENT: MediaState = {
  available: false,
  playing: false,
  title: '',
  artist: '',
  app: '',
  canPrevious: false,
  canNext: false,
  canShuffle: false,
  canRepeat: false,
  shuffle: null,
  repeat: null,
  volume: 0.4,
  volumeScope: 'system',
  positionMs: null,
  durationMs: null,
  canSeek: false,
};

const PLAYING: MediaState = {
  available: true,
  playing: true,
  title: 'Clube da Esquina',
  artist: 'Milton Nascimento',
  app: 'Spotify.exe',
  canPrevious: true,
  canNext: true,
  canShuffle: true,
  canRepeat: true,
  shuffle: false,
  repeat: 'none',
  volume: 0.4,
  volumeScope: 'app',
  positionMs: 60_000,
  durationMs: 200_000,
  canSeek: true,
};

const SETTINGS: Settings = {
  appearance: { template: 'glass', background: { kind: 'default' } },
  timer: DEFAULT_TIMER_SETTINGS,
  notch: { enabled: true, position: 'top', theme: 'dark', border: DEFAULT_NOTCH_BORDER },
  alerts: { soundEnabled: true, notificationsEnabled: true },
  goals: { dailyPomodoros: null },
  weather: { enabled: false, useLocation: false },
  general: { launchAtLogin: false },
  workday: { enabled: false, startMinute: 540, endMinute: 1080 },
  updates: { autoUpdate: true },
};

const SIDE_SETTINGS: Settings = {
  ...SETTINGS,
  notch: { ...SETTINGS.notch, position: 'right' },
};

function place(name: string, temperatureC: number, detail = ''): WeatherReport['places'][number] {
  return {
    name,
    detail,
    temperatureC,
    condition: 'partlyCloudy',
    night: false,
    windKmh: 14.2,
    humidityPercent: 44,
    hourly: [
      { time: '2026-10-13T14:00', condition: 'partlyCloudy', temperatureC: 22.6, night: false },
      { time: '2026-10-13T15:00', condition: 'cloudy', temperatureC: 23, night: false },
      { time: '2026-10-13T16:00', condition: 'rain', temperatureC: 21.4, night: false },
      { time: '2026-10-13T17:00', condition: 'rain', temperatureC: 20, night: false },
      { time: '2026-10-13T18:00', condition: 'clear', temperatureC: 18.2, night: true },
    ],
    daily: [{ date: '2026-10-13', condition: 'rain', minC: 17.4, maxC: 28.2 }],
  };
}

function timerPanel() {
  return screen.getByRole('tabpanel', { name: 'Timer' });
}

/** Deixa promessas pendentes e o requestAnimationFrame da abertura resolverem. */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(50);
  });
}

async function renderNotch() {
  const view = render(<NotchApp />);
  await settle();
  const hoverArea = view.container.firstElementChild;
  if (!hoverArea) throw new Error('notch não renderizado');
  return hoverArea;
}

describe('NotchApp', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    backend.notchSetLayout.mockResolvedValue();
    backend.showMainWindow.mockResolvedValue();
    backend.timerGetState.mockResolvedValue(RUNNING);
    backend.tasksList.mockResolvedValue(TASKS);
    backend.mediaGetState.mockResolvedValue(SILENT);
    backend.routinesList.mockResolvedValue([]);
    backend.mediaGetArtwork.mockResolvedValue(null);
    backend.timerPause.mockResolvedValue({ ...RUNNING, status: 'paused', pauseReason: 'user' });
    backend.getSettings.mockResolvedValue(SETTINGS);
  });

  afterEach(() => {
    vi.useRealTimers();
    useTimerStore.setState(useTimerStore.getInitialState(), true);
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
    useTasksStore.setState(useTasksStore.getInitialState(), true);
    useMediaStore.setState(useMediaStore.getInitialState(), true);
    useRoutinesStore.setState(useRoutinesStore.getInitialState(), true);
  });

  it('mostra o tempo e a fase vindos do backend', async () => {
    await renderNotch();

    expect(
      screen.getByRole('timer', { name: '24 minutos e 30 segundos restantes' }),
    ).toHaveTextContent('24:30');
    expect(timerPanel()).toHaveTextContent('Foco');
  });

  it('pede a expansão da janela ao passar o mouse', async () => {
    const hoverArea = await renderNotch();

    fireEvent.mouseEnter(hoverArea);
    await settle();

    expect(backend.notchSetLayout).toHaveBeenCalledExactlyOnceWith('expanded');
  });

  it('recolhe depois de um atraso quando o mouse sai', async () => {
    const hoverArea = await renderNotch();
    fireEvent.mouseEnter(hoverArea);
    await settle();

    fireEvent.mouseLeave(hoverArea);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(backend.notchSetLayout).not.toHaveBeenCalledWith('collapsed');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    expect(backend.notchSetLayout).toHaveBeenLastCalledWith('collapsed');
  });

  it('não recolhe se o mouse voltar durante o atraso', async () => {
    const hoverArea = await renderNotch();
    fireEvent.mouseEnter(hoverArea);
    await settle();

    fireEvent.mouseLeave(hoverArea);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200);
    });
    fireEvent.mouseEnter(hoverArea);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(backend.notchSetLayout).not.toHaveBeenCalledWith('collapsed');
  });

  it('permanece aberto quando fixado por clique', async () => {
    const hoverArea = await renderNotch();
    fireEvent.mouseEnter(hoverArea);
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'Manter o painel aberto' }));
    fireEvent.mouseLeave(hoverArea);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });

    expect(screen.getByRole('button', { name: 'Soltar o painel' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(backend.notchSetLayout).not.toHaveBeenCalledWith('collapsed');
  });

  it('controla o timer e abre a janela principal', async () => {
    await renderNotch();

    fireEvent.click(screen.getByRole('button', { name: 'Pausar' }));
    await settle();
    expect(backend.timerPause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Retomar' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Pular' }));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir o Compasso' }));
    await settle();
    expect(backend.timerSkip).toHaveBeenCalledTimes(1);
    expect(backend.showMainWindow).toHaveBeenCalledTimes(1);
  });

  it('no topo, a forma cresce na horizontal ao abrir', async () => {
    const hoverArea = await renderNotch();
    const body = screen.getByRole('region', { name: 'Compasso' });
    expect(body).toHaveStyle({ width: '132px', height: '12px' });

    fireEvent.mouseEnter(hoverArea);
    await settle();

    expect(body).toHaveStyle({ width: '580px', height: '216px' });
  });

  it('na lateral, a forma fica em pé e abre para dentro da tela', async () => {
    backend.getSettings.mockResolvedValue(SIDE_SETTINGS);
    await renderNotch();
    const hoverArea = document.querySelector('.h-screen');
    if (!hoverArea) throw new Error('notch não renderizado');
    const body = screen.getByRole('region', { name: 'Compasso' });
    expect(body).toHaveStyle({ width: '12px', height: '132px' });

    fireEvent.mouseEnter(hoverArea);
    await settle();

    expect(body).toHaveStyle({ width: '260px', height: '380px' });
    expect(screen.getByRole('timer')).toHaveTextContent('24:30');
  });

  it('troca de aba pela roda do mouse, com intervalo mínimo entre trocas', async () => {
    const hoverArea = await renderNotch();
    fireEvent.mouseEnter(hoverArea);
    await settle();
    const tab = (name: string) => screen.getByRole('tab', { name });
    expect(tab('Timer')).toHaveAttribute('aria-selected', 'true');

    fireEvent.wheel(hoverArea, { deltaY: 100 });
    expect(tab('Tarefas')).toHaveAttribute('aria-selected', 'true');

    // Um segundo giro imediato é ignorado; depois do intervalo, volta.
    fireEvent.wheel(hoverArea, { deltaY: -100 });
    expect(tab('Tarefas')).toHaveAttribute('aria-selected', 'true');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    fireEvent.wheel(hoverArea, { deltaY: -100 });
    expect(tab('Timer')).toHaveAttribute('aria-selected', 'true');

    // Não passa da primeira aba.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    fireEvent.wheel(hoverArea, { deltaY: -100 });
    expect(tab('Timer')).toHaveAttribute('aria-selected', 'true');
  });

  it('a roda não troca de aba com o notch recolhido', async () => {
    const hoverArea = await renderNotch();

    fireEvent.wheel(hoverArea, { deltaY: 100 });

    expect(screen.getByRole('tab', { name: 'Timer' })).toHaveAttribute('aria-selected', 'true');
  });

  it('troca de aba por clique e lista as tarefas abertas, as em andamento primeiro', async () => {
    await renderNotch();

    fireEvent.click(screen.getByRole('tab', { name: 'Tarefas' }));

    const list = screen.getByRole('list', { name: 'Tarefas abertas' });
    expect(list).toHaveTextContent(/Preparar reunião.*Escrever relatório/);
    expect(list).not.toHaveTextContent('Enviar proposta');
  });

  it('foca em uma tarefa e a conclui a partir do notch', async () => {
    backend.timerFocusTask.mockResolvedValue({ ...RUNNING, taskId: 1 });
    backend.taskMove.mockResolvedValue(TASKS.filter((item) => item.id !== 2));
    await renderNotch();

    fireEvent.click(screen.getByRole('button', { name: 'Focar em Escrever relatório' }));
    await settle();
    expect(backend.timerFocusTask).toHaveBeenCalledExactlyOnceWith(1);
    expect(screen.getByRole('button', { name: 'Focar em Escrever relatório' })).toHaveTextContent(
      'Em foco',
    );
    // A aba do timer passa a mostrar a tarefa escolhida.
    expect(screen.getByRole('tabpanel', { name: 'Timer' })).toHaveTextContent('Escrever relatório');

    fireEvent.click(screen.getByRole('checkbox', { name: 'Concluir Preparar reunião' }));
    await settle();
    expect(backend.taskMove).toHaveBeenCalledWith(2, 'done', expect.any(Number));
    expect(
      screen.queryByRole('button', { name: 'Focar em Preparar reunião' }),
    ).not.toBeInTheDocument();
  });

  it('sem tarefas abertas, oferece abrir o quadro', async () => {
    backend.tasksList.mockResolvedValue([]);
    await renderNotch();

    fireEvent.click(screen.getByRole('button', { name: 'Abrir o quadro' }));
    await settle();

    expect(backend.showMainWindow).toHaveBeenCalledExactlyOnceWith('kanban');
  });

  it('a aba de clima só existe com a previsão ligada', async () => {
    await renderNotch();
    expect(screen.queryByRole('tab', { name: 'Clima' })).not.toBeInTheDocument();
    expect(backend.weatherGet).not.toHaveBeenCalled();
  });

  it('com a previsão ligada, mostra a localização do usuário', async () => {
    backend.getSettings.mockResolvedValue({
      ...SETTINGS,
      weather: { enabled: true, useLocation: true },
    });
    backend.weatherGet.mockResolvedValue({
      source: 'location',
      ageMs: 0,
      stale: false,
      places: [place('Campinas', 22.6, 'São Paulo, Brasil')],
    });
    await renderNotch();

    fireEvent.click(screen.getByRole('tab', { name: 'Clima' }));
    await settle();

    const panel = screen.getByRole('tabpanel', { name: 'Clima' });
    // A cidade em destaque e, abaixo, estado e país.
    expect(within(panel).getByRole('heading')).toHaveTextContent(/^Campinas$/);
    expect(panel).toHaveTextContent('São Paulo, Brasil');
    expect(panel).toHaveTextContent('23°');
    expect(panel).toHaveTextContent('Parcialmente nublado');
    expect(panel).toHaveTextContent('14 km/h');
    expect(panel).toHaveTextContent('44%');
    // De duas em duas horas, a partir de agora.
    expect(screen.getByRole('list', { name: 'Próximas horas' })).toHaveTextContent(
      /^Agora.*23°16h.*21°18h.*18°$/,
    );
    // Ícones coloridos próprios; à noite, a lua no lugar do sol.
    const icons = [...panel.querySelectorAll('[data-weather-icon]')].map((icon) =>
      icon.getAttribute('data-weather-icon'),
    );
    expect(icons).toEqual(['partlyCloudy', 'partlyCloudy', 'rain', 'clear-night']);
    // Um lugar só: não há o que trocar.
    expect(screen.queryByRole('button', { name: 'Próximo lugar' })).not.toBeInTheDocument();
  });

  it('sem localização, mostra uma capital por vez e avisa quando os dados estão desatualizados', async () => {
    backend.getSettings.mockResolvedValue({
      ...SETTINGS,
      weather: { enabled: true, useLocation: false },
    });
    backend.weatherGet.mockResolvedValue({
      source: 'capitals',
      ageMs: 20 * 60_000,
      stale: true,
      places: [place('São Paulo', 27.9, 'SP, Brasil'), place('Manaus', 33.2, 'AM, Brasil')],
    });
    await renderNotch();

    const panel = screen.getByRole('tabpanel', { name: 'Clima' });
    const heading = within(panel).getByRole('heading');
    expect(heading).toHaveTextContent('São Paulo');
    expect(panel).toHaveTextContent('28°');
    expect(panel).toHaveTextContent('Sem conexão — exibindo a última previsão.');

    fireEvent.click(screen.getByRole('button', { name: 'Próximo lugar' }));
    expect(heading).toHaveTextContent('Manaus');
    expect(panel).toHaveTextContent('33°');

    // As setas dão a volta na lista.
    fireEvent.click(screen.getByRole('button', { name: 'Próximo lugar' }));
    expect(heading).toHaveTextContent('São Paulo');
    fireEvent.click(screen.getByRole('button', { name: 'Lugar anterior' }));
    expect(heading).toHaveTextContent('Manaus');
  });

  it('sem conexão e sem dados, explica e deixa tentar de novo', async () => {
    backend.getSettings.mockResolvedValue({
      ...SETTINGS,
      weather: { enabled: true, useLocation: false },
    });
    backend.weatherGet.mockRejectedValue({ kind: 'network', message: 'timeout' });
    await renderNotch();

    expect(screen.getByRole('alert')).toHaveTextContent('Sem conexão com o serviço de previsão.');
    fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
    await settle();

    expect(backend.weatherGet).toHaveBeenCalledTimes(2);
  });

  it('mesmo com música tocando, o painel abre na aba em que estava', async () => {
    backend.mediaGetState.mockResolvedValue(PLAYING);
    const hoverArea = await renderNotch();

    fireEvent.mouseEnter(hoverArea);
    await settle();

    expect(screen.getByRole('tab', { name: 'Timer' })).toHaveAttribute('aria-selected', 'true');
    expect(backend.notchSetLayout).toHaveBeenCalledExactlyOnceWith('expanded');
    // A música aparece no player compacto, ao lado.
    expect(screen.getByRole('region', { name: 'Player de música' })).toHaveTextContent(
      'Clube da Esquina',
    );

    fireEvent.click(screen.getByRole('tab', { name: 'Música' }));
    await settle();
    const panel = screen.getByRole('tabpanel', { name: 'Música' });
    expect(panel).toHaveTextContent('Clube da Esquina');
    expect(panel).toHaveTextContent('Milton Nascimento');
  });

  it('sem música, o painel abre na aba em que estava', async () => {
    const hoverArea = await renderNotch();

    fireEvent.mouseEnter(hoverArea);
    await settle();

    expect(screen.getByRole('tab', { name: 'Timer' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: 'Música' }));
    await settle();
    expect(screen.getByRole('tabpanel', { name: 'Música' })).toHaveTextContent('Nada tocando');
    expect(screen.getByRole('button', { name: 'Tocar a música' })).toBeDisabled();
  });

  it('controla a música: faixas, ordem aleatória, repetição e volume do aplicativo', async () => {
    backend.mediaGetState.mockResolvedValue(PLAYING);
    backend.mediaControl.mockResolvedValue({ ...PLAYING, playing: false, shuffle: true });
    backend.mediaSetVolume.mockResolvedValue({ ...PLAYING, volume: 0.45 });
    const hoverArea = await renderNotch();
    fireEvent.mouseEnter(hoverArea);
    await settle();
    fireEvent.click(screen.getByRole('tab', { name: 'Música' }));
    await settle();
    const panel = within(screen.getByRole('tabpanel', { name: 'Música' }));

    for (const name of [
      'Próxima faixa',
      'Faixa anterior',
      'Ordem aleatória',
      'Repetição',
      'Pausar a música',
    ]) {
      fireEvent.click(panel.getByRole('button', { name }));
    }
    await settle();
    expect(backend.mediaControl.mock.calls.map(([action]) => action)).toEqual([
      'next',
      'previous',
      'toggleShuffle',
      'cycleRepeat',
      'playPause',
    ]);
    expect(panel.getByRole('button', { name: 'Tocar a música' })).toBeInTheDocument();
    expect(panel.getByRole('button', { name: 'Ordem aleatória' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    // O controle é vertical e se refere ao aplicativo que toca, não ao sistema.
    const volume = panel.getByRole('slider', { name: 'Volume do aplicativo de música' });
    expect(volume).toHaveAttribute('aria-orientation', 'vertical');
    expect(volume).toHaveAttribute('aria-valuenow', '40');
    fireEvent.keyDown(volume, { key: 'ArrowUp' });
    await settle();
    expect(backend.mediaSetVolume).toHaveBeenCalledExactlyOnceWith(0.45);
    expect(volume).toHaveAttribute('aria-valuenow', '45');
  });

  it('avisa quando o volume controlado é o do sistema', async () => {
    backend.mediaGetState.mockResolvedValue({ ...PLAYING, volumeScope: 'system' });
    const hoverArea = await renderNotch();
    fireEvent.mouseEnter(hoverArea);
    await settle();

    expect(screen.getByRole('slider', { name: 'Volume do sistema' })).toBeInTheDocument();
  });

  it('mostra o progresso da faixa, que avança sozinho, e muda a posição', async () => {
    backend.mediaGetState.mockResolvedValue(PLAYING);
    backend.mediaSeek.mockResolvedValue({ ...PLAYING, positionMs: 65_000 });
    await renderNotch();
    await act(() => useMediaStore.getState().refresh());
    const panel = within(screen.getByRole('tabpanel', { name: 'Música' }));
    const seek = panel.getByRole('slider', { name: 'Posição na faixa' });

    expect(seek).toHaveAttribute('aria-valuetext', '1:00 de 3:20');
    expect(seek).toHaveAttribute('aria-valuemax', '200');

    // Tocando, a barra anda pelo relógio, sem nova leitura da mídia.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(seek).toHaveAttribute('aria-valuetext', '1:03 de 3:20');
    expect(backend.mediaGetState).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(seek, { key: 'ArrowRight' });
    await settle();
    expect(backend.mediaSeek).toHaveBeenCalledExactlyOnceWith(68_000);
    expect(seek).toHaveAttribute('aria-valuetext', '1:05 de 3:20');
  });

  it('pausada, a posição não avança; sem permissão, não pode ser mudada', async () => {
    backend.mediaGetState.mockResolvedValue({ ...PLAYING, playing: false, canSeek: false });
    await renderNotch();
    await act(() => useMediaStore.getState().refresh());
    const seek = within(screen.getByRole('tabpanel', { name: 'Música' })).getByRole('slider', {
      name: 'Posição na faixa',
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(seek).toHaveAttribute('aria-valuetext', '1:00 de 3:20');
    expect(seek).toHaveAttribute('aria-disabled', 'true');

    fireEvent.keyDown(seek, { key: 'ArrowRight' });
    expect(backend.mediaSeek).not.toHaveBeenCalled();
  });

  it('sem duração conhecida, não há controle de posição', async () => {
    backend.mediaGetState.mockResolvedValue({ ...PLAYING, positionMs: null, durationMs: null });
    await renderNotch();
    await act(() => useMediaStore.getState().refresh());

    expect(screen.queryByRole('slider', { name: 'Posição na faixa' })).not.toBeInTheDocument();
  });

  it('nas laterais, o player é empilhado e o volume fica deitado abaixo dos controles', async () => {
    backend.getSettings.mockResolvedValue(SIDE_SETTINGS);
    backend.mediaGetState.mockResolvedValue(PLAYING);
    await renderNotch();
    await act(() => useMediaStore.getState().refresh());
    const panel = within(screen.getByRole('tabpanel', { name: 'Música' }));

    const volume = panel.getByRole('slider', { name: 'Volume do aplicativo de música' });
    expect(volume).toHaveAttribute('aria-orientation', 'horizontal');
    // Depois dos controles e da barra de progresso, na ordem do documento.
    const seek = panel.getByRole('slider', { name: 'Posição na faixa' });
    const next = panel.getByRole('button', { name: 'Próxima faixa' });
    expect(next.compareDocumentPosition(seek)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(seek.compareDocumentPosition(volume)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('nas outras abas, mostra o player compacto ao lado do conteúdo', async () => {
    backend.mediaGetState.mockResolvedValue({ ...PLAYING, playing: false });
    backend.mediaControl.mockResolvedValue(PLAYING);
    const hoverArea = await renderNotch();
    fireEvent.mouseEnter(hoverArea);
    await settle();

    // O painel fica na aba do timer, com o player compacto à direita.
    expect(screen.getByRole('tab', { name: 'Timer' })).toHaveAttribute('aria-selected', 'true');
    const mini = within(screen.getByRole('region', { name: 'Player de música' }));
    expect(mini.getByText('Clube da Esquina')).toBeInTheDocument();
    fireEvent.click(mini.getByRole('button', { name: 'Tocar a música' }));
    await settle();

    expect(backend.mediaControl).toHaveBeenCalledExactlyOnceWith('playPause');
    expect(mini.getByRole('button', { name: 'Pausar a música' })).toBeInTheDocument();
  });

  it('na aba Música o painel encolhe e mostra só o player completo', async () => {
    const hoverArea = await renderNotch();
    fireEvent.mouseEnter(hoverArea);
    await settle();
    const body = screen.getByRole('region', { name: 'Compasso' });
    expect(body).toHaveStyle({ width: '580px' });

    fireEvent.click(screen.getByRole('tab', { name: 'Música' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(body).toHaveStyle({ width: '380px' });
    expect(backend.notchSetLayout).toHaveBeenLastCalledWith('compact');
    expect(screen.queryByRole('region', { name: 'Player de música' })).not.toBeInTheDocument();

    // De volta a outra aba, a janela cresce antes de o desenho crescer.
    fireEvent.click(screen.getByRole('tab', { name: 'Tarefas' }));
    await settle();
    expect(backend.notchSetLayout).toHaveBeenLastCalledWith('expanded');
    expect(body).toHaveStyle({ width: '580px' });
  });

  it('só consulta a mídia periodicamente com o painel aberto', async () => {
    const hoverArea = await renderNotch();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(backend.mediaGetState).not.toHaveBeenCalled();

    fireEvent.mouseEnter(hoverArea);
    await settle();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6_500);
    });

    // Uma leitura ao abrir e uma a cada 2 s.
    expect(backend.mediaGetState.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('é preto ou branco conforme a cor escolhida', async () => {
    const view = render(<NotchApp />);
    await settle();
    expect(document.documentElement.dataset.notchTheme).toBe('dark');
    view.unmount();

    backend.getSettings.mockResolvedValue({
      ...SETTINGS,
      notch: { ...SETTINGS.notch, theme: 'light' },
    });
    await renderNotch();
    expect(document.documentElement.dataset.notchTheme).toBe('light');
  });

  it('sem a borda animada ligada, não desenha borda nem apara as abas', async () => {
    const hoverArea = await renderNotch();
    expect(hoverArea.querySelector('.notch-border')).toBeNull();
    for (const flare of hoverArea.querySelectorAll<HTMLElement>('.notch-flare')) {
      expect(flare.style.clipPath).toBe('');
    }
  });

  it('mostra a borda animada recolhido e a esconde, parada, ao abrir', async () => {
    backend.getSettings.mockResolvedValue({
      ...SETTINGS,
      notch: {
        ...SETTINGS.notch,
        border: { enabled: true, style: 'solid', color: '#22c55e' },
      },
    });
    const hoverArea = await renderNotch();
    const border = hoverArea.querySelector<HTMLElement>('.notch-border');
    if (!border) throw new Error('borda não renderizada');
    expect(border.dataset.notchBorder).toBe('solid');
    expect(border.dataset.edge).toBe('top');
    expect(border.style.getPropertyValue('--notch-border-color')).toBe('#22c55e');
    expect(border.querySelector<HTMLElement>('.notch-border-glow')?.style.clipPath).toMatch(
      /^path\('M0\.00 0\.00 L/,
    );
    expect(border.querySelector<HTMLElement>('.notch-border-fill')?.style.clipPath).toMatch(
      /^path\('M6\.40 3\.20 L10\.00 8\.00 /,
    );
    expect(border).toHaveClass('opacity-100');
    expect(border.dataset.paused).toBeUndefined();
    // Recolhido, as pontas das abas são aparadas para o contorno suave da borda.
    const flares = [...hoverArea.querySelectorAll<HTMLElement>('.notch-flare')];
    expect(flares.map((flare) => flare.style.clipPath)).toEqual([
      expect.stringMatching(/^polygon\(/),
      expect.stringMatching(/^polygon\(/),
    ]);

    fireEvent.mouseEnter(hoverArea);
    await settle();

    expect(border).toHaveClass('opacity-0');
    expect(border.dataset.paused).toBe('true');
    expect(flares.map((flare) => flare.style.clipPath)).toEqual(['', '']);
  });

  it('em "seguir o sistema", acompanha o modo claro ou escuro do Windows', async () => {
    const listeners = new Set<() => void>();
    let dark = false;
    vi.stubGlobal('matchMedia', () => ({
      get matches() {
        return dark;
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }));
    backend.getSettings.mockResolvedValue({
      ...SETTINGS,
      notch: { ...SETTINGS.notch, theme: 'system' },
    });
    await renderNotch();
    expect(document.documentElement.dataset.notchTheme).toBe('light');

    // O Windows passa para o modo escuro com o notch aberto.
    dark = true;
    act(() => {
      listeners.forEach((listener) => {
        listener();
      });
    });
    expect(document.documentElement.dataset.notchTheme).toBe('dark');
    vi.unstubAllGlobals();
  });

  it('durante uma rotina, mostra o nome e a contagem dela e deixa pulá-la', async () => {
    backend.routinesList.mockResolvedValue([
      {
        id: 4,
        name: 'Hora do café',
        startMinute: 615,
        durationMinutes: 15,
        weekdays: 127,
        enabled: true,
      },
    ]);
    backend.timerGetState.mockResolvedValue({
      ...RUNNING,
      status: 'paused',
      pauseReason: 'routine',
      routineId: 4,
      routineRemainingMs: 12 * 60_000 + 30_000,
    });
    backend.routineSkip.mockResolvedValue(RUNNING);
    await renderNotch();

    const panel = timerPanel();
    expect(panel).toHaveTextContent('Rotina');
    expect(panel).toHaveTextContent('Hora do café');
    // O relógio é o da rotina, não o do foco em espera.
    expect(screen.getByRole('timer')).toHaveTextContent('12:30');

    fireEvent.click(screen.getByRole('button', { name: 'Pular a rotina' }));
    await settle();
    expect(backend.routineSkip).toHaveBeenCalledTimes(1);
    expect(backend.timerSkip).not.toHaveBeenCalled();
  });

  it('avisa quando o foco foi encurtado', async () => {
    backend.timerGetState.mockResolvedValue({ ...RUNNING, short: true });
    await renderNotch();

    expect(timerPanel()).toHaveTextContent('Foco curto');
  });

  it('acompanha os eventos do timer', async () => {
    await renderNotch();

    act(() => {
      backend.emitTimer?.({ ...RUNNING, phase: 'shortBreak', remainingMs: 5 * 60_000 });
    });

    expect(screen.getByRole('timer')).toHaveTextContent('05:00');
    expect(timerPanel()).toHaveTextContent('Pausa curta');
  });
});
