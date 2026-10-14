import { isTauri } from '@tauri-apps/api/core';
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { useState } from 'react';

import { DotMatrixText } from '@/components/ui/DotMatrixText';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { PanelLabel } from '@/components/ui/PanelLabel';
import { formatMinute, nextRoutine, useNow } from '@/features/routines/schedule';
import {
  routineSkip,
  type TimerPhase,
  type TimerSettings,
  type TimerSnapshot,
  type TimerStatus,
} from '@/lib/commands';
import { toAppError } from '@/lib/errors';
import { describeDuration, formatClock, remainingSeconds } from '@/lib/format';
import { useRoutinesStore } from '@/stores/routines';
import { useSettingsStore, useTemplate } from '@/stores/settings';
import { useTasksStore } from '@/stores/tasks';
import { useTimerStore } from '@/stores/timer';

const PHASE_LABEL: Record<TimerPhase, string> = {
  focus: 'Foco',
  shortBreak: 'Pausa curta',
  longBreak: 'Pausa longa',
};

const STATUS_LABEL: Record<TimerStatus, string> = {
  idle: 'Pronto',
  running: 'Em andamento',
  paused: 'Pausado',
};

const PROGRESS_DOTS = 30;

/** Estado parado montado a partir das configurações, para a pré-visualização no navegador. */
function previewSnapshot(timer: TimerSettings): TimerSnapshot {
  const plannedMs = timer.focusMinutes * 60_000;
  return {
    phase: 'focus',
    status: 'idle',
    remainingMs: plannedMs,
    plannedMs,
    cyclePosition: 0,
    cyclesBeforeLongBreak: timer.cyclesBeforeLongBreak,
    pauseReason: null,
    taskId: null,
    routineId: null,
    routineRemainingMs: null,
    short: false,
  };
}

function Progress({ fraction }: { fraction: number }) {
  const template = useTemplate();
  const percent = Math.round(fraction * 100);
  const common = {
    role: 'progressbar',
    'aria-label': 'Progresso da sessão',
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-valuenow': percent,
  } as const;

  if (template === 'matrix') {
    const lit = Math.floor(fraction * PROGRESS_DOTS);
    return (
      <div {...common} className="flex gap-1.5">
        {Array.from({ length: PROGRESS_DOTS }, (_, dot) => (
          <span
            key={dot}
            className={`size-1.5 rounded-full ${dot < lit ? 'bg-accent' : 'bg-ink/15'}`}
          />
        ))}
      </div>
    );
  }

  return (
    <div {...common} className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-ink/15">
      <div
        className="h-full rounded-full bg-linear-to-r from-accent/50 to-accent"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

function CycleDots({ position, total }: { position: number; total: number }) {
  const done = Math.min(position, total);
  return (
    <div
      role="img"
      aria-label={`${done} de ${total} focos do ciclo`}
      className="flex items-center gap-2"
    >
      {Array.from({ length: total }, (_, index) => (
        <span
          key={index}
          className={`size-2 rounded-full ${index < done ? 'bg-ink' : 'border border-ink-muted'}`}
        />
      ))}
    </div>
  );
}

const BUTTON =
  'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium outline-none transition-opacity duration-150 focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-40 matrix:uppercase matrix:tracking-widest';

export function PomodoroPage() {
  const template = useTemplate();
  const timerSettings = useSettingsStore((state) => state.settings.timer);
  const live = useTimerStore((state) => state.snapshot);
  const error = useTimerStore((state) => state.error);
  const start = useTimerStore((state) => state.start);
  const pause = useTimerStore((state) => state.pause);
  const skip = useTimerStore((state) => state.skip);
  const reset = useTimerStore((state) => state.reset);
  const setTask = useTimerStore((state) => state.setTask);
  const task = useTasksStore(
    (state) => state.tasks.find((item) => item.id === live?.taskId) ?? null,
  );

  const routines = useRoutinesStore((state) => state.routines);
  const now = useNow();
  const [routineError, setRoutineError] = useState<string | null>(null);

  const desktop = isTauri();
  const snapshot = live ?? previewSnapshot(timerSettings);
  const ready = desktop && live !== null;

  // Durante uma rotina, o relógio mostra quanto falta para ela acabar.
  const inRoutine = snapshot.routineId !== null;
  const routineName =
    routines.find((routine) => routine.id === snapshot.routineId)?.name ?? 'Rotina';
  const upcoming = inRoutine ? null : nextRoutine(routines, now);

  const seconds = remainingSeconds(
    inRoutine ? (snapshot.routineRemainingMs ?? 0) : snapshot.remainingMs,
  );
  const clock = formatClock(seconds);
  const fraction = snapshot.plannedMs > 0 ? 1 - snapshot.remainingMs / snapshot.plannedMs : 0;
  const running = snapshot.status === 'running';

  return (
    <>
      <PageHeader title="Pomodoro" />

      <Panel aria-label="Timer" className="flex flex-col items-center px-6 py-10 text-center">
        <PanelLabel>
          {inRoutine
            ? `Rotina · ${routineName}`
            : `${snapshot.short ? 'Foco curto' : PHASE_LABEL[snapshot.phase]} · ${STATUS_LABEL[snapshot.status]}`}
        </PanelLabel>

        <div
          role="timer"
          aria-label={`${describeDuration(seconds)} restantes`}
          className="mt-6 mb-8"
        >
          {template === 'matrix' ? (
            <DotMatrixText text={clock} size={84} label={clock} />
          ) : (
            <span className="font-display text-8xl leading-none font-semibold tabular-nums">
              {clock}
            </span>
          )}
        </div>

        <Progress fraction={Math.min(Math.max(fraction, 0), 1)} />

        {inRoutine ? (
          <div role="status" className="mt-5 flex max-w-md flex-col items-center gap-2 text-sm">
            <p className="text-ink-muted">
              {snapshot.pauseReason === 'routine'
                ? 'O foco está em espera e volta sozinho ao fim da rotina.'
                : 'O timer espera a rotina terminar.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setRoutineError(null);
                routineSkip().catch((failure: unknown) => {
                  setRoutineError(toAppError(failure).message);
                });
              }}
              className="underline underline-offset-2 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Pular a rotina de hoje
            </button>
          </div>
        ) : upcoming ? (
          <p className="mt-5 text-sm text-ink-muted">
            Próximo: <span className="text-ink">{upcoming.routine.name}</span> às{' '}
            {formatMinute(upcoming.routine.startMinute)}
            {snapshot.short ? ' — este foco foi encurtado para terminar na hora.' : '.'}
          </p>
        ) : null}

        <p className="mt-5 flex max-w-md items-center gap-2 text-sm text-ink-muted">
          {task ? (
            <>
              <span className="truncate">
                Tarefa: <span className="text-ink">{task.title}</span>
              </span>
              <button
                type="button"
                onClick={() => void setTask(null)}
                className="shrink-0 underline underline-offset-2 outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-white/70"
              >
                remover
              </button>
            </>
          ) : (
            'Sem tarefa — escolha uma no Kanban para dedicar os focos a ela.'
          )}
        </p>

        <div className="mt-6">
          <CycleDots position={snapshot.cyclePosition} total={snapshot.cyclesBeforeLongBreak} />
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
          <button
            type="button"
            disabled={!ready}
            onClick={() => void (running ? pause() : start())}
            className={`${BUTTON} bg-accent text-accent-ink`}
          >
            {running ? (
              <Pause size={16} aria-hidden="true" />
            ) : (
              <Play size={16} aria-hidden="true" />
            )}
            {running ? 'Pausar' : snapshot.status === 'paused' ? 'Retomar' : 'Iniciar'}
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={() => void skip()}
            className={`${BUTTON} border border-panel-border bg-panel-strong`}
          >
            <SkipForward size={16} aria-hidden="true" />
            Pular
          </button>
          <button
            type="button"
            disabled={!ready || snapshot.status === 'idle'}
            onClick={() => void reset()}
            className={`${BUTTON} border border-panel-border bg-panel-strong`}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Reiniciar
          </button>
        </div>

        {snapshot.pauseReason === 'suspend' ? (
          <p role="status" className="mt-5 max-w-md text-sm text-ink-muted">
            Pausado automaticamente: o computador foi suspenso ou o relógio do sistema saltou. O
            tempo parado não foi contado.
          </p>
        ) : null}
        {(error ?? routineError) ? (
          <p role="alert" className="mt-5 max-w-md text-sm text-accent">
            Não foi possível executar a ação: {error ?? routineError}
          </p>
        ) : null}
        {desktop ? null : (
          <p className="mt-5 max-w-md text-sm text-ink-muted">
            Pré-visualização: o timer só funciona dentro do aplicativo desktop.
          </p>
        )}
      </Panel>
    </>
  );
}
