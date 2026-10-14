import { useId, useState, type SyntheticEvent } from 'react';

import { CheckboxField } from '@/components/ui/CheckboxField';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { NumberInput } from '@/components/ui/NumberInput';
import {
  EVERY_DAY,
  formatMinute,
  parseTime,
  WEEKDAY_LABELS,
  WEEKDAY_NAMES,
} from '@/features/routines/schedule';
import type { AppError, Routine, RoutineInput } from '@/lib/commands';

/** Espelham os limites de `src-tauri/src/routines/mod.rs`; o backend revalida. */
const NAME_MAX = 60;
const DURATION_MAX = 240;

type Field = 'name' | 'startMinute' | 'durationMinutes' | 'weekdays';
type FieldErrors = Partial<Record<Field, string>>;

/** Campos que o backend pode apontar em um erro de validação. */
const FIELDS: readonly string[] = ['name', 'startMinute', 'durationMinutes', 'weekdays'];

interface Draft {
  name: string;
  time: string;
  duration: string;
  weekdays: number;
  enabled: boolean;
}

function parseDraft(draft: Draft): { input: RoutineInput } | { errors: FieldErrors } {
  const errors: FieldErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = 'Dê um nome à rotina.';

  const startMinute = parseTime(draft.time);
  if (startMinute === null) errors.startMinute = 'Informe o horário.';

  const durationMinutes = Number(draft.duration);
  if (
    !/^\d+$/.test(draft.duration.trim()) ||
    durationMinutes < 1 ||
    durationMinutes > DURATION_MAX
  ) {
    errors.durationMinutes = `Use um número entre 1 e ${String(DURATION_MAX)} minutos.`;
  } else if (startMinute !== null && startMinute + durationMinutes > 24 * 60) {
    errors.durationMinutes = 'A rotina precisa terminar no mesmo dia em que começa.';
  }

  if (draft.weekdays === 0) errors.weekdays = 'Escolha ao menos um dia da semana.';

  if (startMinute === null || Object.keys(errors).length > 0) return { errors };
  return {
    input: { name, startMinute, durationMinutes, weekdays: draft.weekdays, enabled: draft.enabled },
  };
}

const FIELD =
  'w-full rounded-lg border bg-panel-strong px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-white/70';

interface RoutineDialogProps {
  /** Rotina em edição, ou `null` para criar uma nova. */
  routine: Routine | null;
  onClose: () => void;
  /** Persiste a rotina. Devolve `null` em caso de sucesso ou o erro ocorrido. */
  onSubmit: (input: RoutineInput) => Promise<AppError | null>;
}

/** Formulário de criação e edição. Monte-o apenas enquanto estiver aberto. */
export function RoutineDialog({ routine, onClose, onSubmit }: RoutineDialogProps) {
  const ids = useId();
  const [draft, setDraft] = useState<Draft>(() => ({
    name: routine?.name ?? '',
    time: routine ? formatMinute(routine.startMinute) : '',
    duration: String(routine?.durationMinutes ?? 15),
    weekdays: routine?.weekdays ?? EVERY_DAY,
    enabled: routine?.enabled ?? true,
  }));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const parsed = parseDraft(draft);
    if ('errors' in parsed) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setFailure(null);
    setSaving(true);
    void onSubmit(parsed.input).then((error) => {
      setSaving(false);
      if (!error) {
        onClose();
      } else if (error.kind === 'validation' && FIELDS.includes(error.field)) {
        setErrors({ [error.field]: error.message });
      } else {
        setFailure(error.message);
      }
    });
  };

  const border = (field: Field) => (errors[field] ? 'border-accent' : 'border-panel-border');
  const hint = (field: Field) =>
    errors[field] ? (
      <p id={`${ids}-${field}-error`} className="mt-1 text-xs text-accent">
        {errors[field]}
      </p>
    ) : null;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>{routine ? 'Editar rotina' : 'Nova rotina'}</DialogTitle>
        <DialogDescription className="sr-only">
          {routine ? 'Altere os dados da rotina.' : 'Preencha os dados da nova rotina.'}
        </DialogDescription>

        <form onSubmit={submit} noValidate className="grid gap-4">
          <div>
            <label htmlFor={`${ids}-name`} className="mb-1.5 block text-sm">
              Nome
            </label>
            <input
              id={`${ids}-name`}
              value={draft.name}
              maxLength={NAME_MAX}
              placeholder="Hora do café"
              autoFocus
              onChange={(event) => {
                change('name', event.target.value);
              }}
              aria-invalid={errors.name ? true : undefined}
              aria-describedby={errors.name ? `${ids}-name-error` : undefined}
              className={`${FIELD} ${border('name')}`}
            />
            {hint('name')}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${ids}-time`} className="mb-1.5 block text-sm">
                Começa às
              </label>
              <input
                id={`${ids}-time`}
                type="time"
                value={draft.time}
                onChange={(event) => {
                  change('time', event.target.value);
                }}
                aria-invalid={errors.startMinute ? true : undefined}
                aria-describedby={errors.startMinute ? `${ids}-startMinute-error` : undefined}
                className={`${FIELD} scheme-dark ${border('startMinute')}`}
              />
              {hint('startMinute')}
            </div>
            <div>
              <label htmlFor={`${ids}-duration`} className="mb-1.5 block text-sm">
                Duração (min)
              </label>
              <NumberInput
                id={`${ids}-duration`}
                value={draft.duration}
                onValueChange={(value) => {
                  change('duration', value);
                }}
                min={1}
                max={DURATION_MAX}
                invalid={errors.durationMinutes !== undefined}
                aria-describedby={
                  errors.durationMinutes ? `${ids}-durationMinutes-error` : undefined
                }
              />
              {hint('durationMinutes')}
            </div>
          </div>

          <fieldset>
            <legend className="mb-1.5 text-sm">Repete em</legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map((label, day) => {
                const bit = 1 << day;
                const on = (draft.weekdays & bit) !== 0;
                return (
                  <button
                    key={label}
                    type="button"
                    aria-pressed={on}
                    aria-label={WEEKDAY_NAMES[day]}
                    onClick={() => {
                      change('weekdays', draft.weekdays ^ bit);
                    }}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
                      on
                        ? 'border-accent bg-accent text-accent-ink'
                        : 'border-panel-border text-ink-muted hover:border-ink-muted'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            {hint('weekdays')}
          </fieldset>

          <CheckboxField
            checked={draft.enabled}
            onChange={(enabled) => {
              change('enabled', enabled);
            }}
          >
            Rotina ativa
          </CheckboxField>

          {failure ? (
            <p role="alert" className="text-sm text-accent">
              Não foi possível salvar: {failure}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-panel-border px-3.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-ink outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40"
            >
              {routine ? 'Salvar' : 'Criar rotina'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
