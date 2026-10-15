import { ChevronDownIcon } from 'lucide-react';
import { Slider as SliderPrimitive } from 'radix-ui';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { COLOR_SWATCHES, hexToHsv, hsvToHex, parseHexColor, type Hsv } from '@/lib/color';
import { cn } from '@/lib/utils';

interface ColorPickerProps {
  /** Cor atual, em `#rrggbb`. */
  value: string;
  /** Chamado a cada mudança, inclusive durante o arraste (`#rrggbb`). */
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
  className?: string;
}

const clamp = (value: number) => Math.min(1, Math.max(0, value));

/**
 * Seletor de cor no estilo do shadcn/ui: um botão com a amostra e o código da
 * cor abre um popover com a área de saturação × brilho, a faixa de matiz, o
 * campo hexadecimal e cores prontas. Cores do template via tokens; as únicas
 * cores fixas são as do próprio espectro.
 */
export function ColorPicker({
  value,
  onChange,
  disabled = false,
  id,
  'aria-label': ariaLabel,
  className,
}: ColorPickerProps) {
  // O matiz fica guardado aqui: em cinzas (saturação 0) ele não sai do hex.
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(value));
  const [text, setText] = useState(value);
  const area = useRef<HTMLDivElement>(null);

  // A cor mudou por fora (outra janela, salvamento): acompanha.
  useEffect(() => {
    setHsv((current) => (hsvToHex(current) === value ? current : hexToHsv(value)));
    setText(value);
  }, [value]);

  const commit = (next: Hsv) => {
    setHsv(next);
    const hex = hsvToHex(next);
    setText(hex);
    if (hex !== value) onChange(hex);
  };

  const pickAt = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = area.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    commit({
      ...hsv,
      s: clamp((event.clientX - rect.left) / rect.width),
      v: clamp(1 - (event.clientY - rect.top) / rect.height),
    });
  };

  const onAreaKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.1 : 0.01;
    const moves: Record<string, Partial<Hsv>> = {
      ArrowLeft: { s: clamp(hsv.s - step) },
      ArrowRight: { s: clamp(hsv.s + step) },
      ArrowDown: { v: clamp(hsv.v - step) },
      ArrowUp: { v: clamp(hsv.v + step) },
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    commit({ ...hsv, ...move });
  };

  const pure = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <Popover>
      <PopoverTrigger
        id={id}
        disabled={disabled}
        aria-label={ariaLabel}
        className={cn(
          'flex h-9 items-center gap-2 rounded-lg border border-panel-border bg-panel-strong pr-2.5 pl-1.5 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
      >
        <span
          aria-hidden="true"
          className="size-6 rounded-md border border-white/15"
          style={{ backgroundColor: value }}
        />
        <span className="font-mono text-xs tracking-wide uppercase">{value}</span>
        <ChevronDownIcon aria-hidden="true" className="size-4 opacity-60" />
      </PopoverTrigger>

      <PopoverContent className="w-64">
        <div
          ref={area}
          role="slider"
          tabIndex={0}
          aria-label="Saturação e brilho"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(hsv.s * 100)}
          aria-valuetext={`Saturação ${Math.round(hsv.s * 100)}%, brilho ${Math.round(hsv.v * 100)}%`}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            pickAt(event);
          }}
          onPointerMove={(event) => {
            if (event.currentTarget.hasPointerCapture(event.pointerId)) pickAt(event);
          }}
          onKeyDown={onAreaKey}
          style={{ backgroundColor: pure }}
          className="relative h-36 cursor-crosshair touch-none rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-white/70"
        >
          <div className="color-picker-area pointer-events-none absolute inset-0 rounded-lg" />
          <span
            aria-hidden="true"
            style={{
              left: `${hsv.s * 100}%`,
              top: `${(1 - hsv.v) * 100}%`,
              backgroundColor: hsvToHex(hsv),
            }}
            className="pointer-events-none absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.35),0_2px_6px_rgb(0_0_0/0.35)]"
          />
        </div>

        <SliderPrimitive.Root
          aria-label="Matiz"
          min={0}
          max={359}
          step={1}
          value={[Math.round(hsv.h)]}
          onValueChange={([h = 0]) => {
            commit({ ...hsv, h });
          }}
          className="relative mt-3 flex h-4 touch-none items-center select-none"
        >
          <SliderPrimitive.Track className="color-picker-hue relative h-3 grow rounded-full">
            <SliderPrimitive.Range className="absolute h-full" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb
            aria-label="Matiz"
            style={{ backgroundColor: pure }}
            className="block size-4 rounded-full border-2 border-white shadow-[0_0_0_1px_rgb(0_0_0/0.35),0_2px_6px_rgb(0_0_0/0.35)] outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          />
        </SliderPrimitive.Root>

        <div className="mt-3 flex items-center gap-2">
          <span
            aria-hidden="true"
            className="size-9 shrink-0 rounded-lg border border-white/15"
            style={{ backgroundColor: value }}
          />
          <input
            aria-label="Código da cor"
            spellCheck={false}
            maxLength={7}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              const parsed = parseHexColor(event.target.value);
              // Só a forma longa vira cor durante a digitação: "#12" não é "#112222".
              if (parsed && event.target.value.replace('#', '').length === 6) {
                commit(hexToHsv(parsed));
              }
            }}
            onBlur={() => {
              const parsed = parseHexColor(text);
              if (parsed) commit(hexToHsv(parsed));
              else setText(value);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
            className="h-9 min-w-0 flex-1 rounded-lg border border-panel-border bg-panel-strong px-2.5 font-mono text-sm uppercase outline-none focus-visible:ring-2 focus-visible:ring-white/70"
          />
        </div>

        <div role="group" aria-label="Cores prontas" className="mt-3 grid grid-cols-10 gap-1.5">
          {COLOR_SWATCHES.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={swatch}
              aria-pressed={swatch === value}
              onClick={() => {
                commit(hexToHsv(swatch));
              }}
              style={{ backgroundColor: swatch }}
              className={cn(
                'aspect-square rounded-md border border-white/15 outline-none focus-visible:ring-2 focus-visible:ring-white/70',
                swatch === value && 'ring-2 ring-white ring-offset-1 ring-offset-popover',
              )}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
