// Gera o `latest.json` que os aplicativos instalados consultam para se atualizar.
//
//   node scripts/updater-json.mjs <pasta com os .sig> <tag> <repositório>
//   ex.: node scripts/updater-json.mjs sigs v0.3.3 endriwmsi/pomodoro-app > latest.json
//
// O workflow Release roda isto uma única vez, depois que todas as plataformas
// enviaram seus pacotes. Antes, cada job do `tauri-action` reescrevia o arquivo
// por conta própria e, terminando juntos, um apagava as entradas do outro (v0.3.3).
// As notas vêm do CHANGELOG. Ver docs/RELEASING.md.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { notes } from './changelog.mjs';

/**
 * Pacote de atualização de cada plataforma, pelo nome do arquivo, e as chaves
 * que ele ocupa no `latest.json` — as mesmas que o `tauri-action` usava: a
 * genérica (`<so>-<arquitetura>`) e a do tipo de pacote.
 */
const PLATFORMS = [
  { pattern: /_x64-setup\.exe$/, keys: ['windows-x86_64', 'windows-x86_64-nsis'] },
  { pattern: /_amd64\.AppImage$/, keys: ['linux-x86_64', 'linux-x86_64-appimage'] },
  { pattern: /_amd64\.deb$/, keys: ['linux-x86_64-deb'] },
  { pattern: /\.x86_64\.rpm$/, keys: ['linux-x86_64-rpm'] },
  { pattern: /_aarch64\.app\.tar\.gz$/, keys: ['darwin-aarch64', 'darwin-aarch64-app'] },
  { pattern: /_x64\.app\.tar\.gz$/, keys: ['darwin-x86_64', 'darwin-x86_64-app'] },
];

/**
 * Monta o manifesto. `signatures` associa o nome de cada pacote (sem `.sig`)
 * ao conteúdo da sua assinatura. Pacotes sem plataforma conhecida são
 * ignorados; uma plataforma sem pacote fica de fora — os aplicativos dela
 * simplesmente não veem esta versão.
 */
export function updaterManifest({ version, notes: body, pubDate, repo, tag, signatures }) {
  const platforms = {};
  for (const [file, signature] of signatures) {
    const platform = PLATFORMS.find(({ pattern }) => pattern.test(file));
    if (!platform) continue;
    const url = `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(file)}`;
    for (const key of platform.keys) {
      platforms[key] = { signature: signature.trim(), url };
    }
  }
  if (!platforms['windows-x86_64']) {
    throw new Error('Nenhum pacote do Windows entre as assinaturas: a Release está incompleta.');
  }
  return { version, notes: body, pub_date: pubDate, platforms };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const [dir, tag, repo] = process.argv.slice(2);
  if (!dir || !/^v\d+\.\d+\.\d+$/.test(tag ?? '') || !/^[\w.-]+\/[\w.-]+$/.test(repo ?? '')) {
    console.error(
      'Uso: node scripts/updater-json.mjs <pasta com os .sig> <tag> <dono/repositório>',
    );
    process.exit(1);
  }
  const version = tag.slice(1);
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const body = notes(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), version);
  if (!body) {
    console.error(`O CHANGELOG.md não tem notas para a versão ${version}.`);
    process.exit(1);
  }
  const signatures = new Map(
    readdirSync(dir)
      .filter((name) => name.endsWith('.sig'))
      .map((name) => [name.slice(0, -'.sig'.length), readFileSync(join(dir, name), 'utf8')]),
  );
  const manifest = updaterManifest({
    version,
    notes: body,
    pubDate: new Date().toISOString(),
    repo,
    tag,
    signatures,
  });
  console.log(JSON.stringify(manifest, null, 2));
}
