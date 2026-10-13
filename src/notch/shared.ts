import type { TimerPhase } from '@/lib/commands';

export const PHASE_LABEL: Record<TimerPhase, string> = {
  focus: 'Foco',
  shortBreak: 'Pausa curta',
  longBreak: 'Pausa longa',
};

export const NOTCH_ICON_BUTTON =
  'flex size-8 items-center justify-center rounded-full text-white/80 outline-none transition-colors duration-150 hover:bg-white/15 hover:text-white disabled:opacity-40';

export function reportNotchFailure(error: unknown) {
  console.error('Falha em uma ação do notch', error);
}
