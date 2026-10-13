import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

import { useMediaStore } from '@/stores/media';

/** De quanto em quanto tempo a barra avança sozinha enquanto a faixa toca. */
const TICK_MS = 1_000;
const KEY_STEP_MS = 5_000;

/** `83000` → `1:23`. */
function clock(ms: number): string {
  const seconds = Math.floor(ms / 1_000);
  return `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Barra de progresso da faixa. O backend informa a posição a cada leitura da
 * mídia; entre uma e outra, a barra avança pelo relógio local. Arrastar (ou
 * as setas) muda a posição — enviada ao soltar, uma vez só.
 *
 * `compact`: sem os tempos, para o player compacto.
 */
export function SeekBar({ compact = false }: { compact?: boolean }) {
  const state = useMediaStore((store) => store.state);
  const receivedAt = useMediaStore((store) => store.receivedAt);
  const seek = useMediaStore((store) => store.seek);

  const track = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(() => Date.now());
  /** Posição durante o arraste, em ms. */
  const [dragging, setDragging] = useState<number | null>(null);

  const duration = state?.available ? state.durationMs : null;
  const playing = state?.playing === true;

  useEffect(() => {
    if (!playing || duration === null) return;
    const timer = window.setInterval(() => {
      setNow(Date.now());
    }, TICK_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [playing, duration]);

  if (duration === null || duration <= 0) {
    // Sem duração conhecida (rádio, transmissão ao vivo): só o trilho vazio.
    return compact ? null : (
      <div aria-hidden="true" className="flex w-full items-center gap-2">
        <span className="w-7 text-right text-[0.625rem] text-white/30 tabular-nums">–:––</span>
        <div className="h-1 flex-1 rounded-full bg-white/12" />
        <span className="w-7 text-[0.625rem] text-white/30 tabular-nums">–:––</span>
      </div>
    );
  }

  const elapsed = playing ? Math.max(now - receivedAt, 0) : 0;
  const position = dragging ?? Math.min((state?.positionMs ?? 0) + elapsed, duration);
  const percent = (position / duration) * 100;
  const disabled = state?.canSeek !== true;

  const positionAt = (clientX: number): number => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return position;
    return Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) * duration;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(positionAt(event.clientX));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging !== null) setDragging(positionAt(event.clientX));
  };

  const onPointerUp = () => {
    if (dragging === null) return;
    void seek(Math.round(dragging));
    setDragging(null);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (disabled) return;
    const delta =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? KEY_STEP_MS
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? -KEY_STEP_MS
          : 0;
    if (delta === 0) return;
    event.preventDefault();
    void seek(Math.round(Math.min(Math.max(position + delta, 0), duration)));
  };

  const bar = (
    <div
      ref={track}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label="Posição na faixa"
      aria-orientation="horizontal"
      aria-valuemin={0}
      aria-valuemax={Math.round(duration / 1_000)}
      aria-valuenow={Math.round(position / 1_000)}
      aria-valuetext={`${clock(position)} de ${clock(duration)}`}
      aria-disabled={disabled || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      // A área de toque é mais alta que o trilho desenhado.
      className={`group flex h-3 min-w-0 flex-1 touch-none items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/70 ${
        disabled ? '' : 'cursor-pointer'
      }`}
    >
      <div className="relative h-1 w-full rounded-full bg-white/15">
        <div
          style={{ width: `${String(percent)}%` }}
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
        />
        {disabled ? null : (
          <span
            style={{ left: `${String(percent)}%` }}
            className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 ${
              dragging === null ? 'opacity-0' : 'opacity-100'
            }`}
          />
        )}
      </div>
    </div>
  );

  if (compact) return <div className="flex w-full">{bar}</div>;

  return (
    <div className="flex w-full items-center gap-2">
      <span className="w-7 shrink-0 text-right text-[0.625rem] text-white/55 tabular-nums">
        {clock(position)}
      </span>
      {bar}
      <span className="w-7 shrink-0 text-[0.625rem] text-white/55 tabular-nums">
        {clock(duration)}
      </span>
    </div>
  );
}
