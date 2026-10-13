import { describe, expect, it } from 'vitest';

import { notchShape, windowSize } from '@/notch/shape';

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

  it('expandido (aba + player compacto), ocupa 588 × 216 no topo e 260 × 428 nas laterais', () => {
    expect(windowSize('top', notchShape('top', 'expanded'))).toEqual({ width: 588, height: 216 });
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
