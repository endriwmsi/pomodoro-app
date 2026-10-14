import type { TemplateId } from '@/lib/commands';

/**
 * Templates de estilização disponíveis. Para acrescentar um, siga
 * docs/THEMING.md (variante em Rust, entrada aqui, tokens em globals.css).
 */
export interface TemplateOption {
  id: TemplateId;
  label: string;
  description: string;
}

export const TEMPLATES: readonly TemplateOption[] = [
  {
    id: 'glass',
    label: 'Vidro',
    description: 'Superfícies translúcidas sobre a imagem de fundo.',
  },
  {
    id: 'matrix',
    label: 'Matriz',
    description: 'Painéis escuros, texto monoespaçado e leituras em matriz de pontos.',
  },
  {
    id: 'signal',
    label: 'Sinal',
    description: 'Painel de telemetria: quase preto, rótulos em maiúsculas e blocos verdes.',
  },
  {
    id: 'relief',
    label: 'Relevo',
    description: 'Claro e macio, com superfícies em relevo. Não usa imagem de fundo.',
  },
];

export const DEFAULT_TEMPLATE: TemplateId = 'glass';

const HINT_KEY = 'compasso.template';

function isTemplateId(value: unknown): value is TemplateId {
  return TEMPLATES.some((template) => template.id === value);
}

/**
 * Último template aplicado nesta janela. É só uma dica para o primeiro
 * quadro não piscar no template errado; a fonte de verdade é o banco.
 */
export function readTemplateHint(): TemplateId {
  try {
    const stored = localStorage.getItem(HINT_KEY);
    return isTemplateId(stored) ? stored : DEFAULT_TEMPLATE;
  } catch {
    return DEFAULT_TEMPLATE;
  }
}

export function applyTemplate(id: TemplateId): void {
  document.documentElement.dataset.template = id;
  try {
    localStorage.setItem(HINT_KEY, id);
  } catch {
    // Sem armazenamento local, apenas o primeiro quadro pode usar o padrão.
  }
}
