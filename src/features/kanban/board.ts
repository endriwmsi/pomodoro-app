import type { Task, TaskPriority, TaskStatus } from '@/lib/commands';

/** Colunas do quadro, na ordem em que aparecem. */
export const COLUMNS: readonly { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: 'A fazer' },
  { status: 'doing', label: 'Em andamento' },
  { status: 'done', label: 'Concluído' },
];

export const PRIORITY_LABEL: Record<TaskPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
};

/** Tarefas de uma coluna, na ordem do quadro. */
export function columnTasks(tasks: readonly Task[], status: TaskStatus): Task[] {
  return tasks.filter((task) => task.status === status).sort((a, b) => a.position - b.position);
}

/** Prefixo dos IDs de área de soltura das colunas (os das tarefas são numéricos). */
const COLUMN_PREFIX = 'column:';

export function columnDropId(status: TaskStatus): string {
  return `${COLUMN_PREFIX}${status}`;
}

export interface MoveTarget {
  status: TaskStatus;
  /** Posição na coluna de destino, contada sem a própria tarefa. */
  index: number;
}

/**
 * Traduz o fim de um arraste em um movimento: `overId` é o ID da tarefa sobre
 * a qual se soltou, ou o de uma coluna (`columnDropId`). Devolve `null` se
 * não há o que mover.
 */
export function resolveDrop(
  tasks: readonly Task[],
  activeId: number,
  overId: number | string,
): MoveTarget | null {
  const active = tasks.find((task) => task.id === activeId);
  if (!active) return null;

  if (typeof overId === 'string') {
    if (!overId.startsWith(COLUMN_PREFIX)) return null;
    const status = COLUMNS.find((column) => columnDropId(column.status) === overId)?.status;
    if (!status) return null;
    const others = columnTasks(tasks, status).filter((task) => task.id !== activeId);
    // Soltar na própria coluna, fora de qualquer cartão, não muda nada.
    if (status === active.status) return null;
    return { status, index: others.length };
  }

  if (overId === activeId) return null;
  const over = tasks.find((task) => task.id === overId);
  if (!over) return null;
  // Ocupa o lugar do cartão sobre o qual foi solto — tanto ao reordenar na
  // mesma coluna quanto ao chegar de outra.
  return { status: over.status, index: columnTasks(tasks, over.status).indexOf(over) };
}

/**
 * Movimento de um passo pelos controles do cartão (alternativa ao arraste):
 * para cima/baixo na coluna, ou para o fim da coluna vizinha.
 */
export function stepMove(
  tasks: readonly Task[],
  task: Task,
  direction: 'up' | 'down' | 'left' | 'right',
): MoveTarget | null {
  const column = columnTasks(tasks, task.status);
  const index = column.findIndex((item) => item.id === task.id);

  if (direction === 'up') return index > 0 ? { status: task.status, index: index - 1 } : null;
  if (direction === 'down') {
    return index < column.length - 1 ? { status: task.status, index: index + 1 } : null;
  }

  const columnIndex = COLUMNS.findIndex((item) => item.status === task.status);
  const neighbor = COLUMNS[columnIndex + (direction === 'left' ? -1 : 1)];
  if (!neighbor) return null;
  return { status: neighbor.status, index: columnTasks(tasks, neighbor.status).length };
}

const dueFormatter = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });

/** `2026-10-13` → `13 de out.`; a data é local, sem conversão de fuso. */
export function formatDueDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  if (!year || !month || !day) return date;
  return dueFormatter.format(new Date(year, month - 1, day));
}

/** Data local de hoje como `AAAA-MM-DD`, para comparar com prazos. */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
