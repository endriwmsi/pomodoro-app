import { Music, Pause, Play, SkipBack, SkipForward } from 'lucide-react';

import { cn } from '@/lib/utils';
import { SeekBar } from '@/notch/SeekBar';
import { NOTCH_ICON_BUTTON } from '@/notch/shared';
import { useMediaStore } from '@/stores/media';

/**
 * Player compacto, visível ao lado das demais abas: capa pequena, título e os
 * três controles básicos e o progresso da faixa. A aba Música tem o player
 * completo.
 */
export function MiniPlayer({ horizontal }: { horizontal: boolean }) {
  const state = useMediaStore((store) => store.state);
  const artwork = useMediaStore((store) => store.artwork);
  const act = useMediaStore((store) => store.act);

  const available = state?.available === true;
  const cover = available ? artwork : null;

  return (
    <section
      aria-label="Player de música"
      className="flex h-full w-full min-w-0 flex-col justify-center gap-1.5"
    >
      <div
        className={`flex min-w-0 items-center gap-1.5 ${horizontal ? 'flex-row' : 'flex-col text-center'}`}
      >
        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/10">
          {cover ? (
            <img src={cover} alt="" className="size-full object-cover" />
          ) : (
            <Music size={16} aria-hidden="true" className="text-white/35" />
          )}
        </div>

        <div className={`min-w-0 ${horizontal ? 'flex-1' : 'w-full'}`}>
          <p className="truncate text-[0.6875rem] font-medium text-white/90" title={state?.title}>
            {available ? state.title || 'Sem título' : 'Nada tocando'}
          </p>
          {available ? (
            <p className="truncate text-[0.625rem] text-white/50" title={state.artist}>
              {state.artist || state.app}
            </p>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center">
          <button
            type="button"
            aria-label="Faixa anterior"
            title="Faixa anterior"
            disabled={!available || !state.canPrevious}
            onClick={() => void act('previous')}
            className={cn(NOTCH_ICON_BUTTON, 'size-6')}
          >
            <SkipBack size={12} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={state?.playing ? 'Pausar a música' : 'Tocar a música'}
            title={state?.playing ? 'Pausar' : 'Tocar'}
            disabled={!available}
            onClick={() => void act('playPause')}
            className={cn(
              NOTCH_ICON_BUTTON,
              'size-7 bg-white text-black hover:bg-white hover:text-black hover:opacity-90',
            )}
          >
            {state?.playing ? (
              <Pause size={12} aria-hidden="true" />
            ) : (
              <Play size={12} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            aria-label="Próxima faixa"
            title="Próxima faixa"
            disabled={!available || !state.canNext}
            onClick={() => void act('next')}
            className={cn(NOTCH_ICON_BUTTON, 'size-6')}
          >
            <SkipForward size={12} aria-hidden="true" />
          </button>
        </div>
      </div>
      <SeekBar compact />
    </section>
  );
}
