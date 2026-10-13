import { isTauri } from '@tauri-apps/api/core';
import { create } from 'zustand';

import {
  taskCreate,
  taskDelete,
  taskMove,
  tasksList,
  taskUpdate,
  type AppError,
  type Task,
  type TaskInput,
  type TaskStatus,
} from '@/lib/commands';
import { toAppError } from '@/lib/errors';
import { subscribeTasksChanged } from '@/lib/events';

/**
 * Espelho do quadro de tarefas do backend. Toda alteração é enviada ao
 * backend, que devolve a lista completa; a store nunca calcula ordem ou
 * posições por conta própria.
 */
interface TasksStore {
  tasks: Task[];
  /** `unavailable`: fora do aplicativo desktop não há onde guardar tarefas. */
  status: 'loading' | 'ready' | 'error' | 'unavailable';
  load: () => Promise<void>;
  /** Assina as mudanças e carrega o quadro. Retorna a função de limpeza. */
  connect: () => () => void;
  /** As ações devolvem `null` em caso de sucesso ou o erro ocorrido. */
  create: (input: TaskInput) => Promise<AppError | null>;
  update: (id: number, input: TaskInput) => Promise<AppError | null>;
  remove: (id: number) => Promise<AppError | null>;
  /** `index`: posição na coluna de destino, contada sem a própria tarefa. */
  move: (id: number, status: TaskStatus, index: number) => Promise<AppError | null>;
}

export const useTasksStore = create<TasksStore>((set, get) => {
  const apply = async (command: () => Promise<Task[]>): Promise<AppError | null> => {
    try {
      set({ tasks: await command(), status: 'ready' });
      return null;
    } catch (error) {
      console.error('Falha em uma operação do quadro', error);
      return toAppError(error);
    }
  };

  return {
    tasks: [],
    status: isTauri() ? 'loading' : 'unavailable',

    load: async () => {
      if (!isTauri()) return;
      try {
        set({ tasks: await tasksList(), status: 'ready' });
      } catch (error) {
        console.error('Falha ao carregar as tarefas', error);
        set({ status: 'error' });
      }
    },

    connect: () => {
      if (!isTauri()) return () => undefined;

      let disposed = false;
      let unsubscribe: (() => void) | undefined;

      subscribeTasksChanged(() => {
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
          console.error('Falha ao assinar as tarefas', error);
          set({ status: 'error' });
        });

      return () => {
        disposed = true;
        unsubscribe?.();
      };
    },

    create: (input) => apply(() => taskCreate(input)),
    update: (id, input) => apply(() => taskUpdate(id, input)),
    remove: (id) => apply(() => taskDelete(id)),
    move: (id, status, index) => apply(() => taskMove(id, status, index)),
  };
});
