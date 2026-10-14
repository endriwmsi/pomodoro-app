import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { backgroundUrl, BUILTIN_BACKGROUNDS, builtinFor, labelOf } from '@/app/background';
import { BackgroundPicker } from '@/features/settings/BackgroundPicker';
import type { Settings } from '@/lib/commands';
import { MAX_BACKGROUND_BYTES, useBackgroundStore } from '@/stores/background';
import { useSettingsStore } from '@/stores/settings';

const commands = vi.hoisted(() => ({
  getSettings: vi.fn<() => Promise<Settings>>(),
  updateSettings: vi.fn<(settings: Settings) => Promise<Settings>>(),
  backgroundGetCustom: vi.fn<() => Promise<string | null>>(),
  backgroundSetCustom: vi.fn<(dataUrl: string) => Promise<string | null>>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@/lib/commands', () => commands);

const STORED = 'data:image/png;base64,AAAA';

function file(size = 4, type = 'image/png') {
  return new File([new Uint8Array(size)], 'praia.png', { type });
}

async function send(picked: File) {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Arquivo da imagem de fundo'), {
      target: { files: [picked] },
    });
    // Leitura do arquivo, envio e gravação da escolha.
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
}

describe('imagens de fundo', () => {
  const images = [
    { name: 'floresta', label: 'Floresta', url: '/floresta.jpg' },
    { name: 'nuvens', label: 'Nuvens', url: '/nuvens.jpg' },
  ];

  it('o rótulo vem do nome do arquivo', () => {
    expect(labelOf('por-do-sol')).toBe('Por do sol');
    expect(labelOf('nuvens_2')).toBe('Nuvens 2');
  });

  it('as imagens embutidas existem e têm nomes que o backend aceita', () => {
    expect(BUILTIN_BACKGROUNDS.length).toBeGreaterThan(0);
    for (const image of BUILTIN_BACKGROUNDS) {
      expect(image.name).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    }
  });

  it('resolve a escolha em uma imagem, com a primeira como padrão', () => {
    expect(backgroundUrl({ kind: 'default' }, null, images)).toBe('/floresta.jpg');
    expect(backgroundUrl({ kind: 'builtin', name: 'nuvens' }, null, images)).toBe('/nuvens.jpg');
    expect(backgroundUrl({ kind: 'none' }, STORED, images)).toBeUndefined();
    expect(backgroundUrl({ kind: 'custom' }, STORED, images)).toBe(STORED);
  });

  it('cai na imagem padrão se a escolhida não existe mais', () => {
    // Imagem embutida removida em uma versão nova, ou a do usuário apagada do disco.
    expect(builtinFor({ kind: 'builtin', name: 'removida' }, images)?.name).toBe('floresta');
    expect(backgroundUrl({ kind: 'custom' }, null, images)).toBe('/floresta.jpg');
    expect(backgroundUrl({ kind: 'default' }, null, [])).toBeUndefined();
  });
});

describe('BackgroundPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commands.updateSettings.mockImplementation((settings) => Promise.resolve(settings));
  });

  afterEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
    useBackgroundStore.setState(useBackgroundStore.getInitialState(), true);
  });

  it('começa na primeira imagem embutida e grava a troca', async () => {
    render(<BackgroundPicker />);
    const [first] = BUILTIN_BACKGROUNDS;
    if (!first) throw new Error('sem imagens embutidas');
    expect(screen.getByRole('radio', { name: first.label })).toBeChecked();

    await act(async () => {
      fireEvent.click(screen.getByRole('radio', { name: 'Sem imagem' }));
      await Promise.resolve();
    });

    expect(commands.updateSettings).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        appearance: expect.objectContaining({ background: { kind: 'none' } }) as unknown,
      }),
    );
    expect(screen.getByRole('radio', { name: 'Sem imagem' })).toBeChecked();
  });

  it('"Sua imagem" só pode ser escolhida depois de enviar uma', () => {
    render(<BackgroundPicker />);

    expect(screen.getByRole('radio', { name: 'Sua imagem' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Enviar uma imagem…' })).toBeEnabled();
  });

  it('envia a imagem ao backend e passa a usá-la', async () => {
    commands.backgroundSetCustom.mockResolvedValue(STORED);
    render(<BackgroundPicker />);

    await send(file());

    expect(commands.backgroundSetCustom).toHaveBeenCalledExactlyOnceWith(
      expect.stringMatching(/^data:image\/png;base64,/),
    );
    expect(useBackgroundStore.getState().custom).toBe(STORED);
    expect(screen.getByRole('radio', { name: 'Sua imagem' })).toBeChecked();
    expect(useSettingsStore.getState().settings.appearance.background).toEqual({ kind: 'custom' });
    expect(screen.getByRole('button', { name: 'Trocar a sua imagem…' })).toBeInTheDocument();
  });

  it('mostra o motivo quando o backend recusa e mantém o fundo atual', async () => {
    commands.backgroundSetCustom.mockRejectedValue({
      kind: 'validation',
      field: 'image',
      message: 'Use uma imagem PNG, JPEG ou WebP.',
    });
    render(<BackgroundPicker />);

    await send(file(4, 'image/gif'));

    expect(screen.getByRole('alert')).toHaveTextContent('Use uma imagem PNG, JPEG ou WebP.');
    expect(commands.updateSettings).not.toHaveBeenCalled();
    expect(screen.getByRole('radio', { name: 'Sua imagem' })).toBeDisabled();
  });

  it('recusa um arquivo grande demais sem enviá-lo', async () => {
    render(<BackgroundPicker />);

    await send(file(MAX_BACKGROUND_BYTES + 1));

    expect(screen.getByRole('alert')).toHaveTextContent('A imagem é grande demais');
    expect(commands.backgroundSetCustom).not.toHaveBeenCalled();
  });
});
