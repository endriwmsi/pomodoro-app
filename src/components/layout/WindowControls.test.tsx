import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WindowControls } from '@/components/layout/WindowControls';

const appWindow = vi.hoisted(() => ({
  minimize: vi.fn(() => Promise.resolve()),
  toggleMaximize: vi.fn(() => Promise.resolve()),
  close: vi.fn(() => Promise.resolve()),
  isMaximized: vi.fn(() => Promise.resolve(false)),
  onResized: vi.fn<(handler: () => void) => Promise<() => void>>(() =>
    Promise.resolve(() => undefined),
  ),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/api/window', () => ({ getCurrentWindow: () => appWindow }));

async function renderControls() {
  render(<WindowControls />);
  // Aguarda a consulta inicial de isMaximized e o registro de onResized.
  await act(async () => {
    await Promise.resolve();
  });
}

describe('WindowControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    appWindow.isMaximized.mockResolvedValue(false);
  });

  it('aciona minimizar, maximizar e fechar na janela atual', async () => {
    const user = userEvent.setup();
    await renderControls();

    await user.click(screen.getByRole('button', { name: 'Minimizar' }));
    await user.click(screen.getByRole('button', { name: 'Maximizar' }));
    await user.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(appWindow.minimize).toHaveBeenCalledTimes(1);
    expect(appWindow.toggleMaximize).toHaveBeenCalledTimes(1);
    expect(appWindow.close).toHaveBeenCalledTimes(1);
  });

  it('mostra "Restaurar" quando a janela está maximizada', async () => {
    appWindow.isMaximized.mockResolvedValue(true);
    await renderControls();

    expect(await screen.findByRole('button', { name: 'Restaurar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Maximizar' })).not.toBeInTheDocument();
  });

  it('atualiza o rótulo quando a janela é redimensionada', async () => {
    await renderControls();
    expect(screen.getByRole('button', { name: 'Maximizar' })).toBeInTheDocument();

    const onResize = appWindow.onResized.mock.calls[0]?.[0];
    expect(onResize).toBeTypeOf('function');

    appWindow.isMaximized.mockResolvedValue(true);
    act(() => {
      onResize?.();
    });

    expect(await screen.findByRole('button', { name: 'Restaurar' })).toBeInTheDocument();
  });
});
