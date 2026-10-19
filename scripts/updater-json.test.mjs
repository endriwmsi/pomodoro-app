import { describe, expect, it } from 'vitest';

import { updaterManifest } from './updater-json.mjs';

const REPO = 'endriwmsi/pomodoro-app';
const BASE = `https://github.com/${REPO}/releases/download/v0.3.2`;

/** Os pacotes assinados da Release v0.3.2, a última com o `latest.json` completo. */
const SIGNATURES = new Map([
  ['Compasso-0.3.2-1.x86_64.rpm', 'sig-rpm\n'],
  ['Compasso_0.3.2_amd64.AppImage', 'sig-appimage'],
  ['Compasso_0.3.2_amd64.deb', 'sig-deb'],
  ['Compasso_0.3.2_x64-setup.exe', 'sig-windows'],
  ['Compasso_aarch64.app.tar.gz', 'sig-mac-arm'],
  ['Compasso_x64.app.tar.gz', 'sig-mac-intel'],
]);

function manifest(signatures = SIGNATURES) {
  return updaterManifest({
    version: '0.3.2',
    notes: '### Adicionado\n\n- Algo.',
    pubDate: '2026-10-19T12:59:24.579Z',
    repo: REPO,
    tag: 'v0.3.2',
    signatures,
  });
}

describe('updaterManifest', () => {
  it('gera as mesmas plataformas e endereços que o tauri-action gerava', () => {
    const { version, notes, pub_date, platforms } = manifest();

    expect({ version, notes, pub_date }).toEqual({
      version: '0.3.2',
      notes: '### Adicionado\n\n- Algo.',
      pub_date: '2026-10-19T12:59:24.579Z',
    });
    expect(
      Object.fromEntries(Object.entries(platforms).map(([key, { url }]) => [key, url])),
    ).toEqual({
      'windows-x86_64': `${BASE}/Compasso_0.3.2_x64-setup.exe`,
      'windows-x86_64-nsis': `${BASE}/Compasso_0.3.2_x64-setup.exe`,
      'linux-x86_64': `${BASE}/Compasso_0.3.2_amd64.AppImage`,
      'linux-x86_64-appimage': `${BASE}/Compasso_0.3.2_amd64.AppImage`,
      'linux-x86_64-deb': `${BASE}/Compasso_0.3.2_amd64.deb`,
      'linux-x86_64-rpm': `${BASE}/Compasso-0.3.2-1.x86_64.rpm`,
      'darwin-aarch64': `${BASE}/Compasso_aarch64.app.tar.gz`,
      'darwin-aarch64-app': `${BASE}/Compasso_aarch64.app.tar.gz`,
      'darwin-x86_64': `${BASE}/Compasso_x64.app.tar.gz`,
      'darwin-x86_64-app': `${BASE}/Compasso_x64.app.tar.gz`,
    });
  });

  it('usa a assinatura de cada pacote, sem a quebra de linha final', () => {
    const { platforms } = manifest();

    expect(platforms['windows-x86_64']?.signature).toBe('sig-windows');
    expect(platforms['linux-x86_64-rpm']?.signature).toBe('sig-rpm');
    expect(platforms['darwin-aarch64']?.signature).toBe('sig-mac-arm');
  });

  it('deixa de fora a plataforma que não enviou pacote e ignora arquivos desconhecidos', () => {
    const partial = new Map(SIGNATURES);
    partial.delete('Compasso_aarch64.app.tar.gz');
    partial.set('outra-coisa.zip', 'x');

    const { platforms } = manifest(partial);

    expect(platforms).not.toHaveProperty('darwin-aarch64');
    expect(Object.keys(platforms)).toHaveLength(8);
  });

  it('recusa gerar o arquivo sem o pacote do Windows', () => {
    const withoutWindows = new Map(SIGNATURES);
    withoutWindows.delete('Compasso_0.3.2_x64-setup.exe');

    expect(() => manifest(withoutWindows)).toThrow(/Windows/);
  });
});
