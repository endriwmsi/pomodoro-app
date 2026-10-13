import { PageHeader } from '@/components/ui/PageHeader';
import { AboutSection } from '@/features/settings/AboutSection';
import { AlertsSection } from '@/features/settings/AlertsSection';
import { AppearanceSection } from '@/features/settings/AppearanceSection';
import { GeneralSection } from '@/features/settings/GeneralSection';
import { GoalsSection } from '@/features/settings/GoalsSection';
import { NotchSection } from '@/features/settings/NotchSection';
import { TimerSection } from '@/features/settings/TimerSection';
import { WeatherSection } from '@/features/settings/WeatherSection';
import { useSettingsStore } from '@/stores/settings';

export function SettingsPage() {
  const status = useSettingsStore((state) => state.status);

  return (
    <>
      <PageHeader title="Configurações" />
      {status === 'error' ? (
        <p role="alert" className="panel mb-3 border-accent px-4 py-3 text-sm">
          Não foi possível ler as configurações gravadas. Os valores abaixo são os padrões; salvar
          irá substituí-las.
        </p>
      ) : null}
      <AppearanceSection />
      <GeneralSection />
      <TimerSection />
      <GoalsSection />
      <NotchSection />
      <AlertsSection />
      <WeatherSection />
      <AboutSection />
    </>
  );
}
