import { ImagePlus } from 'lucide-react';
import { useRef, useState, type ChangeEvent, type ReactNode } from 'react';

import { BUILTIN_BACKGROUNDS, builtinFor } from '@/app/background';
import { PanelLabel } from '@/components/ui/PanelLabel';
import type { BackgroundChoice } from '@/lib/commands';
import { useBackgroundStore } from '@/stores/background';
import { useSettingsStore } from '@/stores/settings';

/** Identifica uma opção da grade; `default` equivale à primeira imagem embutida. */
function optionKey(choice: BackgroundChoice): string {
  if (choice.kind === 'custom' || choice.kind === 'none') return choice.kind;
  return `builtin:${builtinFor(choice)?.name ?? ''}`;
}

interface OptionProps {
  label: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
  children: ReactNode;
}

function Option({ label, selected, disabled = false, onSelect, children }: OptionProps) {
  return (
    <label
      className={`block rounded-xl border p-1.5 transition-colors duration-150 has-focus-visible:ring-2 has-focus-visible:ring-white/70 ${
        selected ? 'border-accent' : 'border-panel-border'
      } ${disabled ? 'opacity-50' : 'cursor-pointer hover:border-ink-muted'}`}
    >
      <input
        type="radio"
        name="background"
        checked={selected}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
      />
      <span aria-hidden="true" className="block h-16 overflow-hidden rounded-lg">
        {children}
      </span>
      <span className="mt-1.5 block truncate px-0.5 text-xs">{label}</span>
    </label>
  );
}

/**
 * Escolha da imagem de fundo da janela principal: as que vêm com o
 * aplicativo, nenhuma (gradiente) ou uma imagem do próprio usuário, que é
 * copiada para os dados do aplicativo ao ser enviada.
 */
export function BackgroundPicker() {
  const settings = useSettingsStore((state) => state.settings);
  const save = useSettingsStore((state) => state.save);
  const custom = useBackgroundStore((state) => state.custom);
  const upload = useBackgroundStore((state) => state.upload);
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const current = optionKey(settings.appearance.background);

  const choose = async (background: BackgroundChoice) => {
    setError(null);
    const failure = await save({ ...settings, appearance: { ...settings.appearance, background } });
    if (failure) setError(`Não foi possível salvar o fundo: ${failure.message}`);
  };

  const onFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Permite escolher o mesmo arquivo de novo depois.
    event.target.value = '';
    if (!file) return;
    setError(null);
    setSending(true);
    const failure = await upload(file);
    setSending(false);
    if (failure) {
      setError(failure.message);
      return;
    }
    await choose({ kind: 'custom' });
  };

  return (
    <fieldset className="mt-5">
      <legend>
        <PanelLabel as="span">Imagem de fundo</PanelLabel>
      </legend>
      <div className="mt-3 grid grid-cols-3 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
        {BUILTIN_BACKGROUNDS.map((image) => (
          <Option
            key={image.name}
            label={image.label}
            selected={current === `builtin:${image.name}`}
            onSelect={() => void choose({ kind: 'builtin', name: image.name })}
          >
            <img src={image.url} alt="" className="size-full object-cover" />
          </Option>
        ))}
        <Option
          label="Sem imagem"
          selected={current === 'none'}
          onSelect={() => void choose({ kind: 'none' })}
        >
          <span className="app-background-fallback block size-full" />
        </Option>
        <Option
          label="Sua imagem"
          selected={current === 'custom'}
          disabled={!custom}
          onSelect={() => void choose({ kind: 'custom' })}
        >
          {custom ? (
            <img src={custom} alt="" className="size-full object-cover" />
          ) : (
            <span className="flex size-full items-center justify-center bg-panel-strong text-ink-muted">
              <ImagePlus size={18} />
            </span>
          )}
        </Option>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={sending}
          onClick={() => fileInput.current?.click()}
          className="rounded-lg border border-panel-border px-3 py-1.5 text-sm transition-colors duration-150 outline-none hover:border-ink-muted focus-visible:ring-2 focus-visible:ring-white/70 disabled:opacity-50"
        >
          {sending ? 'Enviando…' : custom ? 'Trocar a sua imagem…' : 'Enviar uma imagem…'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          aria-label="Arquivo da imagem de fundo"
          onChange={(event) => void onFile(event)}
          className="hidden"
        />
        <p className="text-xs text-ink-muted">
          PNG, JPEG ou WebP de até 12 MB. A imagem é copiada para os dados do Compasso: continua
          valendo mesmo que o arquivo original seja movido ou apagado.
        </p>
      </div>

      {error ? (
        <p role="alert" className="mt-3 text-sm text-accent">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
