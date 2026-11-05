// Line icons of the metrics panel. Lucide is not installed (package.json is shared), so they are
// small inline SVGs like the ones in components/documents/design.tsx. Always decorative: the text
// next to them says what they mean.
import type { ReactNode } from 'react';

function Icon({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-5 shrink-0 ${className}`}
    >
      {children}
    </svg>
  );
}

export function FilterIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M3 5h18l-7 8.5V19l-4 2v-7.5z" />
    </Icon>
  );
}

export function WarningIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </Icon>
  );
}
