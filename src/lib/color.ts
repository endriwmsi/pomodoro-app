/**
 * Conversões de cor do seletor de cores (`components/ui/ColorPicker.tsx`).
 * O formato gravado é sempre `#rrggbb` em minúsculas; HSV só existe na
 * interface, porque é nele que o seletor é desenhado (matiz × saturação ×
 * brilho).
 */

/** `h` em graus (0–360); `s` e `v` de 0 a 1. */
export interface Hsv {
  h: number;
  s: number;
  v: number;
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Cores prontas mostradas abaixo do seletor. */
export const COLOR_SWATCHES = [
  '#f59e0b',
  '#ef4444',
  '#ec4899',
  '#8b5cf6',
  '#3b82f6',
  '#0ea5e9',
  '#14b8a6',
  '#22c55e',
  '#eab308',
  '#f4f4f5',
] as const;

/** É `#rrggbb`? É o formato que o backend aceita (`notch.border.color`). */
export function isHexColor(value: string): boolean {
  return HEX.test(value);
}

/**
 * Normaliza o que o usuário digitou: aceita sem `#` e a forma curta `#rgb`.
 * Devolve `null` se não for uma cor.
 */
export function parseHexColor(input: string): string | null {
  const value = input.trim().replace(/^#?/, '#').toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(value)) {
    const [, r = '', g = '', b = ''] = value;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return isHexColor(value) ? value : null;
}

export function hexToHsv(hex: string): Hsv {
  const channel = (start: number) => parseInt(hex.slice(start, start + 2), 16) / 255;
  const [r, g, b] = [channel(1), channel(3), channel(5)];
  const max = Math.max(r, g, b);
  const delta = max - Math.min(r, g, b);
  let h = 0;
  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }
  return { h: (h * 60 + 360) % 360, s: max === 0 ? 0 : delta / max, v: max };
}

export function hsvToHex({ h, s, v }: Hsv): string {
  const channel = (n: number) => {
    const k = (n + h / 60) % 6;
    const value = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(5)}${channel(3)}${channel(1)}`;
}
