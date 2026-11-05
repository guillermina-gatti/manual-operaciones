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

export function BuildingIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 7h.01M15 7h.01M9 11h.01M15 11h.01M9 15h.01M15 15h.01" />
      <path d="M10 21v-3h4v3" />
    </Icon>
  );
}

export function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="m6 9 6 6 6-6" />
    </Icon>
  );
}

export function CheckIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M5 12.5 10 17 19 7" />
    </Icon>
  );
}

export function ChartIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
    </Icon>
  );
}

export function CrossIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6M15 9l-6 6" />
    </Icon>
  );
}

export function ClockIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </Icon>
  );
}

export function TimerIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="14" r="7" />
      <path d="M12 14v-3M10 2h4M12 2v5" />
    </Icon>
  );
}

// The hornero's feather (the bars of the panel have its shape).
export function FeatherIcon({ className }: { className?: string }) {
  return (
    <Icon className={className}>
      <path d="M12.7 19a2 2 0 0 0 1.4-.6l6.2-6.2a6 6 0 0 0-8.5-8.5l-6.2 6.2A2 2 0 0 0 5 11.3V18a1 1 0 0 0 1 1z" />
      <path d="M16 8 2 22M17.5 15H9" />
    </Icon>
  );
}
