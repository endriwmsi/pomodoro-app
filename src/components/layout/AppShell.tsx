import type { ReactNode } from 'react';

import { backgroundUrl } from '@/app/background';
import type { ViewId } from '@/app/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { TitleBar } from '@/components/layout/TitleBar';
import { useBackgroundStore } from '@/stores/background';
import { useSettingsStore } from '@/stores/settings';

interface AppShellProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  children: ReactNode;
}

export function AppShell({ activeView, onNavigate, children }: AppShellProps) {
  const choice = useSettingsStore((state) => state.settings.appearance.background);
  const customImage = useBackgroundStore((state) => state.custom);
  const backgroundImageUrl = backgroundUrl(choice, customImage);

  return (
    <div className="flex h-full bg-shell py-1.5 pr-1.5">
      <Sidebar activeView={activeView} onNavigate={onNavigate} />

      <div className="relative min-w-0 flex-1 overflow-hidden rounded-panel">
        <div
          aria-hidden="true"
          data-testid="app-background"
          className={
            backgroundImageUrl
              ? 'app-background absolute inset-0 bg-cover bg-center'
              : 'app-background app-background-fallback absolute inset-0'
          }
          style={
            backgroundImageUrl ? { backgroundImage: `url("${backgroundImageUrl}")` } : undefined
          }
        />

        <TitleBar />

        <main className="relative h-full overflow-y-auto px-8 pt-14 pb-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
