import type { ReactNode } from 'react';

import { backgroundImageUrl } from '@/app/background';
import type { ViewId } from '@/app/navigation';
import { Sidebar } from '@/components/layout/Sidebar';
import { TitleBar } from '@/components/layout/TitleBar';

interface AppShellProps {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  children: ReactNode;
}

export function AppShell({ activeView, onNavigate, children }: AppShellProps) {
  return (
    <div className="flex h-full bg-shell py-1.5 pr-1.5">
      <Sidebar activeView={activeView} onNavigate={onNavigate} />

      <div className="relative min-w-0 flex-1 overflow-hidden rounded-panel">
        <div
          aria-hidden="true"
          data-testid="app-background"
          className={
            backgroundImageUrl
              ? 'absolute inset-0 bg-cover bg-center'
              : 'app-background-fallback absolute inset-0'
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
