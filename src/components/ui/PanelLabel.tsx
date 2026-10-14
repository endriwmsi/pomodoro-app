import type { ReactNode } from 'react';

interface PanelLabelProps {
  as?: 'p' | 'h2' | 'span';
  /** Numeração do painel, exibida apenas no template Matriz ("01", "02"…). */
  index?: number;
  children: ReactNode;
}

export function PanelLabel({ as: Tag = 'p', index, children }: PanelLabelProps) {
  return (
    <Tag className="text-sm font-medium text-ink matrix:text-[0.6875rem] matrix:font-normal matrix:tracking-[0.08em] matrix:text-ink-muted matrix:uppercase signal:font-mono signal:text-[0.6875rem] signal:font-normal signal:tracking-[0.12em] signal:text-ink-muted signal:uppercase relief:text-xs relief:font-semibold relief:tracking-wide relief:text-ink-muted">
      {index === undefined ? null : (
        <span aria-hidden="true" className="mr-2 hidden text-ink matrix:inline">
          {String(index).padStart(2, '0')}
        </span>
      )}
      {children}
    </Tag>
  );
}
