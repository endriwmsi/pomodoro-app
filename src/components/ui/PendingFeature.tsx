import type { LucideIcon } from 'lucide-react';

import { Panel } from '@/components/ui/Panel';

interface PendingFeatureProps {
  icon: LucideIcon;
  title: string;
  description: string;
}

/** Estado vazio de uma funcionalidade ainda não implementada (ver docs/ROADMAP.md). */
export function PendingFeature({ icon: Icon, title, description }: PendingFeatureProps) {
  return (
    <Panel className="flex flex-col items-center px-6 py-12 text-center">
      <Icon size={24} strokeWidth={1.5} aria-hidden="true" className="text-ink-muted" />
      <h2 className="mt-3 text-sm font-medium matrix:tracking-widest matrix:uppercase">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>
    </Panel>
  );
}
