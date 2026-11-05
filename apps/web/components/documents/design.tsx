// Piezas del diseño pispIAr para las pantallas de Documentos (skill pispiar-design). Solo vista: usan
// los tokens de globals.css y no deciden nada de negocio. Los botones van como clases porque
// components/ui/Button es compartido y todavía usa los colores anteriores.
import type { ReactNode } from 'react';
import type { DocumentReference, ReviewStatus } from '@/lib/api';
import { COMPANY_TIME_ZONE, formatArea } from '@/lib/documents/format';
import { tomorrowIn } from '@/lib/documents/review-date';

// --- Botones (radio 12 px, 48 px de alto) ----------------------------------------------------------

const BUTTON_BASE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60';

export const BUTTON_PRIMARY = `${BUTTON_BASE} bg-bosque text-blanco hover:bg-bosque-hover`;
export const BUTTON_SECONDARY = `${BUTTON_BASE} border border-bosque bg-blanco text-bosque hover:bg-salvia`;
export const BUTTON_DANGER = `${BUTTON_BASE} border border-peligro bg-blanco text-peligro hover:bg-rosa-alerta`;

// Un link de texto (volver, ir a la primera página).
export const TEXT_LINK = 'font-semibold text-bosque underline-offset-4 hover:underline';

// --- Campos ----------------------------------------------------------------------------------------

export const INPUT =
  'min-h-12 w-full rounded-xl border border-borde bg-blanco px-4 text-texto aria-[invalid=true]:border-peligro disabled:opacity-60';
export const LABEL = 'font-semibold';
export const HINT = 'text-sm text-texto-suave';

// --- Página ----------------------------------------------------------------------------------------

// Título grande y la línea que explica la pantalla.
export function PageHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-3xl font-extrabold tracking-[-0.02em] text-bosque sm:text-[40px] sm:leading-tight">
        {title}
      </h1>
      <p className="text-lg text-texto-suave">{subtitle}</p>
    </header>
  );
}

// "← Volver a Documentos".
export const BACK_LINK =
  'inline-flex min-h-11 items-center self-start font-semibold text-bosque underline-offset-4 hover:underline';

// --- Tarjeta ---------------------------------------------------------------------------------------

export const CARD = 'rounded-2xl border border-borde bg-blanco shadow-sm';

export function Card({
  children,
  className = '',
  as: Tag = 'div',
  ...rest
}: {
  children: ReactNode;
  className?: string;
  as?: 'div' | 'section' | 'article';
  'aria-label'?: string;
}) {
  return (
    <Tag className={`${CARD} p-6 sm:p-8 ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

// --- Estado con punto ------------------------------------------------------------------------------

export type DotTone = 'exito' | 'durazno' | 'peligro' | 'azul' | 'gris';

const DOT: Record<DotTone, string> = {
  exito: 'bg-exito',
  durazno: 'bg-naranja',
  peligro: 'bg-peligro',
  azul: 'bg-azul-borrador',
  gris: 'bg-gris-reemplazada',
};

const DOT_TEXT: Record<DotTone, string> = {
  exito: 'text-chip-area-texto',
  durazno: 'text-durazno-texto',
  peligro: 'text-rosa-alerta-texto',
  azul: 'text-texto',
  gris: 'text-texto-suave',
};

// Punto de 10 px y el texto: el color nunca va solo (el punto es decorativo).
export function StatusDot({ tone, children }: { tone: DotTone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-2 text-sm font-semibold ${DOT_TEXT[tone]}`}
    >
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  );
}

// --- Chips de área ---------------------------------------------------------------------------------

export const CHIP = 'inline-flex items-center rounded-lg px-2.5 py-1 text-sm font-semibold';

// Un chip por área, con "(inactiva)" si corresponde (spec 008). Entre chips, ", " solo para lectores
// de pantalla, así se lee y se copia como la lista de siempre ("Ventas, Operaciones").
export function AreaChips({ areas }: { areas: DocumentReference[] }) {
  if (areas.length === 0) return <>—</>;
  return (
    <span className="flex flex-wrap gap-2">
      {areas.map((area, index) => (
        <span key={`${area.id}-${index}`} className="inline-flex">
          {index > 0 && <span className="sr-only">, </span>}
          <span className={`${CHIP} bg-chip-area text-chip-area-texto`}>{formatArea(area)}</span>
        </span>
      ))}
    </span>
  );
}

// --- Badge de archivo ------------------------------------------------------------------------------

const FILE_TYPES: Record<string, string> = { pdf: 'PDF', md: 'MD', txt: 'TXT' };

export function FileBadge({ fileName }: { fileName: string }) {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  const label = FILE_TYPES[extension];
  if (!label) return null;
  return (
    <span className="inline-flex shrink-0 items-center rounded-md border border-borde bg-fondo px-1.5 py-0.5 text-xs font-bold text-texto-suave">
      {label}
    </span>
  );
}

// --- Barra de frescura -----------------------------------------------------------------------------

// El día de un instante en Buenos Aires, como YYYY-MM-DD (en-CA escribe así las fechas).
function companyDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: COMPANY_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(isoDay: string): number {
  const [year, month, day] = isoDay.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

// Días desde hoy (en Buenos Aires, como la API) hasta la fecha de revisión. Negativo si ya pasó.
export function daysUntilReview(reviewDate: string, now: Date): number {
  const today = dayNumber(tomorrowIn(COMPANY_TIME_ZONE, now)) - 1;
  return dayNumber(reviewDate) - today;
}

function describeDays(days: number): string {
  if (days < 0) return days === -1 ? 'La fecha pasó ayer' : `La fecha pasó hace ${-days} días`;
  if (days === 0) return 'Revisar hoy';
  if (days === 1) return 'Revisar mañana';
  return `Revisar en ${days} días`;
}

// El color sale del estado que decide la API (spec 005, D16); acá no se recalcula.
const FRESHNESS_COLOR: Record<ReviewStatus, string> = {
  UP_TO_DATE: 'bg-exito',
  DUE_SOON: 'bg-naranja',
  OVERDUE: 'bg-peligro',
};

interface FreshnessBarProps {
  status: ReviewStatus;
  // YYYY-MM-DD.
  reviewDate: string;
  // Desde cuándo se cuenta: la última revisión o la carga (ISO).
  since: string;
  // Los tests pasan una fecha fija.
  now?: Date;
}

export function FreshnessBar({ status, reviewDate, since, now = new Date() }: FreshnessBarProps) {
  const days = daysUntilReview(reviewDate, now);
  const sinceDate = new Date(since);
  const total = Number.isNaN(sinceDate.getTime())
    ? 0
    : dayNumber(reviewDate) - dayNumber(companyDay(sinceDate));
  const ratio = total > 0 ? Math.min(Math.max(days / total, 0), 1) : days > 0 ? 1 : 0;
  // Siempre se ve un poco de barra, así el color acompaña al texto.
  const width = Math.max(ratio * 100, 6);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-semibold">Frescura</span>
        <span className="text-texto-suave">{describeDays(days)}</span>
      </div>
      <div aria-hidden="true" className="h-2 w-full overflow-hidden rounded-full bg-borde">
        <div
          className={`h-full rounded-full ${FRESHNESS_COLOR[status]}`}
          style={{ width: `${width}%` }}
        />
      </div>
    </div>
  );
}

// --- Avisos ----------------------------------------------------------------------------------------

export const ERROR_BOX = 'rounded-xl border border-rosa-alerta-texto/30 bg-rosa-alerta p-4 text-rosa-alerta-texto';
export const ERROR_TEXT = 'text-sm text-rosa-alerta-texto';

// --- Íconos (Lucide no está instalado: SVG de línea, decorativos) -----------------------------------

export function SearchIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`size-5 ${className}`}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}
