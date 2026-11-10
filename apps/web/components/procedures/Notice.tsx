// A notice with its text. The role (note, alert or status) is set by whoever uses it.
import type { ComponentProps } from 'react';

const TONES = {
  info: 'border-borde bg-salvia text-texto',
  error: 'border-peligro bg-rosa-alerta text-rosa-alerta-texto',
  success: 'border-transparent bg-chip-area text-chip-area-texto',
} as const;

export function Notice({
  tone,
  className = '',
  ...rest
}: ComponentProps<'div'> & { tone: keyof typeof TONES }) {
  return <div className={`rounded-xl border p-4 text-sm ${TONES[tone]} ${className}`} {...rest} />;
}
