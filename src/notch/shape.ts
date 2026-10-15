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

/**
 * Espaço reservado ao player compacto: a largura dele ao lado da aba (topo) e
 * a altura dele abaixo da aba (laterais).
 */
export const MINI_PLAYER_WIDTH = 160;
export const MINI_PLAYER_HEIGHT = 120;

const COLLAPSED: NotchShape = { along: 132, depth: 12, flare: 8, radius: 10 };
const OPEN = { flare: 24, radius: 30 };

const SHAPES: Record<'top' | 'side', Record<NotchLayout, NotchShape>> = {
  top: {
    collapsed: COLLAPSED,
    // Uma aba (420) mais o player compacto.
    expanded: { along: 420 + MINI_PLAYER_WIDTH, depth: 216, ...OPEN },
    // Só o player de música.
    compact: { along: 380, depth: 216, ...OPEN },
  },
  side: {
    collapsed: COLLAPSED,
    expanded: { along: 260 + MINI_PLAYER_HEIGHT, depth: 260, ...OPEN },
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

/**
 * Espessura da borda animada: `middle` em todo o lado comprido do corpo e
 * `ends` ao longo das abas, até a tela; a troca acontece nos cantos.
 */
export const BORDER_GLOW_WIDTH = { middle: 2, ends: 1 } as const;

const ARC_STEPS = 16;
const LINE_STEPS = 4;

interface GlowPoint {
  /** Ao longo da borda e para dentro da tela, como em `NotchShape`. */
  along: number;
  depth: number;
  /** Normal unitária apontando para dentro do notch. */
  inAlong: number;
  inDepth: number;
  width: number;
}

/** Duas casas decimais, sem "-0.00" (o `|| 0` troca -0 por 0). */
function fixed(value: number): string {
  return (Math.round(value * 100) / 100 || 0).toFixed(2);
}

/**
 * Recolhido, a aba termina (na vertical) abaixo do ponto em que o canto do
 * corpo começa a curvar, e entre as duas curvas sobra uma lasca transparente.
 * O contorno suave as liga pela reta tangente às duas: este é o ângulo, na
 * aba, em que ela sai (0 = na borda da tela, π/2 = no fim da aba); no canto,
 * a reta chega no ângulo `tangent + π/2`.
 */
function tangentAngle(): number {
  const { depth, flare, radius } = COLLAPSED;
  // Mesma direção e pontos alinhados: (f + r)·sen φ − (d − r − f)·cos φ = f + r.
  const k = flare + radius;
  const m = depth - radius - flare;
  return Math.atan2(m, k) + Math.asin(k / Math.hypot(k, m));
}

/** Ponto do canto do corpo no ângulo `angle` (π = começo, junto à tela; π/2 = fundo). */
function cornerPoint(angle: number) {
  const { depth, flare, radius } = COLLAPSED;
  return {
    along: flare + radius + radius * Math.cos(angle),
    depth: depth - radius + radius * Math.sin(angle),
  };
}

/**
 * Metade do contorno suave do notch recolhido, da ponta da aba (na borda da
 * tela) até o fim do canto: aba, reta tangente e canto, em que a espessura
 * cresce de `ends` até `middle`. O fundo, reto, liga uma metade à outra.
 */
function glowHalf(): GlowPoint[] {
  const { flare } = COLLAPSED;
  const { middle, ends } = BORDER_GLOW_WIDTH;
  const tangent = tangentAngle();
  const [inAlong, inDepth] = [Math.sin(tangent), -Math.cos(tangent)];
  const half: GlowPoint[] = [];
  // Aba: quarto de círculo de centro (0, flare); o notch fica do lado de fora.
  for (let i = 0; i <= ARC_STEPS; i++) {
    const angle = (i / ARC_STEPS) * tangent;
    half.push({
      along: flare * Math.sin(angle),
      depth: flare - flare * Math.cos(angle),
      inAlong: Math.sin(angle),
      inDepth: -Math.cos(angle),
      width: ends,
    });
  }
  // Reta tangente, por cima da lasca.
  const from = half[half.length - 1] ?? { along: 0, depth: 0 };
  const to = cornerPoint(tangent + Math.PI / 2);
  for (let i = 1; i < LINE_STEPS; i++) {
    const t = i / LINE_STEPS;
    half.push({
      along: from.along + t * (to.along - from.along),
      depth: from.depth + t * (to.depth - from.depth),
      inAlong,
      inDepth,
      width: ends,
    });
  }
  // Canto, do ponto da tangente até o fundo.
  const start = tangent + Math.PI / 2;
  for (let i = 0; i <= ARC_STEPS; i++) {
    const progress = i / ARC_STEPS;
    const angle = start - progress * (start - Math.PI / 2);
    half.push({
      ...cornerPoint(angle),
      inAlong: -Math.cos(angle),
      inDepth: -Math.sin(angle),
      // Suave nas duas pontas do canto: sem quina na borda de dentro.
      width: ends + ((middle - ends) * (1 - Math.cos(Math.PI * progress))) / 2,
    });
  }
  return half;
}

/** Converte (ao longo, para dentro) em pixels da janela, conforme a borda. */
function windowPoint(position: NotchPosition) {
  const { depth } = COLLAPSED;
  return (along: number, inward: number) => {
    const [x, y] =
      position === 'top'
        ? [along, inward]
        : position === 'left'
          ? [inward, along]
          : [depth - inward, along];
    return `${fixed(x)} ${fixed(y)}`;
  };
}

/** O mesmo lado, espelhado no meio do notch. */
function mirror<T extends { along: number }>(point: T): T {
  const { along, flare } = COLLAPSED;
  return { ...point, along: along + 2 * flare - point.along };
}

/**
 * Forma da borda animada do notch recolhido, como `path()` para `clip-path`,
 * em pixels da janela: uma faixa que segue o contorno inteiro, da ponta de uma
 * aba à da outra, com `ends` ao longo das abas e `middle` no fundo.
 */
export function borderGlowPath(position: NotchPosition): string {
  const half = glowHalf();
  const contour = [
    ...half,
    ...[...half].reverse().map((point) => ({ ...mirror(point), inAlong: -point.inAlong })),
  ];
  const toWindow = windowPoint(position);
  const outer = contour.map((point) => toWindow(point.along, point.depth));
  const inner = contour.map((point) =>
    toWindow(point.along + point.inAlong * point.width, point.depth + point.inDepth * point.width),
  );
  return `M${outer.join(' L')} L${inner.reverse().join(' L')} Z`;
}

/**
 * Preenchimento da lasca entre a aba e o canto (ver `tangentAngle`) e da
 * emenda entre os dois, como `path()` para `clip-path`: com ele, o contorno
 * que a borda segue é a forma desenhada de fato. Um trecho para cada lado.
 */
export function borderFillPath(position: NotchPosition): string {
  const { depth, flare, radius } = COLLAPSED;
  const tangent = tangentAngle();
  // A reta tangente por fora; por dentro, o polígono avança pelo corpo e pela
  // aba (mesma cor), para não deixar bordas suavizadas encostadas umas nas
  // outras — elas mostrariam um fio claro. Sobe até a tela pela emenda.
  const side = [
    { along: flare * Math.sin(tangent), depth: flare - flare * Math.cos(tangent) },
    cornerPoint(tangent + Math.PI / 2),
    { along: flare + radius, depth: depth - radius },
    { along: flare + 1, depth: 0 },
    { along: flare - 1, depth: 0 },
  ];
  const toWindow = windowPoint(position);
  const subpath = (points: { along: number; depth: number }[]) =>
    `M${points.map((point) => toWindow(point.along, point.depth)).join(' L')} Z`;
  return `${subpath(side)} ${subpath(side.map(mirror))}`;
}

/**
 * Recorte de uma aba (`index` 0 ou 1, na ordem do empilhamento) para o
 * contorno suave: a ponta da aba que passa da reta tangente (ver
 * `tangentAngle`) ficaria para fora da borda. Em porcentagens do quadrado da
 * aba, como `polygon()` para `clip-path`.
 */
export function flareTrim(position: NotchPosition, index: 0 | 1): string {
  const tangent = tangentAngle();
  const tip = { along: Math.sin(tangent), depth: 1 - Math.cos(tangent) };
  // Onde a reta tangente cruza o lado da aba que encosta no corpo.
  const exit = tip.depth + (1 - tip.along) * Math.tan(tangent);
  // Aba da esquerda, no topo: tudo menos a cunha entre a reta e o centro do círculo.
  const base = [
    [0, 0],
    [1, 0],
    [1, Math.min(exit, 1)],
    [tip.along, tip.depth],
    [0, 1],
  ] as const;
  const percent = (value: number) => `${fixed(value * 100)}%`;
  return `polygon(${base
    .map(([along, depth]) => {
      const at = index === 0 ? along : 1 - along;
      const [x, y] =
        position === 'top' ? [at, depth] : position === 'left' ? [depth, at] : [1 - depth, at];
      return `${percent(x)} ${percent(y)}`;
    })
    .join(', ')})`;
}
