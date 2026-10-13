import { useState } from 'react';

import { TEMPLATES } from '@/app/templates';
import { DotMatrixText } from '@/components/ui/DotMatrixText';
import { Panel } from '@/components/ui/Panel';
import { PanelLabel } from '@/components/ui/PanelLabel';
import type { TemplateId } from '@/lib/commands';
import { useSettingsStore } from '@/stores/settings';

/** Miniatura com aparência fixa: mostra o template, não o que está ativo. */
function TemplatePreview({ id }: { id: TemplateId }) {
  if (id === 'matrix') {
    return (
      <div
        aria-hidden="true"
        className="flex h-20 flex-col justify-between rounded-lg bg-[#19191b] p-3 text-[#f4f3ee]"
      >
        <DotMatrixText text="25:00" size={18} />
        <div className="flex gap-1">
          {[true, true, true, false, false, false, false, false].map((on, dot) => (
            <span
              key={dot}
              className={`size-1.5 rounded-full ${on ? 'bg-[#ff5a36]' : 'bg-white/15'}`}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div aria-hidden="true" className="app-background-fallback h-20 rounded-lg p-2">
      <div className="flex h-full flex-col justify-between rounded-xl border border-white/15 bg-[rgb(22_22_25/0.6)] bg-linear-140 from-white/15 to-transparent to-40% px-3 py-2 font-[Segoe_UI,system-ui,sans-serif] text-white">
        <span className="text-lg leading-none font-semibold">25:00</span>
        <span className="h-1 w-2/3 rounded-full bg-linear-to-r from-[#f5c251]/50 to-[#f5c251]" />
      </div>
    </div>
  );
}

export function AppearanceSection() {
  const settings = useSettingsStore((state) => state.settings);
  const save = useSettingsStore((state) => state.save);
  const [error, setError] = useState<string | null>(null);

  const choose = (template: TemplateId) => {
    setError(null);
    void save({ ...settings, appearance: { ...settings.appearance, template } }).then((failure) => {
      if (failure) setError(`Não foi possível salvar o template: ${failure.message}`);
    });
  };

  return (
    <Panel aria-label="Aparência" className="px-4 py-3.5">
      <fieldset>
        <legend>
          <PanelLabel as="span">Template de estilização</PanelLabel>
        </legend>
        <div className="mt-3 grid grid-cols-2 gap-3">
          {TEMPLATES.map((template) => {
            const selected = template.id === settings.appearance.template;
            return (
              <label
                key={template.id}
                className={`cursor-pointer rounded-xl border p-2.5 transition-colors duration-150 has-focus-visible:ring-2 has-focus-visible:ring-white/70 ${
                  selected ? 'border-accent' : 'border-panel-border hover:border-ink-muted'
                }`}
              >
                <input
                  type="radio"
                  name="template"
                  value={template.id}
                  checked={selected}
                  onChange={() => {
                    choose(template.id);
                  }}
                  className="sr-only"
                />
                <TemplatePreview id={template.id} />
                <span className="mt-2.5 block text-sm font-medium">{template.label}</span>
                <span className="mt-0.5 block text-xs text-ink-muted">{template.description}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-accent">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
