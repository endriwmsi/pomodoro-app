// Define a versão do projeto em todos os arquivos que a guardam:
// package.json, package-lock.json, src-tauri/Cargo.toml e src-tauri/Cargo.lock.
//
//   npm run release:version -- 0.2.0
//
// Depois: confira o CHANGELOG, faça o commit, crie a tag `v0.2.0` e envie-a —
// o workflow de release cuida do resto (ver docs/RELEASING.md).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('Uso: npm run release:version -- <versão>   (ex.: 0.2.0)');
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Aplica `change` ao texto do arquivo; falha se nada mudar de lugar esperado. */
function rewrite(file, change) {
  const path = join(root, file);
  const before = readFileSync(path, 'utf8');
  const after = change(before);
  if (after === null) {
    console.error(`Não encontrei a versão em ${file}.`);
    process.exit(1);
  }
  writeFileSync(path, after);
  console.log(`${file} → ${version}`);
}

/** Troca a primeira ocorrência de `pattern`, que precisa existir. */
function replaceOnce(pattern, replacement) {
  return (text) => (pattern.test(text) ? text.replace(pattern, replacement) : null);
}

rewrite('package.json', replaceOnce(/("version":\s*")[^"]+(")/, `$1${version}$2`));
// No lock, a versão do projeto aparece no topo e de novo no pacote raiz (`""`).
rewrite('package-lock.json', (text) => {
  const top = /("name":\s*"compasso",\s*"version":\s*")[^"]+(")/g;
  return top.test(text) ? text.replace(top, `$1${version}$2`) : null;
});
rewrite(
  'src-tauri/Cargo.toml',
  replaceOnce(/(\[package\][^[]*?\nversion = ")[^"]+(")/, `$1${version}$2`),
);
rewrite(
  'src-tauri/Cargo.lock',
  replaceOnce(/(name = "compasso"\r?\nversion = ")[^"]+(")/, `$1${version}$2`),
);
