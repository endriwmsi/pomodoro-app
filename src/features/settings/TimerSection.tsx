import { useId, useState, type SyntheticEvent } from 'react';

import { CheckboxField } from '@/components/ui/CheckboxField';
import { NumberInput } from '@/components/ui/NumberInput';
import { Panel } from '@/components/ui/Panel';
import { PanelLabel } from '@/components/ui/PanelLabel';
import type { TimerSettings } from '@/lib/commands';
import { TIMER_LIMITS, useSettingsStore } from '@/stores/settings';

type NumberKey = keyof typeof TIMER_LIMITS;
type ToggleKey = 'autoStartBreaks' | 'autoStartFocus';

const NUMBER_FIELDS: readonly { key: NumberKey; label: string; unit: string }[] = [
  { key: 'focusMinutes', label: 'Foco', unit: 'min' },
  { key: 'shortBreakMinutes', label: 'Pausa curta', unit: 'min' },
  { key: 'longBreakMinutes', label: 'Pausa longa', unit: 'min' },
  { key: 'cyclesBeforeLongBreak', label: 'Ciclos até a pausa longa', unit: 'ciclos' },
];

const TOGGLE_FIELDS: readonly { key: ToggleKey; label: string }[] = [
  { key: 'autoStartBreaks', label: 'Iniciar as pausas automaticamente' },
  { key: 'autoStartFocus', label: 'Iniciar o próximo foco automaticamente' },
];

type Draft = Record<NumberKey, string> & Record<ToggleKey, boolean>;
type FieldErrors = Partial<Record<NumberKey, string>>;

function toDraft(timer: TimerSettings): Draft {
  return {
    focusMinutes: String(timer.focusMinutes),
    shortBreakMinutes: String(timer.shortBreakMinutes),
    longBreakMinutes: String(timer.longBreakMinutes),
    cyclesBeforeLongBreak: String(timer.cyclesBeforeLongBreak),
    autoStartBreaks: timer.autoStartBreaks,
    autoStartFocus: timer.autoStartFocus,
  };
}

/** Converte o rascunho; devolve os erros por campo quando algo é inválido. */
function parseDraft(draft: Draft): { timer: TimerSettings } | { errors: FieldErrors } {
  const errors: FieldErrors = {};
  const numbers = {} as Record<NumberKey, number>;

  for (const { key } of NUMBER_FIELDS) {
    const text = draft[key].trim();
    const { min, max } = TIMER_LIMITS[key];
    if (!/^\d+$/.test(text)) {
      errors[key] = 'Informe um número inteiro.';
      continue;
    }
    const value = Number(text);
    if (value < min || value > max) {
      errors[key] = `Use um valor entre ${min} e ${max}.`;
      continue;
    }
    numbers[key] = value;
  }

  if (Object.keys(errors).length > 0) return { errors };
  return {
    timer: {
      ...numbers,
      autoStartBreaks: draft.autoStartBreaks,
      autoStartFocus: draft.autoStartFocus,
    },
  };
}

function fieldFromBackend(field: string): NumberKey | null {
  const key = field.replace(/^timer\./, '');
  return key in TIMER_LIMITS ? (key as NumberKey) : null;
}

type Feedback = { kind: 'saved' } | { kind: 'error'; message: string } | null;

interface TimerFormProps {
  timer: TimerSettings;
  feedback: Feedback;
  onFeedback: (feedback: Feedback) => void;
}

function TimerForm({ timer, feedback, onFeedback: setFeedback }: TimerFormProps) {
  const settings = useSettingsStore((state) => state.settings);
  const save = useSettingsStore((state) => state.save);
  const formId = useId();

  const [draft, setDraft] = useState<Draft>(() => toDraft(timer));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [saving, setSaving] = useState(false);

  const initial = toDraft(timer);
  const dirty = (Object.keys(initial) as (keyof Draft)[]).some(
    (key) => draft[key] !== initial[key],
  );

  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFeedback(null);
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const parsed = parseDraft(draft);
    if ('errors' in parsed) {
      setErrors(parsed.errors);
      setFeedback(null);
      return;
    }

    setErrors({});
    setSaving(true);
    void save({ ...settings, timer: parsed.timer }).then((failure) => {
      setSaving(false);
      if (!failure) {
        setFeedback({ kind: 'saved' });
        return;
      }
      const field = failure.kind === 'validation' ? fieldFromBackend(failure.field) : null;
      if (field) setErrors({ [field]: failure.message });
      else setFeedback({ kind: 'error', message: failure.message });
    });
  };

  return (
    <form onSubmit={submit} noValidate className="mt-3">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4">
        {NUMBER_FIELDS.map(({ key, label, unit }) => {
          const inputId = `${formId}-${key}`;
          const error = errors[key];
          return (
            <div key={key}>
              <label htmlFor={inputId} className="block text-sm">
                {label}
              </label>
              <div className="mt-1.5 flex items-center gap-2">
                <NumberInput
                  id={inputId}
                  value={draft[key]}
                  onValueChange={(value) => {
                    change(key, value);
                  }}
                  min={TIMER_LIMITS[key].min}
                  max={TIMER_LIMITS[key].max}
                  invalid={error !== undefined}
                  aria-describedby={error ? `${inputId}-error` : undefined}
                  className="w-24"
                />
                <span className="text-xs text-ink-muted">{unit}</span>
              </div>
              {error ? (
                <p id={`${inputId}-error`} className="mt-1 text-xs text-accent">
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-col gap-2.5">
        {TOGGLE_FIELDS.map(({ key, label }) => (
          <CheckboxField
            key={key}
            checked={draft[key]}
            onChange={(checked) => {
              change(key, checked);
            }}
          >
            {label}
          </CheckboxField>
        ))}
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="submit"
          disabled={!dirty || saving}
          className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-ink transition-opacity duration-150 outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Salvar
        </button>
        {feedback?.kind === 'saved' ? (
          <p role="status" className="text-sm text-ink-muted">
            Configurações salvas.
          </p>
        ) : null}
        {feedback?.kind === 'error' ? (
          <p role="alert" className="text-sm text-accent">
            Não foi possível salvar: {feedback.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function TimerSection() {
  const timer = useSettingsStore((state) => state.settings.timer);
  // Fica aqui, e não no formulário, para sobreviver à recriação após salvar.
  const [feedback, setFeedback] = useState<Feedback>(null);

  return (
    <Panel aria-label="Pomodoro" className="mt-3 px-4 py-3.5">
      <PanelLabel as="h2">Pomodoro</PanelLabel>
      {/* A chave recria o formulário quando os valores gravados mudam (carga inicial, salvar). */}
      <TimerForm
        key={JSON.stringify(timer)}
        timer={timer}
        feedback={feedback}
        onFeedback={setFeedback}
      />
      <p className="mt-4 text-xs text-ink-muted">
        As novas durações valem a partir da próxima sessão; a sessão em andamento mantém a duração
        com que começou.
      </p>
    </Panel>
  );
}
