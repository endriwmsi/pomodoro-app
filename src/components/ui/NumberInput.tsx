import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

interface NumberInputProps extends Omit<
  ComponentProps<'input'>,
  'type' | 'value' | 'onChange' | 'min' | 'max'
> {
  /** Texto do campo: pode estar vazio ou incompleto enquanto o usuário digita. */
  value: string;
  onValueChange: (value: string) => void;
  min: number;
  max: number;
  invalid?: boolean;
}

/**
 * Campo numérico com setas no estilo do template (as nativas do navegador são
 * escondidas em globals.css). As setas somam ou subtraem 1, dentro dos limites.
 */
export function NumberInput({
  value,
  onValueChange,
  min,
  max,
  invalid = false,
  disabled,
  className,
  ...props
}: NumberInputProps) {
  const step = (delta: number) => {
    const current = Number(value);
    // Campo vazio ou inválido: a primeira seta leva ao limite mais próximo.
    const base =
      value.trim() === '' || Number.isNaN(current) ? (delta > 0 ? min - 1 : min + 1) : current;
    onValueChange(String(Math.min(max, Math.max(min, Math.round(base) + delta))));
  };

  return (
    <div
      className={cn(
        'flex h-9 items-stretch overflow-hidden rounded-lg border bg-panel-strong focus-within:ring-2 focus-within:ring-white/70',
        invalid ? 'border-accent' : 'border-panel-border',
        disabled && 'opacity-50',
        className,
      )}
    >
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={1}
        value={value}
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        onChange={(event) => {
          onValueChange(event.target.value);
        }}
        className="w-full min-w-0 bg-transparent pl-3 text-sm text-ink outline-none"
        {...props}
      />
      <div className="flex w-6 shrink-0 flex-col border-l border-panel-border">
        {(
          [
            { delta: 1, label: 'Aumentar', icon: ChevronUp },
            { delta: -1, label: 'Diminuir', icon: ChevronDown },
          ] as const
        ).map(({ delta, label, icon: Icon }) => (
          <button
            key={label}
            type="button"
            // Fora da ordem de tabulação: as setas do teclado já fazem o mesmo no campo.
            tabIndex={-1}
            aria-label={label}
            disabled={disabled}
            onClick={() => {
              step(delta);
            }}
            className="flex flex-1 items-center justify-center text-ink-muted transition-colors duration-150 outline-none hover:bg-white/10 hover:text-ink"
          >
            <Icon size={12} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
