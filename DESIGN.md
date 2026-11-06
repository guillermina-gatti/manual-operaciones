# Sistema de diseño · Manual de operaciones

Cómo se ven y se comportan las pantallas de la web (`apps/web`), para que todo el equipo, y sus agentes,
lo apliquen igual. Todo lo que está acá sale del código. Si algo de este documento no coincide con el
código, manda el código: avisá y se corrige el documento.

## 1. Fuentes de verdad

| Archivo | Qué tiene |
|---|---|
| `apps/web/app/globals.css` | Los tokens de color (`@theme`), la fuente y el foco visible global |
| `apps/web/app/layout.tsx` | La fuente: Plus Jakarta Sans (`next/font`), pesos 400, 500, 600, 700 y 800 |
| `apps/web/components/documents/design.tsx` | Las clases base: botones, campos, tarjeta, chips, marcas de estado. Lo usan también métricas y chat |
| `apps/web/components/documents/list-design.tsx` | La capa con respuesta al puntero y al teclado: botones que se hunden, tarjeta y fila clickeables, encabezado con acción, selector de vista, íconos de tipo de archivo |

**Para las pantallas nuevas, importá de `list-design.tsx` tal cual**, aunque esté en la carpeta de
Documentos. Es mejor que copiar las clases: si se ajusta algo, cambia en todas las pantallas a la vez.
Moverlo a un lugar común queda como decisión del equipo (ver [Pendientes](#11-pendientes-conocidos)).

```tsx
import { BUTTON_PRIMARY, CARD, HINT, INPUT, LABEL } from '@/components/documents/design';
import { LIST_BUTTON_PRIMARY, LIST_BUTTON_SECONDARY, PageHeader } from '@/components/documents/list-design';
```

Los colores se usan **siempre por su token** (`bg-bosque`, `text-texto-suave`, `border-borde`), nunca con
grises o colores de Tailwind (`zinc`, `gray`, `blue-500`…) ni con hex sueltos. La única excepción son los
colores por tipo de archivo, que se definen una sola vez en `FILE_TYPE_COLORS` (sección 2.3).

## 2. Paleta

### 2.1 Tokens (`globals.css`)

| Token | Hex | Para qué se usa |
|---|---|---|
| `fondo` | `#F6F7F6` | Fondo de la app (`body`). Zonas internas de una tarjeta: el adjunto, la zona para soltar archivos, el chip de versión |
| `blanco` | `#FFFFFF` | Tarjetas y campos. Texto sobre `bosque` |
| `borde` | `#E6E9E7` | Bordes de tarjetas y campos, líneas entre filas, fondo vacío de las barras |
| `texto` | `#1E2B27` | Texto principal (`body`) |
| `texto-suave` | `#646F6A` | Subtítulos, ayudas, etiquetas de datos. Se oscureció para llegar a AA: 4,86:1 sobre `fondo`, 5,22:1 sobre `blanco`, 4,65:1 sobre `salvia` |
| `bosque` | `#0B4233` | El color de la marca: títulos, enlaces, botón principal, opción elegida |
| `bosque-hover` | `#1F5848` | Hover del botón principal |
| `salvia` | `#EEF3F0` | Hover de botones secundarios, filas y opciones. Fondo del aviso de éxito ("Áreas actualizadas") |
| `naranja` | `#E85114` | **Solo foco e indicadores** (ver 2.2) |
| `naranja-boton` | `#B8400F` | Fondo de botón con texto blanco (5,56:1). Hoy, solo el botón de IA del asistente |
| `celeste` | `#D9EFFA` | **Reservado del asistente** (ver 2.2) |
| `chip-area` / `chip-area-texto` | `#E3F4E1` / `#1F6B3A` | Chips de área. El texto, también para "Vigente" |
| `exito` | `#18894C` | Punto y barra de "al día", versión vigente, procesamiento listo |
| `durazno` / `durazno-texto` | `#FCE9E0` / `#B53C0A` | Palabras resaltadas en la búsqueda, avisos de contradicción, "Vence pronto". El texto se oscureció para AA: 4,94:1 sobre `durazno` |
| `rosa-alerta` / `rosa-alerta-texto` | `#FCE1E4` / `#B4232C` | Cajas de error (`ERROR_BOX`), texto de error (`ERROR_TEXT`), "Vencido" |
| `peligro` | `#C62828` | Botón de peligro ("Archivar"), borde de un campo con error, punto de "Vencido" |
| `azul-borrador` | `#3B82F6` | Solo el punto de estado "Procesando" (`StatusDot tone="azul"`) |
| `gris-reemplazada` | `#B5AC9A` | Punto de "Archivado" y de versión reemplazada |
| `barro` | `#9C5A2E` | Un ícono del panel de métricas |
| `barro-puerta` | `#5C3420` | Sin uso (ver Pendientes) |

### 2.2 Colores reservados y restricciones

- **Naranja (`naranja`, `#E85114`): solo para foco e indicadores, nunca para texto ni como fondo de
  texto.** Con texto blanco da 3,74:1 y no llega a AA. Se usa en el anillo de foco, en flechas e íconos
  chicos y en la barra de "vence pronto". Si hace falta un botón naranja con texto, es `naranja-boton`.
- **Celeste (`celeste`): solo del asistente.** Los encabezados del chat lo usan; ninguna otra pantalla.
  Por eso el resaltado de la búsqueda es `durazno` y los archivos Markdown/Word son azules, no celestes.
- **`naranja-boton`: el botón de IA** (`BUTTON_AI` en `components/chat/design.tsx`, con "✦"). No es el
  botón principal de las demás pantallas: ese es `bosque`.
- **Los colores de estado nunca van solos**: siempre con la palabra ("Vencido", "Vence pronto",
  "Archivado"). `StatusDot` dibuja un punto decorativo más el texto.

### 2.3 Colores por tipo de archivo (`FILE_TYPE_COLORS`, en `list-design.tsx`)

La hoja del ícono va en el fondo pastel y el glifo y la extensión en la tinta oscura del mismo tono. Se
definen **solo ahí**; el ícono grande (tarjetas) y el chico (listas) usan los mismos.

| Tipo | Extensiones | Fondo | Tinta | Contraste |
|---|---|---|---|---|
| PDF | pdf | `#FCE1E4` | `#B4232C` | 5,3:1 |
| Documento | md, doc, docx | `#DBEAFE` | `#1E40AF` | 7,2:1 |
| Texto | txt y cualquier extensión desconocida | `#ECEEED` | `#3F4A45` | 7,9:1 |
| Planilla (por si se habilita) | xls, xlsx, csv | `#E3F4E1` | `#1F6B3A` | 5,7:1 |
| Presentación (por si se habilita) | ppt, pptx | `#FCE9E0` | `#B53C0A` | 4,9:1 |

Hoy la carga acepta solo PDF, TXT y MD, y cada uno tiene su color. Para un tipo nuevo, sumalo en
`FILE_TYPE_COLORS` y en el mapa de extensiones de `list-design.tsx`, con su contraste medido.

## 3. Tipografía

Una sola familia: **Plus Jakarta Sans** (`font-sans`), pesos 400 a 800.

| Uso | Clases | De dónde |
|---|---|---|
| Título de la pantalla (h1) | `text-3xl font-extrabold tracking-[-0.02em] text-bosque sm:text-[40px] sm:leading-tight` | `PAGE_TITLE` |
| Subtítulo de la pantalla | `text-lg text-texto-suave` | `PAGE_SUBTITLE` |
| Título de sección o panel (h2) | `text-xl font-bold` | paneles del detalle, secciones de la carga |
| Etiqueta de campo | `font-semibold` | `LABEL` |
| Ayuda debajo de un campo | `text-sm text-texto-suave` | `HINT` |
| Etiqueta de un dato (`dt`) | `text-xs font-semibold tracking-wide text-texto-suave uppercase` | `META_LABEL` |
| Fechas y números alineados | `tabular-nums` | fechas, tamaños, versión |

Un título que viene de datos (el de un documento) puede ser largo: `min-w-0 break-words`, o `truncate` /
`line-clamp-2` con el texto completo en `title`.

## 4. Espaciado y formas

| Qué | Valor |
|---|---|
| Ancho de página | `mx-auto w-full max-w-6xl px-4` |
| Margen vertical de página | `pt-8`; abajo, `pb-28` si lo último de la página es un botón (deja lugar a lo que flota en desarrollo: el selector de sesión y la insignia de Next) |
| Entre bloques de una página | `gap-6` a `gap-8` |
| Dentro de una tarjeta | `p-6` (`LIST_PANEL`) |
| Entre la etiqueta, el campo y la ayuda | `gap-1` a `gap-2` |
| Radio de tarjetas | `rounded-2xl` |
| Radio de botones y campos | `rounded-xl` |
| Radio de chips | `rounded-lg` (área), `rounded-md` (versión, tipo) |
| Alto de botones y campos | `min-h-12` (48 px). Botón chico: `min-h-11` (44 px, lo mínimo para tocar en el celular) |
| Sombra | `shadow-sm` en tarjetas; `shadow-md` solo al pasar sobre una tarjeta con enlace |

## 5. Botones

Todos se hunden 1 px al apretar, tienen foco visible y se quedan quietos con `motion-reduce` (sección 7).
Usá las versiones de `list-design.tsx`:

| Botón | Clase | Cuándo |
|---|---|---|
| **Principal** | `LIST_BUTTON_PRIMARY` (fondo `bosque`, texto blanco) | **Uno por pantalla**: la acción que la gente viene a hacer ("Cargar documento", "Descargar"). Va en el encabezado, a la derecha |
| **Secundario** | `LIST_BUTTON_SECONDARY` (borde `bosque`, fondo blanco) | Acciones de uso común que no son la principal ("Cambiar áreas", "Marcar como revisado", "Cancelar") |
| **Peligro** | `LIST_BUTTON_DANGER` (borde y texto `peligro`) | Acciones que no se deshacen ("Archivar"). Separado de los demás (`sm:ml-auto`), nunca pegado al principal |
| **Chico** | `LIST_BUTTON_SMALL` | Acciones dentro de una fila o ficha ("Quitar") |
| **Enlace de texto** | `TEXT_LINK` | "Ir a la primera página", "Ver todas" |
| **Ruta** | `DocumentsBreadcrumb` / `Breadcrumb` | "Documentos › título", arriba de todo, en el detalle y la carga. `nav` con `aria-label="Ruta"`, `aria-current="page"` en el último; "Documentos" conserva `?vista=` |
| **Volver** | Enlace con `BACK_LINK` | "← Volver a Documentos", arriba de todo, en Alertas y Por revisar |
| **Ícono** | `LIST_BUTTON_SMALL` + `size-11 px-0` | Una acción repetida en cada fila ("Descargar la versión 2"): el SVG `aria-hidden` y el nombre en `aria-label` y `title` |

Mientras se envía: el botón queda deshabilitado, con `aria-busy` y un texto que lo dice ("Cargando…",
"Guardando…").

## 6. Patrones de pantalla

### 6.1 Encabezado

`PageHeader` de `list-design.tsx`: el **título va afuera de las tarjetas**, con el subtítulo debajo y la
**acción principal a la derecha** (debajo en el celular). La acción es un único elemento, que se
reacomoda con flex: no hagas una versión para escritorio y otra para celular.

```tsx
<PageHeader
  title="Documentos"
  subtitle="Los documentos vigentes de tus áreas. Buscá, descargá y revisá."
  action={isAdmin && <Link href="/documentos/nuevo" className={LIST_BUTTON_PRIMARY}>Cargar documento</Link>}
/>
```

`meta` pone marcas junto al título (Vencido, Archivado) y `wrap` deja cortar títulos largos. El
`PageHeader` de `design.tsx` es la versión anterior, sin acción: no lo uses en pantallas nuevas.

### 6.2 Tarjetas

- **Con enlace** (`LIST_CARD` + `LIST_CARD_LINK` o `TILE_LINK`): toda la tarjeta lleva al detalle. El
  enlace del título se estira sobre la tarjeta (`after:inset-0`) y hay **un solo enlace por tarjeta**. Lo
  que tenga que seguir usable encima (otro botón, texto para seleccionar) va dentro de `LIST_CARD_LAYER`
  (`relative z-10`).
- **Sin enlace** (`LIST_PANEL`): paneles y secciones de formulario, con su `h2`.
- **Datos dentro de una tarjeta**: `dl` con `META_LABEL` en el `dt` y el valor debajo, en grilla de 2 o 3
  columnas.
- Cada documento es un `article` con su título en `h2`.

### 6.3 Listas

La vista Lista de Documentos, estilo Drive:

- Un `ROW_PANEL` con una fila de encabezados (solo visual, `aria-hidden`) y filas `ROW` con la **misma
  grilla** (`ROW_GRID`), así las columnas quedan alineadas.
- En cada fila, el nombre de cada dato va como `dt` con `sr-only`.
- **Desde `md`, columnas; en el celular, la fila se apila**: título arriba y los datos en una línea, con
  "·" entre ellos. Cada dato se dibuja una sola vez y solo cambia cómo se acomoda.
- Para elegir la vista: `VIEW_SWITCH` con botones `VIEW_OPTION` y `aria-pressed`. La vista vive en la
  URL (`?vista=`), nunca en `localStorage`.

### 6.4 Marcas, chips e íconos

| Pieza | Para qué |
|---|---|
| `AreaChips` | Las áreas, una por chip, con "(inactiva)" si corresponde |
| `StatusDot` | Punto decorativo y palabra: Vencido, Archivado, Vigente, Procesando |
| `ReviewStatusBadge` | "Vencido" / "Vence pronto" (lo decide la API) |
| `FileTypeIcon` | La hoja del tipo de archivo, grande (`lg`) o chica (`sm`). Es decorativa: acompañala con `sr-only` "Archivo PDF" |
| `VERSION_CHIP` | "v3" |
| `AttachmentStrip` | Un archivo como adjunto: clip, nombre recortado y tamaño |

### 6.5 Estados vacíos y de error

`ScreenState` (`components/ui/ScreenState.tsx`), con el texto que decide cada pantalla:

- `kind="empty"`: un mensaje que dice qué pasa ("Todavía no hay documentos en tus áreas") y, si
  corresponde, la acción para salir de ahí ("Cargar el primer documento").
- `kind="error"`: el mensaje y, si se puede reintentar, `onRetry` ("Reintentar").
- `kind="loading"`: con el esqueleto como `children` (el texto queda solo para lectores de pantalla).

### 6.6 Esqueletos de carga

Copian la forma de lo que va a aparecer, así la pantalla no salta: las mismas tarjetas o filas, en
`bg-borde`, con `animate-pulse motion-reduce:animate-none`. Si la pantalla tiene varias vistas, el
esqueleto es el de la vista activa (`DocumentListSkeleton` recibe `variant`).

## 7. Movimiento

Poco y con sentido: responde a lo que hace la persona, nunca anima por su cuenta.

| Qué | Cómo | Clases |
|---|---|---|
| Tarjeta con enlace, al pasar | Sube 2 px, crece la sombra y se oscurece el borde | `hover:-translate-y-0.5 hover:shadow-md hover:border-bosque/30` |
| Fila, botón secundario u opción, al pasar | Fondo `salvia` | `hover:bg-salvia` |
| Botón, al apretar | Se hunde 1 px | `active:translate-y-px` |
| Enlace de la ruta, al pasar | Se subraya | `hover:underline` |
| Desplegable | La flecha gira | `rotate-90` |

**Siempre con `motion-reduce`**: todo lo que se mueve tiene su versión quieta
(`motion-reduce:transition-none`, `motion-reduce:hover:translate-y-0`,
`motion-reduce:active:translate-y-0`, `motion-reduce:animate-none`). Las constantes de `list-design.tsx`
ya lo traen.

No hay animaciones al bajar por la página, ni carruseles, ni cosas que parpadeen o se muevan solas.

## 8. Accesibilidad

- **Foco visible**: anillo naranja de 2 px con 2 px de separación (global en `globals.css`; en los
  componentes, `focus-visible:outline-naranja`). En tarjetas y filas, el foco rodea la tarjeta entera
  (`has-[a:focus-visible]:outline-…`).
- **Teclado**: todo se usa con Tab y Enter.
  - Un solo enlace por tarjeta o fila.
  - Los controles visualmente ocultos (por ejemplo, el `input type="file"` de la zona para soltar) van con
    `sr-only`, nunca con `display: none`, para que se llegue con Tab.
  - Los botones que se prenden y apagan llevan `aria-pressed`, y los desplegables `aria-expanded`.
- **Contraste mínimo AA**: 4,5:1 para texto normal. Medilo antes de sumar un color. Ya hubo que oscurecer
  `texto-suave` y `durazno-texto` para llegar.
- **Nombres accesibles**: un botón con poco texto se completa con `sr-only` dentro del botón ("Quitar el
  archivo elegido"), con el espacio afuera del `span` (`Quitar <span className="sr-only">el archivo
  elegido</span>`). Evitá `aria-label` con palabras que ya son la etiqueta de un campo: los tests de
  Playwright buscan por etiqueta como parte del texto y encontrarían dos elementos.
- **Errores**: junto al campo (`FieldError`), asociados con `aria-describedby`, y el campo con
  `aria-invalid`. Después de enviar con errores, el foco va al primer campo marcado.
- **Avisos que llegan solos** ("Revisión registrada", resultados de búsqueda): `role="status"` o
  `aria-live="polite"`.
- **Celular**: todo lo que se toca mide al menos 44 px de alto.

## 9. Qué no hacer

Lo que hace que una pantalla se vea genérica o fuera del sistema:

- Usar colores que no son tokens (`zinc`, `gray`, `blue-500`, hex sueltos).
- Usar el naranja para texto o como fondo de texto, o el celeste fuera del asistente.
- Poner varios botones con el mismo peso en fila, o dos botones principales.
- Pegar "Archivar" o cualquier acción destructiva al botón principal.
- Meter el título de la pantalla dentro de una tarjeta, o poner la acción principal en una fila aparte,
  lejos del título.
- Hacer clickeable solo el título de una tarjeta, o poner dos enlaces en la misma tarjeta.
- Indicar un estado solo con color, sin palabra.
- Dibujar una versión distinta del mismo elemento para escritorio y para celular, en vez de reacomodarlo.
- Animar sin `motion-reduce`, o animar cosas al bajar por la página.
- Esconder el foco (`outline-none` sin un reemplazo visible).
- Mostrar "Cargando…" en texto donde puede ir un esqueleto con la forma real.
- Escribir textos vagos ("Error", "Sin datos"): decí qué pasó y qué se puede hacer.
- Copiar las clases de `list-design.tsx` en otro archivo en vez de importarlas.

## 10. Cómo aplicar este diseño en una pantalla

El flujo que venimos usando:

1. **Rama aparte**: nunca sobre `develop` ni `main`.
2. **Captura antes**: sacá una captura de la pantalla como está (por ejemplo,
   `capturas/<pantalla>-antes.png`). Las capturas son para comparar y compartir en la revisión, **no se
   suben al repo**: `capturas/` está en `.gitignore`.
3. **Plan primero (plan mode)**:
   - Leé los archivos de la pantalla y escribí qué cambiarías y por qué, sin tocar código.
   - Revisá qué tests y qué partes de la spec dependen de lo que vas a cambiar, y avisá antes de tocarlos.
   - Si un cambio choca con la spec, anotalo en la spec ("Actualizada el…" y una decisión nueva, como D8
     en `specs/002-pantallas-documentos/plan.md`).
4. **No tocar lo compartido ni lo de otros sin acuerdo del equipo**: `design.tsx`, `components/ui/*`, el
   header, los layouts, `globals.css` ni componentes de otros integrantes. Se pueden cambiar si se decide
   en grupo.
   - Si te falta algo, creá una variante local o sumá una prop opcional.
   - Para saber de quién es un componente, preguntá: `git log` no alcanza.
5. **Tests, lint y typecheck**: `npx vitest run`, `npx eslint` y `npx tsc --noEmit` en `apps/web`. Si
   tocaste la API, lo mismo en `apps/api`. Antes de mergear, los e2e de Playwright (simulados e
   integración).
6. **Captura después**: la misma pantalla, para comparar con la de antes.

## 11. Pendientes conocidos

Decisiones del equipo. Nada de esto se cambió todavía.

- **Skill de diseño: el equipo usa design-taste-frontend, que está en .claude/skills/design-taste-frontend (se actualiza a mano si sale una versión nueva). Reemplaza a la skill que se había votado: no instalen las dos, porque se contradicen.
- **Mover las piezas generales a un lugar común.** Los botones con respuesta (`LIST_BUTTON_*`), la tarjeta
  (`LIST_CARD`, `LIST_PANEL`) y el encabezado (`PageHeader`) están en
  `components/documents/list-design.tsx`, pero no son solo de Documentos. La propuesta es pasarlos a un
  lugar común, como `components/ui`. Mientras tanto, importalos de donde están.
- **`ScreenState`** (`components/ui/ScreenState.tsx`) usa grises `zinc` en vez de los tokens.
- **`components/ui/Button`** todavía usa los colores anteriores (lo dice el comentario de `design.tsx`):
  por eso los botones se usan como clases.
- **Tokens sin uso o casi sin uso** (no se recomienda borrarlos; queda para decidir):
  - `barro-puerta` (`#5C3420`): sin uso en el código.
  - `barro` (`#9C5A2E`): un solo uso, un ícono del panel de métricas.
- **Dos `PageHeader`**: el de `design.tsx` (sin acción) y el de `list-design.tsx` (con acción). Las
  pantallas nuevas usan el segundo. El primero lo siguen usando `/documentos/alertas`,
  `/documentos/por-revisar`, `/ejecuciones`, `/metricas` y `ExecutionView`.
