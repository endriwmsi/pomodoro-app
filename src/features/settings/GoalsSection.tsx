import { useId, useState } from 'react';

import { CheckboxField } from '@/components/ui/CheckboxField';
import { NumberInput } from '@/components/ui/NumberInput';
import { Panel } from '@/components/ui/Panel';
import { PanelLabel } from '@/components/ui/PanelLabel';
import { useSettingsStore } from '@/stores/settings';

/** Espelha `DAILY_POMODOROS_GOAL` em src-tauri/src/settings/mod.rs; o backend revalida. */
const GOAL_LIMITS = { min: 1, max: 50 };
const DEFAULT_GOAL = 8;

export function GoalsSection() {
  const settings = useSettingsStore((state) => state.settings);
  const save = useSettingsStore((state) => state.save);
  const goal = settings.goals.dailyPomodoros;
  const inputId = useId();

  /** Texto em edição; `null` quando o campo mostra o valor gravado. */
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const persist = (dailyPomodoros: number | null) => {
    void save({ ...settings, goals: { ...settings.goals, dailyPomodoros } }).then((failure) => {
      setError(failure ? failure.message : null);
      if (!failure) setDraft(null);
    });
  };

  const change = (text: string) => {
    setDraft(text);
    const value = Number(text);
    if (!/^\d+$/.test(text.trim()) || value < GOAL_LIMITS.min || value > GOAL_LIMITS.max) {
      setError(`Use um número entre ${GOAL_LIMITS.min} e ${GOAL_LIMITS.max}.`);
      return;
    }
    persist(value);
  };

  return (
    <Panel aria-label="Metas" className="mt-3 px-4 py-3.5">
      <PanelLabel as="h2">Meta diária</PanelLabel>
      <div className="mt-3">
        <CheckboxField
          checked={goal !== null}
          onChange={(enabled) => {
            setDraft(null);
            persist(enabled ? DEFAULT_GOAL : null);
          }}
        >
          Ter uma meta de pomodoros por dia
        </CheckboxField>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <label htmlFor={inputId} className="text-sm">
          Pomodoros por dia
        </label>
        <NumberInput
          id={inputId}
          value={draft ?? (goal === null ? '' : String(goal))}
          onValueChange={change}
          min={GOAL_LIMITS.min}
          max={GOAL_LIMITS.max}
          disabled={goal === null}
          invalid={error !== null}
          className="w-24"
        />
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        O dashboard mostra o progresso do dia em relação à meta.
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-accent">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
