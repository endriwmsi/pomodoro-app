import { describe, expect, it } from 'vitest';

import {
  columnDropId,
  columnTasks,
  formatDueDate,
  resolveDrop,
  stepMove,
  todayIso,
} from '@/features/kanban/board';
import type { Task, TaskStatus } from '@/lib/commands';

let nextId = 1;

function task(title: string, status: TaskStatus, position: number): Task {
  return {
    id: nextId++,
    title,
    description: '',
    priority: 'medium',
    status,
    position,
    dueDate: null,
    estimatedPomodoros: null,
    createdAtMs: 0,
    updatedAtMs: 0,
    completedAtMs: status === 'done' ? 1 : null,
    completedPomodoros: 0,
  };
}

/** Quadro: A, B, C em "A fazer"; D, E em "Em andamento"; "Concluído" vazio. */
function board() {
  const a = task('A', 'todo', 0);
  const b = task('B', 'todo', 1);
  const c = task('C', 'todo', 2);
  const d = task('D', 'doing', 0);
  const e = task('E', 'doing', 1);
  // Fora de ordem de propósito: a ordem vem de `position`, não do array.
  return { tasks: [c, e, a, d, b], a, b, c, d, e };
}

describe('columnTasks', () => {
  it('devolve as tarefas da coluna ordenadas pela posição', () => {
    const { tasks } = board();

    expect(columnTasks(tasks, 'todo').map((t) => t.title)).toEqual(['A', 'B', 'C']);
    expect(columnTasks(tasks, 'doing').map((t) => t.title)).toEqual(['D', 'E']);
    expect(columnTasks(tasks, 'done')).toEqual([]);
  });
});

describe('resolveDrop', () => {
  it('reordena para baixo na mesma coluna, ocupando o lugar do cartão de destino', () => {
    const { tasks, a, c } = board();

    // [A, B, C] → [B, C, A]
    expect(resolveDrop(tasks, a.id, c.id)).toEqual({ status: 'todo', index: 2 });
  });

  it('reordena para cima na mesma coluna', () => {
    const { tasks, a, c } = board();

    // [A, B, C] → [C, A, B]
    expect(resolveDrop(tasks, c.id, a.id)).toEqual({ status: 'todo', index: 0 });
  });

  it('ao soltar sobre um cartão de outra coluna, entra antes dele', () => {
    const { tasks, a, e } = board();

    expect(resolveDrop(tasks, a.id, e.id)).toEqual({ status: 'doing', index: 1 });
  });

  it('ao soltar em uma coluna, vai para o fim dela', () => {
    const { tasks, a } = board();

    expect(resolveDrop(tasks, a.id, columnDropId('doing'))).toEqual({ status: 'doing', index: 2 });
    expect(resolveDrop(tasks, a.id, columnDropId('done'))).toEqual({ status: 'done', index: 0 });
  });

  it('não há movimento ao soltar sobre si mesmo, na própria coluna ou em algo desconhecido', () => {
    const { tasks, a } = board();

    expect(resolveDrop(tasks, a.id, a.id)).toBeNull();
    expect(resolveDrop(tasks, a.id, columnDropId('todo'))).toBeNull();
    expect(resolveDrop(tasks, a.id, 'outra-coisa')).toBeNull();
    expect(resolveDrop(tasks, a.id, 9_999)).toBeNull();
    expect(resolveDrop(tasks, 9_999, a.id)).toBeNull();
  });
});

describe('stepMove', () => {
  it('sobe e desce um passo dentro da coluna', () => {
    const { tasks, a, b, c } = board();

    expect(stepMove(tasks, b, 'up')).toEqual({ status: 'todo', index: 0 });
    expect(stepMove(tasks, b, 'down')).toEqual({ status: 'todo', index: 2 });
    expect(stepMove(tasks, a, 'up')).toBeNull();
    expect(stepMove(tasks, c, 'down')).toBeNull();
  });

  it('vai para o fim da coluna vizinha', () => {
    const { tasks, a, d } = board();

    expect(stepMove(tasks, a, 'right')).toEqual({ status: 'doing', index: 2 });
    expect(stepMove(tasks, d, 'left')).toEqual({ status: 'todo', index: 3 });
    expect(stepMove(tasks, d, 'right')).toEqual({ status: 'done', index: 0 });
  });

  it('não sai do quadro pelas pontas', () => {
    const { tasks, a } = board();
    const done = task('Z', 'done', 0);

    expect(stepMove(tasks, a, 'left')).toBeNull();
    expect(stepMove([...tasks, done], done, 'right')).toBeNull();
  });
});

describe('datas', () => {
  it('formata o prazo como data local, sem deslocar o dia pelo fuso', () => {
    expect(formatDueDate('2026-10-13')).toMatch(/^13 de out/);
    expect(formatDueDate('2026-01-01')).toMatch(/^1 de jan/);
    expect(formatDueDate('inválida')).toBe('inválida');
  });

  it('todayIso usa o calendário local', () => {
    expect(todayIso(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(todayIso(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });
});
