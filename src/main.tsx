import { isTauri } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from '@/app/App';
import { applyTemplate, readTemplateHint } from '@/app/templates';
import { NotchApp } from '@/notch/NotchApp';
import '@/styles/globals.css';

const root = document.getElementById('root');
if (!root) {
  throw new Error('Elemento #root não encontrado em index.html');
}

// As duas janelas carregam este mesmo arquivo; o rótulo decide a interface.
// No navegador (pré-visualização), `?window=notch` mostra a interface do notch.
const windowLabel = isTauri()
  ? getCurrentWindow().label
  : (new URLSearchParams(window.location.search).get('window') ?? 'main');
document.documentElement.dataset.window = windowLabel;

// Antes do primeiro quadro, para a janela não abrir no template errado.
applyTemplate(readTemplateHint());

createRoot(root).render(
  <StrictMode>{windowLabel === 'notch' ? <NotchApp /> : <App />}</StrictMode>,
);
