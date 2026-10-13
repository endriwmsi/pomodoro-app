import { Volume1, Volume2, VolumeX } from 'lucide-react';
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/** Intervalo mínimo entre envios ao backend enquanto se arrasta. */
const SEND_INTERVAL_MS = 80;
const KEY_STEP = 0.05;

interface VolumeSliderProps {
  /** De 0 a 1; `null` quando não há o que controlar. */
  value: number | null;
  onChange: (level: number) => void;
  label: string;
  /** `vertical` (padrão): enche de baixo para cima; `horizontal`: da esquerda para a direita. */
  orientation?: 'vertical' | 'horizontal';
}

/**
 * Controle de volume em forma de pílula, preenchida até o nível atual.
 * Arraste ou clique para ajustar; pelo teclado, setas.
 */
export function VolumeSlider({
  value,
  onChange,
  label,
  orientation = 'vertical',
}: VolumeSliderProps) {
  const track = useRef<HTMLDivElement>(null);
  /** Valor durante o arraste, para o desenho não esperar o backend. */
  const [dragging, setDragging] = useState<number | null>(null);
  const lastSent = useRef(0);

  const vertical = orientation === 'vertical';
  const disabled = value === null;
  const level = dragging ?? value ?? 0;
  const percent = Math.round(level * 100);
  const Icon = level === 0 ? VolumeX : level < 0.5 ? Volume1 : Volume2;

  const levelAt = (event: PointerEvent): number => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.height === 0 || rect.width === 0) return level;
    const fraction = vertical
      ? (rect.bottom - event.clientY) / rect.height
      : (event.clientX - rect.left) / rect.width;
    return Math.min(Math.max(fraction, 0), 1);
  };

  const send = (next: number, force: boolean) => {
    const now = Date.now();
    if (!force && now - lastSent.current < SEND_INTERVAL_MS) return;
    lastSent.current = now;
    onChange(Math.round(next * 100) / 100);
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const next = levelAt(event);
    setDragging(next);
    send(next, true);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging === null) return;
    const next = levelAt(event);
    setDragging(next);
    send(next, false);
  };

  const onPointerUp = () => {
    if (dragging === null) return;
    send(dragging, true);
    setDragging(null);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (disabled) return;
    const delta =
      event.key === 'ArrowUp' || event.key === 'ArrowRight'
        ? KEY_STEP
        : event.key === 'ArrowDown' || event.key === 'ArrowLeft'
          ? -KEY_STEP
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    send(Math.min(Math.max(level + delta, 0), 1), true);
  };

  const animated = dragging === null ? 'duration-150 ease-out' : 'duration-0';

  return (
    <div
      ref={track}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={label}
      aria-orientation={orientation}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-valuetext={`${String(percent)}%`}
      aria-disabled={disabled || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      className={`relative shrink-0 touch-none overflow-hidden bg-white/12 outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
        vertical ? 'h-full w-8 rounded-2xl' : 'h-6 w-full rounded-full'
      } ${disabled ? 'opacity-40' : vertical ? 'cursor-ns-resize' : 'cursor-ew-resize'}`}
    >
      <div
        style={vertical ? { height: `${String(percent)}%` } : { width: `${String(percent)}%` }}
        className={
          vertical
            ? `absolute inset-x-0 bottom-0 rounded-2xl bg-linear-to-t from-accent/70 to-accent transition-[height] ${animated}`
            : `absolute inset-y-0 left-0 rounded-full bg-linear-to-r from-accent/70 to-accent transition-[width] ${animated}`
        }
      />
      <Icon
        size={13}
        aria-hidden="true"
        className={`absolute text-white mix-blend-difference ${
          vertical ? 'bottom-1.5 left-1/2 -translate-x-1/2' : 'top-1/2 left-2 -translate-y-1/2'
        }`}
      />
    </div>
  );
}
