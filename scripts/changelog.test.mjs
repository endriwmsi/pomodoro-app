import { describe, expect, it } from 'vitest';

import { notes, promote, unreleased } from './changelog.mjs';

const CHANGELOG = `# Changelog

Texto de abertura.

## [Não lançado]

### Adicionado

- Algo novo.

## [0.2.0] — 2026-10-15

### Adicionado

- Primeira versão.
`;

describe('changelog', () => {
  it('lê o que está em "Não lançado"', () => {
    expect(unreleased(CHANGELOG)).toBe('### Adicionado\n\n- Algo novo.');
  });

  it('lê as notas de uma versão fechada, só dela', () => {
    expect(notes(CHANGELOG, '0.2.0')).toBe('### Adicionado\n\n- Primeira versão.');
    expect(notes(CHANGELOG, '9.9.9')).toBeNull();
  });

  it('fecha "Não lançado" como a nova versão e deixa uma seção vazia', () => {
    const promoted = promote(CHANGELOG, '0.3.0', '2026-11-01');

    expect(unreleased(promoted)).toBe('');
    expect(notes(promoted, '0.3.0')).toBe('### Adicionado\n\n- Algo novo.');
    expect(notes(promoted, '0.2.0')).toBe('### Adicionado\n\n- Primeira versão.');
    expect(promoted).toContain('## [0.3.0] — 2026-11-01');
    expect(promoted.indexOf('[Não lançado]')).toBeLessThan(promoted.indexOf('[0.3.0]'));
    expect(promoted.indexOf('[0.3.0]')).toBeLessThan(promoted.indexOf('[0.2.0]'));
  });

  it('recusa publicar com "Não lançado" vazio', () => {
    const empty = CHANGELOG.replace('### Adicionado\n\n- Algo novo.\n\n', '');

    expect(() => promote(empty, '0.3.0', '2026-11-01')).toThrow(/vazia/);
  });

  it('funciona quando "Não lançado" é a última seção', () => {
    const only = '# Changelog\n\n## [Não lançado]\n\n- Algo.\n';

    expect(promote(only, '0.1.0', '2026-01-01')).toBe(
      '# Changelog\n\n## [Não lançado]\n\n## [0.1.0] — 2026-01-01\n\n- Algo.\n\n',
    );
  });
});
