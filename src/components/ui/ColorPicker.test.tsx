import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ColorPicker } from '@/components/ui/ColorPicker';

/** O seletor controlado, como numa tela de verdade; `onChange` registra as mudanças. */
function Harness({ initial, onChange }: { initial: string; onChange: (hex: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <ColorPicker
      aria-label="Cor"
      value={value}
      onChange={(hex) => {
        setValue(hex);
        onChange(hex);
      }}
    />
  );
}

function open(initial = '#ff0000') {
  const onChange = vi.fn<(hex: string) => void>();
  render(<Harness initial={initial} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cor' }));
  return onChange;
}

describe('ColorPicker', () => {
  it('mostra a amostra e o código no botão e abre o seletor', () => {
    open('#8b5cf6');
    expect(screen.getByRole('button', { name: 'Cor' })).toHaveTextContent('#8b5cf6');
    expect(screen.getByRole('slider', { name: 'Saturação e brilho' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Código da cor' })).toHaveValue('#8b5cf6');
    expect(screen.getByRole('button', { name: '#8b5cf6' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('muda saturação e brilho pelo teclado', () => {
    const onChange = open('#ff0000');
    const area = screen.getByRole('slider', { name: 'Saturação e brilho' });

    fireEvent.keyDown(area, { key: 'ArrowDown', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith('#e60000');
    fireEvent.keyDown(area, { key: 'ArrowLeft', shiftKey: true });
    expect(onChange).toHaveBeenLastCalledWith('#e61717');
    expect(area).toHaveAttribute('aria-valuetext', 'Saturação 90%, brilho 90%');
  });

  it('muda o matiz pela faixa, mantendo saturação e brilho', () => {
    const onChange = open('#ff0000');
    const hue = screen.getAllByRole('slider', { name: 'Matiz' })[0];
    if (!hue) throw new Error('faixa de matiz não renderizada');

    fireEvent.keyDown(hue, { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('#ff0004');
    fireEvent.keyDown(hue, { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('#ff0000');
  });

  it('aceita o código digitado e desfaz o que não é cor', () => {
    const onChange = open('#ff0000');
    const hex = screen.getByRole('textbox', { name: 'Código da cor' });

    fireEvent.change(hex, { target: { value: '22C55E' } });
    expect(onChange).toHaveBeenLastCalledWith('#22c55e');

    fireEvent.change(hex, { target: { value: '#0f8' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    fireEvent.blur(hex);
    expect(onChange).toHaveBeenLastCalledWith('#00ff88');

    fireEvent.change(hex, { target: { value: 'azul' } });
    fireEvent.blur(hex);
    expect(hex).toHaveValue('#00ff88');
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('escolhe uma das cores prontas', () => {
    const onChange = open('#ff0000');
    fireEvent.click(screen.getByRole('button', { name: '#14b8a6' }));
    expect(onChange).toHaveBeenLastCalledWith('#14b8a6');
    expect(screen.getByRole('button', { name: 'Cor' })).toHaveTextContent('#14b8a6');
  });
});
