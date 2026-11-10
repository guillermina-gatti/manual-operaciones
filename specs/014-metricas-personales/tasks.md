# Tareas 014 · Métricas personales del empleado

- **Spec:** [spec.md](./spec.md) · **Plan:** [plan.md](./plan.md)
- **Responsable:** Mayra Limachi (pareja B)
- **Estado (08/11/2026):** T01 a T05 **hechas** y en `develop` (merge `a6affa4`). T06 y T07 quedan pendientes por decisión de Mayra. Esta lista se armó después del código, con los commits reales.

## Convenciones

- **Commits:** en inglés, en imperativo, con tipo y ámbito.
- **Tests:** lint, typecheck y unitarios con cada commit; los e2e de la API los corre Mayra (`pnpm test:e2e test/executions --runInBand`, desde `apps/api`, con Docker).
- **Archivos de otros:** ninguno. En `apps/web/lib/api/index.ts` solo se agregan líneas; `design.tsx` solo se importa.

## API

### T01 · Agregados del usuario

- **Qué hace:** `userId` opcional en las consultas agregadas, `inProgressSql` y `mine` en una transacción.
- **Cubre:** R2, R7, R8; plan 1.1.
- **Commit:** `5067598 feat(executions): read the viewer's own execution aggregates`
- **Estado:** hecha.

### T02 · Endpoint

- **Qué hace:** `GET /metrics/me` con su servicio, funciones puras, respuesta y tests unitarios y e2e.
- **Cubre:** R1 a R11.
- **Commit:** `0fe7110 feat(executions): add GET /metrics/me for the employee`
- **Estado:** hecha.

### T03 · Id de usuario vacío

- **Qué hace:** `mine` rechaza un `userId` vacío o con espacios antes de consultar.
- **Cubre:** R11.
- **Commit:** `3d776f5 fix(api): reject personal metrics without a user id`
- **Estado:** hecha.

## Web

### T04 · Página

- **Qué hace:** refactor de filtros y tiles, la página con filtros y resumen, "Para retomar", la tabla de procedimientos recientes y el link desde `/ejecuciones`.
- **Commits:** `35f72a2`, `a4924d7`, `51fc866`, `e4c73dd`, `b0c7777`
- **Estado:** hecha.

### T05 · Cobertura

- **Qué hace:** tests de sesión, errores 400, 401 y 403, directorio de áreas caído, secciones ocultas con error, y "abandonada" ausente también en atributos accesibles.
- **Commits:** `019679a`, `95ffe15`
- **Estado:** hecha.

## Pendiente

### T06 · Comparación con el promedio de los demás

- **Qué hace:** campos nuevos con las reglas de privacidad de la spec (P6).
- **Depende de:** que Mayra la pida.
- **Estado:** pendiente.

### T07 · Actividad por semana

- **Depende de:** que Mayra la pida.
- **Estado:** pendiente.
