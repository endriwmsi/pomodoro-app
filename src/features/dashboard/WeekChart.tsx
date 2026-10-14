import { DotColumns } from '@/components/ui/DotColumns';
import { useTemplate } from '@/stores/settings';

const WEEKDAY_INITIALS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'] as const;
const WEEKDAY_NAMES = [
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
  'domingo',
] as const;

/** Altura mínima da escala: poucas sessões não devem virar barras gigantes. */
const MIN_SCALE = 4;

interface WeekChartProps {
  /** Pomodoros concluídos de segunda a domingo. */
  values: readonly number[];
  /** Índice de hoje (0 = segunda), se a semana exibida for a atual. */
  today: number | undefined;
}

function describe(values: readonly number[]): string {
  if (values.every((value) => value === 0)) return 'Nenhum pomodoro concluído nesta semana';
  const days = values.map((value, day) => `${WEEKDAY_NAMES[day] ?? ''} ${value}`);
  return `Pomodoros concluídos por dia: ${days.join(', ')}`;
}

/** Gráfico semanal: barras (Vidro e Relevo), colunas de pontos (Matriz) ou de blocos (Sinal). */
export function WeekChart({ values, today }: WeekChartProps) {
  const template = useTemplate();
  const label = describe(values);

  if (template === 'matrix' || template === 'signal') {
    return (
      <DotColumns
        values={values}
        labels={WEEKDAY_INITIALS}
        label={label}
        rows={8}
        shape={template === 'signal' ? 'block' : 'dot'}
        {...(today === undefined ? {} : { highlight: today })}
      />
    );
  }

  const scale = Math.max(MIN_SCALE, ...values);

  return (
    <div role="img" aria-label={label} className="flex h-44 items-end justify-between gap-3">
      {values.map((value, day) => {
        const current = day === today;
        return (
          <div key={day} className="flex h-full flex-1 flex-col items-center justify-end gap-2">
            <span className={`text-xs tabular-nums ${value > 0 ? 'text-ink' : 'text-ink-muted'}`}>
              {value}
            </span>
            <div className="flex w-full max-w-9 flex-1 items-end overflow-hidden rounded-full bg-ink/10">
              <div
                style={{ height: `${(value / scale) * 100}%` }}
                className={`w-full rounded-full transition-[height] duration-300 ease-out ${
                  current ? 'bg-linear-to-t from-accent/60 to-accent' : 'bg-ink/55'
                }`}
              />
            </div>
            <span className={`text-xs ${current ? 'font-medium text-accent' : 'text-ink-muted'}`}>
              {WEEKDAY_INITIALS[day]}
            </span>
          </div>
        );
      })}
    </div>
  );
}
