import { DotMatrixText } from '@/components/ui/DotMatrixText';
import { useTemplate } from '@/stores/settings';

interface MetricValueProps {
  /** Valor já formatado, ou `null` quando ainda não há dados. */
  value: string | null;
}

/** Leitura principal de um indicador, desenhada conforme o template ativo. */
export function MetricValue({ value }: MetricValueProps) {
  const template = useTemplate();

  if (template === 'matrix') {
    return (
      <DotMatrixText
        text={value ?? '--'}
        label={value ?? 'Sem dados'}
        size={30}
        className="mt-3 block"
      />
    );
  }

  return (
    <p
      className="mt-2 font-display text-4xl font-semibold tracking-tight signal:font-normal relief:font-bold"
      title={value === null ? 'Sem dados ainda' : undefined}
    >
      {value ?? '—'}
    </p>
  );
}
