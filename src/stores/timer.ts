import { isTauri } from '@tauri-apps/api/core';
import { create } from 'zustand';

import {
  timerFocusTask,
  timerGetState,
  timerPause,
  timerReset,
  timerSetTask,
  timerSkip,
  timerStart,
  type TimerSnapshot,
} from '@/lib/commands';
import { toAppError } from '@/lib/errors';
import { subscribeTimerState } from '@/lib/events';

/**
 * Espelho do timer do backend. Esta store não conta tempo: apenas guarda o
 * último `TimerSnapshot` recebido (por evento ou como resposta de um comando).
 */
interface TimerStore {
  /** `null` até a primeira leitura — e sempre, fora do aplicativo desktop. */
  snapshot: TimerSnapshot | null;
  /** Mensagem da última falha de comando ou de leitura. */
  error: string | null;
  /** Assina os eventos e lê o estado atual. Retorna a função de limpeza. */
  connect: () => () => void;
  start: () => Promise<void>;
  pause: () => Promise<void>;
  skip: () => Promise<void>;
  reset: () => Promise<void>;
  /** Escolhe a tarefa dos focos (`null` para nenhuma), sem mexer no andamento. */
  setTask: (taskId: number | null) => Promise<void>;
  /** Escolhe a tarefa e vai direto para um foco nela. */
  focusTask: (taskId: number) => Promise<void>;
}

export const useTimerStore = create<TimerStore>((set) => {
  const run = async (command: () => Promise<TimerSnapshot>) => {
    try {
      set({ snapshot: await command(), error: null });
    } catch (error) {
      console.error('Falha em um comando do timer', error);
      set({ error: toAppError(error).message });
    }
  };

  return {
    snapshot: null,
    error: null,

    connect: () => {
      if (!isTauri()) return () => undefined;

      let disposed = false;
      let unsubscribe: (() => void) | undefined;

      subscribeTimerState((snapshot) => {
        if (!disposed) set({ snapshot });
      })
        .then((stop) => {
          if (disposed) {
            stop();
            return;
          }
          unsubscribe = stop;
          // Só depois de assinar: nenhuma mudança se perde entre os dois.
          return run(timerGetState);
        })
        .catch((error: unknown) => {
          console.error('Falha ao assinar o estado do timer', error);
          set({ error: toAppError(error).message });
        });

      return () => {
        disposed = true;
        unsubscribe?.();
      };
    },

    start: () => run(timerStart),
    pause: () => run(timerPause),
    skip: () => run(timerSkip),
    reset: () => run(timerReset),
    setTask: (taskId) => run(() => timerSetTask(taskId)),
    focusTask: (taskId) => run(() => timerFocusTask(taskId)),
  };
});
