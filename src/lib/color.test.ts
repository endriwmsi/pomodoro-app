import { describe, expect, it } from 'vitest';

import { hexToHsv, hsvToHex, isHexColor, parseHexColor } from '@/lib/color';

describe('cores', () => {
  it('aceita só #rrggbb como cor gravada', () => {
    expect(isHexColor('#f59e0b')).toBe(true);
    expect(isHexColor('#A1B2C3')).toBe(true);
    for (const bad of ['', '#fff', 'f59e0b', '#f59e0', '#gg0000', 'red']) {
      expect(isHexColor(bad)).toBe(false);
    }
  });

  it('normaliza o que o usuário digita', () => {
    expect(parseHexColor(' F59E0B ')).toBe('#f59e0b');
    expect(parseHexColor('#0f8')).toBe('#00ff88');
    expect(parseHexColor('abc')).toBe('#aabbcc');
    expect(parseHexColor('#12345')).toBeNull();
    expect(parseHexColor('azul')).toBeNull();
  });

  it('converte entre hex e HSV', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(hexToHsv('#00ff00')).toEqual({ h: 120, s: 1, v: 1 });
    expect(hexToHsv('#0000ff')).toEqual({ h: 240, s: 1, v: 1 });
    expect(hexToHsv('#000000')).toEqual({ h: 0, s: 0, v: 0 });
    expect(hexToHsv('#ffffff')).toEqual({ h: 0, s: 0, v: 1 });
    expect(hsvToHex({ h: 300, s: 1, v: 1 })).toBe('#ff00ff');
    expect(hsvToHex({ h: 0, s: 0, v: 0.5 })).toBe('#808080');
  });

  it('volta à mesma cor depois de ida e volta', () => {
    for (const hex of ['#f59e0b', '#22c55e', '#8b5cf6', '#0ea5e9', '#123456', '#fefefe']) {
      expect(hsvToHex(hexToHsv(hex))).toBe(hex);
    }
  });
});
