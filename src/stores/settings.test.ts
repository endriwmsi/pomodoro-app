import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Settings } from '@/lib/commands';
import { DEFAULT_TIMER_SETTINGS, useSettingsStore } from '@/stores/settings';

const events = vi.hoisted(() => ({
  emit: undefined as ((settings: Settings) => void) | undefined,
  unsubscribe: vi.fn(),
}));

const commands = vi.hoisted(() => ({
  getSettings: vi.fn<() => Promise<Settings>>(),
  updateSettings: vi.fn<(settings: Settings) => Promise<Settings>>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@/lib/commands', () => commands);
vi.mock('@/lib/events', () => ({
  subscribeSettingsChanged: (handler: (settings: Settings) => void) => {
    events.emit = handler;
    return Promise.resolve(events.unsubscribe);
  },
}));

const STORED: Settings = {
  appearance: { template: 'matrix', background: { kind: 'none' } },
  timer: { ...DEFAULT_TIMER_SETTINGS, focusMinutes: 50 },
  notch: {
    enabled: false,
    position: 'left',
    theme: 'light',
    border: { enabled: true, style: 'solid', color: '#22c55e' },
    notices: false,
  },
  alerts: { soundEnabled: false, notificationsEnabled: true },
  goals: { dailyPomodoros: 8 },
  weather: { enabled: true, useLocation: false },
  general: { launchAtLogin: false },
  workday: { enabled: true, startMinute: 480, endMinute: 1020 },
  updates: { autoUpdate: false },
};

describe('store de configurações (dentro do Tauri)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  });

  it('começa carregando e adota o que o backend devolve', async () => {
    commands.getSettings.mockResolvedValue(STORED);
    expect(useSettingsStore.getState().status).toBe('loading');

    await useSettingsStore.getState().load();

    expect(useSettingsStore.getState()).toMatchObject({ status: 'ready', settings: STORED });
  });

  it('sinaliza erro e mantém os padrões quando a leitura falha', async () => {
    commands.getSettings.mockRejectedValue({ kind: 'database', message: 'arquivo bloqueado' });

    await useSettingsStore.getState().load();

    const state = useSettingsStore.getState();
    expect(state.status).toBe('error');
    expect(state.settings.timer).toEqual(DEFAULT_TIMER_SETTINGS);
  });

  it('ao salvar, guarda o valor confirmado pelo backend', async () => {
    commands.updateSettings.mockResolvedValue(STORED);

    const failure = await useSettingsStore.getState().save(STORED);

    expect(failure).toBeNull();
    expect(commands.updateSettings).toHaveBeenCalledWith(STORED);
    expect(useSettingsStore.getState().settings).toEqual(STORED);
  });

  it('devolve o erro de validação e não altera o estado', async () => {
    const rejection = {
      kind: 'validation',
      field: 'timer.focusMinutes',
      message: 'A duração do foco deve ficar entre 1 e 180 minutos.',
    };
    commands.updateSettings.mockRejectedValue(rejection);
    const before = useSettingsStore.getState().settings;

    const failure = await useSettingsStore.getState().save({
      ...before,
      timer: { ...before.timer, focusMinutes: 0 },
    });

    expect(failure).toEqual(rejection);
    expect(useSettingsStore.getState().settings).toBe(before);
  });

  it('conectada, carrega o estado e segue as mudanças feitas em outra janela', async () => {
    commands.getSettings.mockResolvedValue(STORED);

    const disconnect = useSettingsStore.getState().connect();
    await vi.waitFor(() => {
      expect(useSettingsStore.getState().status).toBe('ready');
    });
    const changed: Settings = {
      ...STORED,
      appearance: { template: 'glass', background: { kind: 'default' } },
    };
    events.emit?.(changed);

    expect(useSettingsStore.getState().settings).toEqual(changed);

    disconnect();
    expect(events.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('normaliza falhas inesperadas do IPC', async () => {
    commands.updateSettings.mockRejectedValue('invalid args `settings`');

    const failure = await useSettingsStore.getState().save(STORED);

    expect(failure).toEqual({ kind: 'unknown', message: 'invalid args `settings`' });
  });
});
