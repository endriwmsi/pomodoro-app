import { invoke, isTauri } from '@tauri-apps/api/core';

/**
 * Contratos dos comandos Tauri expostos pelo backend Rust.
 * Fonte de verdade: docs/ARCHITECTURE.md (seção "Comandos e eventos").
 */

/** Espelha `commands::app::AppInfo` em src-tauri. */
export interface AppInfo {
  name: string;
  version: string;
}

/** Espelha `settings::Template`. */
export type TemplateId = 'glass' | 'matrix';

/** Espelha `settings::TimerSettings`. */
export interface TimerSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  cyclesBeforeLongBreak: number;
  autoStartBreaks: boolean;
  autoStartFocus: boolean;
}

/** Espelha `settings::NotchPosition`: a borda do monitor principal em que o notch fica. */
export type NotchPosition = 'top' | 'left' | 'right';

/** Espelha `settings::Settings`. Também é o payload de `settings:changed`. */
/** Espelha `settings::NotchTheme`: cor do notch; `system` acompanha o Windows. */
export type NotchTheme = 'dark' | 'light' | 'system';

export interface Settings {
  appearance: { template: TemplateId };
  timer: TimerSettings;
  notch: { enabled: boolean; position: NotchPosition; theme: NotchTheme };
  alerts: { soundEnabled: boolean; notificationsEnabled: boolean };
  /** `dailyPomodoros`: meta de pomodoros por dia, ou `null` para nenhuma. */
  goals: { dailyPomodoros: number | null };
  /** Previsão do tempo no notch: a única função que usa a internet. */
  weather: { enabled: boolean; useLocation: boolean };
  /** `launchAtLogin`: abrir o Compasso ao entrar no Windows. */
  general: { launchAtLogin: boolean };
}

export const SETTINGS_CHANGED_EVENT = 'settings:changed';

/** Evento enviado à janela principal para trocar de tela (payload: nome da tela). */
export const NAVIGATE_EVENT = 'app:navigate';

/**
 * Espelha `error::AppError`. `unknown` não vem do backend: cobre falhas do
 * próprio IPC (ex.: argumentos que não desserializam).
 */
export type AppError =
  | { kind: 'validation'; field: string; message: string }
  | { kind: 'database'; message: string }
  | { kind: 'notFound'; message: string }
  | { kind: 'network'; message: string }
  | { kind: 'internal'; message: string }
  | { kind: 'unknown'; message: string };

/** Espelha `timer::engine::Phase`: o tipo da sessão, rodando ou não. */
export type TimerPhase = 'focus' | 'shortBreak' | 'longBreak';

/** Espelha `timer::engine::Status`. */
export type TimerStatus = 'idle' | 'running' | 'paused';

/** Espelha `timer::engine::TimerSnapshot`. Também é o payload de `timer:state`. */
export interface TimerSnapshot {
  phase: TimerPhase;
  status: TimerStatus;
  remainingMs: number;
  plannedMs: number;
  /** Focos já encerrados (concluídos ou pulados) no ciclo atual. */
  cyclePosition: number;
  cyclesBeforeLongBreak: number;
  /** `suspend`: pausa automática após suspensão do computador. */
  pauseReason: 'user' | 'suspend' | null;
  /** Tarefa escolhida para os focos, se houver. */
  taskId: number | null;
}

/** Espelha `tasks::Priority`. */
export type TaskPriority = 'low' | 'medium' | 'high';

/** Espelha `tasks::Status`: a coluna do quadro. */
export type TaskStatus = 'todo' | 'doing' | 'done';

/** Espelha `tasks::Task`. */
export interface Task {
  id: number;
  title: string;
  description: string;
  priority: TaskPriority;
  status: TaskStatus;
  /** Ordem dentro da coluna, a partir de 0. */
  position: number;
  /** Prazo como data local, `AAAA-MM-DD`. */
  dueDate: string | null;
  estimatedPomodoros: number | null;
  createdAtMs: number;
  updatedAtMs: number;
  completedAtMs: number | null;
  /** Sessões de foco concluídas dedicadas a esta tarefa. */
  completedPomodoros: number;
}

/** Espelha `tasks::TaskInput`: os campos editáveis de uma tarefa. */
export interface TaskInput {
  title: string;
  description: string;
  priority: TaskPriority;
  dueDate: string | null;
  estimatedPomodoros: number | null;
}

/** Evento sem payload: o quadro mudou; busque a lista de novo. */
export const TASKS_CHANGED_EVENT = 'tasks:changed';

export function tasksList(): Promise<Task[]> {
  return invoke<Task[]>('tasks_list');
}

// Os comandos que alteram o quadro devolvem a lista completa já atualizada.

export function taskCreate(input: TaskInput): Promise<Task[]> {
  return invoke<Task[]>('task_create', { input });
}

export function taskUpdate(id: number, input: TaskInput): Promise<Task[]> {
  return invoke<Task[]>('task_update', { id, input });
}

export function taskDelete(id: number): Promise<Task[]> {
  return invoke<Task[]>('task_delete', { id });
}

/** `index` é a posição na coluna de destino, contada sem a própria tarefa. */
export function taskMove(id: number, status: TaskStatus, index: number): Promise<Task[]> {
  return invoke<Task[]>('task_move', { id, status, index });
}

/** Escolhe a tarefa a que os focos são dedicados; `null` para nenhuma. */
export function timerSetTask(taskId: number | null): Promise<TimerSnapshot> {
  return invoke<TimerSnapshot>('timer_set_task', { taskId });
}

/** Escolhe a tarefa e vai direto para um foco nela. */
export function timerFocusTask(taskId: number): Promise<TimerSnapshot> {
  return invoke<TimerSnapshot>('timer_focus_task', { taskId });
}

export const TIMER_STATE_EVENT = 'timer:state';

export function timerGetState(): Promise<TimerSnapshot> {
  return invoke<TimerSnapshot>('timer_get_state');
}

/** Inicia a fase atual ou retoma a sessão pausada. */
export function timerStart(): Promise<TimerSnapshot> {
  return invoke<TimerSnapshot>('timer_start');
}

export function timerPause(): Promise<TimerSnapshot> {
  return invoke<TimerSnapshot>('timer_pause');
}

export function timerSkip(): Promise<TimerSnapshot> {
  return invoke<TimerSnapshot>('timer_skip');
}

export function timerReset(): Promise<TimerSnapshot> {
  return invoke<TimerSnapshot>('timer_reset');
}

/** Espelha `analytics::PeriodStats`: totais de um período `[startMs, endMs)`. */
export interface PeriodStats {
  startMs: number;
  endMs: number;
  /** Sessões de foco concluídas que terminaram no período. */
  completedPomodoros: number;
  /** Tempo efetivo de todos os focos que terminaram no período, concluídos ou não. */
  focusMs: number;
  /** Tarefas concluídas no período. */
  tasksCompleted: number;
}

/** Espelha `analytics::Dashboard`. */
export interface Dashboard {
  today: {
    completedPomodoros: number;
    focusMs: number;
    tasksCompleted: number;
    tasksInProgress: number;
  };
  /** Um item por dia da semana pedida, de segunda a domingo. */
  week: PeriodStats[];
}

/**
 * Indicadores de hoje e totais por dia de uma semana. Os limites são
 * meias-noites **locais** em milissegundos (ver `src/lib/calendar.ts`).
 */
export function analyticsDashboard(
  todayStartMs: number,
  todayEndMs: number,
  weekBoundariesMs: number[],
): Promise<Dashboard> {
  return invoke<Dashboard>('analytics_dashboard', { todayStartMs, todayEndMs, weekBoundariesMs });
}

/**
 * Totais de cada período entre limites consecutivos (meias-noites locais) —
 * por exemplo, cada dia de um mês, para o calendário do dashboard.
 */
export function analyticsPeriods(boundariesMs: number[]): Promise<PeriodStats[]> {
  return invoke<PeriodStats[]>('analytics_periods', { boundariesMs });
}

/** Espelha `weather::Condition`. */
export type WeatherCondition =
  'clear' | 'partlyCloudy' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'snow' | 'thunderstorm';

/** Espelha `weather::Place`. */
export interface WeatherPlace {
  /** A cidade. */
  name: string;
  /** Estado e país; vazio se não se sabe. */
  detail: string;
  temperatureC: number;
  condition: WeatherCondition;
  /** É noite agora no lugar. */
  night: boolean;
  windKmh: number;
  humidityPercent: number;
  /** A hora atual e as seguintes; `time` é `AAAA-MM-DDTHH:MM`, local do lugar. */
  hourly: { time: string; condition: WeatherCondition; temperatureC: number; night: boolean }[];
  /** Hoje e os dias seguintes; `date` é `AAAA-MM-DD`, local do lugar. */
  daily: { date: string; condition: WeatherCondition; minC: number; maxC: number }[];
}

/** Espelha `weather::WeatherReport`. */
export interface WeatherReport {
  /** `location`: a localização do computador; `capitals`: a lista de capitais. */
  source: 'location' | 'capitals';
  places: WeatherPlace[];
  ageMs: number;
  /** A última atualização falhou; estes são dados anteriores. */
  stale: boolean;
}

/**
 * Previsão do tempo. Rejeita com `validation` se a função estiver desligada e
 * com `network` se não houver conexão nem dados anteriores.
 */
export function weatherGet(): Promise<WeatherReport> {
  return invoke<WeatherReport>('weather_get');
}

/** Espelha `media::MediaState`. */
export interface MediaState {
  /** Há uma sessão de mídia em algum aplicativo. */
  available: boolean;
  playing: boolean;
  title: string;
  artist: string;
  app: string;
  canPrevious: boolean;
  canNext: boolean;
  canShuffle: boolean;
  canRepeat: boolean;
  /** `null` se o aplicativo não informa. */
  shuffle: boolean | null;
  /** `list` repete a lista; `track`, a faixa atual. */
  repeat: 'none' | 'track' | 'list' | null;
  /** De 0 a 1; `null` sem saída de áudio. */
  volume: number | null;
  /** `app`: volume só do aplicativo que toca; `system`: volume geral (alternativa). */
  volumeScope: 'app' | 'system';
  /** Posição na faixa e duração dela, em ms; `null` se o aplicativo não informa. */
  positionMs: number | null;
  durationMs: number | null;
  canSeek: boolean;
}

/** Espelha `media::MediaAction`. `cycleRepeat`: nenhuma → lista → faixa → nenhuma. */
export type MediaAction = 'playPause' | 'next' | 'previous' | 'toggleShuffle' | 'cycleRepeat';

export function mediaGetState(): Promise<MediaState> {
  // Na pré-visualização do navegador não há controle de mídia.
  if (!isTauri()) {
    return Promise.resolve({
      available: false,
      playing: false,
      title: '',
      artist: '',
      app: '',
      canPrevious: false,
      canNext: false,
      canShuffle: false,
      canRepeat: false,
      shuffle: null,
      repeat: null,
      volume: null,
      volumeScope: 'system',
      positionMs: null,
      durationMs: null,
      canSeek: false,
    });
  }
  return invoke<MediaState>('media_get_state');
}

export function mediaControl(action: MediaAction): Promise<MediaState> {
  return invoke<MediaState>('media_control', { action });
}

/** Leva a faixa atual para `positionMs`. */
export function mediaSeek(positionMs: number): Promise<MediaState> {
  return invoke<MediaState>('media_seek', { positionMs });
}

/** Capa da mídia atual como `data:` URL, ou `null`. */
export function mediaGetArtwork(): Promise<string | null> {
  return invoke<string | null>('media_get_artwork');
}

/** Ajusta o volume (0 a 1) do aplicativo que toca ou, se ele não for achado, o do sistema. */
export function mediaSetVolume(level: number): Promise<MediaState> {
  return invoke<MediaState>('media_set_volume', { level });
}

/**
 * Espelha `windows::notch::Layout`: o que o notch mostra, e portanto o tamanho
 * da janela. `compact` é a aba Música, só com o player.
 */
export type NotchLayout = 'collapsed' | 'expanded' | 'compact';

/** Ajusta o tamanho da janela do notch (só faz sentido na janela do notch). */
export function notchSetLayout(layout: NotchLayout): Promise<void> {
  // Na pré-visualização do navegador não há janela para redimensionar.
  if (!isTauri()) return Promise.resolve();
  return invoke('notch_set_layout', { layout });
}

/** Toca o som e mostra a notificação de exemplo, conforme as preferências gravadas. */
export function previewAlerts(): Promise<void> {
  return invoke('preview_alerts');
}

/** Mostra a janela principal, opcionalmente em uma tela específica. */
export function showMainWindow(view?: string): Promise<void> {
  return invoke('show_main_window', { view: view ?? null });
}

export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>('app_info');
}

export function getSettings(): Promise<Settings> {
  return invoke<Settings>('get_settings');
}

/** Substitui todas as configurações. Rejeita com `AppError` se forem inválidas. */
export function updateSettings(settings: Settings): Promise<Settings> {
  return invoke<Settings>('update_settings', { settings });
}
