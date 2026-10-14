import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { CheckboxField } from '@/components/ui/CheckboxField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { PanelLabel } from '@/components/ui/PanelLabel';
import { RoutineDialog } from '@/features/routines/RoutineDialog';
import {
  describeWeekdays,
  formatMinute,
  minuteOfDay,
  parseTime,
  routinesOn,
  useNow,
} from '@/features/routines/schedule';
import type { Routine, RoutineInput, Settings } from '@/lib/commands';
import { useRoutinesStore } from '@/stores/routines';
import { useSettingsStore } from '@/stores/settings';

type Workday = Settings['workday'];

const ICON_BUTTON =
  'flex size-8 items-center justify-center rounded-lg text-ink-muted transition-colors duration-150 outline-none hover:bg-panel-strong hover:text-ink focus-visible:ring-2 focus-visible:ring-white/70';
const TIME_FIELD =
  'rounded-lg border border-panel-border bg-panel-strong px-2.5 py-1.5 text-sm text-ink scheme-dark outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50';

/** Horário de expediente: o timer encaixa os ciclos para terminar junto com ele. */
function WorkdaySection() {
  const settings = useSettingsStore((state) => state.settings);
  const save = useSettingsStore((state) => state.save);
  const [error, setError] = useState<string | null>(null);
  const { workday } = settings;

  const update = (change: Partial<Workday>) => {
    setError(null);
    void save({ ...settings, workday: { ...workday, ...change } }).then((failure) => {
      if (failure) setError(failure.message);
    });
  };
  const setTime = (key: 'startMinute' | 'endMinute', text: string) => {
    const minute = parseTime(text);
    // Campo incompleto enquanto o usuário digita: espera um horário inteiro.
    if (minute !== null) update({ [key]: minute });
  };

  return (
    <Panel aria-label="Expediente" className="px-4 py-3.5">
      <PanelLabel as="h2">Expediente</PanelLabel>
      <div className="mt-3">
        <CheckboxField
          checked={workday.enabled}
          onChange={(enabled) => {
            update({ enabled });
          }}
        >
          Tenho um horário de expediente
        </CheckboxField>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="workday-start">Das</label>
        <input
          id="workday-start"
          type="time"
          value={formatMinute(workday.startMinute)}
          disabled={!workday.enabled}
          onChange={(event) => {
            setTime('startMinute', event.target.value);
          }}
          className={TIME_FIELD}
        />
        <label htmlFor="workday-end">às</label>
        <input
          id="workday-end"
          type="time"
          value={formatMinute(workday.endMinute)}
          disabled={!workday.enabled}
          onChange={(event) => {
            setTime('endMinute', event.target.value);
          }}
          className={TIME_FIELD}
        />
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Com o expediente ligado, o último foco do dia termina junto com ele e nada começa sozinho
        fora desse horário. Você continua podendo iniciar o timer manualmente quando quiser.
      </p>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-accent">
          Não foi possível salvar: {error}
        </p>
      ) : null}
    </Panel>
  );
}

/** Faixa do dia com o expediente, as rotinas de hoje e a hora atual. */
function DayTimeline({ routines, workday }: { routines: Routine[]; workday: Workday }) {
  const now = useNow();
  const today = routinesOn(routines, now);
  const current = minuteOfDay(now);

  // Do começo ao fim do que há para mostrar, arredondado para horas cheias.
  const starts = [...today.map((routine) => routine.startMinute), current];
  const ends = [...today.map((routine) => routine.startMinute + routine.durationMinutes), current];
  if (workday.enabled) {
    starts.push(workday.startMinute);
    ends.push(workday.endMinute);
  }
  const from = Math.floor(Math.min(...starts, 8 * 60) / 60) * 60;
  const to = Math.ceil(Math.max(...ends, 18 * 60) / 60) * 60;
  const span = to - from;
  const left = (minute: number) => `${String(((minute - from) / span) * 100)}%`;
  const width = (minutes: number) => `${String((minutes / span) * 100)}%`;
  const hours = Array.from({ length: span / 60 + 1 }, (_, hour) => from + hour * 60);

  const summary =
    today.length === 0
      ? 'Nenhuma rotina hoje.'
      : `Rotinas de hoje: ${today
          .map((routine) => `${routine.name} às ${formatMinute(routine.startMinute)}`)
          .join('; ')}.`;

  return (
    <Panel aria-label="Hoje" className="mt-3 px-4 py-3.5">
      <PanelLabel as="h2">Hoje</PanelLabel>
      <div role="img" aria-label={summary} className="mt-4">
        <div className="relative h-9 rounded-lg bg-ink/8">
          {workday.enabled ? (
            <div
              title={`Expediente: ${formatMinute(workday.startMinute)} – ${formatMinute(workday.endMinute)}`}
              style={{
                left: left(workday.startMinute),
                width: width(workday.endMinute - workday.startMinute),
              }}
              className="absolute inset-y-0 rounded-lg bg-ink/12"
            />
          ) : null}
          {today.map((routine) => (
            <div
              key={routine.id}
              title={`${routine.name}: ${formatMinute(routine.startMinute)} – ${formatMinute(routine.startMinute + routine.durationMinutes)}`}
              style={{ left: left(routine.startMinute), width: width(routine.durationMinutes) }}
              className="absolute inset-y-1 min-w-1 rounded-md bg-accent"
            />
          ))}
          <div
            style={{ left: left(current) }}
            className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-ink"
          />
        </div>
        <div className="relative mt-1.5 h-4 text-[0.625rem] text-ink-muted tabular-nums">
          {hours.map((hour, index) =>
            // Em faixas longas, só as horas pares cabem.
            hours.length > 13 && index % 2 === 1 ? null : (
              <span key={hour} style={{ left: left(hour) }} className="absolute -translate-x-1/2">
                {String(hour / 60).padStart(2, '0')}h
              </span>
            ),
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-muted">{summary}</p>
    </Panel>
  );
}

export function RoutinesPage() {
  const routines = useRoutinesStore((state) => state.routines);
  const status = useRoutinesStore((state) => state.status);
  const create = useRoutinesStore((state) => state.create);
  const update = useRoutinesStore((state) => state.update);
  const remove = useRoutinesStore((state) => state.remove);
  const workday = useSettingsStore((state) => state.settings.workday);
  /** `'new'`, a rotina em edição ou `null` (diálogo fechado). */
  const [editing, setEditing] = useState<Routine | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const report = (failure: { message: string } | null) => {
    setError(failure ? `Não foi possível concluir: ${failure.message}` : null);
  };
  const inputOf = (routine: Routine): RoutineInput => ({
    name: routine.name,
    startMinute: routine.startMinute,
    durationMinutes: routine.durationMinutes,
    weekdays: routine.weekdays,
    enabled: routine.enabled,
  });

  return (
    <>
      <PageHeader title="Rotina" />
      <WorkdaySection />
      <DayTimeline routines={routines} workday={workday} />

      <Panel aria-label="Rotinas" className="mt-3 px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <PanelLabel as="h2">Rotinas</PanelLabel>
          <button
            type="button"
            disabled={status === 'unavailable'}
            onClick={() => {
              setEditing('new');
            }}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40"
          >
            <Plus size={15} aria-hidden="true" />
            Nova rotina
          </button>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Atividades em horário fixo, como &quot;Hora do café&quot;. Quando uma começa, o timer cede
          a vez e volta ao foco ao fim dela; o foco anterior é encaixado para terminar na hora.
        </p>

        {status === 'unavailable' ? (
          <p className="mt-4 text-sm text-ink-muted">
            Pré-visualização: as rotinas só funcionam dentro do aplicativo desktop.
          </p>
        ) : status === 'error' ? (
          <p role="alert" className="mt-4 text-sm text-accent">
            Não foi possível carregar as rotinas.
          </p>
        ) : routines.length === 0 ? (
          <p className="mt-4 text-sm text-ink-muted">Nenhuma rotina ainda.</p>
        ) : (
          <ul aria-label="Rotinas cadastradas" className="mt-3 divide-y divide-panel-border">
            {routines.map((routine) => (
              <li key={routine.id} className="flex items-center gap-3 py-2.5">
                <div className={`min-w-0 flex-1 ${routine.enabled ? '' : 'opacity-50'}`}>
                  <p className="truncate text-sm font-medium">{routine.name}</p>
                  <p className="text-xs text-ink-muted tabular-nums">
                    {formatMinute(routine.startMinute)} –{' '}
                    {formatMinute(routine.startMinute + routine.durationMinutes)} ·{' '}
                    {describeWeekdays(routine.weekdays)}
                  </p>
                </div>
                <CheckboxField
                  checked={routine.enabled}
                  onChange={(enabled) => {
                    void update(routine.id, { ...inputOf(routine), enabled }).then(report);
                  }}
                >
                  <span className="sr-only">{routine.name}: </span>Ativa
                </CheckboxField>
                <button
                  type="button"
                  aria-label={`Editar ${routine.name}`}
                  title="Editar"
                  onClick={() => {
                    setEditing(routine);
                  }}
                  className={ICON_BUTTON}
                >
                  <Pencil size={15} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={`Excluir ${routine.name}`}
                  title="Excluir"
                  onClick={() => {
                    void remove(routine.id).then(report);
                  }}
                  className={ICON_BUTTON}
                >
                  <Trash2 size={15} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}

        {error ? (
          <p role="alert" className="mt-3 text-sm text-accent">
            {error}
          </p>
        ) : null}
      </Panel>

      {editing ? (
        <RoutineDialog
          routine={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
          onSubmit={(input) => (editing === 'new' ? create(input) : update(editing.id, input))}
        />
      ) : null}
    </>
  );
}
