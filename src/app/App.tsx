import { isTauri } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

import { DEFAULT_VIEW, isViewId, type ViewId } from '@/app/navigation';
import { applyTemplate } from '@/app/templates';
import { AppShell } from '@/components/layout/AppShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { KanbanPage } from '@/features/kanban/KanbanPage';
import { PomodoroPage } from '@/features/pomodoro/PomodoroPage';
import { RoutinesPage } from '@/features/routines/RoutinesPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { subscribeNavigate } from '@/lib/events';
import { useBackgroundStore } from '@/stores/background';
import { useRoutinesStore } from '@/stores/routines';
import { useSettingsStore, useTemplate } from '@/stores/settings';
import { useTasksStore } from '@/stores/tasks';
import { useTimerStore } from '@/stores/timer';

const VIEWS: Record<ViewId, () => React.JSX.Element> = {
  dashboard: DashboardPage,
  pomodoro: PomodoroPage,
  kanban: KanbanPage,
  routines: RoutinesPage,
  settings: SettingsPage,
};

export function App() {
  const [view, setView] = useState<ViewId>(DEFAULT_VIEW);
  const View = VIEWS[view];

  const connectSettings = useSettingsStore((state) => state.connect);
  const template = useTemplate();

  useEffect(() => connectSettings(), [connectSettings]);

  const loadBackground = useBackgroundStore((state) => state.load);
  useEffect(() => void loadBackground(), [loadBackground]);

  // A bandeja e o notch podem pedir uma tela específica (ex.: Configurações).
  useEffect(() => {
    if (!isTauri()) return;
    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    subscribeNavigate((target) => {
      if (isViewId(target)) setView(target);
    })
      .then((stop) => {
        if (disposed) stop();
        else unsubscribe = stop;
      })
      .catch((error: unknown) => {
        console.error('Falha ao assinar a navegação', error);
      });
    return () => {
      disposed = true;
      unsubscribe?.();
    };
  }, []);

  useEffect(() => {
    applyTemplate(template);
  }, [template]);

  // No nível do app, e não da tela: o estado do timer segue atualizado em qualquer tela.
  const connectTimer = useTimerStore((state) => state.connect);
  useEffect(() => connectTimer(), [connectTimer]);

  const connectTasks = useTasksStore((state) => state.connect);
  useEffect(() => connectTasks(), [connectTasks]);

  const connectRoutines = useRoutinesStore((state) => state.connect);
  useEffect(() => connectRoutines(), [connectRoutines]);

  return (
    <AppShell activeView={view} onNavigate={setView}>
      <View />
    </AppShell>
  );
}
