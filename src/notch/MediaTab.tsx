import { Music, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward } from 'lucide-react';

import { cn } from '@/lib/utils';
import { SeekBar } from '@/notch/SeekBar';
import { NOTCH_ICON_BUTTON } from '@/notch/shared';
import { VolumeSlider } from '@/notch/VolumeSlider';
import { useMediaStore } from '@/stores/media';

const REPEAT_LABEL = {
  none: 'Repetição desligada',
  list: 'Repetindo a lista',
  track: 'Repetindo a faixa',
} as const;

/**
 * Aba de música: mostra o que está tocando em outros aplicativos e permite
 * voltar, tocar/pausar, avançar, alternar ordem aleatória e repetição e
 * ajustar a posição na faixa e o volume. No topo, a capa fica à esquerda e o
 * volume, em pé, à direita; nas laterais (`stacked`) tudo é empilhado, com o
 * volume deitado abaixo dos controles. O estado vem de `stores/media.ts`, atualizado pelo notch.
 */
export function MediaTab({ stacked }: { stacked: boolean }) {
  const state = useMediaStore((store) => store.state);
  const artwork = useMediaStore((store) => store.artwork);
  const act = useMediaStore((store) => store.act);
  const setVolume = useMediaStore((store) => store.setVolume);

  const available = state?.available === true;
  const cover = available ? artwork : null;
  const repeat = state?.repeat ?? 'none';
  const RepeatIcon = repeat === 'track' ? Repeat1 : Repeat;

  const coverBox = (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/10 ${
        stacked ? 'size-24' : 'size-[5.25rem]'
      }`}
    >
      {cover ? (
        <img src={cover} alt="" className="size-full object-cover" />
      ) : (
        <Music size={26} aria-hidden="true" className="text-white/35" />
      )}
    </div>
  );

  const volume = (
    <VolumeSlider
      value={state?.volume ?? null}
      onChange={(level) => void setVolume(level)}
      orientation={stacked ? 'horizontal' : 'vertical'}
      label={state?.volumeScope === 'app' ? 'Volume do aplicativo de música' : 'Volume do sistema'}
    />
  );

  return (
    <div className="flex h-full items-stretch gap-3">
      {stacked ? null : <div className="flex items-center">{coverBox}</div>}

      {/* Título, artista e controles: centralizados. */}
      <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 text-center">
        {stacked ? coverBox : null}
        <div className="w-full min-w-0">
          <p className="truncate text-sm font-medium text-white" title={state?.title}>
            {available ? state.title || 'Sem título' : 'Nada tocando'}
          </p>
          <p className="truncate text-xs text-white/55" title={state?.artist}>
            {available ? state.artist || state.app : 'Inicie uma música em qualquer aplicativo.'}
          </p>
        </div>

        <div className="flex items-center justify-center gap-0.5">
          <button
            type="button"
            aria-label="Ordem aleatória"
            aria-pressed={state?.shuffle === true}
            title={state?.shuffle ? 'Ordem aleatória ligada' : 'Ordem aleatória desligada'}
            disabled={!available || !state.canShuffle}
            onClick={() => void act('toggleShuffle')}
            className={cn(NOTCH_ICON_BUTTON, 'size-7', state?.shuffle && 'text-accent')}
          >
            <Shuffle size={13} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Faixa anterior"
            title="Faixa anterior"
            disabled={!available || !state.canPrevious}
            onClick={() => void act('previous')}
            className={NOTCH_ICON_BUTTON}
          >
            <SkipBack size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={state?.playing ? 'Pausar a música' : 'Tocar a música'}
            title={state?.playing ? 'Pausar' : 'Tocar'}
            disabled={!available}
            onClick={() => void act('playPause')}
            className={cn(
              NOTCH_ICON_BUTTON,
              'bg-white text-black hover:bg-white hover:text-black hover:opacity-90',
            )}
          >
            {state?.playing ? (
              <Pause size={15} aria-hidden="true" />
            ) : (
              <Play size={15} aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            aria-label="Próxima faixa"
            title="Próxima faixa"
            disabled={!available || !state.canNext}
            onClick={() => void act('next')}
            className={NOTCH_ICON_BUTTON}
          >
            <SkipForward size={15} aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Repetição"
            aria-pressed={repeat !== 'none'}
            title={REPEAT_LABEL[repeat]}
            disabled={!available || !state.canRepeat}
            onClick={() => void act('cycleRepeat')}
            className={cn(NOTCH_ICON_BUTTON, 'size-7', repeat !== 'none' && 'text-accent')}
          >
            <RepeatIcon size={13} aria-hidden="true" />
          </button>
        </div>

        <SeekBar />
        {stacked ? volume : null}
      </div>

      {stacked ? null : volume}
    </div>
  );
}
