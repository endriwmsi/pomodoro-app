// Cria um banco do Compasso com dados de exemplo — várias semanas de
// pomodoros, tarefas nas três colunas, rotinas e expediente —, para
// demonstrações e para as capturas de tela do README e do instalador.
//
//   node scripts/demo-data.mjs <pasta> [--template glass|matrix|signal|relief]
//
// Depois abra o aplicativo apontando para a pasta (PowerShell):
//
//   $env:COMPASSO_DATA_DIR = "<pasta>"; .\src-tauri\target\release\compasso.exe
//
// Nada disto toca nos dados reais (%APPDATA%\com.endriwmsi.compasso): o banco
// é criado do zero, na pasta indicada, a partir das migrations do projeto.
// Usa o SQLite embutido no Node 22.5+ (`node:sqlite`).

import { mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const TEMPLATES = ['glass', 'matrix', 'signal', 'relief'];
const MINUTE = 60_000;
const FOCUS_MS = 25 * MINUTE;
/** Dias de histórico, contando hoje. */
const HISTORY_DAYS = 42;

const args = process.argv.slice(2);
const folder = args.find((arg) => !arg.startsWith('--'));
const templateFlag = args.indexOf('--template');
const template = templateFlag >= 0 ? args[templateFlag + 1] : 'glass';
if (!folder || !TEMPLATES.includes(template)) {
  console.error(`Uso: node scripts/demo-data.mjs <pasta> [--template ${TEMPLATES.join('|')}]`);
  process.exit(1);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const migrations = join(root, 'src-tauri', 'migrations');
const dataDir = resolve(folder);
mkdirSync(dataDir, { recursive: true });
for (const suffix of ['', '-wal', '-shm']) {
  rmSync(join(dataDir, `compasso.db${suffix}`), { force: true });
}

const db = new DatabaseSync(join(dataDir, 'compasso.db'));
db.exec('PRAGMA foreign_keys = ON');
const files = readdirSync(migrations)
  .filter((file) => file.endsWith('.sql'))
  .sort();
for (const file of files) {
  db.exec(readFileSync(join(migrations, file), 'utf8'));
}
// O aplicativo confere a versão do esquema ao abrir.
db.exec(`PRAGMA user_version = ${String(files.length)}`);

// --- Tempo: tudo relativo a hoje, no fuso local ---------------------------------

const now = new Date();
/** Meia-noite local de `daysAgo` dias atrás. */
function day(daysAgo) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysAgo);
}
function at(daysAgo, hours, minutes = 0) {
  const date = day(daysAgo);
  date.setHours(hours, minutes, 0, 0);
  return date.getTime();
}
/** Data local como `AAAA-MM-DD`, o formato dos prazos. */
function isoDate(daysFromNow) {
  const date = day(-daysFromNow);
  const pad = (value) => String(value).padStart(2, '0');
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Sorteio determinístico: o mesmo banco a cada execução (fora as datas). */
let seed = 20261013;
function random() {
  seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296;
  return seed / 4_294_967_296;
}

// --- Configurações ------------------------------------------------------------

const settings = {
  appearance: { template, background: { kind: 'default' } },
  timer: {
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    cyclesBeforeLongBreak: 4,
    autoStartBreaks: true,
    autoStartFocus: false,
  },
  notch: { enabled: true, position: 'top', theme: 'dark' },
  alerts: { soundEnabled: false, notificationsEnabled: false },
  goals: { dailyPomodoros: 8 },
  // Capitais, não a localização: as capturas não revelam onde foram feitas.
  weather: { enabled: true, useLocation: false },
  general: { launchAtLogin: false },
  workday: { enabled: true, startMinute: 9 * 60, endMinute: 18 * 60 },
};
const saveSetting = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(settings)) {
  saveSetting.run(key, JSON.stringify(value));
}

// --- Rotinas --------------------------------------------------------------------

const EVERY_DAY = 127;
const WORKING_DAYS = 31;
const saveRoutine = db.prepare(
  `INSERT INTO routines (name, start_minute, duration_minutes, weekdays, enabled, created_at_ms)
   VALUES (?, ?, ?, ?, 1, ?)`,
);
for (const [name, start, duration, weekdays] of [
  ['Hora do café', 10 * 60 + 15, 15, EVERY_DAY],
  ['Almoço', 12 * 60, 60, WORKING_DAYS],
  ['Lanche da tarde', 15 * 60 + 30, 15, EVERY_DAY],
]) {
  saveRoutine.run(name, start, duration, weekdays, at(HISTORY_DAYS, 9));
}

// --- Tarefas --------------------------------------------------------------------

const saveTask = db.prepare(
  `INSERT INTO tasks (title, description, priority, status, position, due_date,
                      estimated_pomodoros, created_at_ms, updated_at_ms, completed_at_ms)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const positions = { todo: 0, doing: 0, done: 0 };
/** Quantos pomodoros cada tarefa trabalhada ainda pode receber (para não passar da estimativa). */
const budget = new Map();
/** `due`: dias a partir de hoje; `doneAgo`: há quantos dias foi concluída. */
function task(
  status,
  title,
  priority,
  { description = '', due = null, estimate = null, doneAgo = null } = {},
) {
  const created = at(doneAgo === null ? 9 : doneAgo + 6, 9, 30);
  const completed = doneAgo === null ? null : at(doneAgo, 16, 40);
  const { lastInsertRowid } = saveTask.run(
    title,
    description,
    priority,
    status,
    positions[status]++,
    due === null ? null : isoDate(due),
    estimate,
    created,
    completed ?? created,
    completed,
  );
  const id = Number(lastInsertRowid);
  // Concluídas gastaram a estimativa; as em andamento ainda têm um pouco pela frente.
  if (status === 'done') budget.set(id, estimate ?? 1);
  if (status === 'doing') budget.set(id, Math.max((estimate ?? 3) - 2, 1));
  return id;
}

/** Sorteia uma tarefa que ainda comporta um pomodoro; `null` quando todas estão completas. */
function pickTask() {
  const open = [...budget.entries()].filter(([, left]) => left > 0);
  if (open.length === 0) return null;
  const [id, left] = open[Math.floor(random() * open.length)];
  budget.set(id, left - 1);
  return id;
}

const doing = [
  task('doing', 'Escrever a proposta do projeto Atlas', 'high', {
    description: 'Escopo, prazos e orçamento para a reunião de quinta.',
    due: 2,
    estimate: 6,
  }),
  task('doing', 'Revisar o capítulo 3 da monografia', 'medium', { due: 5, estimate: 4 }),
];
task('todo', 'Preparar os slides da apresentação', 'high', { due: 3, estimate: 3 });
task('todo', 'Responder os e-mails pendentes', 'low', { estimate: 1 });
task('todo', 'Estudar para a prova de estatística', 'medium', {
  description: 'Capítulos 4 a 6 e a lista de exercícios.',
  due: 9,
  estimate: 8,
});
task('todo', 'Organizar as referências bibliográficas', 'low', { due: 12, estimate: 2 });
const done = [
  task('done', 'Fechar o relatório mensal', 'high', { estimate: 5, doneAgo: 0 }),
  task('done', 'Planejar a semana', 'low', { estimate: 1, doneAgo: 1 }),
  task('done', 'Corrigir os testes do módulo de pagamentos', 'medium', { estimate: 4, doneAgo: 2 }),
  task('done', 'Entrevistar os três candidatos', 'medium', { estimate: 3, doneAgo: 6 }),
  task('done', 'Atualizar a documentação da API', 'low', { estimate: 3, doneAgo: 9 }),
  task('done', 'Migrar o banco de testes', 'high', { estimate: 6, doneAgo: 15 }),
];

// --- Sessões de foco ------------------------------------------------------------

const saveSession = db.prepare(
  `INSERT INTO pomodoro_sessions (kind, planned_ms, elapsed_ms, started_at_ms, updated_at_ms,
                                  ended_at_ms, status, task_id, short)
   VALUES ('focus', ?, ?, ?, ?, ?, ?, ?, 0)`,
);
let completedTotal = 0;
for (let daysAgo = HISTORY_DAYS - 1; daysAgo >= 0; daysAgo--) {
  const weekday = day(daysAgo).getDay();
  const weekend = weekday === 0 || weekday === 6;
  // Dias úteis: de 4 a 9 pomodoros, com um ou outro dia fraco; fim de semana: até 2.
  let count = weekend ? Math.floor(random() * 3) : 4 + Math.floor(random() * 6);
  if (!weekend && random() < 0.12) count = Math.floor(random() * 3);
  // Hoje o dia ainda está em andamento.
  if (daysAgo === 0) count = 5;

  // Um foco a cada 30 minutos a partir das 9h, pulando o almoço.
  let slot = at(daysAgo, 9);
  for (let index = 0; index < count; index++) {
    if (new Date(slot).getHours() === 12) slot += 60 * MINUTE;
    // Só o que já aconteceu: nada de sessões no futuro.
    if (slot + FOCUS_MS > now.getTime()) break;
    const interrupted = daysAgo > 0 && random() < 0.07;
    // Metade dos focos é dedicada a uma tarefa; os interrompidos não gastam a estimativa.
    const taskId = !interrupted && random() < 0.5 ? pickTask() : null;
    const elapsed = interrupted ? Math.round(FOCUS_MS * (0.3 + random() * 0.4)) : FOCUS_MS;
    const ended = slot + elapsed;
    saveSession.run(
      FOCUS_MS,
      elapsed,
      slot,
      ended,
      ended,
      interrupted ? 'skipped' : 'completed',
      taskId,
    );
    if (!interrupted) completedTotal++;
    slot += 30 * MINUTE;
  }
}

// O timer aguarda no terceiro foco do ciclo, dedicado à primeira tarefa em andamento.
db.prepare(
  `INSERT INTO timer_state (id, phase, cycle_position, active_task_id) VALUES (1, 'focus', 2, ?)`,
).run(doing[0]);

db.close();
console.log(
  `Banco de exemplo criado em ${join(dataDir, 'compasso.db')} ` +
    `(template ${template}, ${String(completedTotal)} pomodoros em ${String(HISTORY_DAYS)} dias).`,
);
