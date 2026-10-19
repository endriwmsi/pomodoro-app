import { listen } from '@tauri-apps/api/event';

import {
  NAVIGATE_EVENT,
  NOTCH_NOTICE_EVENT,
  ROUTINES_CHANGED_EVENT,
  SETTINGS_CHANGED_EVENT,
  TASKS_CHANGED_EVENT,
  TIMER_STATE_EVENT,
  type NotchNotice,
  type Settings,
  type TimerSnapshot,
} from '@/lib/commands';

/**
 * Assina o evento `timer:state`. A promessa resolve quando a assinatura está
 * ativa — só depois disso é seguro buscar o estado inicial sem risco de perder
 * uma mudança. O valor resolvido cancela a assinatura.
 */
export function subscribeTimerState(
  handler: (snapshot: TimerSnapshot) => void,
): Promise<() => void> {
  return listen<TimerSnapshot>(TIMER_STATE_EVENT, (event) => {
    handler(event.payload);
  });
}

/** Assina `settings:changed`: outra janela (ou esta) gravou novas configurações. */
export function subscribeSettingsChanged(
  handler: (settings: Settings) => void,
): Promise<() => void> {
  return listen<Settings>(SETTINGS_CHANGED_EVENT, (event) => {
    handler(event.payload);
  });
}

/** Assina `app:navigate`: o backend pede que a janela principal abra uma tela. */
export function subscribeNavigate(handler: (view: string) => void): Promise<() => void> {
  return listen<string>(NAVIGATE_EVENT, (event) => {
    handler(event.payload);
  });
}

/** Assina `routines:changed`: as rotinas mudaram (em qualquer janela). */
export function subscribeRoutinesChanged(handler: () => void): Promise<() => void> {
  return listen(ROUTINES_CHANGED_EVENT, () => {
    handler();
  });
}

/** Assina `tasks:changed`: o quadro mudou (em qualquer janela, ou por uma sessão concluída). */
export function subscribeTasksChanged(handler: () => void): Promise<() => void> {
  return listen(TASKS_CHANGED_EVENT, () => {
    handler();
  });
}

/** Assina `notch:notice`: um foco ou uma pausa terminou (só a janela do notch recebe). */
export function subscribeNotchNotice(handler: (notice: NotchNotice) => void): Promise<() => void> {
  return listen<NotchNotice>(NOTCH_NOTICE_EVENT, (event) => {
    handler(event.payload);
  });
}
