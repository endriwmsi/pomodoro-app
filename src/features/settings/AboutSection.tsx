import { isTauri } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

import { Panel } from '@/components/ui/Panel';
import { PanelLabel } from '@/components/ui/PanelLabel';
import { getAppInfo, type AppInfo } from '@/lib/commands';

type AboutState =
  | { status: 'loading' }
  | { status: 'ready'; info: AppInfo }
  | { status: 'error' }
  | { status: 'unavailable' };

function describe(state: AboutState): string {
  switch (state.status) {
    case 'loading':
      return 'Carregando…';
    case 'ready':
      return `${state.info.name} ${state.info.version}`;
    case 'error':
      return 'Não foi possível consultar a versão do aplicativo.';
    case 'unavailable':
      return 'Disponível apenas dentro do aplicativo desktop.';
  }
}

export function AboutSection() {
  const [about, setAbout] = useState<AboutState>(() =>
    isTauri() ? { status: 'loading' } : { status: 'unavailable' },
  );

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    getAppInfo()
      .then((info) => {
        if (!cancelled) setAbout({ status: 'ready', info });
      })
      .catch((error: unknown) => {
        console.error('Falha no comando app_info', error);
        if (!cancelled) setAbout({ status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Panel aria-label="Sobre" className="mt-3 px-4 py-3.5">
      <PanelLabel as="h2">Sobre</PanelLabel>
      <p className="mt-2 text-sm" role={about.status === 'error' ? 'alert' : undefined}>
        {describe(about)}
      </p>
    </Panel>
  );
}
