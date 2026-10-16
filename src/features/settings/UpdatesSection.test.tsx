import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { UpdatesSection } from '@/features/settings/UpdatesSection';
import type { Settings, UpdateInfo } from '@/lib/commands';
import { useSettingsStore } from '@/stores/settings';

const commands = vi.hoisted(() => ({
  getSettings: vi.fn<() => Promise<Settings>>(),
  updateSettings: vi.fn<(settings: Settings) => Promise<Settings>>(),
  updatePending: vi.fn<() => Promise<UpdateInfo | null>>(),
  updateCheck: vi.fn<() => Promise<UpdateInfo | null>>(),
  updateInstall: vi.fn<() => Promise<void>>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@/lib/commands', () => commands);

const NEWER: UpdateInfo = { version: '0.3.0', notes: null };

async function renderSection() {
  render(<UpdatesSection />);
  await act(async () => {
    await Promise.resolve();
  });
}

describe('UpdatesSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commands.updatePending.mockResolvedValue(null);
  });

  afterEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  });

  it('vem ligado e grava a escolha de atualizar sozinho', async () => {
    commands.updateSettings.mockImplementation((settings) => Promise.resolve(settings));
    await renderSection();
    const checkbox = screen.getByRole('checkbox', {
      name: 'Atualizar automaticamente ao abrir o aplicativo',
    });
    expect(checkbox).toBeChecked();

    await act(async () => {
      fireEvent.click(checkbox);
      await Promise.resolve();
    });

    expect(commands.updateSettings).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ updates: { autoUpdate: false } }),
    );
    expect(checkbox).not.toBeChecked();
  });

  it('informa que já está na versão mais recente', async () => {
    commands.updateCheck.mockResolvedValue(null);
    await renderSection();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Verificar agora' }));
      await Promise.resolve();
    });

    expect(screen.getByRole('status')).toHaveTextContent('Você já está na versão mais recente.');
  });

  it('oferece a versão nova e a instala sob pedido', async () => {
    commands.updateCheck.mockResolvedValue(NEWER);
    commands.updateInstall.mockReturnValue(new Promise(() => undefined));
    await renderSection();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Verificar agora' }));
      await Promise.resolve();
    });
    expect(screen.getByRole('status')).toHaveTextContent('Versão 0.3.0 disponível.');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Instalar e reiniciar' }));
      await Promise.resolve();
    });

    expect(commands.updateInstall).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Instalando a versão 0.3.0…');
  });

  it('mostra a atualização que a consulta automática já achou', async () => {
    commands.updatePending.mockResolvedValue(NEWER);

    await renderSection();

    expect(screen.getByRole('status')).toHaveTextContent('Versão 0.3.0 disponível.');
  });

  it('mostra o erro se a consulta falhar e permite tentar de novo', async () => {
    commands.updateCheck.mockRejectedValue({ kind: 'network', message: 'sem rede' });
    await renderSection();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Verificar agora' }));
      await Promise.resolve();
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível verificar: sem rede');
    expect(screen.getByRole('button', { name: 'Verificar agora' })).toBeEnabled();
  });

  it('volta a oferecer a instalação se ela falhar', async () => {
    commands.updatePending.mockResolvedValue(NEWER);
    commands.updateInstall.mockRejectedValue({
      kind: 'validation',
      field: 'update',
      message: 'Há uma sessão em andamento.',
    });
    await renderSection();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Instalar e reiniciar' }));
      await Promise.resolve();
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Há uma sessão em andamento.');
    expect(screen.getByRole('button', { name: 'Instalar e reiniciar' })).toBeEnabled();
  });
});
