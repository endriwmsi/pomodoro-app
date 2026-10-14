import {
  CalendarClock,
  Kanban,
  LayoutDashboard,
  Settings,
  Timer,
  type LucideIcon,
} from 'lucide-react';

export type ViewId = 'dashboard' | 'pomodoro' | 'kanban' | 'routines' | 'settings';

export interface NavItem {
  id: ViewId;
  label: string;
  icon: LucideIcon;
  /** Itens `secondary` ficam ancorados na parte inferior da barra lateral. */
  placement: 'primary' | 'secondary';
}

export const NAV_ITEMS: readonly NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, placement: 'primary' },
  { id: 'pomodoro', label: 'Pomodoro', icon: Timer, placement: 'primary' },
  { id: 'kanban', label: 'Kanban', icon: Kanban, placement: 'primary' },
  { id: 'routines', label: 'Rotina', icon: CalendarClock, placement: 'primary' },
  { id: 'settings', label: 'Configurações', icon: Settings, placement: 'secondary' },
];

export const DEFAULT_VIEW: ViewId = 'dashboard';

export function isViewId(value: unknown): value is ViewId {
  return NAV_ITEMS.some((item) => item.id === value);
}
