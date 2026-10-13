import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/** Define `name` em `target` apenas se o jsdom não o implementar. */
function polyfill(target: object, name: string, value: unknown) {
  if (!(name in target)) {
    Object.defineProperty(target, name, { value, configurable: true, writable: true });
  }
}

const noop = () => undefined;

// APIs usadas pelo Select do Radix (shadcn/ui) que o jsdom não tem.
polyfill(Element.prototype, 'hasPointerCapture', () => false);
polyfill(Element.prototype, 'setPointerCapture', noop);
polyfill(Element.prototype, 'releasePointerCapture', noop);
polyfill(Element.prototype, 'scrollIntoView', noop);
polyfill(
  globalThis,
  'ResizeObserver',
  class {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
  },
);

// O jsdom não avalia media queries: sem preferência, vale o modo claro.
if (typeof window.matchMedia !== 'function') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: () => ({ matches: false, addEventListener: noop, removeEventListener: noop }),
  });
}

afterEach(() => {
  cleanup();
  // Estado global que sobreviveria entre testes. A store de configurações é
  // restaurada em cada arquivo de teste: importá-la aqui a criaria antes dos
  // mocks de módulo.
  localStorage.clear();
  delete document.documentElement.dataset.template;
  delete document.documentElement.dataset.notchTheme;
});
