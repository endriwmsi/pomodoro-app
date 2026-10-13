import { useId, useState } from 'react';

import { CheckboxField } from '@/components/ui/CheckboxField';
import { Panel } from '@/components/ui/Panel';
import { PanelLabel } from '@/components/ui/PanelLabel';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { NotchPosition, NotchTheme, Settings } from '@/lib/commands';
import { useSettingsStore } from '@/stores/settings';

const POSITIONS: readonly { value: NotchPosition; label: string }[] = [
  { value: 'top', label: 'Topo' },
  { value: 'left', label: 'Lateral esquerda' },
  { value: 'right', label: 'Lateral direita' },
];

const THEMES: readonly { value: NotchTheme; label: string }[] = [
  { value: 'dark', label: 'Preto' },
  { value: 'light', label: 'Branco' },
  { value: 'system', label: 'Seguir o sistema' },
];

function isTheme(value: string): value is NotchTheme {
  return THEMES.some((theme) => theme.value === value);
}

function isPosition(value: string): value is NotchPosition {
  return POSITIONS.some((position) => position.value === value);
}

export function NotchSection() {
  const settings = useSettingsStore((state) => state.settings);
  const save = useSettingsStore((state) => state.save);
  const [error, setError] = useState<string | null>(null);
  const positionId = useId();
  const themeId = useId();

  const update = (notch: Partial<Settings['notch']>) => {
    setError(null);
    void save({ ...settings, notch: { ...settings.notch, ...notch } }).then((failure) => {
      if (failure) setError(`Não foi possível salvar: ${failure.message}`);
    });
  };

  return (
    <Panel aria-label="Notch" className="mt-3 px-4 py-3.5">
      <PanelLabel as="h2">Notch</PanelLabel>
      <div className="mt-3">
        <CheckboxField
          checked={settings.notch.enabled}
          onChange={(enabled) => {
            update({ enabled });
          }}
        >
          Mostrar o notch no monitor principal
        </CheckboxField>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Um pequeno puxador que, ao passar o mouse, mostra o timer e seus controles por cima de
        outros aplicativos.
      </p>

      <div className="mt-4 flex items-center gap-3">
        <label htmlFor={positionId} className="text-sm">
          Posição
        </label>
        <Select
          value={settings.notch.position}
          disabled={!settings.notch.enabled}
          onValueChange={(value) => {
            if (isPosition(value)) update({ position: value });
          }}
        >
          <SelectTrigger id={positionId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {POSITIONS.map((position) => (
              <SelectItem key={position.value} value={position.value}>
                {position.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <label htmlFor={themeId} className="text-sm">
          Cor
        </label>
        <Select
          value={settings.notch.theme}
          disabled={!settings.notch.enabled}
          onValueChange={(value) => {
            if (isTheme(value)) update({ theme: value });
          }}
        >
          <SelectTrigger id={themeId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THEMES.map((theme) => (
              <SelectItem key={theme.value} value={theme.value}>
                {theme.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        A cor do notch não depende do template. Em "Seguir o sistema", ele fica branco no modo claro
        do Windows e preto no escuro.
      </p>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-accent">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
