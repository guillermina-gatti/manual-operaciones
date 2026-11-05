---
name: pispiar-design
description: Aplicar el diseño ganador de pispIAr (verde bosque, naranja, hornero) al front de apps/web: tokens, componentes, textos y pantallas. Usar al crear o rediseñar pantallas de la web.
---

# Diseño pispIAr (versión votada, pantallas v2)

Este skill describe el diseño que ganó la votación del equipo (PDF `pispIAr-pantallas-v2`). Sirve para construir o rediseñar pantallas de `apps/web` (Next.js App Router + Tailwind) con el mismo aspecto. Todo en español rioplatense (voseo).

## Reglas antes de tocar código

1. **El código de otras parejas no se modifica.** `globals.css`, `app/layout.tsx`, `components/ui/*`, `components/session/*` y las pantallas de otros son compartidos. Si el diseño necesita cambiarlos (tokens globales, sidebar, fuente), **avisá y proponé el cambio para que lo acuerde el equipo**; no lo hagas por tu cuenta.
2. En las pantallas propias, aplicá el diseño solo en la vista (`components/...`). La lógica (`lib/...`) no cambia por un rediseño.
3. Primero mostrá qué archivos vas a tocar y esperá el OK.
4. Los tests existentes usan roles y textos accesibles (`getByRole`, `getByText`). Si cambiás un texto visible, actualizá el test en el mismo commit y avisá.
5. Commits `style(web): ...` o `feat(web): ...`, chicos, sin mencionar herramientas de IA.

## Tokens

Ya están cargados en `apps/web/app/globals.css` como tokens de Tailwind v4. Usá las clases (`bg-bosque`, `text-texto-suave`, `bg-chip-area text-chip-area-texto`, `bg-naranja-boton`, `text-durazno-texto`, `text-barro-puerta`…); no escribas colores en hexadecimal en los componentes.

### Colores

| Token | Hex | Uso |
|---|---|---|
| bosque | `#0B4233` | Sidebar, botón primario, títulos grandes, burbuja del usuario en el chat, números de paso en el editor |
| bosque-hover | `#1F5848` | Ítem activo del sidebar (fondo), hover del primario |
| naranja | `#E85114` | Solo decorativo: "IA" del logo, barrita del ítem activo, círculos de recorrido, íconos, paso actual. Nunca fondo de texto blanco |
| naranja-boton | `#B8400F` | Fondo de botones con texto blanco ("Pispear", "Preguntar"); contraste 5,6 a 1. También para texto y links naranjas sobre blanco (5,6 a 1) |
| fondo | `#F6F7F6` | Fondo de la app |
| blanco | `#FFFFFF` | Tarjetas |
| borde | `#E6E9E7` | Borde de tarjetas e inputs |
| texto | `#1E2B27` | Texto principal |
| texto-suave | `#646F6A` (ajustado para contraste AA) | Subtítulos, metadatos |
| celeste | `#D9EFFA` | **Solo del asistente**: cabecera del chat, "¿Dudas con este paso?", resaltado de la cita |
| salvia | `#EEF3F0` | Tip del hornero, pantalla de éxito, filas de pasos |
| chip-area | `#E3F4E1` / texto `#1F6B3A` | Chips de área (Ventas, Operaciones) |
| exito | `#18894C` | "Vigente", "Publicada", frescura alta, "Fluye" |
| durazno | `#FCE9E0` / texto `#B53C0A` (ajustado para contraste AA) | "Se demora", "Nuevo en v3" |
| rosa-alerta | `#FCE1E4` / texto `#B4232C` | "Se abandona" |
| peligro | `#C62828` | Botón "Descartar", ícono de borrar |
| azul-borrador | `#3B82F6` | "Borrador", "En curso" |
| gris-reemplazada | `#B5AC9A` | "Reemplazada" |
| barro | `#9C5A2E` / puerta `#5C3420` | El nido del hornero |

Nunca uses el color solo para dar significado: cada punto de estado va con su texto ("Vigente", "Vence pronto").

### Tipografía

- Fuente: **Plus Jakarta Sans** (Google Fonts), pesos 400 a 800.
- Título de página: 40-44 px, 800, color bosque, letter-spacing -0.02em.
- Subtítulo de página: 18 px, 400, texto-suave.
- Título de tarjeta: 22-24 px, 700.
- Cuerpo: 16 px. Metadatos: 14 px texto-suave.
- Hero: dos líneas, la segunda en naranja (texto grande: pasa AA) ("¡Buen día, Elena! / ¿Qué procedimiento necesitás?").

### Forma

- Tarjetas: blanco, radio 16 px, borde 1 px, sombra muy suave, padding 32 px.
- Botones e inputs: radio 12 px, alto 48-56 px.
- Chips: radio 8 px, 14 px, 600.
- Espaciado en múltiplos de 8; separación entre tarjetas 24-32 px.

## Estructura de la app

- **Sidebar fijo a la izquierda** (≈ 280 px), fondo bosque:
  - Arriba: hornero chico + logo `pisp` blanco, `IA` naranja, `r` blanco.
  - Menú con íconos de línea (Lucide): Inicio, Documentos, Procedimientos, Ejecuciones, Métricas, Usuarios y roles, Asistente. Cada rol ve solo sus ítems (EMPLOYEE: Inicio, Documentos, Ejecuciones, Asistente).
  - Ítem activo: fondo bosque-hover, texto blanco 600 y barrita naranja de 3 px a la izquierda.
  - Abajo: tarjeta "¿Dudas? **Preguntale al hornero**" con el hornero asomado, y el usuario (avatar naranja con iniciales, nombre, "Rol · Área").
- **Barra superior derecha**: píldora "⇄ Ver como: **Elena**" (selector de usuario de prueba) y botón circular con campana.
- **Contenido**: título grande + subtítulo, filtros como píldoras (activa: bosque con texto blanco; inactiva: blanca con borde) y la acción principal a la derecha ("+ Nuevo procedimiento").
- Columna lateral derecha opcional (≈ 360 px) con tarjetas de contexto: tip del hornero, Áreas, Historia.

## Componentes

- **Botón primario**: fondo bosque, texto blanco 600, flecha cuando avanza ("Ingresar →", "Retomar →").
- **Botón de IA**: fondo naranja-boton, ícono ✦, texto blanco ("Pispear", "Preguntar").
- **Botón secundario**: blanco, borde y texto bosque ("Editar borrador", "Volver al anterior").
- **Botón peligro**: blanco, borde y texto peligro ("Descartar").
- **Agregar**: caja con borde punteado, "+ Agregar paso" centrado.
- **Botones de ícono** (subir, bajar, borrar): 48 px, blancos; el deshabilitado en gris claro; borrar en rojo. Siempre con `aria-label`.
- **Input**: blanco, borde, ícono a la izquierda si corresponde, label arriba 600.
- **Chip de área**: chip-area.
- **Estado con punto**: punto de 10 px + texto 600 ("● Vigente", "● Vence pronto", "● Procesando").
- **Badge de archivo**: `PDF`, `MD`, `TXT` en gris claro.
- **Barra de frescura**: fina y redondeada; verde si falta mucho, naranja/rojo si vence pronto, gris si procesa; arriba "Frescura" y "Revisar en 4 días".
- **Progreso por segmentos** (ejecución): hechos en bosque, actual en naranja, pendientes en gris; "2 de 6 pasos hechos". Título: "Tu nido va tomando forma".
- **Recorrido** (lista de procedimientos): círculos naranjas numerados unidos por una línea gris y "6 pasos"; abajo "Versiones" con puntos (v1 Reemplazada, v2 Publicada, v3 Borrador).
- **Fila de paso en el editor**: fondo salvia, círculo bosque con el número, título 600, descripción suave, badge "Nuevo en v3" en durazno, botones subir/bajar/borrar. Encabezado: "Pasos · 5 de 50 · la numeración se acomoda sola".
- **Historia de versiones**: línea vertical con puntos (azul Borrador, verde Publicada, gris Reemplazada) y una línea de explicación.
- **Tip del hornero**: tarjeta salvia con el hornero y un texto corto ("La versión 2 sigue publicada y no se toca…").
- **Tiles de métricas**: ícono naranja en cuadrado gris, etiqueta, número grande 64 px 800 bosque.
- **Mapa de pasos** (métricas): celdas verde "Fluye", durazno "Se demora", rosa "Se abandona", con leyenda y conclusión ("El paso 3 frena a 4 de cada 10").
- **Matriz de roles**: ✓ en círculo verde claro, "—" para no, texto ("Todas", "Su área") cuando hay matices.
- **Chat**: cabecera celeste con hornero, "El hornero", alcance ("Responde solo con lo vigente de **Ventas** y cita la fuente") y "● Conectado". Usuario: burbuja bosque a la derecha. Respuesta: citas numeradas y botones de fuente ("1 Política de devoluciones · v3"). "No encontré" en caja punteada: no inventa. Sugerencias como píldoras. Panel "FUENTE 1" con la cita, borde izquierdo naranja y frases resaltadas en celeste.
- **Pantalla de éxito**: fondo salvia, hornero sobre el nido, hojas verdes, título grande ("¡Terminaste el cierre de caja!"), segmentos completos, "Volver al inicio" y "Ver otro procedimiento".
- **Login**: tarjeta partida; izquierda bosque con logo, "Tu nido de conocimiento", hojas y el hornero sobre el nido; derecha blanca con "¡Hola de nuevo!", campos, "Recordarme", "¿La olvidaste?" en naranja-boton y "Ingresar →".

## Ilustraciones

- El **hornero** y el **nido de barro** son imágenes del equipo. Usá los archivos que el equipo comparta (en `apps/web/public`); no los redibujes ni los generes.
- Hojas verdes decorativas (`#1F5848`, `#2E7D5B`, `#6FAF86`) solo en login, hero y pantallas de éxito, con `aria-hidden`.
- El hornero lleva `alt="Hornero"` solo cuando aporta; si es decorativo, `alt=""`.

## Voz y textos

- Voseo y tono cercano: "Entrá con tu cuenta", "Buscá también adentro de los documentos… (no importan las tildes)".
- Metáforas del hornero, sin abusar: "Recorridos" (procedimientos), "El estante de Ventas" (documentos), "Frescura", "Tu nido va tomando forma", "Dónde se traban" (métricas), "Pispear" (buscar con IA).
- Cada pantalla explica en una línea qué muestra.
- Errores claros y sin culpa; nunca el texto crudo de la API.
- Datos de ejemplo se marcan: "Datos de ejemplo".

## Pantallas de referencia (PDF v2)

1. Login · 2. Inicio · 3. Documentos ("El estante de Ventas") · 4. Procedimientos ("Recorridos") · 5. Editor de borrador · 6. Ejecución paso a paso · 7. Ejecución terminada · 8. Métricas ("Dónde se traban") · 9. Usuarios y roles · 10. Asistente.

## Responsive y accesibilidad

- Debajo de 1024 px el sidebar pasa a menú desplegable y las columnas laterales bajan.
- Contraste AA (4,5 a 1): texto blanco sobre bosque o naranja-boton; nunca texto blanco sobre naranja.
- Foco visible: anillo de 2 px naranja.
- Todo botón de solo ícono lleva `aria-label`.

## Cómo aplicarlo paso a paso

1. Leé la pantalla actual y sus tests.
2. Listá qué partes del diseño entran y qué necesitaría un archivo compartido (avisar, no tocar).
3. Mostrá el plan y esperá el OK.
4. Cambiá solo la vista; mantené roles, labels y textos de los tests, o actualizalos en el mismo commit.
5. Corré `pnpm --filter web lint`, `pnpm --filter web test` y el build con `API_URL`.
6. Mostrá una captura o cómo verlo en `localhost:3001`.
