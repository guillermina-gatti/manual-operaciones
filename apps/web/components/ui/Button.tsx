// Botón común de la web. Mide al menos 44 px de alto para tocarlo bien en el celular (F10).
import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-blue-700 text-white hover:bg-blue-800 dark:bg-blue-500 dark:text-zinc-950 dark:hover:bg-blue-400',
  secondary:
    'border border-zinc-300 bg-white text-zinc-900 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

// Por defecto type="button": dentro de un formulario, un botón sin type lo envía.
export function Button({
  variant = 'primary',
  type = 'button',
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex min-h-11 items-center justify-center rounded-md px-4 font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
