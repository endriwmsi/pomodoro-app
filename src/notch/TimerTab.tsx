import { AppWindow, Pause, Play, SkipForward } from 'lucide-react';

import { DotMatrixText } from '@/components/ui/DotMatrixText';
import { formatMinute, nextRoutine, useNow } from '@/features/routines/schedule';
import { routineSkip, showMainWindow } from '@/lib/commands';
import { describeDuration, formatClock, remainingSeconds } from '@/lib/format';
import { cn } from '@/lib/utils';
import { NOTCH_ICON_BUTTON, PHASE_LABEL, reportNotchFailure } from '@/notch/shared';
import { useRoutinesStore } from '@/stores/routines';
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

  const routines = useRoutinesStore((state) => state.routines);
  const now = useNow();

  // Durante uma rotina, a aba mostra a rotina: o nome dela e quanto falta.
  const inRoutine = snapshot?.routineId != null;
  const routineName = routines.find((routine) => routine.id === snapshot?.routineId)?.name;
  const upcoming = inRoutine ? null : nextRoutine(routines, now);

  const cycleDone = snapshot ? Math.min(snapshot.cyclePosition, snapshot.cyclesBeforeLongBreak) : 0;
  // Quanto da sessão já passou; durante uma rotina a barra fica vazia.
  const percent =
    !snapshot || inRoutine || snapshot.plannedMs <= 0
      ? 0
      : Math.round(Math.min(Math.max(1 - snapshot.remainingMs / snapshot.plannedMs, 0), 1) * 100);

  const running = snapshot?.status === 'running';
  const seconds = !snapshot
    ? null
    : remainingSeconds(inRoutine ? (snapshot.routineRemainingMs ?? 0) : snapshot.remainingMs);
  const clock = seconds === null ? '--:--' : formatClock(seconds);
  const primaryLabel = running ? 'Pausar' : snapshot?.status === 'paused' ? 'Retomar' : 'Iniciar';

  return (
    <div
      className={`flex h-full flex-col ${stacked ? 'justify-between' : 'justify-center gap-3.5'}`}
    >
      <div className={stacked ? 'text-center' : 'flex items-start justify-between gap-3'}>
        <div className="min-w-0">
          <p className="text-[0.6875rem] tracking-wide text-white/60 matrix:tracking-widest matrix:uppercase">
            {!snapshot
              ? 'Compasso'
              : inRoutine
                ? 'Rotina'
                : snapshot.short
                  ? 'Foco curto'
                  : PHASE_LABEL[snapshot.phase]}
            {!inRoutine && snapshot?.status === 'paused' ? ' · pausado' : ''}
          </p>
          <p className="mt-0.5 truncate text-xs text-white/85" title={taskTitle ?? undefined}>
            {inRoutine ? (routineName ?? 'Rotina') : (taskTitle ?? 'Sem tarefa')}
            {upcoming && upcoming.inMinutes <= 60 ? (
              <span className="text-white/50">
                {' · '}
                {upcoming.routine.name} às {formatMinute(upcoming.routine.startMinute)}
              </span>
            ) : null}
          </p>
        </div>
        {stacked || !snapshot ? null : (
          <div
            role="img"
            aria-label={`${String(cycleDone)} de ${String(snapshot.cyclesBeforeLongBreak)} focos do ciclo`}
            className="mt-1 flex shrink-0 items-center gap-1.5"
          >
            {Array.from({ length: snapshot.cyclesBeforeLongBreak }, (_, index) => (
              <span
                key={index}
                className={`size-1.5 rounded-full ${index < cycleDone ? 'bg-accent' : 'bg-white/20'}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className={stacked ? 'flex flex-col items-center gap-4' : 'flex items-end gap-5'}>
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
            aria-label={inRoutine ? 'Pular a rotina' : 'Pular'}
            title={inRoutine ? 'Pular a rotina' : 'Pular'}
            onClick={() => {
              if (inRoutine) routineSkip().catch(reportNotchFailure);
              else void skip();
            }}
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

      {stacked || !snapshot ? null : (
        <div
          role="progressbar"
          aria-label="Progresso da sessão"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="h-1 w-full overflow-hidden rounded-full bg-white/12"
        >
          <div style={{ width: `${String(percent)}%` }} className="h-full rounded-full bg-accent" />
        </div>
      )}
    </div>
  );
}
