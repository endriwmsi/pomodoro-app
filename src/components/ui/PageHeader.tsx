interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="mb-6 [text-shadow:0_1px_8px_rgb(0_0_0/0.25)]">
      <h1 className="font-display text-2xl font-semibold tracking-tight matrix:text-xl matrix:tracking-[0.12em] matrix:uppercase">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-1 text-sm text-ink-muted matrix:text-xs matrix:tracking-widest matrix:uppercase">
          {subtitle}
        </p>
      ) : null}
    </header>
  );
}
