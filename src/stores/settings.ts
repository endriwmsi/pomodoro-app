import { isTauri } from '@tauri-apps/api/core';
import { create } from 'zustand';

import { readTemplateHint } from '@/app/templates';
import {
  getSettings,
  updateSettings,
  type AppError,
  type Settings,
  type TemplateId,
  type TimerSettings,
} from '@/lib/commands';
import { toAppError } from '@/lib/errors';
import { subscribeSettingsChanged } from '@/lib/events';

/**
 * Padrões e limites espelhados de `src-tauri/src/settings/mod.rs`, que é a
 * fonte de verdade. Aqui servem ao primeiro quadro, à pré-visualização no
 * navegador e a mensagens imediatas no formulário; o backend sempre revalida.
 */
export const DEFAULT_TIMER_SETTINGS: TimerSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  cyclesBeforeLongBreak: 4,
  autoStartBreaks: false,
  autoStartFocus: false,
};

export const TIMER_LIMITS = {
  focusMinutes: { min: 1, max: 180 },
  shortBreakMinutes: { min: 1, max: 60 },
  longBreakMinutes: { min: 1, max: 120 },
  cyclesBeforeLongBreak: { min: 1, max: 12 },
} as const satisfies Partial<Record<keyof TimerSettings, { min: number; max: number }>>;

interface SettingsStore {
  settings: Settings;
  /** `error`: a leitura do banco falhou e os valores exibidos são os padrões. */
  status: 'loading' | 'ready' | 'error';
  load: () => Promise<void>;
  /**
   * Assina as mudanças feitas em qualquer janela e carrega o estado atual.
   * Retorna a função de limpeza.
   */
  connect: () => () => void;
  /** Persiste `next`. Retorna `null` em caso de sucesso ou o erro ocorrido. */
  save: (next: Settings) => Promise<AppError | null>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: {
    appearance: { template: readTemplateHint() },
    timer: DEFAULT_TIMER_SETTINGS,
    notch: { enabled: true, position: 'top', theme: 'system' },
    alerts: { soundEnabled: true, notificationsEnabled: true },
    goals: { dailyPomodoros: null },
    weather: { enabled: false, useLocation: false },
    general: { launchAtLogin: false },
  },
  status: isTauri() ? 'loading' : 'ready',

  load: async () => {
    if (!isTauri()) return;
    try {
      set({ settings: await getSettings(), status: 'ready' });
    } catch (error) {
      console.error('Falha ao carregar as configurações', error);
      set({ status: 'error' });
    }
  },

  connect: () => {
    if (!isTauri()) return () => undefined;

    let disposed = false;
    let unsubscribe: (() => void) | undefined;

    subscribeSettingsChanged((settings) => {
      if (!disposed) set({ settings, status: 'ready' });
    })
      .then((stop) => {
        if (disposed) {
          stop();
          return;
        }
        unsubscribe = stop;
        return get().load();
      })
      .catch((error: unknown) => {
        console.error('Falha ao assinar as configurações', error);
        set({ status: 'error' });
      });

    return () => {
      disposed = true;
      unsubscribe?.();
    };
  },

  save: async (next) => {
    if (!isTauri()) {
      // Pré-visualização no navegador: vale apenas até recarregar a página.
      set({ settings: next });
      return null;
    }
    try {
      set({ settings: await updateSettings(next), status: 'ready' });
      return null;
    } catch (error) {
      return toAppError(error);
    }
  },
}));

export function useTemplate(): TemplateId {
  return useSettingsStore((state) => state.settings.appearance.template);
}
