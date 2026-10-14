import { create } from 'zustand';

import { backgroundGetCustom, backgroundSetCustom, type AppError } from '@/lib/commands';
import { toAppError } from '@/lib/errors';

/** O mesmo limite do backend (`background::MAX_IMAGE_BYTES`). */
export const MAX_BACKGROUND_BYTES = 12 * 1024 * 1024;

/**
 * A imagem de fundo enviada pelo usuário, guardada pelo backend no diretório
 * de dados do aplicativo. Qual fundo está em uso é `appearance.background`,
 * nas configurações; aqui fica só o conteúdo da imagem.
 */
interface BackgroundStore {
  /** `data:` URL da imagem, ou `null` se não há (ou ainda não foi lida). */
  custom: string | null;
  /** Lê a imagem guardada. Chamado uma vez, ao abrir a janela principal. */
  load: () => Promise<void>;
  /** Envia `file` ao backend. Devolve o erro, ou `null` se deu certo. */
  upload: (file: File) => Promise<AppError | null>;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // `readAsDataURL` sempre produz texto.
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('não foi possível ler o arquivo'));
    };
    reader.onerror = () => {
      reject(new Error('não foi possível ler o arquivo'));
    };
    reader.readAsDataURL(file);
  });
}

export const useBackgroundStore = create<BackgroundStore>((set) => ({
  custom: null,
  load: async () => {
    try {
      set({ custom: await backgroundGetCustom() });
    } catch (error) {
      console.error('Falha ao ler a imagem de fundo', error);
    }
  },
  upload: async (file) => {
    // Evita ler e transmitir um arquivo que o backend recusaria de qualquer forma.
    if (file.size > MAX_BACKGROUND_BYTES) {
      return {
        kind: 'validation',
        field: 'image',
        message: 'A imagem é grande demais (o limite é 12 MB).',
      };
    }
    try {
      set({ custom: await backgroundSetCustom(await readAsDataUrl(file)) });
      return null;
    } catch (error) {
      return toAppError(error);
    }
  },
}));
