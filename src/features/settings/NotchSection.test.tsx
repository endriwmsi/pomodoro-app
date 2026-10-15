import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotchSection } from '@/features/settings/NotchSection';
import type { Settings } from '@/lib/commands';
import { useSettingsStore } from '@/stores/settings';

const commands = vi.hoisted(() => ({
  getSettings: vi.fn<() => Promise<Settings>>(),
  updateSettings: vi.fn<(settings: Settings) => Promise<Settings>>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@/lib/commands', () => commands);

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('NotchSection — borda animada', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commands.updateSettings.mockImplementation((settings) => Promise.resolve(settings));
  });

  afterEach(() => {
    vi.useRealTimers();
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  });

  it('vem desligada e grava ao ligar', async () => {
    render(<NotchSection />);
    const checkbox = screen.getByRole('checkbox', { name: 'Borda animada no notch recolhido' });
    expect(checkbox).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Cor da borda' })).toBeNull();

    fireEvent.click(checkbox);
    await flush();

    expect(commands.updateSettings).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        notch: expect.objectContaining({
          border: { enabled: true, style: 'rainbow', color: '#f59e0b' },
        }) as unknown,
      }),
    );
    expect(checkbox).toBeChecked();
  });

  it('no estilo "uma cor", grava a cor escolhida uma vez só, quando o usuário para', async () => {
    vi.useFakeTimers();
    const initial = useSettingsStore.getState().settings;
    useSettingsStore.setState({
      settings: {
        ...initial,
        notch: { ...initial.notch, border: { enabled: true, style: 'solid', color: '#f59e0b' } },
      },
    });
    render(<NotchSection />);
    const trigger = screen.getByRole('button', { name: 'Cor da borda' });
    expect(trigger).toHaveTextContent('#f59e0b');

    fireEvent.click(trigger);
    const hex = screen.getByRole('textbox', { name: 'Código da cor' });
    fireEvent.change(hex, { target: { value: '#112233' } });
    fireEvent.click(screen.getByRole('button', { name: '#22c55e' }));
    expect(trigger).toHaveTextContent('#22c55e');
    expect(commands.updateSettings).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(commands.updateSettings).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        notch: expect.objectContaining({
          border: { enabled: true, style: 'solid', color: '#22c55e' },
        }) as unknown,
      }),
    );
    expect(trigger).toHaveTextContent('#22c55e');
  });
});
