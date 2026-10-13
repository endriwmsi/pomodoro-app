import { useState } from 'react';

import { CheckboxField } from '@/components/ui/CheckboxField';
import { Panel } from '@/components/ui/Panel';
import { PanelLabel } from '@/components/ui/PanelLabel';
import type { Settings } from '@/lib/commands';
import { useSettingsStore } from '@/stores/settings';

export function WeatherSection() {
  const settings = useSettingsStore((state) => state.settings);
  const save = useSettingsStore((state) => state.save);
  const [error, setError] = useState<string | null>(null);

  const { enabled, useLocation } = settings.weather;

  const update = (weather: Partial<Settings['weather']>) => {
    setError(null);
    void save({ ...settings, weather: { ...settings.weather, ...weather } }).then((failure) => {
      if (failure) setError(`Não foi possível salvar: ${failure.message}`);
    });
  };

  return (
    <Panel aria-label="Previsão do tempo" className="mt-3 px-4 py-3.5">
      <PanelLabel as="h2">Previsão do tempo</PanelLabel>
      <div className="mt-3">
        <CheckboxField
          checked={enabled}
          onChange={(checked) => {
            update({ enabled: checked });
          }}
        >
          Mostrar a previsão do tempo no notch
        </CheckboxField>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Usa a internet: consulta o serviço Open-Meteo, no máximo uma vez a cada 15 minutos. É a
        única função do Compasso que acessa a rede; desligada, nada é enviado.
      </p>

      <div className="mt-4">
        <CheckboxField
          checked={useLocation}
          disabled={!enabled}
          onChange={(checked) => {
            update({ useLocation: checked });
          }}
        >
          Usar a localização deste computador
        </CheckboxField>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Envia as coordenadas aproximadas (cerca de 1 km) obtidas do Windows ao Open-Meteo e, para
        saber o nome da cidade, ao Nominatim (OpenStreetMap). Sem isso, ou se a localização estiver
        desligada no sistema, são mostradas as maiores capitais de cada região.
      </p>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-accent">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
