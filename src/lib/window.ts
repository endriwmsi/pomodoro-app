import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/**
 * Controles da janela principal sem decoração nativa.
 *
 * Fora do Tauri (Vite no navegador, testes) todas as funções são no-ops, de
 * modo que a interface continue renderizando sem o runtime nativo.
 */

export async function minimizeWindow(): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().minimize();
}

export async function toggleMaximizeWindow(): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().toggleMaximize();
}

export async function closeWindow(): Promise<void> {
  if (!isTauri()) return;
  await getCurrentWindow().close();
}

/**
 * Observa o estado maximizado da janela. Chama `onChange` com o valor atual
 * e novamente a cada redimensionamento. Retorna a função de cancelamento.
 */
export function watchMaximized(onChange: (maximized: boolean) => void): () => void {
  if (!isTauri()) return () => undefined;

  const appWindow = getCurrentWindow();
  let disposed = false;
  let unlisten: (() => void) | undefined;

  const refresh = () => {
    appWindow
      .isMaximized()
      .then((maximized) => {
        if (!disposed) onChange(maximized);
      })
      .catch((error: unknown) => {
        console.error('Falha ao consultar o estado da janela', error);
      });
  };

  refresh();
  appWindow
    .onResized(refresh)
    .then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    })
    .catch((error: unknown) => {
      console.error('Falha ao observar o redimensionamento da janela', error);
    });

  return () => {
    disposed = true;
    unlisten?.();
  };
}
