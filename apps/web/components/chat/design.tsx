// Piezas del diseño pispIAr para el asistente (sección "Chat" del skill pispiar-design). Copiadas
// de components/documents/design.tsx en lo que hace falta, para no acoplar las dos pantallas (PD13).
// Solo clases de los tokens de globals.css.

const BUTTON_BASE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60';

// Botón de IA: naranja-boton con texto blanco (contraste AA), con ✦.
export const BUTTON_AI = `${BUTTON_BASE} bg-naranja-boton text-blanco hover:bg-naranja-boton/90`;
export const BUTTON_SECONDARY = `${BUTTON_BASE} border border-bosque bg-blanco text-bosque hover:bg-salvia`;

export const TEXT_LINK = 'font-semibold text-bosque underline underline-offset-4 hover:no-underline';

export const CARD = 'rounded-2xl border border-borde bg-blanco shadow-sm';
