# Plan 018 · Menú de ejecuciones para empleados

- **Código:** `apps/web/components/navigation/Sidebar.tsx`: el ítem `ejecuciones` recibe `roles: ['EMPLOYEE']`, igual que otros ítems usan `roles` (R1).
- **Tests:** `apps/web/tests/components/navigation/Sidebar.test.tsx`:
  - el test de EMPLOYEE sigue esperando "Ejecuciones" (E1);
  - los tests de SUPERVISOR y ADMIN pasan a esperar que no esté (E2, E3);
  - E4 ya lo cubre la protección existente de `/ejecuciones` (RequireRole con EMPLOYEE), que no cambia.
- **Evidencia:** `pnpm --filter web lint` y `pnpm --filter web test` en verde; el diff contra develop tiene solo la spec 018, `Sidebar.tsx` y `Sidebar.test.tsx`; prueba en el navegador con Ana, Sergio, Sofía y Elena.
