// A notice with its text. The role (note, alert or status) is set by whoever uses it.
import type { ComponentProps } from 'react';
import { ERROR_BOX } from '@/components/documents/design';

const BOX = 'rounded-xl border p-4 text-sm';

const TONES = {
  info: `${BOX} border-borde bg-fondo text-texto`,
  error: `${ERROR_BOX} text-sm`,
  success: `${BOX} border-bosque/20 bg-salvia text-bosque`,
} as const;

export function Notice({
  tone,
  className = '',
  ...rest
}: ComponentProps<'div'> & { tone: keyof typeof TONES }) {
  return <div className={`${TONES[tone]} ${className}`} {...rest} />;
}
