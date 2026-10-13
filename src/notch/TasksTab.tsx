import { Checkbox } from '@/components/ui/checkbox';
import { DotMatrixText } from '@/components/ui/DotMatrixText';
import { columnTasks } from '@/features/kanban/board';
import { showMainWindow } from '@/lib/commands';
import { formatClock, remainingSeconds } from '@/lib/format';
import { PHASE_LABEL, reportNotchFailure } from '@/notch/shared';
import { useTemplate } from '@/stores/settings';
import { useTasksStore } from '@/stores/tasks';
import { useTimerStore } from '@/stores/timer';

/** Posição além do fim de qualquer coluna: o backend a trata como "no fim". */
const END_OF_COLUMN = 1_000_000;

/**
 * Aba de tarefas: as tarefas abertas ("Em andamento" primeiro, depois "A
 * fazer"), cada uma com um botão para focar nela e uma caixa para concluí-la.
 */
export function TasksTab({ stacked }: { stacked: boolean }) {
  const template = useTemplate();
  const tasks = useTasksStore((state) => state.tasks);
  const moveTask = useTasksStore((state) => state.move);
  const snapshot = useTimerStore((state) => state.snapshot);
  const focusTask = useTimerStore((state) => state.focusTask);

  const open = [...columnTasks(tasks, 'doing'), ...columnTasks(tasks, 'todo')];
  const clock = snapshot ? formatClock(remainingSeconds(snapshot.remainingMs)) : '--:--';
  const focusing = snapshot?.phase === 'focus' && snapshot.status === 'running';

  return (
    <div className={`flex h-full gap-4 ${stacked ? 'flex-col' : ''}`}>
      {stacked ? null : (
        <div className="flex w-28 shrink-0 flex-col justify-center" aria-hidden="true">
          {template === 'matrix' ? (
            <DotMatrixText text={clock} size={28} />
          ) : (
            <span className="font-display text-3xl leading-none font-semibold tabular-nums">
              {clock}
            </span>
          )}
          <span className="mt-1.5 text-[0.6875rem] text-white/55 matrix:tracking-widest matrix:uppercase">
            {snapshot ? PHASE_LABEL[snapshot.phase] : 'Compasso'}
          </span>
        </div>
      )}

      {open.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <p className="text-xs text-white/60">Nenhuma tarefa aberta.</p>
          <button
            type="button"
            onClick={() => {
              showMainWindow('kanban').catch(reportNotchFailure);
            }}
            className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/85 transition-colors duration-150 outline-none hover:bg-white/10"
          >
            Abrir o quadro
          </button>
        </div>
      ) : (
        <ul
          aria-label="Tarefas abertas"
          data-notch-scroll
          className="-mr-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-2"
        >
          {open.map((task) => {
            const chosen = task.id === snapshot?.taskId;
            return (
              <li key={task.id} className="flex items-center gap-2">
                <Checkbox
                  checked={false}
                  aria-label={`Concluir ${task.title}`}
                  onCheckedChange={() => void moveTask(task.id, 'done', END_OF_COLUMN)}
                  className="size-4 border-white/40 bg-transparent"
                />
                <span
                  title={task.title}
                  className={`min-w-0 flex-1 truncate text-xs ${chosen ? 'text-accent' : 'text-white/90'}`}
                >
                  {task.title}
                </span>
                <button
                  type="button"
                  aria-label={`Focar em ${task.title}`}
                  onClick={() => void focusTask(task.id)}
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-[0.6875rem] font-medium transition-opacity duration-150 outline-none hover:opacity-85 matrix:tracking-wider matrix:uppercase ${
                    chosen && focusing
                      ? 'border border-accent text-accent'
                      : 'bg-accent text-accent-ink'
                  }`}
                >
                  {chosen && focusing ? 'Em foco' : 'Focar'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
