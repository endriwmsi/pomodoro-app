import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GeneralSection } from '@/features/settings/GeneralSection';
import type { Settings } from '@/lib/commands';
import { useSettingsStore } from '@/stores/settings';

const commands = vi.hoisted(() => ({
  getSettings: vi.fn<() => Promise<Settings>>(),
  updateSettings: vi.fn<(settings: Settings) => Promise<Settings>>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@/lib/commands', () => commands);

describe('GeneralSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  });

  it('vem desligado e grava a escolha de iniciar com o Windows', async () => {
    commands.updateSettings.mockImplementation((settings) => Promise.resolve(settings));
    render(<GeneralSection />);
    const checkbox = screen.getByRole('checkbox', { name: 'Iniciar com o Windows' });
    expect(checkbox).not.toBeChecked();

    await act(async () => {
      fireEvent.click(checkbox);
      await Promise.resolve();
    });

    expect(commands.updateSettings).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ general: { launchAtLogin: true } }),
    );
    expect(checkbox).toBeChecked();
  });

  it('mostra o erro e mantém a opção como estava se o backend recusar', async () => {
    commands.updateSettings.mockRejectedValue({
      kind: 'internal',
      message: 'não foi possível ajustar o início com o Windows',
    });
    render(<GeneralSection />);
    const checkbox = screen.getByRole('checkbox', { name: 'Iniciar com o Windows' });

    await act(async () => {
      fireEvent.click(checkbox);
      await Promise.resolve();
    });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível salvar: não foi possível ajustar o início com o Windows',
    );
    expect(checkbox).not.toBeChecked();
  });
});
