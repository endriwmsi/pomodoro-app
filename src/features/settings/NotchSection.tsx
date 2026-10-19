import { useEffect, useId, useRef, useState } from 'react';

import { CheckboxField } from '@/components/ui/CheckboxField';
import { ColorPicker } from '@/components/ui/ColorPicker';
import { Panel } from '@/components/ui/Panel';
import { PanelLabel } from '@/components/ui/PanelLabel';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  NotchBorder,
  NotchBorderStyle,
  NotchPosition,
  NotchTheme,
  Settings,
} from '@/lib/commands';
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

/** O seletor de cor dispara a cada movimento: só salva quando o usuário para. */
const COLOR_SAVE_DELAY_MS = 300;

const BORDER_STYLES: readonly { value: NotchBorderStyle; label: string }[] = [
  { value: 'rainbow', label: 'Colorida' },
  { value: 'solid', label: 'Uma cor' },
];

function isBorderStyle(value: string): value is NotchBorderStyle {
  return BORDER_STYLES.some((style) => style.value === value);
}

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
  const borderStyleId = useId();
  const borderColorId = useId();

  const update = (notch: Partial<Settings['notch']>) => {
    setError(null);
    void save({ ...settings, notch: { ...settings.notch, ...notch } }).then((failure) => {
      if (failure) setError(`Não foi possível salvar: ${failure.message}`);
    });
  };

  const border = settings.notch.border;
  const updateBorder = (next: Partial<NotchBorder>) => {
    update({ border: { ...border, ...next } });
  };

  // Cor exibida no seletor enquanto o salvamento espera.
  const [draftColor, setDraftColor] = useState<string | null>(null);
  const colorTimer = useRef<number | undefined>(undefined);
  const flushColor = useRef<(() => void) | null>(null);
  useEffect(
    () => () => {
      window.clearTimeout(colorTimer.current);
      flushColor.current?.();
    },
    [],
  );
  const changeColor = (color: string) => {
    setDraftColor(color);
    window.clearTimeout(colorTimer.current);
    flushColor.current = () => {
      flushColor.current = null;
      setDraftColor(null);
      updateBorder({ color });
    };
    colorTimer.current = window.setTimeout(() => flushColor.current?.(), COLOR_SAVE_DELAY_MS);
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

      <div className="mt-4">
        <CheckboxField
          checked={settings.notch.notices}
          disabled={!settings.notch.enabled}
          onChange={(notices) => {
            update({ notices });
          }}
        >
          Avisar no notch ao fim de cada foco e pausa e no início das rotinas
        </CheckboxField>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        O notch se abre na aba Timer por alguns segundos, mostrando o que terminou e o que vem a
        seguir (ou a rotina que começou), e se recolhe sozinho.
      </p>

      <div className="mt-4">
        <CheckboxField
          checked={border.enabled}
          disabled={!settings.notch.enabled}
          onChange={(enabled) => {
            updateBorder({ enabled });
          }}
        >
          Borda animada no notch recolhido
        </CheckboxField>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label htmlFor={borderStyleId} className="text-sm">
          Cores da borda
        </label>
        <Select
          value={border.style}
          disabled={!settings.notch.enabled || !border.enabled}
          onValueChange={(value) => {
            if (isBorderStyle(value)) updateBorder({ style: value });
          }}
        >
          <SelectTrigger id={borderStyleId}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BORDER_STYLES.map((style) => (
              <SelectItem key={style.value} value={style.value}>
                {style.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {border.style === 'solid' ? (
          <ColorPicker
            id={borderColorId}
            aria-label="Cor da borda"
            value={draftColor ?? border.color}
            disabled={!settings.notch.enabled || !border.enabled}
            onChange={changeColor}
          />
        ) : null}
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Uma linha de cor que percorre a borda do notch fechado, para ele chamar mais atenção. Some
        quando o notch abre.
      </p>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-accent">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
