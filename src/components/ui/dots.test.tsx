import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { DotColumns } from '@/components/ui/DotColumns';
import { GLYPHS, litDots } from '@/components/ui/dotMatrix';
import { DotMatrixText } from '@/components/ui/DotMatrixText';

function countOnes(glyph: readonly string[]): number {
  return glyph.join('').replaceAll('0', '').length;
}

describe('DotMatrixText', () => {
  it('todo glifo tem 7 linhas de mesma largura', () => {
    for (const [char, glyph] of Object.entries(GLYPHS)) {
      expect(glyph, `glifo "${char}"`).toHaveLength(7);
      expect(new Set(glyph.map((row) => row.length)).size, `glifo "${char}"`).toBe(1);
    }
  });

  it('desenha um ponto por célula acesa e expõe o texto como nome acessível', () => {
    const { container } = render(<DotMatrixText text="25:00" />);

    const expected = ['2', '5', ':', '0', '0'].reduce(
      (total, char) => total + countOnes(GLYPHS[char] ?? []),
      0,
    );
    expect(screen.getByRole('img', { name: '25:00' })).toBeInTheDocument();
    expect(container.querySelectorAll('circle')).toHaveLength(expected);
  });

  it('usa o rótulo informado e ignora caracteres desconhecidos', () => {
    const { container } = render(<DotMatrixText text="?" label="Sem dados" />);

    expect(screen.getByRole('img', { name: 'Sem dados' })).toBeInTheDocument();
    expect(container.querySelectorAll('circle')).toHaveLength(0);
  });
});

describe('DotColumns', () => {
  it('calcula os pontos acesos proporcionalmente, com mínimo de um', () => {
    expect(litDots(0, 6, 6)).toBe(0);
    expect(litDots(1, 6, 6)).toBe(1);
    expect(litDots(6, 6, 6)).toBe(6);
    expect(litDots(1, 40, 6)).toBe(1);
    expect(litDots(20, 40, 6)).toBe(3);
    expect(litDots(99, 40, 6)).toBe(6);
  });

  it('acende um ponto por unidade quando os valores cabem na coluna', () => {
    const { container } = render(
      <DotColumns values={[0, 2, 5]} labels={['A', 'B', 'C']} label="Exemplo" rows={6} />,
    );

    expect(screen.getByRole('img', { name: 'Exemplo' })).toBeInTheDocument();
    expect(container.querySelectorAll('[data-lit="true"]')).toHaveLength(7);
    expect(container.querySelectorAll('[data-lit="false"]')).toHaveLength(11);
  });

  it('não acende nada quando não há dados', () => {
    const { container } = render(
      <DotColumns values={[0, 0, 0]} labels={['A', 'B', 'C']} label="Vazio" />,
    );

    expect(container.querySelectorAll('[data-lit="true"]')).toHaveLength(0);
  });
});
