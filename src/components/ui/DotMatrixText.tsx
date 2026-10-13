/**
 * Texto desenhado em matriz de pontos (7 linhas por glifo), em SVG — sem
 * fonte externa. Cobre apenas o necessário para leituras numéricas; caracteres
 * desconhecidos viram um espaço.
 */

import { GLYPHS } from '@/components/ui/dotMatrix';

const ROWS = 7;

const BLANK = GLYPHS[' '] ?? [];
const DOT_RADIUS = 0.36;

interface Dot {
  x: number;
  y: number;
}

function layout(text: string): { dots: Dot[]; width: number } {
  const dots: Dot[] = [];
  let offset = 0;
  for (const char of text) {
    const glyph = GLYPHS[char] ?? BLANK;
    glyph.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === '1') dots.push({ x: offset + x, y });
      }
    });
    offset += (glyph[0]?.length ?? 0) + 1;
  }
  return { dots, width: Math.max(offset - 1, 1) };
}

interface DotMatrixTextProps {
  text: string;
  /** Altura em pixels; a largura acompanha o texto. */
  size?: number;
  /** Nome acessível. Por padrão, o próprio texto. */
  label?: string;
  className?: string;
}

export function DotMatrixText({ text, size = 28, label, className }: DotMatrixTextProps) {
  const { dots, width } = layout(text);
  return (
    <svg
      role="img"
      aria-label={label ?? text}
      viewBox={`-0.5 -0.5 ${width} ${ROWS}`}
      height={size}
      width={(size * width) / ROWS}
      fill="currentColor"
      className={className}
    >
      {dots.map((dot) => (
        <circle key={`${dot.x}-${dot.y}`} cx={dot.x} cy={dot.y} r={DOT_RADIUS} />
      ))}
    </svg>
  );
}
