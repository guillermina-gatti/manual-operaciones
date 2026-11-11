# Spec 016 · Datos de demostración de procedimientos (HU41)

- **Responsable:** Micaela Franco (pareja B)
- **Depende de:** spec 006 (borradores, pasos 1..n y áreas), spec 015 (versiones, `step_key`, cambio crítico) y los fixtures de la pareja A (áreas Ventas y Operaciones, usuario admin).
- **Estado:** borrador → implementación T01 a T05. Sin migraciones: no cambia el esquema.

## 1. Objetivo

Cargar en la base de **desarrollo** los procedimientos de una empresa ficticia, **"Supermercado La Esquina"**, para poder demostrar el producto (catálogo, ejecuciones, historial y comparación de versiones) sin armar los datos a mano.

## 2. Datos

| # | Procedimiento | Área(s) | Versiones |
|---|---|---|---|
| 1 | Cierre de caja | Ventas | V1 reemplazada, V2 publicada con cambio crítico |
| 2 | Atención de un cambio de producto | Ventas | V1 publicada |
| 3 | Apertura del local | Ventas | V1 publicada |
| 4 | Recepción de mercadería | Operaciones | V1 publicada |
| 5 | Limpieza del depósito | Operaciones | V1 reemplazada, V2 publicada con cambio crítico (un paso agregado, uno modificado y uno quitado) |
| 6 | Control de stock | Operaciones | V1 publicada |
| 7 | Atención de reclamos | Ventas y Operaciones | V1 publicada |
| 8 | Inventario anual | Operaciones | solo borrador |

Cada versión tiene de 3 a 6 pasos reales, en español, con título y descripción.
El #1 y el #4 reutilizan los UUID de `src/executions/adapters/procedure-fixtures.ts` (que no se modifica); los demás usan UUID fijos con los mismos prefijos (`1a` procedimientos, `1b` versiones, `1c` pasos, `1d` claves de paso).

## 3. Reglas

- **S1 · Idempotente.** Ids fijos y `upsert`: correrlo dos veces deja exactamente lo mismo.
- **S2 · Usa lo de la pareja A.** Los UUID de las áreas y del admin son los de `AREA_IDS` y `FIXTURE_USERS.admin`. Si el admin o alguna área no existen en la base, falla con un mensaje claro **sin escribir nada** (verifica antes y escribe en una sola transacción).
- **S3 · Cumple las specs 006 y 015.** Pasos numerados 1..n; como máximo un borrador y una publicada por procedimiento; el mismo paso conserva su `stepKey` entre versiones; el cambio crítico lleva resumen de 1 a 300 caracteres; `publishedById` es el admin; `ownerId` y `createdById` también.
- **S4 · No toca lo creado desde la app.** Solo escribe filas con los ids del seed.
- **S5 · Procedimiento con datos ajenos.** Si un procedimiento demo ya tiene versiones o pasos que no son del seed, se saltea entero con un aviso (no se pisa nada) y el resto sigue.
- **S6 · Fechas fijas en UTC.** `createdAt` y `publishedAt` son constantes, no `now()`.
- **S7 · Solo pareja B.** Escribe solo `procedures`, `procedure_versions`, `steps` y `procedure_areas`. No se modifica ningún archivo de otra pareja. La línea que lo engancha en `prisma/seed.ts` (compartido) la agrega la pareja A, o se agrega con el OK de Micaela; hasta entonces se corre por separado.

## 4. Decisiones

- **P1 · Producción (resuelta).** `prisma/seed.ts` bloquea `NODE_ENV=production` y exige que la base esté en `localhost`; el seed de demostración aplica la misma guarda en su punto de entrada, por lo que **no corre en AWS**.
- **P2 · Cómo se corre solo.** Sin script en `apps/api/package.json` (es compartido): comando directo con `ts-node` y el mismo `-r ./test/resolve-js-to-ts.cjs` (ver el plan).
- **P3 · Dónde va el código.** En `src/procedures/demo/` con su `.spec.ts` al lado; el punto de entrada en `prisma/seed-demo.ts`.
- **P4 · Cierre de caja V2.** En los fixtures es `isCritical: false`; en la base de demostración se marca crítica, con el resumen de los fixtures.
- **P5 · Recepción de mercadería.** Los fixtures tienen 2 pasos; se agrega un tercero (`1c…23`) para cumplir "3 a 6 pasos".
