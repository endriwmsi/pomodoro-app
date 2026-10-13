import type { ReactNode } from 'react';

import { Checkbox } from '@/components/ui/checkbox';

interface CheckboxFieldProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  children: ReactNode;
}

/** Checkbox com rótulo clicável — o formato usado nas Configurações. */
export function CheckboxField({
  checked,
  onChange,
  disabled = false,
  children,
}: CheckboxFieldProps) {
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm">
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(state) => {
          onChange(state === true);
        }}
      />
      {children}
    </label>
  );
}
