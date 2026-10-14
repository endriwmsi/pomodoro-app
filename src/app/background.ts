import type { BackgroundChoice } from '@/lib/commands';

/**
 * Imagens de fundo da janela principal que vêm com o aplicativo.
 *
 * Para acrescentar uma, coloque o arquivo em `src/assets/backgrounds/`
 * (`png`, `jpg`, `jpeg`, `webp` ou `avif`). O nome do arquivo, sem a extensão,
 * é o identificador gravado nas configurações — use só letras, números, hífen
 * e sublinhado — e também vira o rótulo (`por-do-sol.jpg` → "Por do sol").
 * Ver `docs/THEMING.md`.
 */
export interface BuiltinBackground {
  name: string;
  label: string;
  url: string;
}

const files = import.meta.glob<string>('../assets/backgrounds/*.{png,jpg,jpeg,webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
});

function nameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1, path.lastIndexOf('.'));
}

export function labelOf(name: string): string {
  const words = name.replace(/[-_]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const BUILTIN_BACKGROUNDS: readonly BuiltinBackground[] = Object.entries(files)
  .map(([path, url]) => ({ name: nameOf(path), label: labelOf(nameOf(path)), url }))
  .sort((a, b) => a.name.localeCompare(b.name));

/**
 * A imagem embutida que uma escolha representa. `default` e um nome que esta
 * versão não conhece caem na primeira da lista.
 */
export function builtinFor(
  choice: BackgroundChoice,
  available: readonly BuiltinBackground[] = BUILTIN_BACKGROUNDS,
): BuiltinBackground | undefined {
  if (choice.kind === 'builtin') {
    return available.find((image) => image.name === choice.name) ?? available[0];
  }
  return available[0];
}

/**
 * URL da imagem a mostrar, ou `undefined` para o gradiente
 * (`.app-background-fallback`, em `styles/globals.css`). `custom` sem imagem
 * enviada — ainda carregando, ou apagada do disco — cai na imagem padrão.
 */
export function backgroundUrl(
  choice: BackgroundChoice,
  customImage: string | null,
  available: readonly BuiltinBackground[] = BUILTIN_BACKGROUNDS,
): string | undefined {
  if (choice.kind === 'none') return undefined;
  if (choice.kind === 'custom' && customImage) return customImage;
  return builtinFor(choice, available)?.url;
}
