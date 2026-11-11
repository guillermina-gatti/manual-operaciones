# Plan 016 · Datos de demostración

## Estructura (cada archivo ≤ 120 líneas)

- `src/procedures/demo/demo-types.ts`: tipos `DemoProcedure`, `DemoVersion`, `DemoStep`.
- `src/procedures/demo/demo-ids.ts`: `demoUuid` y los ids fijos.
- `src/procedures/demo/demo-ventas.ts` y `demo-operaciones.ts`: los 8 procedimientos.
- `src/procedures/demo/demo-procedures.ts`: la lista completa `DEMO_PROCEDURES` (`demo-ventas.ts`, `demo-reclamos.ts`, `demo-operaciones.ts` y `demo-operaciones-2.ts` tienen los datos).
- `src/procedures/demo/demo-preflight.ts`: verifica admin y áreas, y detecta procedimientos con datos ajenos (S2, S5).
- `src/procedures/demo/demo-operations.ts`: arma los `upsert` de un procedimiento.
- `src/procedures/demo/demo-seed.ts`: `seedDemoProcedures(prisma)`, una sola `$transaction`.
- `src/procedures/demo/demo-guard.ts`: guarda de desarrollo (no producción, solo localhost).
- `prisma/seed-demo.ts`: punto de entrada.

## Orden de escritura (dentro de la transacción)

Por procedimiento: `procedure` (upsert) → áreas (`deleteMany` + `createMany`) → versiones en orden de número (upsert) → pasos (upsert por id). Las versiones se escriben V1 antes que V2 para respetar los índices únicos parciales (un borrador y una publicada).

## Cómo correrlo solo (sin `seed.ts` ni script nuevo)

Desde `apps/api`, con `DATABASE_URL` apuntando a localhost y las áreas y usuarios de la pareja A ya cargados (`prisma db seed`):

```
pnpm exec ts-node --transpile-only -r ./test/resolve-js-to-ts.cjs prisma/seed-demo.ts
```

(el mismo comando que `migrations.seed` de `prisma.config.ts`, con otro archivo). Correrlo de nuevo no duplica nada.

## Pruebas

Jest unitario (`pnpm --filter api test`), con `jest.fn().mockResolvedValue`, patrón AAA; la regla S3 se prueba sobre los datos puros, sin base.
