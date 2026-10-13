import type { NotchLayout, NotchPosition } from '@/lib/commands';

/**
 * Forma do notch, em pixels lógicos e em relação à borda da tela: `along`
 * acompanha a borda, `depth` avança para dentro. `flare` é o raio das abas
 * côncavas que ligam o corpo à borda; `radius`, o dos cantos externos.
 *
 * A janela mede `along + 2 × flare` por `depth`. Esses totais precisam ser
 * iguais aos de `edge_size` em `src-tauri/src/windows/notch.rs` (um teste
 * confere).
 */
export interface NotchShape {
  along: number;
  depth: number;
  flare: number;
  radius: number;
}

/** Espaço reservado ao player compacto, ao lado (topo) ou abaixo (laterais) da aba. */
export const MINI_PLAYER_SIZE = 120;

const COLLAPSED: NotchShape = { along: 132, depth: 12, flare: 8, radius: 10 };
const OPEN = { flare: 24, radius: 30 };

const SHAPES: Record<'top' | 'side', Record<NotchLayout, NotchShape>> = {
  top: {
    collapsed: COLLAPSED,
    // Uma aba (420) mais o player compacto.
    expanded: { along: 420 + MINI_PLAYER_SIZE, depth: 216, ...OPEN },
    // Só o player de música.
    compact: { along: 380, depth: 216, ...OPEN },
  },
  side: {
    collapsed: COLLAPSED,
    expanded: { along: 260 + MINI_PLAYER_SIZE, depth: 260, ...OPEN },
    // O player completo, empilhado: capa, faixa, controles, progresso e volume.
    compact: { along: 340, depth: 260, ...OPEN },
  },
};

export function notchShape(position: NotchPosition, layout: NotchLayout): NotchShape {
  return SHAPES[position === 'top' ? 'top' : 'side'][layout];
}

/** Ordem de tamanho dos layouts: para saber se uma troca aumenta ou reduz a janela. */
export const LAYOUT_RANK: Record<NotchLayout, number> = { collapsed: 0, compact: 1, expanded: 2 };

/** Tamanho da janela (largura × altura) que comporta a forma. */
export function windowSize(position: NotchPosition, shape: NotchShape) {
  const along = shape.along + 2 * shape.flare;
  return position === 'top'
    ? { width: along, height: shape.depth }
    : { width: shape.depth, height: along };
}

interface EdgeLayout {
  /** Alinha a forma dentro da janela, encostada na borda. */
  window: string;
  /** Empilha aba, corpo e aba ao longo da borda. */
  stack: string;
  /** Centro do círculo vazado de cada aba (primeira e segunda). */
  flareCenters: readonly [string, string];
  /** Cantos arredondados do corpo: só os que não tocam a borda. */
  bodyRadius: (radius: number) => string;
}

export const EDGE_LAYOUT: Record<NotchPosition, EdgeLayout> = {
  top: {
    window: 'items-start justify-center',
    stack: 'flex-row items-start',
    flareCenters: ['0% 100%', '100% 100%'],
    bodyRadius: (r) => `0 0 ${r}px ${r}px`,
  },
  left: {
    window: 'items-center justify-start',
    stack: 'flex-col items-start',
    flareCenters: ['100% 0%', '100% 100%'],
    bodyRadius: (r) => `0 ${r}px ${r}px 0`,
  },
  right: {
    window: 'items-center justify-end',
    stack: 'flex-col items-end',
    flareCenters: ['0% 0%', '0% 100%'],
    bodyRadius: (r) => `${r}px 0 0 ${r}px`,
  },
};
