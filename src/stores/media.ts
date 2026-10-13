import { create } from 'zustand';

import {
  mediaControl,
  mediaGetArtwork,
  mediaGetState,
  mediaSeek,
  mediaSetVolume,
  type MediaAction,
  type MediaState,
} from '@/lib/commands';

/**
 * Espelho da mídia em reprodução no sistema, compartilhado pela aba Música e
 * pelo player compacto do notch. Só é atualizado quando alguém chama
 * `refresh` — o notch faz isso periodicamente enquanto está aberto.
 */
interface MediaStore {
  /** `null` até a primeira leitura. */
  state: MediaState | null;
  /** Quando `state` chegou (`Date.now()`): a posição na faixa avança a partir daí. */
  receivedAt: number;
  /** Capa da faixa atual como `data:` URL. */
  artwork: string | null;
  refresh: () => Promise<void>;
  act: (action: MediaAction) => Promise<void>;
  /** Volume de 0 a 1. */
  setVolume: (level: number) => Promise<void>;
  seek: (positionMs: number) => Promise<void>;
}

function report(error: unknown) {
  console.error('Falha ao consultar ou controlar a mídia', error);
}

function trackOf(state: MediaState | null): string | null {
  return state?.available ? `${state.app}|${state.artist}|${state.title}` : null;
}

export const useMediaStore = create<MediaStore>((set, get) => {
  /** Adota o novo estado e, se a faixa mudou, busca a capa (a parte cara). */
  const adopt = (next: MediaState) => {
    const changed = trackOf(next) !== trackOf(get().state);
    const receivedAt = Date.now();
    set(changed ? { state: next, receivedAt, artwork: null } : { state: next, receivedAt });
    if (!changed || !next.available) return;
    const track = trackOf(next);
    mediaGetArtwork()
      .then((artwork) => {
        // Descarta a capa se a faixa já mudou de novo enquanto ela vinha.
        if (trackOf(get().state) === track) set({ artwork });
      })
      .catch(report);
  };

  const run = async (request: Promise<MediaState>) => {
    try {
      adopt(await request);
    } catch (error) {
      report(error);
    }
  };

  return {
    state: null,
    receivedAt: 0,
    artwork: null,
    refresh: () => run(mediaGetState()),
    act: (action) => run(mediaControl(action)),
    setVolume: (level) => run(mediaSetVolume(level)),
    seek: (positionMs) => run(mediaSeek(positionMs)),
  };
});
