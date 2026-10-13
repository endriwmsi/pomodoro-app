import { useId, useState, type SyntheticEvent } from 'react';

import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { NumberInput } from '@/components/ui/NumberInput';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PRIORITY_LABEL } from '@/features/kanban/board';
import type { AppError, Task, TaskInput, TaskPriority } from '@/lib/commands';

/** Espelham os limites de `src-tauri/src/tasks/mod.rs`; o backend revalida. */
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 4000;
const ESTIMATE_MAX = 99;

const PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high'];

function isPriority(value: string): value is TaskPriority {
  return (PRIORITIES as readonly string[]).includes(value);
}

interface Draft {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string;
  estimate: string;
}

function toDraft(task: Task | null): Draft {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    priority: task?.priority ?? 'medium',
    dueDate: task?.dueDate ?? '',
    estimate: task?.estimatedPomodoros?.toString() ?? '',
  };
}

type FieldErrors = Partial<
  Record<'title' | 'description' | 'dueDate' | 'estimatedPomodoros', string>
>;

function parseDraft(draft: Draft): { input: TaskInput } | { errors: FieldErrors } {
  const errors: FieldErrors = {};
  const title = draft.title.trim();
  if (!title) errors.title = 'Informe um título.';

  let estimatedPomodoros: number | null = null;
  const estimate = draft.estimate.trim();
  if (estimate) {
    const value = Number(estimate);
    if (!/^\d+$/.test(estimate) || value < 1 || value > ESTIMATE_MAX) {
      errors.estimatedPomodoros = `Use um número entre 1 e ${ESTIMATE_MAX}.`;
    } else {
      estimatedPomodoros = value;
    }
  }

  if (Object.keys(errors).length > 0) return { errors };
  return {
    input: {
      title,
      description: draft.description.trim(),
      priority: draft.priority,
      dueDate: draft.dueDate || null,
      estimatedPomodoros,
    },
  };
}

const FIELD =
  'w-full rounded-lg border bg-panel-strong px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-white/70';

interface TaskDialogProps {
  /** Tarefa em edição, ou `null` para criar uma nova. */
  task: Task | null;
  onClose: () => void;
  /** Persiste a tarefa. Devolve `null` em caso de sucesso ou o erro ocorrido. */
  onSubmit: (input: TaskInput) => Promise<AppError | null>;
}

/** Formulário de criação e edição. Monte-o apenas enquanto estiver aberto. */
export function TaskDialog({ task, onClose, onSubmit }: TaskDialogProps) {
  const ids = useId();
  const [draft, setDraft] = useState<Draft>(() => toDraft(task));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const change = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    const parsed = parseDraft(draft);
    if ('errors' in parsed) {
      setErrors(parsed.errors);
      return;
    }
    setErrors({});
    setFailure(null);
    setSaving(true);
    void onSubmit(parsed.input).then((error) => {
      setSaving(false);
      if (!error) {
        onClose();
      } else if (error.kind === 'validation' && error.field in toFieldKeys) {
        setErrors({ [error.field]: error.message });
      } else {
        setFailure(error.message);
      }
    });
  };

  const border = (field: keyof FieldErrors) =>
    errors[field] ? 'border-accent' : 'border-panel-border';

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogTitle>{task ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
        <DialogDescription className="sr-only">
          {task ? 'Altere os dados da tarefa.' : 'Preencha os dados da nova tarefa.'}
        </DialogDescription>

        <form onSubmit={submit} noValidate className="grid gap-4">
          <div>
            <label htmlFor={`${ids}-title`} className="mb-1.5 block text-sm">
              Título
            </label>
            <input
              id={`${ids}-title`}
              value={draft.title}
              maxLength={TITLE_MAX}
              autoFocus
              onChange={(event) => {
                change('title', event.target.value);
              }}
              aria-invalid={errors.title ? true : undefined}
              aria-describedby={errors.title ? `${ids}-title-error` : undefined}
              className={`${FIELD} ${border('title')}`}
            />
            {errors.title ? (
              <p id={`${ids}-title-error`} className="mt-1 text-xs text-accent">
                {errors.title}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor={`${ids}-description`} className="mb-1.5 block text-sm">
              Descrição <span className="text-ink-muted">(opcional)</span>
            </label>
            <textarea
              id={`${ids}-description`}
              value={draft.description}
              maxLength={DESCRIPTION_MAX}
              rows={3}
              onChange={(event) => {
                change('description', event.target.value);
              }}
              className={`${FIELD} resize-none ${border('description')}`}
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label htmlFor={`${ids}-priority`} className="mb-1.5 block text-sm">
                Prioridade
              </label>
              <Select
                value={draft.priority}
                onValueChange={(value) => {
                  if (isPriority(value)) change('priority', value);
                }}
              >
                <SelectTrigger id={`${ids}-priority`} className="w-full min-w-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((priority) => (
                    <SelectItem key={priority} value={priority}>
                      {PRIORITY_LABEL[priority]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label htmlFor={`${ids}-due`} className="mb-1.5 block text-sm">
                Prazo
              </label>
              <input
                id={`${ids}-due`}
                type="date"
                value={draft.dueDate}
                onChange={(event) => {
                  change('dueDate', event.target.value);
                }}
                aria-invalid={errors.dueDate ? true : undefined}
                className={`${FIELD} scheme-dark ${border('dueDate')}`}
              />
            </div>

            <div>
              <label htmlFor={`${ids}-estimate`} className="mb-1.5 block text-sm">
                Pomodoros
              </label>
              <NumberInput
                id={`${ids}-estimate`}
                value={draft.estimate}
                onValueChange={(value) => {
                  change('estimate', value);
                }}
                min={1}
                max={ESTIMATE_MAX}
                placeholder="—"
                invalid={errors.estimatedPomodoros !== undefined}
                aria-describedby={errors.estimatedPomodoros ? `${ids}-estimate-error` : undefined}
              />
            </div>
          </div>
          {errors.dueDate ? <p className="-mt-2 text-xs text-accent">{errors.dueDate}</p> : null}
          {errors.estimatedPomodoros ? (
            <p id={`${ids}-estimate-error`} className="-mt-2 text-xs text-accent">
              {errors.estimatedPomodoros}
            </p>
          ) : null}

          {failure ? (
            <p role="alert" className="text-sm text-accent">
              Não foi possível salvar: {failure}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-panel-border px-3.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-ink outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-40"
            >
              {task ? 'Salvar' : 'Criar tarefa'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Campos que o backend pode apontar em um erro de validação. */
const toFieldKeys: Record<keyof FieldErrors, true> = {
  title: true,
  description: true,
  dueDate: true,
  estimatedPomodoros: true,
};
