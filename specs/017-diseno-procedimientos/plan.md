# Plan 017 · Diseño de procedimientos

## Dónde se trabaja

- Rama: `feat/B-procedures-design`, desde `develop`. PR a `develop` con la aprobación de alguien de otra pareja.
- Solo `apps/web/components/procedures/` y `apps/web/tests/components/procedures/`. No cambian la API, el esquema ni los archivos compartidos.
- Commits del tipo `style(web): ...` para lo visual, como en el rediseño de Mayra, y `test(web): ...` y `docs(specs): ...` para lo demás.

## Archivos

| Archivo | Cambio | Reglas |
|---|---|---|
| `design.tsx` | Agrega `SECTION_HEADING`, `SECONDARY_LIFT`, `areaTone` y `ColoredAreaChips`, `STEP_BUTTON` y `STEP_BUTTON_DANGER`, `StepTrail` e íconos `IconPencil` e `IconPlus`; actualiza `STEP_ROW` y `ADD_BUTTON` | D3, D4, D7–D10, D16, D20 |
| `ProcedureList.tsx` | Título de la lista y título "Crear un procedimiento" solo para lectores de pantalla, contador "N procedimientos", recuadro "¡Borrador creado!", botón verde, recuadro del hornero | D1, D5, D6 |
| `ProcedureCard.tsx` | Sombra y movimiento, chips de estado, `StepTrail`, áreas con color | D2, D3, D4 |
| `ProcedureSheet.tsx` | `SECTION_HEADING` y `ColoredAreaChips` | D19 |
| `DraftSections.tsx`, `ProcedureEditorBody.tsx`, `VersionReadOnly.tsx`, `VersionsSection.tsx` | `SECTION_TITLE` pasa a `SECTION_HEADING` | D7 |
| `StepsEditor.tsx` | Sin "Todavía no tiene pasos." | D11 |
| `StepItem.tsx` | Título en negrita | D8 |
| `StepActions.tsx` | `STEP_BUTTON`, `STEP_BUTTON_DANGER` y lápiz en Editar | D9 |
| `AddStep.tsx` | `IconPlus` en lugar de "+" | D10 |
| `AreaChipsField.tsx`, `ProcedureAreasForm.tsx` | Chips propios con el color del área | D12 |
| `DiscardDraft.tsx` | Tachito rojo lleno | D13 |
| `DraftForm.tsx`, `TextField.tsx` | La Descripción del borrador con 1 fila y una prop opcional (`fieldClassName`) para igualar la altura del Título | D23 |
| `VersionTimeline.tsx` | Recuadros sin borde, chips llenos con ✓ ✎ ↺, cambio crítico, "fecha · N pasos" | D14, D15 |
| `StartDraft.tsx`, `CompareVersions.tsx` | `SECONDARY_LIFT` | D16 |
| `CompareResult.tsx` | Color según el tipo de cambio | D17 |
| `PublishVersion.tsx` | Recuadro salvia con el hornero | D18 |

Cada archivo sigue con 120 líneas como máximo. No hay archivos nuevos de código.

## Pruebas

Vitest y Testing Library (`apps/web/tests/components/procedures/`), patrón AAA. Se prueban solo las reglas que cambian lo que se ve o se lee (el color exacto no se prueba píxel a píxel):

| Test | Regla que protege |
|---|---|
| `design.test.tsx` · `areaTone` da durazno a Ventas, azul a Operaciones y el mismo tono a un mismo nombre | D4 (E2) |
| `ProcedureList.test.tsx` · "Procedimientos" aparece una sola vez a la vista y "3 procedimientos" / "1 procedimiento" | D1 (E1) |
| `ProcedureList.test.tsx` · el título "Crear un procedimiento" existe y es `sr-only` | D5 (E8) |
| `DraftForm.test.tsx` · en el Borrador la Descripción es un textarea de 1 fila | D23 (E9) |
| `ProcedureList.refresh.test.tsx` · después de crear, el botón se llama "Crear otro procedimiento" sin "+" y vuelve al formulario | D6 (E4) |
| `StepsEditor.test.tsx` · un borrador sin pasos no muestra "Todavía no tiene pasos." | D11 (E3) |
| `VersionTimeline.test.tsx` · los chips "Publicada", "Borrador", "Reemplazada" y "Cambio crítico" | D14, D15 (E5) |
| Los tests existentes de procedimientos, sin cambiar sus comprobaciones | E6 |

Tests existentes que buscan textos que cambian. Se actualizan en el mismo commit que el cambio y se explican en el PR, porque cambia la spec, no el comportamiento:

- `StepsEditor.test.tsx`: `'+ Agregar paso'` pasa a `'Agregar paso'`. El test "without steps it says so" pasa a comprobar que **no** aparece "Todavía no tiene pasos." (D10, D11).
- `ProcedureEditor.versions.test.tsx`: `'+ Agregar paso'` pasa a `'Agregar paso'` (D10).
- `ProcedureList.refresh.test.tsx`: `'+ Crear otro procedimiento'` pasa a `'Crear otro procedimiento'` (D6).

## Evidencia para el PR

- `pnpm --filter web lint`, `pnpm --filter web test` y `pnpm --filter web build` en verde.
- `git diff --stat develop` muestra solo archivos de `components/procedures`, `tests/components/procedures` y `specs/017-...`.
