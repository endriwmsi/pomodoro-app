import { litDots } from '@/components/ui/dotMatrix';

interface DotColumnsProps {
  /** Um valor por coluna. */
  values: readonly number[];
  /** Um rótulo curto por coluna (ex.: iniciais dos dias). */
  labels: readonly string[];
  /** Descrição do gráfico para leitores de tela. */
  label: string;
  /** Pontos por coluna. */
  rows?: number;
  /** Índice da coluna destacada com a cor de destaque. */
  highlight?: number;
  /** `dot`: pontos (template Matriz); `block`: blocos empilhados (template Sinal). */
  shape?: 'dot' | 'block';
}

/** Gráfico de colunas em pontos (template Matriz) ou em blocos (template Sinal). */
export function DotColumns({
  values,
  labels,
  label,
  rows = 6,
  highlight,
  shape = 'dot',
}: DotColumnsProps) {
  const block = shape === 'block';
  // A escala nunca fica abaixo de `rows`: valores pequenos acendem um ponto por unidade.
  const max = Math.max(rows, ...values);

  return (
    <div role="img" aria-label={label} className="flex items-end justify-between gap-2">
      {values.map((value, column) => {
        const lit = litDots(value, max, rows);
        const active = column === highlight;
        return (
          <div key={column} className="flex flex-1 flex-col items-center gap-1.5">
            {Array.from({ length: rows }, (_, row) => {
              const on = rows - row <= lit;
              return (
                <span
                  key={row}
                  data-lit={on}
                  className={
                    block
                      ? `h-3 w-full max-w-10 rounded-[3px] ${
                          on ? (active ? 'bg-accent' : 'bg-accent/45') : 'bg-ink/8'
                        }`
                      : `size-1.5 rounded-full ${on ? (active ? 'bg-accent' : 'bg-ink') : 'bg-ink/15'}`
                  }
                />
              );
            })}
            <span
              className={`mt-1 text-[0.6875rem] tracking-widest ${
                active ? 'text-accent' : 'text-ink-muted'
              }`}
            >
              {labels[column]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
