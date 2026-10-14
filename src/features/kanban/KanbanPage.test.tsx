import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { KanbanPage } from '@/features/kanban/KanbanPage';
import type { Task, TaskInput, TaskStatus, TimerSnapshot } from '@/lib/commands';
import { useTasksStore } from '@/stores/tasks';
import { useTimerStore } from '@/stores/timer';

const backend = vi.hoisted(() => ({
  tasksList: vi.fn<() => Promise<Task[]>>(),
  taskCreate: vi.fn<(input: TaskInput) => Promise<Task[]>>(),
  taskUpdate: vi.fn<(id: number, input: TaskInput) => Promise<Task[]>>(),
  taskDelete: vi.fn<(id: number) => Promise<Task[]>>(),
  taskMove: vi.fn<(id: number, status: TaskStatus, index: number) => Promise<Task[]>>(),
  timerFocusTask: vi.fn<(id: number) => Promise<TimerSnapshot>>(),
  emitChange: undefined as (() => void) | undefined,
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@/lib/commands', () => ({
  tasksList: backend.tasksList,
  taskCreate: backend.taskCreate,
  taskUpdate: backend.taskUpdate,
  taskDelete: backend.taskDelete,
  taskMove: backend.taskMove,
  timerFocusTask: backend.timerFocusTask,
}));
vi.mock('@/lib/events', () => ({
  subscribeTasksChanged: (handler: () => void) => {
    backend.emitChange = handler;
    return Promise.resolve(() => undefined);
  },
}));

function task(id: number, title: string, status: TaskStatus, position: number): Task {
  return {
    id,
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

const BOARD: Task[] = [
  task(1, 'Escrever relatório', 'todo', 0),
  task(2, 'Revisar contrato', 'todo', 1),
  {
    ...task(3, 'Preparar reunião', 'doing', 0),
    priority: 'high',
    estimatedPomodoros: 4,
    completedPomodoros: 1,
  },
  task(4, 'Enviar proposta', 'done', 0),
];

const FOCUSING: TimerSnapshot = {
  phase: 'focus',
  status: 'running',
  remainingMs: 25 * 60_000,
  plannedMs: 25 * 60_000,
  cyclePosition: 0,
  cyclesBeforeLongBreak: 4,
  pauseReason: null,
  taskId: 1,
  routineId: null,
  routineRemainingMs: null,
  short: false,
};

async function renderBoard(tasks: Task[] = BOARD) {
  backend.tasksList.mockResolvedValue(tasks);
  render(<KanbanPage />);
  await act(async () => {
    useTasksStore.getState().connect();
    await Promise.resolve();
    await Promise.resolve();
  });
}

function column(name: string) {
  return screen.getByRole('region', { name });
}

function card(title: string) {
  return screen.getByRole('listitem', { name: title });
}

describe('KanbanPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    useTasksStore.setState(useTasksStore.getInitialState(), true);
    useTimerStore.setState(useTimerStore.getInitialState(), true);
  });

  it('distribui as tarefas pelas três colunas, na ordem do quadro', async () => {
    await renderBoard();

    const titles = (name: string) =>
      within(column(name))
        .getAllByRole('listitem')
        .map((item) => item.getAttribute('aria-label'));
    expect(titles('A fazer')).toEqual(['Escrever relatório', 'Revisar contrato']);
    expect(titles('Em andamento')).toEqual(['Preparar reunião']);
    expect(titles('Concluído')).toEqual(['Enviar proposta']);
    expect(within(column('A fazer')).getByLabelText('2 tarefas')).toBeInTheDocument();
  });

  it('mostra prioridade e pomodoros concluídos sobre a estimativa', async () => {
    await renderBoard();

    const meeting = card('Preparar reunião');
    expect(within(meeting).getByText('Alta')).toBeVisible();
    expect(meeting).toHaveTextContent('1 / 4');
  });

  it('mostra o estado vazio de uma coluna', async () => {
    await renderBoard([task(1, 'Única', 'todo', 0)]);

    expect(within(column('Concluído')).getByText('Nenhuma tarefa')).toBeVisible();
  });

  it('cria uma tarefa pelo diálogo', async () => {
    const user = userEvent.setup();
    backend.taskCreate.mockResolvedValue([...BOARD, task(5, 'Nova', 'todo', 2)]);
    await renderBoard();

    await user.click(screen.getByRole('button', { name: 'Nova tarefa' }));
    const dialog = screen.getByRole('dialog', { name: 'Nova tarefa' });
    await user.type(within(dialog).getByLabelText('Título'), '  Nova  ');
    await user.type(within(dialog).getByLabelText(/Descrição/), 'Detalhes');
    await user.type(within(dialog).getByLabelText('Pomodoros'), '3');
    await user.click(within(dialog).getByRole('button', { name: 'Criar tarefa' }));

    expect(backend.taskCreate).toHaveBeenCalledExactlyOnceWith({
      title: 'Nova',
      description: 'Detalhes',
      priority: 'medium',
      dueDate: null,
      estimatedPomodoros: 3,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(card('Nova')).toBeInTheDocument();
  });

  it('exige título e não chama o backend sem ele', async () => {
    const user = userEvent.setup();
    await renderBoard();

    await user.click(screen.getByRole('button', { name: 'Nova tarefa' }));
    await user.click(screen.getByRole('button', { name: 'Criar tarefa' }));

    expect(screen.getByText('Informe um título.')).toBeVisible();
    expect(screen.getByLabelText('Título')).toBeInvalid();
    expect(backend.taskCreate).not.toHaveBeenCalled();
  });

  it('mostra no campo o erro de validação devolvido pelo backend', async () => {
    const user = userEvent.setup();
    backend.taskCreate.mockRejectedValue({
      kind: 'validation',
      field: 'title',
      message: 'O título pode ter até 200 caracteres.',
    });
    await renderBoard();

    await user.click(screen.getByRole('button', { name: 'Nova tarefa' }));
    await user.type(screen.getByLabelText('Título'), 'Qualquer');
    await user.click(screen.getByRole('button', { name: 'Criar tarefa' }));

    expect(await screen.findByText('O título pode ter até 200 caracteres.')).toBeVisible();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('edita uma tarefa partindo dos dados atuais', async () => {
    const user = userEvent.setup();
    backend.taskUpdate.mockResolvedValue(BOARD);
    await renderBoard();

    await user.click(within(card('Preparar reunião')).getByRole('button', { name: 'Editar' }));
    const title = screen.getByLabelText('Título');
    expect(title).toHaveValue('Preparar reunião');
    expect(screen.getByLabelText('Pomodoros')).toHaveValue(4);
    await user.clear(title);
    await user.type(title, 'Preparar pauta');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(backend.taskUpdate).toHaveBeenCalledExactlyOnceWith(3, {
      title: 'Preparar pauta',
      description: '',
      priority: 'high',
      dueDate: null,
      estimatedPomodoros: 4,
    });
  });

  it('move com os controles do cartão, sem arrastar', async () => {
    const user = userEvent.setup();
    backend.taskMove.mockResolvedValue(BOARD);
    await renderBoard();
    const report = card('Escrever relatório');

    await user.click(within(report).getByRole('button', { name: 'Mover para baixo' }));
    await user.click(within(report).getByRole('button', { name: 'Mover para a próxima coluna' }));

    expect(backend.taskMove).toHaveBeenNthCalledWith(1, 1, 'todo', 1);
    expect(backend.taskMove).toHaveBeenNthCalledWith(2, 1, 'doing', 1);
    expect(within(report).getByRole('button', { name: 'Mover para cima' })).toBeDisabled();
    expect(
      within(report).getByRole('button', { name: 'Mover para a coluna anterior' }),
    ).toBeDisabled();
  });

  it('só exclui depois da confirmação', async () => {
    const user = userEvent.setup();
    backend.taskDelete.mockResolvedValue(BOARD.filter((item) => item.id !== 2));
    await renderBoard();

    await user.click(within(card('Revisar contrato')).getByRole('button', { name: 'Excluir' }));
    const confirmation = screen.getByRole('alertdialog', { name: 'Excluir tarefa?' });
    expect(confirmation).toHaveTextContent('Revisar contrato');
    expect(backend.taskDelete).not.toHaveBeenCalled();

    await user.click(within(confirmation).getByRole('button', { name: 'Excluir' }));

    expect(backend.taskDelete).toHaveBeenCalledExactlyOnceWith(2);
    expect(screen.queryByRole('listitem', { name: 'Revisar contrato' })).not.toBeInTheDocument();
  });

  it('cancelar a confirmação mantém a tarefa', async () => {
    const user = userEvent.setup();
    await renderBoard();

    await user.click(within(card('Revisar contrato')).getByRole('button', { name: 'Excluir' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(backend.taskDelete).not.toHaveBeenCalled();
    expect(card('Revisar contrato')).toBeInTheDocument();
  });

  it('foca em uma tarefa e a destaca; tarefas concluídas não têm o botão', async () => {
    const user = userEvent.setup();
    backend.timerFocusTask.mockResolvedValue(FOCUSING);
    await renderBoard();

    await user.click(
      within(card('Escrever relatório')).getByRole('button', { name: 'Focar nesta tarefa' }),
    );

    expect(backend.timerFocusTask).toHaveBeenCalledExactlyOnceWith(1);
    expect(within(card('Escrever relatório')).getByText('Em foco')).toBeVisible();
    expect(
      within(card('Enviar proposta')).queryByRole('button', { name: 'Focar nesta tarefa' }),
    ).not.toBeInTheDocument();
  });

  it('mostra o erro quando uma operação falha e mantém o quadro', async () => {
    const user = userEvent.setup();
    backend.taskMove.mockRejectedValue({
      kind: 'notFound',
      message: 'A tarefa 1 não existe mais.',
    });
    await renderBoard();

    await user.click(
      within(card('Escrever relatório')).getByRole('button', { name: 'Mover para baixo' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('A tarefa 1 não existe mais.');
    expect(card('Escrever relatório')).toBeInTheDocument();
  });

  it('recarrega o quadro quando outra janela o altera', async () => {
    await renderBoard();
    backend.tasksList.mockResolvedValue([task(9, 'Vinda do notch', 'doing', 0)]);

    await act(async () => {
      backend.emitChange?.();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(card('Vinda do notch')).toBeInTheDocument();
    expect(screen.queryByRole('listitem', { name: 'Escrever relatório' })).not.toBeInTheDocument();
  });
});
