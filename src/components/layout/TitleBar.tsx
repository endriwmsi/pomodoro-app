import { WindowControls } from '@/components/layout/WindowControls';

/**
 * Faixa superior da área de conteúdo: substitui a barra de título nativa.
 * O espaço vazio arrasta a janela; os controles ficam no canto direito.
 */
export function TitleBar() {
  return (
    <header className="absolute inset-x-0 top-0 z-10 flex h-11 items-center justify-end">
      <div data-tauri-drag-region className="h-full flex-1" />
      <WindowControls />
    </header>
  );
}
