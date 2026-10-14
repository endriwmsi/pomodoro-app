import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RoutinesPage } from '@/features/routines/RoutinesPage';
import {
  describeWeekdays,
  formatMinute,
  nextRoutine,
  parseTime,
  routinesOn,
  weekdayBit,
} from '@/features/routines/schedule';
import type { Routine, RoutineInput, Settings } from '@/lib/commands';
import { useRoutinesStore } from '@/stores/routines';
import { useSettingsStore } from '@/stores/settings';

const commands = vi.hoisted(() => ({
  getSettings: vi.fn<() => Promise<Settings>>(),
  updateSettings: vi.fn<(settings: Settings) => Promise<Settings>>(),
  routinesList: vi.fn<() => Promise<Routine[]>>(),
  routineCreate: vi.fn<(input: RoutineInput) => Promise<Routine[]>>(),
  routineUpdate: vi.fn<(id: number, input: RoutineInput) => Promise<Routine[]>>(),
  routineDelete: vi.fn<(id: number) => Promise<Routine[]>>(),
}));

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@/lib/commands', () => commands);
vi.mock('@/lib/events', () => ({
  subscribeRoutinesChanged: () => Promise.resolve(() => undefined),
}));

const EVERY_DAY = 127;

function routine(id: number, name: string, startMinute: number, weekdays = EVERY_DAY): Routine {
  return { id, name, startMinute, durationMinutes: 15, weekdays, enabled: true };
}

const COFFEE = routine(1, 'Hora do café', 615);
const SNACK = routine(2, 'Lanche da tarde', 930);

/** Segunda-feira, 12 de outubro de 2026. */
function monday(hours: number, minutes: number) {
  return new Date(2026, 9, 12, hours, minutes);
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('horários das rotinas', () => {
  it('converte entre minutos e horário', () => {
    expect(formatMinute(615)).toBe('10:15');
    expect(formatMinute(5)).toBe('00:05');
    expect(parseTime('10:15')).toBe(615);
    expect(parseTime('9:05')).toBe(545);
    expect(parseTime('24:00')).toBeNull();
    expect(parseTime('10:60')).toBeNull();
    expect(parseTime('')).toBeNull();
  });

  it('o primeiro bit é a segunda-feira e o último, o domingo', () => {
    expect(weekdayBit(monday(9, 0))).toBe(1);
    expect(weekdayBit(new Date(2026, 9, 18, 9, 0))).toBe(64);
  });

  it('descreve os dias da semana', () => {
    expect(describeWeekdays(127)).toBe('Todos os dias');
    expect(describeWeekdays(31)).toBe('Dias úteis');
    expect(describeWeekdays(96)).toBe('Fins de semana');
    expect(describeWeekdays(0b000_0101)).toBe('Seg, Qua');
  });

  it('lista as rotinas do dia em ordem, sem as desligadas nem as de outros dias', () => {
    const saturdayOnly = routine(3, 'Feira', 480, 32);
    const off = { ...routine(4, 'Desligada', 500), enabled: false };

    const today = routinesOn([SNACK, saturdayOnly, off, COFFEE], monday(9, 0));

    expect(today.map((item) => item.name)).toEqual(['Hora do café', 'Lanche da tarde']);
  });

  it('aponta a próxima rotina de hoje e quanto falta', () => {
    expect(nextRoutine([SNACK, COFFEE], monday(9, 0))).toEqual({ routine: COFFEE, inMinutes: 75 });
    // A que já começou não é mais "a próxima".
    expect(nextRoutine([SNACK, COFFEE], monday(10, 15))?.routine).toBe(SNACK);
    expect(nextRoutine([SNACK, COFFEE], monday(16, 0))).toBeNull();
  });
});

describe('RoutinesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commands.updateSettings.mockImplementation((settings) => Promise.resolve(settings));
    useRoutinesStore.setState({ routines: [COFFEE, SNACK], status: 'ready' });
  });

  afterEach(() => {
    useRoutinesStore.setState(useRoutinesStore.getInitialState(), true);
    useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  });

  it('lista as rotinas com horário e dias', () => {
    render(<RoutinesPage />);

    const list = screen.getByRole('list', { name: 'Rotinas cadastradas' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(list).toHaveTextContent('Hora do café10:15 – 10:30 · Todos os dias');
  });

  it('cria uma rotina pelo diálogo', async () => {
    commands.routineCreate.mockResolvedValue([COFFEE, SNACK, routine(3, 'Almoço', 720)]);
    render(<RoutinesPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Nova rotina' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: ' Almoço ' } });
    fireEvent.change(screen.getByLabelText('Começa às'), { target: { value: '12:00' } });
    fireEvent.change(screen.getByLabelText('Duração (min)'), { target: { value: '60' } });
    // Só em dias úteis: desliga sábado e domingo.
    fireEvent.click(screen.getByRole('button', { name: 'Sábado' }));
    fireEvent.click(screen.getByRole('button', { name: 'Domingo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Criar rotina' }));
    await flush();

    expect(commands.routineCreate).toHaveBeenCalledExactlyOnceWith({
      name: 'Almoço',
      startMinute: 720,
      durationMinutes: 60,
      weekdays: 31,
      enabled: true,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Rotinas cadastradas' })).toHaveTextContent('Almoço');
  });

  it('valida o formulário antes de enviar', () => {
    render(<RoutinesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Nova rotina' }));
    for (const day of ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira']) {
      fireEvent.click(screen.getByRole('button', { name: day }));
    }
    for (const day of ['Sexta-feira', 'Sábado', 'Domingo']) {
      fireEvent.click(screen.getByRole('button', { name: day }));
    }

    fireEvent.click(screen.getByRole('button', { name: 'Criar rotina' }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Dê um nome à rotina.');
    expect(dialog).toHaveTextContent('Informe o horário.');
    expect(dialog).toHaveTextContent('Escolha ao menos um dia da semana.');
    expect(commands.routineCreate).not.toHaveBeenCalled();
  });

  it('mostra no campo o conflito de horário apontado pelo backend', async () => {
    commands.routineCreate.mockRejectedValue({
      kind: 'validation',
      field: 'startMinute',
      message: 'O horário coincide com a rotina "Hora do café".',
    });
    render(<RoutinesPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Nova rotina' }));
    fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Reunião' } });
    fireEvent.change(screen.getByLabelText('Começa às'), { target: { value: '10:20' } });

    fireEvent.click(screen.getByRole('button', { name: 'Criar rotina' }));
    await flush();

    expect(screen.getByRole('dialog')).toHaveTextContent(
      'O horário coincide com a rotina "Hora do café".',
    );
  });

  it('edita, desliga e exclui uma rotina', async () => {
    commands.routineUpdate.mockResolvedValue([{ ...COFFEE, enabled: false }, SNACK]);
    commands.routineDelete.mockResolvedValue([COFFEE]);
    render(<RoutinesPage />);

    fireEvent.click(screen.getByRole('checkbox', { name: /Hora do café:\s*Ativa/ }));
    await flush();
    expect(commands.routineUpdate).toHaveBeenCalledExactlyOnceWith(1, {
      name: 'Hora do café',
      startMinute: 615,
      durationMinutes: 15,
      weekdays: 127,
      enabled: false,
    });

    fireEvent.click(screen.getByRole('button', { name: 'Editar Lanche da tarde' }));
    expect(screen.getByLabelText('Nome')).toHaveValue('Lanche da tarde');
    expect(screen.getByLabelText('Começa às')).toHaveValue('15:30');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Lanche da tarde' }));
    await flush();
    expect(commands.routineDelete).toHaveBeenCalledExactlyOnceWith(2);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
  });

  it('liga o expediente e grava os horários', async () => {
    render(<RoutinesPage />);
    expect(screen.getByLabelText('Das')).toBeDisabled();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Tenho um horário de expediente' }));
    await flush();
    expect(commands.updateSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ workday: { enabled: true, startMinute: 540, endMinute: 1080 } }),
    );

    fireEvent.change(screen.getByLabelText('às'), { target: { value: '17:30' } });
    await flush();
    expect(commands.updateSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ workday: { enabled: true, startMinute: 540, endMinute: 1050 } }),
    );
  });

  it('mostra o motivo quando o expediente é recusado', async () => {
    commands.updateSettings.mockRejectedValue({
      kind: 'validation',
      field: 'workday.endMinute',
      message: 'O fim do expediente precisa ser depois do início, no mesmo dia.',
    });
    render(<RoutinesPage />);

    fireEvent.click(screen.getByRole('checkbox', { name: 'Tenho um horário de expediente' }));
    await flush();

    expect(screen.getByRole('alert')).toHaveTextContent(
      'O fim do expediente precisa ser depois do início',
    );
  });

  it('descreve as rotinas de hoje na linha do tempo', () => {
    render(<RoutinesPage />);

    const timeline = screen.getByRole('img', { name: /Rotinas de hoje|Nenhuma rotina hoje/ });
    // As duas valem todos os dias.
    expect(timeline).toHaveAccessibleName(
      'Rotinas de hoje: Hora do café às 10:15; Lanche da tarde às 15:30.',
    );
  });
});
