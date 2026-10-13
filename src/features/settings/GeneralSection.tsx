import { useState } from 'react';

import { CheckboxField } from '@/components/ui/CheckboxField';
import { Panel } from '@/components/ui/Panel';
import { PanelLabel } from '@/components/ui/PanelLabel';
import { useSettingsStore } from '@/stores/settings';

export function GeneralSection() {
  const settings = useSettingsStore((state) => state.settings);
  const save = useSettingsStore((state) => state.save);
  const [error, setError] = useState<string | null>(null);

  const setLaunchAtLogin = (launchAtLogin: boolean) => {
    setError(null);
    void save({ ...settings, general: { ...settings.general, launchAtLogin } }).then((failure) => {
      if (failure) setError(`Não foi possível salvar: ${failure.message}`);
    });
  };

  return (
    <Panel aria-label="Geral" className="mt-3 px-4 py-3.5">
      <PanelLabel as="h2">Geral</PanelLabel>
      <div className="mt-3">
        <CheckboxField checked={settings.general.launchAtLogin} onChange={setLaunchAtLogin}>
          Iniciar com o Windows
        </CheckboxField>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Abre o Compasso, já no painel, quando você entra no Windows.
      </p>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-accent">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
