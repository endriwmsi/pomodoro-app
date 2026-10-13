import { AppWindow, Pause, Play, SkipForward } from 'lucide-react';

import { DotMatrixText } from '@/components/ui/DotMatrixText';
import { showMainWindow } from '@/lib/commands';
import { describeDuration, formatClock, remainingSeconds } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NOTCH_ICON_BUTTON, PHASE_LABEL, reportNotchFailure } from '@/notch/shared';
import { useTemplate } from '@/stores/settings';
import { useTasksStore } from '@/stores/tasks';
import { useTimerStore } from '@/stores/timer';

/** Aba do timer: fase, tarefa em foco, tempo e controles. */
export function TimerTab({ stacked }: { stacked: boolean }) {
  const template = useTemplate();
  const snapshot = useTimerStore((state) => state.snapshot);
  const start = useTimerStore((state) => state.start);
  const pause = useTimerStore((state) => state.pause);
  const skip = useTimerStore((state) => state.skip);
  const taskTitle = useTasksStore(
    (state) => state.tasks.find((task) => task.id === snapshot?.taskId)?.title ?? null,
  );

  const running = snapshot?.status === 'running';
  const seconds = snapshot ? remainingSeconds(snapshot.remainingMs) : null;
  const clock = seconds === null ? '--:--' : formatClock(seconds);
  const primaryLabel = running ? 'Pausar' : snapshot?.status === 'paused' ? 'Retomar' : 'Iniciar';

  return (
    <div className="flex h-full flex-col justify-between">
      <div className={stacked ? 'text-center' : ''}>
        <p className="text-[0.6875rem] tracking-wide text-white/60 matrix:tracking-widest matrix:uppercase">
          {snapshot ? PHASE_LABEL[snapshot.phase] : 'Compasso'}
          {snapshot?.status === 'paused' ? ' · pausado' : ''}
        </p>
        <p className="mt-0.5 truncate text-xs text-white/85" title={taskTitle ?? undefined}>
          {taskTitle ?? 'Sem tarefa'}
        </p>
      </div>

      <div
        className={stacked ? 'flex flex-col items-center gap-4' : 'flex items-end justify-between'}
      >
        <div
          role="timer"
          aria-label={
            seconds === null ? 'Timer indisponível' : `${describeDuration(seconds)} restantes`
          }
        >
          {template === 'matrix' ? (
            <DotMatrixText text={clock} size={40} label={clock} />
          ) : (
            <span className="font-display text-5xl leading-none font-semibold tabular-nums">
              {clock}
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            disabled={!snapshot}
            aria-label={primaryLabel}
            title={primaryLabel}
            onClick={() => void (running ? pause() : start())}
            className={cn(
              NOTCH_ICON_BUTTON,
              'bg-accent text-accent-ink hover:bg-accent hover:text-accent-ink hover:opacity-90',
            )}
          >
            {running ? (
              <Pause size={15} aria-hidden="true" />
            ) : (
              <Play size={15} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            disabled={!snapshot}
            aria-label="Pular"
            title="Pular"
            onClick={() => void skip()}
            className={NOTCH_ICON_BUTTON}
          >
            <SkipForward size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Abrir o Compasso"
            title="Abrir o Compasso"
            onClick={() => {
              showMainWindow().catch(reportNotchFailure);
            }}
            className={NOTCH_ICON_BUTTON}
          >
            <AppWindow size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
