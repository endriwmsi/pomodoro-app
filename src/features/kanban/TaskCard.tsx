import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  CalendarDays,
  GripVertical,
  Pencil,
  Play,
  Timer,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

import { formatDueDate, PRIORITY_LABEL, todayIso, type MoveTarget } from '@/features/kanban/board';
import type { Task, TaskPriority } from '@/lib/commands';

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  low: 'text-priority-low border-priority-low/50 bg-priority-low/10',
  medium: 'text-priority-medium border-priority-medium/50 bg-priority-medium/10',
  high: 'text-priority-high border-priority-high/60 bg-priority-high/10',
};

const ICON_BUTTON =
  'flex size-7 items-center justify-center rounded-md text-ink-muted outline-none transition-colors duration-150 hover:bg-white/10 hover:text-ink focus-visible:ring-2 focus-visible:ring-white/70 disabled:pointer-events-none disabled:opacity-25';

export type StepDirection = 'up' | 'down' | 'left' | 'right';

const STEPS: readonly { direction: StepDirection; icon: LucideIcon; label: string }[] = [
  { direction: 'left', icon: ArrowLeft, label: 'Mover para a coluna anterior' },
  { direction: 'up', icon: ArrowUp, label: 'Mover para cima' },
  { direction: 'down', icon: ArrowDown, label: 'Mover para baixo' },
  { direction: 'right', icon: ArrowRight, label: 'Mover para a próxima coluna' },
];

interface TaskCardProps {
  task: Task;
  /** É a tarefa escolhida no timer. */
  active: boolean;
  /** Para onde cada controle de movimento levaria; `null` se não há para onde ir. */
  steps: Record<StepDirection, MoveTarget | null>;
  onMove: (target: MoveTarget) => void;
  onFocus: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function TaskCard({
  task,
  active,
  steps,
  onMove,
  onFocus,
  onEdit,
  onDelete,
}: TaskCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const done = task.status === 'done';
  const overdue = !done && task.dueDate !== null && task.dueDate < todayIso();

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      aria-label={task.title}
      className={`rounded-xl border bg-panel-strong p-3 ${
        active ? 'border-accent' : 'border-panel-border'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start gap-1.5">
        <button
          type="button"
          ref={setActivatorNodeRef}
          aria-label={`Arrastar ${task.title}`}
          className={`${ICON_BUTTON} -ml-1.5 shrink-0 cursor-grab touch-none active:cursor-grabbing`}
          {...attributes}
          {...listeners}
        >
          <GripVertical size={14} aria-hidden="true" />
        </button>
        <div className="min-w-0 flex-1 pt-1">
          <p
            className={`text-sm leading-snug font-medium break-words ${done ? 'line-through opacity-60' : ''}`}
          >
            {task.title}
          </p>
          {task.description ? (
            <p className="mt-1 line-clamp-2 text-xs break-words text-ink-muted">
              {task.description}
            </p>
          ) : null}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        <span className={`rounded-full border px-2 py-0.5 ${PRIORITY_STYLE[task.priority]}`}>
          <span className="sr-only">Prioridade: </span>
          {PRIORITY_LABEL[task.priority]}
        </span>
        {task.dueDate ? (
          <span className={`flex items-center gap-1 ${overdue ? 'text-accent' : 'text-ink-muted'}`}>
            <CalendarDays size={12} aria-hidden="true" />
            <span className="sr-only">{overdue ? 'Prazo vencido: ' : 'Prazo: '}</span>
            {formatDueDate(task.dueDate)}
          </span>
        ) : null}
        {task.completedPomodoros > 0 || task.estimatedPomodoros !== null ? (
          <span className="flex items-center gap-1 text-ink-muted">
            <Timer size={12} aria-hidden="true" />
            <span className="sr-only">Pomodoros concluídos: </span>
            {task.completedPomodoros}
            {task.estimatedPomodoros !== null ? ` / ${task.estimatedPomodoros}` : ''}
          </span>
        ) : null}
        {active ? <span className="font-medium text-accent">Em foco</span> : null}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <div className="flex">
          {STEPS.map(({ direction, icon: Icon, label }) => {
            const target = steps[direction];
            return (
              <button
                key={direction}
                type="button"
                aria-label={label}
                title={label}
                disabled={!target}
                onClick={() => {
                  if (target) onMove(target);
                }}
                className={ICON_BUTTON}
              >
                <Icon size={14} aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <div className="flex">
          {done ? null : (
            <button
              type="button"
              aria-label="Focar nesta tarefa"
              title="Focar nesta tarefa"
              onClick={onFocus}
              className={`${ICON_BUTTON} text-accent hover:text-accent`}
            >
              <Play size={14} aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            aria-label="Editar"
            title="Editar"
            onClick={onEdit}
            className={ICON_BUTTON}
          >
            <Pencil size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Excluir"
            title="Excluir"
            onClick={onDelete}
            className={ICON_BUTTON}
          >
            <Trash2 size={14} aria-hidden="true" />
          </button>
        </div>
      </div>
    </li>
  );
}
