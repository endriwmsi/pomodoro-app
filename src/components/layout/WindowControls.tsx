import { Maximize2, Minimize2, Minus, X } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';

import { closeWindow, minimizeWindow, toggleMaximizeWindow, watchMaximized } from '@/lib/window';

function run(action: () => Promise<void>) {
  action().catch((error: unknown) => {
    console.error('Falha ao controlar a janela', error);
  });
}

const GLYPH = { size: 8, strokeWidth: 3.25, 'aria-hidden': true } as const;

interface DotButtonProps {
  label: string;
  /** Classe de cor do ponto (token `--color-window-*` do template). */
  color: string;
  onClick: () => void;
  children: ReactNode;
}

/**
 * O ponto tem 13 px, mas o botão ocupa 24 px para ser fácil de acertar.
 */
function DotButton({ label, color, onClick, children }: DotButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="group/dot flex size-6 items-center justify-center outline-none"
      onClick={onClick}
    >
      <span
        className={`flex size-[13px] items-center justify-center rounded-full text-window-glyph shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.18)] transition-transform duration-150 group-hover/dot:scale-[1.18] group-focus-visible/dot:ring-2 group-focus-visible/dot:ring-white/80 group-active/dot:scale-95 ${color}`}
      >
        {children}
      </span>
    </button>
  );
}

export function WindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => watchMaximized(setMaximized), []);

  return (
    <div
      role="group"
      aria-label="Controles da janela"
      className="mr-3 flex items-center rounded-full border border-panel-border bg-panel-strong px-1 backdrop-blur-md"
    >
      <DotButton
        label="Minimizar"
        color="bg-window-minimize"
        onClick={() => {
          run(minimizeWindow);
        }}
      >
        <Minus {...GLYPH} />
      </DotButton>
      <DotButton
        label={maximized ? 'Restaurar' : 'Maximizar'}
        color="bg-window-maximize"
        onClick={() => {
          run(toggleMaximizeWindow);
        }}
      >
        {maximized ? <Minimize2 {...GLYPH} /> : <Maximize2 {...GLYPH} />}
      </DotButton>
      <DotButton
        label="Fechar"
        color="bg-window-close"
        onClick={() => {
          run(closeWindow);
        }}
      >
        <X {...GLYPH} />
      </DotButton>
    </div>
  );
}
