/**
 * Imagem de fundo da janela principal.
 *
 * Coloque um arquivo `background.{png,jpg,jpeg,webp,avif}` em `src/assets/`
 * para que ele seja usado automaticamente. Sem arquivo, a interface usa o
 * gradiente `.app-background-fallback` definido em `styles/globals.css`.
 */
const candidates = import.meta.glob<string>('../assets/background.{png,jpg,jpeg,webp,avif}', {
  eager: true,
  query: '?url',
  import: 'default',
});

export const backgroundImageUrl: string | undefined = Object.values(candidates)[0];
