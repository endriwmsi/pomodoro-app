import type { AppError } from '@/lib/commands';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Normaliza o que um `invoke` rejeitou para o formato `AppError`. */
export function toAppError(error: unknown): AppError {
  if (isRecord(error) && typeof error.message === 'string') {
    if (error.kind === 'validation' && typeof error.field === 'string') {
      return { kind: 'validation', field: error.field, message: error.message };
    }
    if (
      error.kind === 'database' ||
      error.kind === 'internal' ||
      error.kind === 'notFound' ||
      error.kind === 'network'
    ) {
      return { kind: error.kind, message: error.message };
    }
  }
  const message = error instanceof Error ? error.message : String(error);
  return { kind: 'unknown', message };
}
