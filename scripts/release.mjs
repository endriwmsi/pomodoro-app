// Publica uma versão do Compasso com um único comando.
//
//   npm run release -- patch          0.2.0 → 0.2.1
//   npm run release -- minor          0.2.0 → 0.3.0
//   npm run release -- major          0.2.0 → 1.0.0
//   npm run release -- 0.3.0          versão explícita
//
// Opções: --dry-run (só mostra o que faria), --skip-check (pula `npm run check`),
// --no-push (cria o commit e a tag, mas não envia).
//
// O que faz: confere o repositório, roda as verificações, fecha a seção
// "Não lançado" do CHANGELOG, define a versão nos arquivos, cria o commit
// `chore(release): X.Y.Z` e a tag `vX.Y.Z` e envia os dois. O workflow Release
// do GitHub compila, assina e publica. Ver docs/RELEASING.md.

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { promote } from './changelog.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith('--')));
const [target] = args.filter((arg) => !arg.startsWith('--'));
const dryRun = flags.has('--dry-run');

const BRANCH = 'main';
const FILES = [
  'package.json',
  'package-lock.json',
  'src-tauri/Cargo.toml',
  'src-tauri/Cargo.lock',
  'CHANGELOG.md',
];

function fail(message) {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

function step(message) {
  console.log(`\n▸ ${message}`);
}

function git(...gitArgs) {
  return execFileSync('git', gitArgs, { cwd: root, encoding: 'utf8' }).trim();
}

/**
 * Roda um comando mostrando a saída; encerra o script se ele falhar. Só o
 * `npm` precisa de shell no Windows (é um `.cmd`); com shell os argumentos
 * perdem as aspas, o que quebraria a mensagem do commit.
 */
function run(command, commandArgs) {
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32' && command === 'npm',
  });
  if (result.status !== 0) fail(`"${command} ${commandArgs.join(' ')}" falhou.`);
}

function nextVersion(current, kind) {
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  const [major, minor, patch] = current.split('.').map(Number);
  switch (kind) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      return null;
  }
}

function isNewer(candidate, current) {
  const a = candidate.split('.').map(Number);
  const b = current.split('.').map(Number);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

// --- Entrada -----------------------------------------------------------------

const current = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const version = target ? nextVersion(current, target) : null;
if (!version) {
  fail('Uso: npm run release -- <patch | minor | major | X.Y.Z> [--dry-run] [--skip-check]');
}
if (!isNewer(version, current)) {
  fail(`A versão ${version} não é maior que a atual (${current}).`);
}
const tag = `v${version}`;

// --- Repositório -------------------------------------------------------------

step(`Conferindo o repositório para publicar ${tag}`);
if (git('rev-parse', '--abbrev-ref', 'HEAD') !== BRANCH) {
  fail(`Publique a partir da branch "${BRANCH}".`);
}
if (git('status', '--porcelain') !== '') {
  fail('Há alterações não commitadas. Faça o commit (ou guarde-as) antes de publicar.');
}
run('git', ['fetch', '--quiet', 'origin', BRANCH, '--tags']);
if (git('rev-list', '--count', `HEAD..origin/${BRANCH}`) !== '0') {
  fail(`Sua branch está atrás de origin/${BRANCH}. Rode "git pull" antes de publicar.`);
}
if (git('tag', '--list', tag) !== '') {
  fail(`A tag ${tag} já existe. Para refazê-la, apague-a no GitHub e localmente.`);
}

const changelogPath = join(root, 'CHANGELOG.md');
const today = new Date();
const date = [
  today.getFullYear(),
  String(today.getMonth() + 1).padStart(2, '0'),
  String(today.getDate()).padStart(2, '0'),
].join('-');
let changelog;
try {
  changelog = promote(readFileSync(changelogPath, 'utf8'), version, date);
} catch (error) {
  fail(error.message);
}

if (dryRun) {
  console.log(`\n✓ Simulação: ${current} → ${version}, tag ${tag}, data ${date}.`);
  console.log('  Nada foi alterado. Rode sem --dry-run para publicar.');
  process.exit(0);
}

// --- Verificações ------------------------------------------------------------

if (flags.has('--skip-check')) {
  step('Pulando as verificações (--skip-check)');
} else {
  step('Rodando as verificações (npm run check)');
  run('npm', ['run', 'check']);
}

// --- Versão, changelog, commit e tag -------------------------------------------

step(`Definindo a versão ${version}`);
run(process.execPath, ['scripts/bump-version.mjs', version]);
writeFileSync(changelogPath, changelog);

step('Criando o commit e a tag');
run('git', ['add', ...FILES]);
run('git', ['commit', '-m', `chore(release): ${version}`]);
run('git', ['tag', tag]);

if (flags.has('--no-push')) {
  console.log(`\n✓ ${tag} criada localmente. Para publicar: git push origin ${BRANCH} ${tag}`);
  process.exit(0);
}

step('Enviando para o GitHub');
run('git', ['push', 'origin', BRANCH, tag]);

console.log(`
✓ ${tag} enviada. O GitHub está compilando os instaladores (15 a 25 minutos).
  Acompanhe:  https://github.com/endriwmsi/pomodoro-app/actions
  Resultado:  https://github.com/endriwmsi/pomodoro-app/releases/tag/${tag}
  Quem usa o Compasso recebe a atualização na próxima vez que abrir o aplicativo.`);
