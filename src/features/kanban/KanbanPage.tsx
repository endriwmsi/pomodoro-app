import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus } from 'lucide-react';
import { useState } from 'react';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/ui/PageHeader';
import { Panel } from '@/components/ui/Panel';
import { PanelLabel } from '@/components/ui/PanelLabel';
import {
  columnDropId,
  COLUMNS,
  columnTasks,
  resolveDrop,
  stepMove,
  type MoveTarget,
} from '@/features/kanban/board';
import { TaskCard } from '@/features/kanban/TaskCard';
import { TaskDialog } from '@/features/kanban/TaskDialog';
import type { AppError, Task, TaskStatus } from '@/lib/commands';
import { useTasksStore } from '@/stores/tasks';
import { useTimerStore } from '@/stores/timer';

interface ColumnProps {
  status: TaskStatus;
  label: string;
  index: number;
  tasks: Task[];
  children: React.ReactNode;
}

function Column({ status, label, index, tasks, children }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: columnDropId(status) });

  return (
    <Panel
      aria-label={label}
      className={`flex min-h-48 flex-col px-3 py-3.5 ${isOver ? 'border-accent' : ''}`}
    >
      <div className="flex items-baseline justify-between px-1">
        <PanelLabel as="h2" index={index}>
          {label}
        </PanelLabel>
        <span className="text-xs text-ink-muted" aria-label={`${tasks.length} tarefas`}>
          {tasks.length}
        </span>
      </div>
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <ul ref={setNodeRef} className="mt-3 flex flex-1 flex-col gap-2">
          {children}
          {tasks.length === 0 ? (
            <li className="px-1 py-6 text-center text-xs text-ink-muted">Nenhuma tarefa</li>
          ) : null}
        </ul>
      </SortableContext>
    </Panel>
  );
}

export function KanbanPage() {
  const tasks = useTasksStore((state) => state.tasks);
  const status = useTasksStore((state) => state.status);
  const createTask = useTasksStore((state) => state.create);
  const updateTask = useTasksStore((state) => state.update);
  const removeTask = useTasksStore((state) => state.remove);
  const moveTask = useTasksStore((state) => state.move);
  const activeTaskId = useTimerStore((state) => state.snapshot?.taskId ?? null);
  const focusTask = useTimerStore((state) => state.focusTask);

  /** `{ task: null }` cria; `{ task }` edita; `null` fechado. */
  const [editing, setEditing] = useState<{ task: Task | null } | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [dragging, setDragging] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sensors = useSensors(
    // A distância mínima evita que um clique nos botões vire arraste.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const report = (action: Promise<AppError | null>) => {
    void action.then((failure) => {
      setError(failure ? failure.message : null);
    });
  };

  const move = (task: Task, target: MoveTarget) => {
    report(moveTask(task.id, target.status, target.index));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDragging(null);
    const { active, over } = event;
    if (!over) return;
    const task = tasks.find((item) => item.id === active.id);
    const target = resolveDrop(tasks, Number(active.id), over.id);
    if (task && target) move(task, target);
  };

  const available = status !== 'unavailable';

  return (
    <>
      <div className="flex items-start justify-between">
        <PageHeader title="Kanban" />
        <button
          type="button"
          disabled={!available}
          onClick={() => {
            setEditing({ task: null });
          }}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-ink outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-40 matrix:tracking-widest matrix:uppercase"
        >
          <Plus size={16} aria-hidden="true" />
          Nova tarefa
        </button>
      </div>

      {status === 'unavailable' ? (
        <p className="panel mb-3 px-4 py-3 text-sm">
          Pré-visualização: as tarefas só existem dentro do aplicativo desktop.
        </p>
      ) : null}
      {status === 'error' ? (
        <p role="alert" className="panel mb-3 border-accent px-4 py-3 text-sm">
          Não foi possível carregar as tarefas.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="panel mb-3 border-accent px-4 py-3 text-sm">
          {error}
        </p>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={(event) => {
          setDragging(tasks.find((task) => task.id === event.active.id) ?? null);
        }}
        onDragCancel={() => {
          setDragging(null);
        }}
        onDragEnd={onDragEnd}
      >
        <div className="grid grid-cols-3 items-start gap-3">
          {COLUMNS.map((column, position) => {
            const items = columnTasks(tasks, column.status);
            return (
              <Column
                key={column.status}
                status={column.status}
                label={column.label}
                index={position + 1}
                tasks={items}
              >
                {items.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    active={task.id === activeTaskId}
                    steps={{
                      up: stepMove(tasks, task, 'up'),
                      down: stepMove(tasks, task, 'down'),
                      left: stepMove(tasks, task, 'left'),
                      right: stepMove(tasks, task, 'right'),
                    }}
                    onMove={(target) => {
                      move(task, target);
                    }}
                    onFocus={() => void focusTask(task.id)}
                    onEdit={() => {
                      setEditing({ task });
                    }}
                    onDelete={() => {
                      setDeleting(task);
                    }}
                  />
                ))}
              </Column>
            );
          })}
        </div>

        <DragOverlay>
          {dragging ? (
            <div className="rounded-xl border border-accent bg-popover p-3 text-sm font-medium shadow-xl shadow-black/40">
              {dragging.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {editing ? (
        <TaskDialog
          task={editing.task}
          onClose={() => {
            setEditing(null);
          }}
          onSubmit={(input) =>
            editing.task ? updateTask(editing.task.id, input) : createTask(input)
          }
        />
      ) : null}

      <AlertDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogTitle>Excluir tarefa?</AlertDialogTitle>
          <AlertDialogDescription>
            “{deleting?.title}” será excluída. As sessões de foco já registradas para ela continuam
            nas estatísticas.
          </AlertDialogDescription>
          <div className="flex justify-end gap-2">
            <AlertDialogCancel className="rounded-lg border border-panel-border px-3.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-white/70">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleting) report(removeTask(deleting.id));
              }}
              className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-ink outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Excluir
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
