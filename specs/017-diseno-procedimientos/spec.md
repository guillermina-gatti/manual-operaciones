# Spec 017 · Diseño pispIAr de las pantallas de procedimientos

- **Responsable:** Micaela Franco (pareja B)
- **Depende de:** spec 006 (borradores, pasos y áreas: HU09, HU10, HU11), spec 015 (versiones: HU32) y `DESIGN.md` (tokens y reglas de pispIAr).
- **Precedente:** el rediseño de Mayra (`feat/B-executions-design`, `feat/B-metrics-redesign`): mismo criterio, solo cambia cómo se ve.
- **Estado:** diseño aprobado por Micaela con 11 imágenes (17/11/2026). Falta implementar.

## 1. Objetivo

Darles "más color, más vida" a las pantallas de procedimientos **sin cambiar la estructura ni el comportamiento**: los mismos botones, carteles, avisos, textos de las acciones y llamadas a la API. Solo cambian colores, formas, efectos al pasar el mouse y algunos títulos repetidos.

## 2. Alcance

**Entra:** la lista de procedimientos (admin y empleada), el editor del borrador (pasos y áreas), la sección Versiones (historial, nueva versión, comparar, publicar) y la ficha que ve la empleada.

**No entra (no se toca):**
- la API, la base de datos y los datos de demostración (spec 016);
- archivos compartidos de otras parejas: `components/documents/*` (Matías), el `Sidebar` y la sesión (Cami), las pantallas de ejecuciones y métricas (Mayra);
- el texto de los carteles de confirmación y de los avisos ("Cambios guardados", errores);
- los adjuntos de los pasos (siguen como pregunta abierta de la spec 006).

## 3. Pantallas aprobadas

| # | Imagen | Qué muestra |
|---|---|---|
| 01 | lista-y-crear | Lista del admin y "Crear un procedimiento" con el hornero al costado |
| 02 | recien-creado-borrador-pasos-versiones | Aviso "¡Borrador creado!" y el editor |
| 03 | agregar-paso | Formulario de un paso nuevo |
| 04 | cartel-borrar-paso | Confirmación para borrar un paso |
| 05 | cartel-descartar-borrador | Confirmación para descartar el borrador |
| 06 | confirmar-publicar | Recuadro de publicación con el hornero |
| 07 | publicar-con-cambio-critico | Publicación marcando cambio crítico |
| 08 | version-publicada-y-comparar | Historial de versiones y comparación |
| 09 | botones-al-pasar-el-mouse | Cómo reaccionan los botones al pasar el mouse |
| 10 | empleada-lista | Lista de la empleada (solo sus áreas) |
| 11 | empleada-ficha | Ficha de un procedimiento publicado |

## 4. Reglas de diseño

Colores con los tokens de `DESIGN.md`. Donde no hay token se indica el hexadecimal.

### Encabezado y lista

- **D1 · Sin títulos repetidos.** Arriba de la lista se ven solo el título de la página, "Procedimientos", y su frase: "Consultá los procedimientos publicados de tus áreas, paso a paso." (empleada) o "Creá un procedimiento y armá su borrador con pasos y áreas." (admin). El título de la sección de la lista queda solo para lectores de pantalla (`sr-only`) y a la derecha se ve "N procedimientos" ("1 procedimiento" en singular).
- **D2 · Tarjeta.** Tiene sombra suave. Al pasar el mouse sube un poco y su sombra crece. El estado de la versión es un chip: verde con punto si está publicada, azul (`#E3EDFC` / `#1D4ED8`) si es borrador. Si tiene un borrador abierto, suma el chip azul "Borrador abierto".
- **D3 · Recorrido de pasos.** Cada tarjeta muestra puntos naranjas numerados unidos por una línea, uno por paso y hasta 8; el último dice "+N" si hay más. Al lado, "N pasos".
- **D4 · Color por área.** Cada área tiene siempre el mismo color, en las tarjetas, la ficha y el editor: **Ventas** durazno (`durazno` / `durazno-texto`), **Operaciones** azul (`#E3EDFC` / `#1D4ED8`) y cualquier otra verde (`chip-area` / `chip-area-texto`). Para las demás, el color sale del nombre (suma de los códigos de sus letras, módulo 3): el mismo nombre da siempre el mismo color.

### Crear

- **D5 · Crear un procedimiento.** Es la única sección con la rayita naranja en el título. En pantallas medianas y grandes tiene al costado el hornero (`/hornero.png`) con "Como el hornero, paso a paso", 4 puntos naranjas y "Título · Pasos · Áreas · Publicar". En el celular el hornero no se ve.
- **D6 · Borrador creado.** Recuadro salvia con el hornero, "¡Borrador creado!" y "Agregale pasos y áreas abajo. Nadie lo ve hasta que lo publiques." El botón "Crear otro procedimiento" es **verde** (`exito`, más oscuro `#126E3C` al pasar el mouse), con texto blanco y **sin "+"**.

### Editor del borrador

- **D7 · Títulos de sección.** En el editor y en la ficha van en verde bosque, **sin** la rayita naranja. El título del procedimiento no cambia.
- **D8 · Pasos.** Cada paso es un recuadro salvia redondeado; al pasar el mouse se oscurece apenas (`#E7EFEA`) y muestra un borde suave. El título del paso va en negrita.
- **D9 · Botones de un paso** (subir, bajar, editar, borrar). Son blancos con borde. Al pasar el mouse suben, se agrandan un poco y se llenan de verde bosque; el de borrar se llena de rojo (`peligro`). "Editar" tiene un lápiz. Un botón deshabilitado (subir el primero, bajar el último) no reacciona.
- **D10 · Agregar paso.** Botón de borde punteado verde, con el ícono "+" dibujado en SVG (no el carácter "+"). Al pasar el mouse el borde se marca.
- **D11 · Sin pasos.** Si el borrador no tiene pasos, no se muestra el texto "Todavía no tiene pasos.": queda solo "Agregar paso".
- **D12 · Áreas.** Se eligen con chips propios de procedimientos (`AreaChipsField`), no con el campo compartido de documentos. Cada chip marcado toma el color de su área (D4). La aclaración "Un procedimiento puede quedar sin áreas, pero no se puede publicar sin al menos una." se mantiene.
- **D13 · Descartar borrador.** El tachito es un botón cuadrado **rojo lleno** con el ícono blanco, al lado de "Guardar cambios". Al pasar el mouse sube y se oscurece (`#A31F1F`).

### Versiones

- **D14 · Historial.** Cada versión es un recuadro redondeado **sin borde**, sobre la línea de tiempo con sus puntos:
  - **Publicada:** fondo verde claro (`chip-area`) y chip verde lleno (`exito`, texto blanco) "✓ Publicada".
  - **Borrador:** fondo celeste (`#EEF4FE`) y chip azul lleno (`#1D4ED8`, texto blanco) "✎ Borrador".
  - **Reemplazada:** fondo gris (`fondo`) y chip beige (`#ECE7DD` / `#5F5747`) "↺ Reemplazada".

  Debajo va "fecha · N pasos". Al pasar el mouse el recuadro sube un poco.
- **D15 · Cambio crítico.** Es un chip naranja oscuro (`naranja-boton`) con texto blanco y "⚠". El resumen va en un recuadro blanco, sin borde naranja.
- **D16 · Crear nueva versión y Comparar.** Siguen siendo botones secundarios; al pasar el mouse se llenan de verde bosque con texto blanco y suben.
- **D17 · Resultado de comparar.** Los pasos agregados se ven en verde (`chip-area`), los quitados en rosa (`rosa-alerta`) y los modificados en durazno.
- **D18 · Publicar.** La confirmación va en un recuadro salvia con el hornero abajo a la derecha y la pregunta en verde bosque, en negrita. El cambio crítico (casilla y resumen) sigue igual.

### Ficha de la empleada

- **D19** · Los títulos siguen D7 y las áreas D4.

### Generales

- **D20 · Movimiento reducido.** Si el sistema pide reducir el movimiento (`prefers-reduced-motion`), nada sube ni se agranda: solo cambia el color.
- **D21 · Accesibilidad.** Los textos siguen siendo los mismos para los lectores de pantalla. El hornero y los puntos son decorativos (`alt=""` / `aria-hidden`). Se mantiene el foco visible.
- **D22 · Reglas de `DESIGN.md`.** Hay un solo botón principal por pantalla y nunca va texto sobre naranja claro (`naranja`). El chip de cambio crítico usa `naranja-boton`, que sí admite texto blanco.

## 5. Escenarios

**E1 · Título sin repetir (D1)**
- *Dado* una empleada en `/procedimientos` con 3 procedimientos de sus áreas,
- *cuando* carga la lista,
- *entonces* ve el título "Procedimientos" una sola vez, la frase "Consultá los procedimientos publicados de tus áreas, paso a paso." y "3 procedimientos",
- *y* el título de la sección de la lista sigue disponible para los lectores de pantalla.

**E2 · Color de las áreas (D4, D12, D19)**
- *Dado* un procedimiento de Ventas y Operaciones,
- *cuando* se ve en la lista, en la ficha o en el editor,
- *entonces* Ventas siempre es durazno y Operaciones siempre azul,
- *y* un área con otro nombre recibe siempre el mismo color.

**E3 · Borrador sin pasos (D11)**
- *Dado* un borrador recién creado,
- *cuando* se abre el editor,
- *entonces* no aparece "Todavía no tiene pasos." y sí aparece "Agregar paso".

**E4 · Crear otro procedimiento (D6)**
- *Dado* que el admin acaba de crear un borrador,
- *cuando* aparece el aviso "¡Borrador creado!",
- *entonces* el botón dice exactamente "Crear otro procedimiento", sin "+",
- *y* al tocarlo vuelve el formulario de creación, como antes.

**E5 · Estados de versión (D14, D15)**
- *Dado* un procedimiento con V1 reemplazada, V2 publicada con cambio crítico y V3 borrador,
- *cuando* se abre Versiones,
- *entonces* cada versión muestra su chip ("Reemplazada", "Publicada", "Borrador") y la V2 muestra "Cambio crítico" con su resumen.

**E6 · Lo que no cambia**
- *Dado* cualquier acción del editor (guardar, agregar, mover o borrar un paso, descartar, publicar, crear una versión, comparar),
- *cuando* se usa,
- *entonces* hace la misma llamada a la API, muestra el mismo cartel y el mismo aviso que antes del rediseño,
- *y* los tests existentes de `tests/components/procedures/` siguen pasando sin cambiar lo que comprueban (salvo los textos que cambian por D6, D10 y D11, ver el plan).

**E7 · Movimiento reducido (D20)**
- *Dado* el sistema con "reducir movimiento",
- *cuando* se pasa el mouse por una tarjeta o un botón,
- *entonces* cambia el color, pero nada se mueve.

## 6. Decisiones

- **P1 · Una sola rama** (`feat/B-procedures-design`) para HU09, HU10, HU11 y HU32, porque comparten los mismos componentes visuales. Se integra a `develop` con un PR.
- **P2 · Solo `apps/web/components/procedures/`** y sus tests. Lo compartido de documentos (`CHIP`, `StatusDot`, `BACK_LINK`, `LIST_*`, `formatArea`) se **usa** pero no se modifica. Cuando se necesita otro estilo, se pisa con clases propias (sufijo `!` de Tailwind).
- **P3 · Las áreas usan componentes propios** (`AreaChipsField`, `ColoredAreaChips`) en lugar de `AreasField` y `AreaChips` de documentos, para no tocar el código de Matías.
- **P4 · Colores sin token** (azul de Operaciones y del borrador, beige de reemplazada, rojo y verde oscuros al pasar el mouse): se escriben como hexadecimales en `design.tsx` de procedimientos. No se agregan tokens a `globals.css`, que es compartido.
- **P5 · Puntos naranjas:** se ven en las tarjetas y en el recuadro del hornero, **no** dentro del editor, donde los números de los pasos quedan en verde oscuro como hoy.
- **P6 · El hornero** usa `public/hornero.png`, que ya existe en `develop`.

## 7. Preguntas abiertas (fuera de esta spec, no bloquean)

- **Q1 · Menú "Procedimientos" para la empleada.** El `Sidebar` de Cami lo muestra solo a ADMIN y SUPERVISOR, aunque la HU11 pide que la empleada lo vea. Lo tiene que decidir y cambiar Cami.
- **Q2 · Actualización de seguridad de Next.js.** El servidor de desarrollo avisa de una vulnerabilidad conocida. La decisión es de Cami, porque `package.json` es compartido.
