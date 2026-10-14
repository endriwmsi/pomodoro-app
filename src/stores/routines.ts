import { isTauri } from '@tauri-apps/api/core';
import { create } from 'zustand';

import {
  routineCreate,
  routineDelete,
  routinesList,
  routineUpdate,
  type AppError,
  type Routine,
  type RoutineInput,
} from '@/lib/commands';
import { toAppError } from '@/lib/errors';
import { subscribeRoutinesChanged } from '@/lib/events';

/**
 * Espelho das rotinas do backend. Toda alteração é enviada ao backend, que
 * devolve a lista completa; a store nunca a altera por conta própria.
 */
interface RoutinesStore {
  routines: Routine[];
  /** `unavailable`: fora do aplicativo desktop não há onde guardar rotinas. */
  status: 'loading' | 'ready' | 'error' | 'unavailable';
  load: () => Promise<void>;
  /** Assina as mudanças e carrega a lista. Retorna a função de limpeza. */
  connect: () => () => void;
  /** As ações devolvem `null` em caso de sucesso ou o erro ocorrido. */
  create: (input: RoutineInput) => Promise<AppError | null>;
  update: (id: number, input: RoutineInput) => Promise<AppError | null>;
  remove: (id: number) => Promise<AppError | null>;
}

export const useRoutinesStore = create<RoutinesStore>((set, get) => {
  const apply = async (command: () => Promise<Routine[]>): Promise<AppError | null> => {
    try {
      set({ routines: await command(), status: 'ready' });
      return null;
    } catch (error) {
      console.error('Falha em uma operação das rotinas', error);
      return toAppError(error);
    }
  };

  return {
    routines: [],
    status: isTauri() ? 'loading' : 'unavailable',

    load: async () => {
      if (!isTauri()) return;
      try {
        set({ routines: await routinesList(), status: 'ready' });
      } catch (error) {
        console.error('Falha ao carregar as rotinas', error);
        set({ status: 'error' });
      }
    },

    connect: () => {
      if (!isTauri()) return () => undefined;

      let disposed = false;
      let unsubscribe: (() => void) | undefined;

      subscribeRoutinesChanged(() => {
        if (!disposed) void get().load();
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
          console.error('Falha ao assinar as rotinas', error);
          set({ status: 'error' });
        });

      return () => {
        disposed = true;
        unsubscribe?.();
      };
    },

    create: (input) => apply(() => routineCreate(input)),
    update: (id, input) => apply(() => routineUpdate(id, input)),
    remove: (id) => apply(() => routineDelete(id)),
  };
});
