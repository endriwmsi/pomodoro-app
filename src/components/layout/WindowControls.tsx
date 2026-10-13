import { Copy, Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';

import { closeWindow, minimizeWindow, toggleMaximizeWindow, watchMaximized } from '@/lib/window';

function run(action: () => Promise<void>) {
  action().catch((error: unknown) => {
    console.error('Falha ao controlar a janela', error);
  });
}

const BUTTON_BASE =
  'flex h-7 w-9 items-center justify-center rounded-md text-white/85 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-white/70';

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => watchMaximized(setMaximized), []);

  return (
    <div
      role="group"
      aria-label="Controles da janela"
      className="mr-3 flex items-center gap-0.5 rounded-lg border border-panel-border bg-panel-strong p-0.5 backdrop-blur-md"
    >
      <button
        type="button"
        aria-label="Minimizar"
        title="Minimizar"
        className={`${BUTTON_BASE} hover:bg-white/15`}
        onClick={() => {
          run(minimizeWindow);
        }}
      >
        <Minus size={15} strokeWidth={1.75} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label={maximized ? 'Restaurar' : 'Maximizar'}
        title={maximized ? 'Restaurar' : 'Maximizar'}
        className={`${BUTTON_BASE} hover:bg-white/15`}
        onClick={() => {
          run(toggleMaximizeWindow);
        }}
      >
        {maximized ? (
          <Copy size={12} strokeWidth={1.75} aria-hidden="true" />
        ) : (
          <Square size={12} strokeWidth={1.75} aria-hidden="true" />
        )}
      </button>
      <button
        type="button"
        aria-label="Fechar"
        title="Fechar"
        className={`${BUTTON_BASE} hover:bg-red-500/90 hover:text-white`}
        onClick={() => {
          run(closeWindow);
        }}
      >
        <X size={15} strokeWidth={1.75} aria-hidden="true" />
      </button>
    </div>
  );
}
