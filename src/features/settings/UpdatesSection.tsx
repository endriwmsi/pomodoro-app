import { isTauri } from '@tauri-apps/api/core';
import { Download, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import { CheckboxField } from '@/components/ui/CheckboxField';
import { Panel } from '@/components/ui/Panel';
import { PanelLabel } from '@/components/ui/PanelLabel';
import { updateCheck, updateInstall, updatePending, type UpdateInfo } from '@/lib/commands';
import { toAppError } from '@/lib/errors';
import { useSettingsStore } from '@/stores/settings';

type CheckState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'current' }
  | { status: 'available'; update: UpdateInfo }
  | { status: 'installing'; update: UpdateInfo };

const BUTTON =
  'mt-4 flex items-center gap-2 rounded-lg border border-panel-border bg-panel-strong px-3.5 py-1.5 text-sm font-medium transition-opacity duration-150 outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-40';

export function UpdatesSection() {
  const settings = useSettingsStore((state) => state.settings);
  const save = useSettingsStore((state) => state.save);
  const [state, setState] = useState<CheckState>({ status: 'idle' });
  const [error, setError] = useState<string | null>(null);

  // Uma atualização que a consulta automática achou mas não pôde instalar.
  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    updatePending()
      .then((update) => {
        if (!cancelled && update) setState({ status: 'available', update });
      })
      .catch((failure: unknown) => {
        console.error('Falha no comando update_pending', failure);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setAutoUpdate = (autoUpdate: boolean) => {
    setError(null);
    void save({ ...settings, updates: { ...settings.updates, autoUpdate } }).then((failure) => {
      if (failure) setError(`Não foi possível salvar: ${failure.message}`);
    });
  };

  const check = () => {
    setError(null);
    setState({ status: 'checking' });
    updateCheck()
      .then((update) => {
        setState(update ? { status: 'available', update } : { status: 'current' });
      })
      .catch((failure: unknown) => {
        setState({ status: 'idle' });
        setError(`Não foi possível verificar: ${toAppError(failure).message}`);
      });
  };

  const install = (update: UpdateInfo) => {
    setError(null);
    setState({ status: 'installing', update });
    // Em caso de sucesso o aplicativo reinicia: a promessa só volta com erro.
    updateInstall().catch((failure: unknown) => {
      setState({ status: 'available', update });
      setError(`Não foi possível atualizar: ${toAppError(failure).message}`);
    });
  };

  const busy = state.status === 'checking' || state.status === 'installing';

  return (
    <Panel aria-label="Atualizações" className="mt-3 px-4 py-3.5">
      <PanelLabel as="h2">Atualizações</PanelLabel>
      <div className="mt-3">
        <CheckboxField checked={settings.updates.autoUpdate} onChange={setAutoUpdate}>
          Atualizar automaticamente ao abrir o aplicativo
        </CheckboxField>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        Usa a internet: ao abrir, consulta a última versão publicada no GitHub e, havendo uma nova,
        instala e reinicia o Compasso. Nada além do pedido da página de versões é enviado. Seus
        dados não são alterados.
      </p>

      {state.status === 'available' || state.status === 'installing' ? (
        <>
          <p className="mt-4 text-sm" role="status">
            {state.status === 'installing'
              ? `Instalando a versão ${state.update.version}…`
              : `Versão ${state.update.version} disponível.`}
          </p>
          <button
            type="button"
            disabled={busy || !isTauri()}
            onClick={() => {
              install(state.update);
            }}
            className={BUTTON}
          >
            <Download size={15} aria-hidden="true" />
            Instalar e reiniciar
          </button>
        </>
      ) : (
        <>
          {state.status === 'current' ? (
            <p className="mt-4 text-sm" role="status">
              Você já está na versão mais recente.
            </p>
          ) : null}
          <button type="button" disabled={busy || !isTauri()} onClick={check} className={BUTTON}>
            <RefreshCw size={15} aria-hidden="true" />
            {state.status === 'checking' ? 'Verificando…' : 'Verificar agora'}
          </button>
        </>
      )}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-accent">
          {error}
        </p>
      ) : null}
    </Panel>
  );
}
