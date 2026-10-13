import type { ComponentPropsWithoutRef } from 'react';

/** Superfície de conteúdo. A aparência vem dos tokens do template (`.panel`). */
export function Panel({ className = '', ...props }: ComponentPropsWithoutRef<'section'>) {
  return <section className={`panel ${className}`} {...props} />;
}
