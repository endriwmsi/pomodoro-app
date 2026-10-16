// Operações sobre o CHANGELOG.md usadas pelo processo de release.
//
//   node scripts/changelog.mjs notes 0.3.0   → imprime as notas da versão 0.3.0
//
// O workflow Release usa o comando acima para preencher o texto da Release (que
// o atualizador também mostra); `scripts/release.mjs` usa `promote`.

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const UNRELEASED = '## [Não lançado]';

/** Posição do título `## [...]` que começa a seção, ou -1. */
function headingIndex(text, heading) {
  const match = new RegExp(`^${escape(heading)}.*$`, 'm').exec(text);
  return match ? match.index : -1;
}

function escape(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Corpo da seção que começa em `heading`, sem o título, aparado. */
function sectionBody(text, heading) {
  const start = headingIndex(text, heading);
  if (start === -1) return null;
  const afterTitle = text.indexOf('\n', start);
  if (afterTitle === -1) return '';
  const next = text.slice(afterTitle + 1).search(/^## \[/m);
  const end = next === -1 ? text.length : afterTitle + 1 + next;
  return text.slice(afterTitle + 1, end).trim();
}

/** O que está em "Não lançado"; `null` se a seção não existir. */
export function unreleased(text) {
  return sectionBody(text, UNRELEASED);
}

/** As notas de uma versão já fechada; `null` se ela não existir. */
export function notes(text, version) {
  return sectionBody(text, `## [${version}]`);
}

/**
 * Fecha "Não lançado" como a versão `version`, na data `date` (AAAA-MM-DD), e
 * deixa uma seção "Não lançado" vazia no topo.
 */
export function promote(text, version, date) {
  const body = unreleased(text);
  if (body === null) throw new Error(`Não encontrei a seção "${UNRELEASED}" no CHANGELOG.md.`);
  if (body === '') {
    throw new Error(
      `A seção "${UNRELEASED}" do CHANGELOG.md está vazia. Descreva o que mudou antes de publicar.`,
    );
  }
  const start = headingIndex(text, UNRELEASED);
  const afterTitle = text.indexOf('\n', start);
  const next = text.slice(afterTitle + 1).search(/^## \[/m);
  const rest = next === -1 ? '' : text.slice(afterTitle + 1 + next);
  const head = text.slice(0, start);
  return `${head}${UNRELEASED}\n\n## [${version}] — ${date}\n\n${body}\n\n${rest}`;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  const [command, version] = process.argv.slice(2);
  if (command !== 'notes' || !/^\d+\.\d+\.\d+$/.test(version ?? '')) {
    console.error('Uso: node scripts/changelog.mjs notes <versão>   (ex.: 0.3.0)');
    process.exit(1);
  }
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const found = notes(readFileSync(join(root, 'CHANGELOG.md'), 'utf8'), version);
  if (found === null || found === '') {
    console.error(`O CHANGELOG.md não tem notas para a versão ${version}.`);
    process.exit(1);
  }
  console.log(found);
}
