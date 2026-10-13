import { isTauri } from '@tauri-apps/api/core';
import { BellRing } from 'lucide-react';
import { useState } from 'react';

import { CheckboxField } from '@/components/ui/CheckboxField';
import { Panel } from '@/components/ui/Panel';
import { PanelLabel } from '@/components/ui/PanelLabel';
import { previewAlerts, type Settings } from '@/lib/commands';
import { toAppError } from '@/lib/errors';
import { useSettingsStore } from '@/stores/settings';

export function AlertsSection() {
  const settings = useSettingsStore((state) => state.settings);
  const save = useSettingsStore((state) => state.save);
  const [error, setError] = useState<string | null>(null);

  const { soundEnabled, notificationsEnabled } = settings.alerts;

  const update = (alerts: Partial<Settings['alerts']>) => {
    setError(null);
    void save({ ...settings, alerts: { ...settings.alerts, ...alerts } }).then((failure) => {
      if (failure) setError(`Não foi possível salvar: ${failure.message}`);
    });
  };

  const preview = () => {
    setError(null);
    previewAlerts().catch((failure: unknown) => {
      setError(`Não foi possível testar o aviso: ${toAppError(failure).message}`);
    });
  };

  return (
    <Panel aria-label="Avisos" className="mt-3 px-4 py-3.5">
      <PanelLabel as="h2">Avisos ao concluir uma sessão</PanelLabel>
      <div className="mt-3 flex flex-col gap-2.5">
        <CheckboxField
          checked={soundEnabled}
          onChange={(checked) => {
            update({ soundEnabled: checked });
          }}
        >
          Tocar um som
        </CheckboxField>
        <CheckboxField
          checked={notificationsEnabled}
          onChange={(checked) => {
            update({ notificationsEnabled: checked });
          }}
        >
          Mostrar uma notificação do Windows
        </CheckboxField>
      </div>

      <button
        type="button"
        disabled={!isTauri() || (!soundEnabled && !notificationsEnabled)}
        onClick={preview}
        className="mt-4 flex items-center gap-2 rounded-lg border border-panel-border bg-panel-strong px-3.5 py-1.5 text-sm font-medium transition-opacity duration-150 outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-40"
      >
        <BellRing size={15} aria-hidden="true" />
        Testar aviso
      </button>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-accent">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
