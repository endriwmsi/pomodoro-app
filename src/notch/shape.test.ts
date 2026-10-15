import { describe, expect, it } from 'vitest';

import {
  BORDER_GLOW_WIDTH,
  borderFillPath,
  borderGlowPath,
  flareTrim,
  notchShape,
  windowSize,
} from '@/notch/shape';

// Os totais abaixo são os de `edge_size` em src-tauri/src/windows/notch.rs. Se um lado mudar, o outro precisa mudar junto.
describe('forma do notch', () => {
  it('recolhido, ocupa 148 × 12 ao longo da borda', () => {
    expect(windowSize('top', notchShape('top', 'collapsed'))).toEqual({ width: 148, height: 12 });
    expect(windowSize('left', notchShape('left', 'collapsed'))).toEqual({ width: 12, height: 148 });
    expect(windowSize('right', notchShape('right', 'collapsed'))).toEqual({
      width: 12,
      height: 148,
    });
  });

  it('expandido (aba + player compacto), ocupa 628 × 216 no topo e 260 × 428 nas laterais', () => {
    expect(windowSize('top', notchShape('top', 'expanded'))).toEqual({ width: 628, height: 216 });
    expect(windowSize('left', notchShape('left', 'expanded'))).toEqual({ width: 260, height: 428 });
    expect(windowSize('right', notchShape('right', 'expanded'))).toEqual({
      width: 260,
      height: 428,
    });
  });

  it('compacto (só o player de música), ocupa 428 × 216 no topo e 260 × 388 nas laterais', () => {
    expect(windowSize('top', notchShape('top', 'compact'))).toEqual({ width: 428, height: 216 });
    expect(windowSize('left', notchShape('left', 'compact'))).toEqual({ width: 260, height: 388 });
  });
});

/** Pontos do `path()`: primeiro o contorno, depois a borda de dentro, de volta. */
function points(path: string): [number, number][] {
  return path
    .replace(/^M/, '')
    .replace(/ Z$/, '')
    .split(' L')
    .map((pair) => pair.split(' ').map(Number) as [number, number]);
}

describe('borda animada do notch recolhido', () => {
  it('segue o contorno de uma ponta à outra das abas, colada à borda da tela', () => {
    const all = points(borderGlowPath('top'));
    const outer = all.slice(0, all.length / 2);
    expect(outer[0]).toEqual([0, 0]);
    expect(outer[outer.length - 1]).toEqual([148, 0]);
    for (const [x, y] of outer) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(148);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(12);
    }
  });

  it('passa da aba para o canto pela reta tangente às duas curvas', () => {
    const outer = points(borderGlowPath('top'));
    // Ponto de tangência na aba (ângulo de 53,13°) e no canto do corpo.
    expect(outer).toContainEqual([6.4, 3.2]);
    expect(outer).toContainEqual([10, 8]);
    expect(outer).toContainEqual([141.6, 3.2]);
    expect(outer).toContainEqual([138, 8]);
  });

  it('tem 1 px ao longo das abas e 2 px constantes no fundo (a borda de dentro é reta)', () => {
    const all = points(borderGlowPath('top'));
    const half = all.length / 2;
    const outer = all.slice(0, half);
    const inner = all.slice(half).reverse();
    expect(inner[0]).toEqual([0, -BORDER_GLOW_WIDTH.ends]);
    expect(inner[half - 1]).toEqual([148, -BORDER_GLOW_WIDTH.ends]);
    const bottom = outer
      .map((point, i) => [point, inner[i] ?? [0, 0]] as const)
      .filter(([[, y]]) => y === 12);
    expect(bottom.length).toBeGreaterThanOrEqual(2);
    for (const [, [, innerY]] of bottom) {
      expect(12 - innerY).toBeCloseTo(BORDER_GLOW_WIDTH.middle, 2);
    }
  });

  it('nas laterais, é a mesma faixa em pé, junto à borda da tela', () => {
    const top = points(borderGlowPath('top'));
    expect(points(borderGlowPath('left'))).toEqual(top.map(([x, y]) => [y, x]));
    points(borderGlowPath('right')).forEach(([x, y], i) => {
      const [topX, topY] = top[i] ?? [0, 0];
      expect(x).toBeCloseTo(12 - topY, 2);
      expect(y).toBe(topX);
    });
  });

  it('preenche a lasca entre aba e canto, nos dois lados, por fora até a reta tangente', () => {
    const [left, right] = borderFillPath('top').split(' M');
    expect(left).toMatch(/^M6\.40 3\.20 L10\.00 8\.00 /);
    expect(right).toMatch(/^141\.60 3\.20 L138\.00 8\.00 /);
  });

  it('apara a ponta das abas que passa da reta tangente', () => {
    expect(flareTrim('top', 0)).toBe(
      'polygon(0.00% 0.00%, 100.00% 0.00%, 100.00% 66.67%, 80.00% 40.00%, 0.00% 100.00%)',
    );
    expect(flareTrim('top', 1)).toBe(
      'polygon(100.00% 0.00%, 0.00% 0.00%, 0.00% 66.67%, 20.00% 40.00%, 100.00% 100.00%)',
    );
    // Na lateral esquerda, a primeira aba fica em cima, com o círculo no canto superior direito.
    expect(flareTrim('left', 0)).toBe(
      'polygon(0.00% 0.00%, 0.00% 100.00%, 66.67% 100.00%, 40.00% 80.00%, 100.00% 0.00%)',
    );
  });
});
