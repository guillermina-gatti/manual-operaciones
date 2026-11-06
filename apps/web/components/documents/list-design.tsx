// Variante local del diseño para las pantallas de /documentos (listado y detalle), de la prueba de la
// skill design-taste-frontend. design.tsx lo comparten métricas y chat, por eso estas piezas viven
// aparte: mismos tokens de globals.css, más la respuesta al puntero (sube al pasar, se hunde al tocar) y
// su versión quieta para quien pide menos movimiento.
import type { ReactNode } from 'react';
import { BUTTON_DANGER, BUTTON_PRIMARY, BUTTON_SECONDARY, CARD } from './design';

// --- Botones ---------------------------------------------------------------------------------------

// Se hunde 1 px al apretar; sin movimiento si el sistema lo pide. Foco visible en naranja.
const RESPONSIVE_BUTTON =
  'active:translate-y-px motion-reduce:active:translate-y-0 transition-[background-color,transform] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranja';

export const LIST_BUTTON_PRIMARY = `${BUTTON_PRIMARY} ${RESPONSIVE_BUTTON}`;
export const LIST_BUTTON_SECONDARY = `${BUTTON_SECONDARY} ${RESPONSIVE_BUTTON}`;
export const LIST_BUTTON_DANGER = `${BUTTON_DANGER} ${RESPONSIVE_BUTTON}`;

// --- Tarjetas --------------------------------------------------------------------------------------

// La tarjeta del listado: toda la superficie lleva al detalle (el enlace del título se estira con
// after:inset-0). Al pasar sube 2 px, crece la sombra y el borde se oscurece; con foco, el contorno
// rodea la tarjeta entera.
export const LIST_CARD = [
  CARD,
  'relative transition-[transform,box-shadow,border-color] duration-200 ease-out',
  'hover:-translate-y-0.5 hover:border-bosque/30 hover:shadow-md',
  'motion-reduce:transition-none motion-reduce:hover:translate-y-0',
  'has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-naranja',
].join(' ');

// El enlace del título, estirado sobre toda la tarjeta. Lo que tenga que quedar usable encima (otros
// enlaces, botones, texto para seleccionar) va dentro de LIST_CARD_LAYER.
export const LIST_CARD_LINK =
  'block truncate text-bosque outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[""]';
export const LIST_CARD_LAYER = 'relative z-10';

// El título de la vista Tarjetas: hasta dos líneas (el texto completo queda en title).
export const TILE_LINK =
  'line-clamp-2 text-bosque outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[""]';

// Una tarjeta quieta (sin enlace), con el mismo relleno que la del listado.
export const LIST_PANEL = `${CARD} p-6`;

// --- Vista Lista (filas estilo Drive) ----------------------------------------------------------------

// Las columnas: Nombre · Área · Responsable · Revisión · Actualizado. La usan los encabezados y cada
// fila, así quedan alineadas. Debajo de md: no hay grilla y la fila se apila.
export const ROW_GRID =
  'md:grid md:grid-cols-[minmax(0,2.6fr)_minmax(0,1.5fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,1fr)] md:items-center md:gap-x-4';

// El contenedor de las filas: una tarjeta con líneas entre filas.
export const ROW_PANEL = `${CARD} overflow-hidden`;

// Una fila: toda la superficie lleva al detalle (como la tarjeta). Al pasar, fondo salvia; con foco,
// el contorno rodea la fila entera, por dentro.
export const ROW = [
  'relative flex flex-col gap-1.5 px-4 py-3 transition-colors md:gap-y-1',
  ROW_GRID,
  'hover:bg-salvia motion-reduce:transition-none',
  'has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-naranja',
].join(' ');

// El enlace del título de la fila, estirado sobre ella.
export const ROW_LINK =
  'block truncate font-semibold text-bosque outline-none after:absolute after:inset-0 after:content-[""]';

// --- Selector de vista -----------------------------------------------------------------------------

export const VIEW_SWITCH = 'inline-flex rounded-xl border border-borde bg-blanco p-1';

// La opción elegida va en bosque (aria-pressed); se hunde al apretar y tiene foco visible.
export const VIEW_OPTION = [
  'inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-texto-suave',
  'transition-[background-color,color,transform] hover:bg-salvia hover:text-bosque',
  'active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0',
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranja',
  'aria-pressed:bg-bosque aria-pressed:text-blanco aria-pressed:hover:bg-bosque aria-pressed:hover:text-blanco',
].join(' ');

// --- Ícono del tipo de archivo ---------------------------------------------------------------------

// La extensión del archivo en mayúsculas ("PDF", "DOCX"), o "ARCH" si no tiene.
export function fileExtension(fileName: string): string {
  const dot = fileName.lastIndexOf('.');
  const extension = dot > 0 ? fileName.slice(dot + 1).toUpperCase() : '';
  return extension.slice(0, 4) || 'ARCH';
}

// Los colores de cada tipo de archivo: el fondo pastel de la hoja y la tinta oscura del mismo tono (el
// glifo y la extensión). El único lugar donde se definen; los usan el ícono grande (Tarjetas) y el chico
// (Lista). Contraste de la tinta sobre el fondo, todos AA (4,5:1 o más). Van en hex porque no hay
// tokens para todos sin tocar globals.css; donde el color ya existe como token, se nombra.
export const FILE_TYPE_COLORS = {
  // Los mismos valores que rosa-alerta / rosa-alerta-texto. 5,3:1.
  pdf: { background: '#FCE1E4', ink: '#B4232C' },
  // Markdown y Word comparten el azul (el celeste es solo del asistente). 7,2:1.
  doc: { background: '#DBEAFE', ink: '#1E40AF' },
  // Texto y cualquier tipo desconocido. texto-suave daría 4,48:1, por eso una tinta propia. 7,9:1.
  text: { background: '#ECEEED', ink: '#3F4A45' },
  // Por si se habilitan (hoy la carga acepta solo PDF, TXT y MD).
  // Los mismos valores que chip-area / chip-area-texto. 5,7:1.
  sheet: { background: '#E3F4E1', ink: '#1F6B3A' },
  // Los mismos valores que durazno / durazno-texto. 4,9:1.
  slides: { background: '#FCE9E0', ink: '#B53C0A' },
} as const;

export type FileTypeKind = keyof typeof FILE_TYPE_COLORS;

const KIND_BY_EXTENSION: Record<string, FileTypeKind> = {
  PDF: 'pdf',
  MD: 'doc',
  DOC: 'doc',
  DOCX: 'doc',
  TXT: 'text',
  XLS: 'sheet',
  XLSX: 'sheet',
  CSV: 'sheet',
  PPT: 'slides',
  PPTX: 'slides',
};

// El tipo de un archivo por su extensión; lo que no se conoce, como texto (gris).
export function fileTypeKind(fileName: string): FileTypeKind {
  return KIND_BY_EXTENSION[fileExtension(fileName)] ?? 'text';
}

const ICON_SIZE = { sm: 'h-8 w-7', lg: 'h-16 w-14' } as const;

// La hoja: esquinas de radio 4 y la superior derecha bien redondeada, como una hoja doblada.
const SHEET = 'M6 1h20a12 12 0 0 1 12 12v30a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V5a4 4 0 0 1 4-4Z';

// La hoja entera en el tono suave del tipo, con la extensión en la tinta oscura. La grande (Tarjetas)
// suma arriba un glifo de documento; la chica (Lista) lleva solo la extensión, que a 28 px es lo que se
// lee. Decorativa: quien la usa dice el tipo con texto (sr-only "Archivo PDF").
export function FileTypeIcon({ fileName, size }: { fileName: string; size: 'sm' | 'lg' }) {
  const extension = fileExtension(fileName);
  const { background, ink } = FILE_TYPE_COLORS[fileTypeKind(fileName)];
  const long = extension.length > 3;

  return (
    <svg aria-hidden="true" viewBox="0 0 40 48" className={`${ICON_SIZE[size]} shrink-0`}>
      {/* Un borde de la misma tinta, apenas visible, para que la hoja gris no se pierda sobre blanco. */}
      <path d={SHEET} fill={background} stroke={ink} strokeOpacity="0.2" strokeWidth="1" />
      {size === 'lg' && (
        // Un documento con tres renglones.
        <g data-part="glyph" fill="none" stroke={ink} strokeWidth="1.6" strokeLinecap="round">
          <rect x="13" y="8" width="14" height="17" rx="2" />
          <path d="M16.5 13.5h7M16.5 17h7M16.5 20.5h4.5" />
        </g>
      )}
      <text
        x="20"
        y={size === 'lg' ? 38 : 28.5}
        textAnchor="middle"
        fill={ink}
        fontSize={size === 'lg' ? (long ? 8.5 : 9.5) : long ? 9.5 : 11}
        fontWeight="700"
        fontFamily="inherit"
        letterSpacing="0.3"
      >
        {extension}
      </text>
    </svg>
  );
}

// La etiqueta de un dato (dt): chica, en mayúscula, sobre el valor.
export const META_LABEL = 'text-xs font-semibold tracking-wide text-texto-suave uppercase';

// El chip de la versión ("v3"): el mismo en la tarjeta y en el detalle.
export const VERSION_CHIP =
  'rounded-md border border-borde bg-fondo px-2 py-0.5 text-xs font-bold text-texto-suave tabular-nums';

// --- Adjunto ---------------------------------------------------------------------------------------

function PaperclipIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0 text-texto-suave"
    >
      <path d="m21 11.5-8.6 8.6a5.5 5.5 0 0 1-7.8-7.8l8.6-8.6a3.7 3.7 0 0 1 5.2 5.2l-8.6 8.6a1.8 1.8 0 0 1-2.6-2.6l7.9-7.9" />
    </svg>
  );
}

// El archivo vigente como un adjunto: clip, nombre (recortado, completo en title) y tamaño. Cada uno en
// su propio elemento; para lectores de pantalla, "Archivo:" y "tamaño:".
export function AttachmentStrip({ fileName, size }: { fileName: string; size: string }) {
  return (
    <p className="flex min-w-0 items-center gap-3 rounded-xl border border-borde bg-fondo px-4 py-3">
      <PaperclipIcon />
      <span className="sr-only">Archivo: </span>
      <span title={fileName} className="min-w-0 truncate font-semibold">
        {fileName}
      </span>
      <span className="sr-only">, tamaño: </span>
      <span className="ml-auto shrink-0 text-sm text-texto-suave tabular-nums">{size}</span>
    </p>
  );
}

// --- Encabezado ------------------------------------------------------------------------------------

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  // Marcas junto al título (Vencido, Archivado…).
  meta?: ReactNode;
  // Una línea chica entre el título y el subtítulo.
  note?: ReactNode;
  // La acción principal: a la derecha desde sm:, debajo en el celular. Un único elemento.
  action?: ReactNode;
  // Títulos que vienen de datos (pueden ser largos): cortan palabras en vez de desbordar.
  wrap?: boolean;
}

export const PAGE_TITLE =
  'text-3xl font-extrabold tracking-[-0.02em] text-bosque sm:text-[40px] sm:leading-tight';
export const PAGE_SUBTITLE = 'text-lg text-texto-suave';
const join = (...classes: (string | false)[]) => classes.filter(Boolean).join(' ');

export function PageHeader({ title, subtitle, meta, note, action, wrap = false }: PageHeaderProps) {
  const heading = <h1 className={join(PAGE_TITLE, wrap && 'min-w-0 break-words')}>{title}</h1>;
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        {meta ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {heading}
            {meta}
          </div>
        ) : (
          heading
        )}
        {note}
        {subtitle && <p className={join(PAGE_SUBTITLE, wrap && 'break-words')}>{subtitle}</p>}
      </div>
      {action && <div className="flex shrink-0">{action}</div>}
    </header>
  );
}

// El encabezado del listado.
export function DocumentsHeader({ action }: { action?: ReactNode }) {
  return (
    <PageHeader
      title="Documentos"
      subtitle="Los documentos vigentes de tus áreas. Buscá, descargá y revisá."
      action={action}
    />
  );
}
