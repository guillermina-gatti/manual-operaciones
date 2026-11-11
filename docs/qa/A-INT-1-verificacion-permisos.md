# A-INT.1 — Checklist de integración de permisos por rol

**Proyecto:** PispIAr — Manual de Operaciones Interactivo con Asistente IA
**Equipo responsable:** A — Seguridad y Plataforma
**Fecha:** 10/11/2026
**Estado:** Checklist inicial; validación de API parcialmente ejecutada, coordinación interequipos pendiente
**Rama de trabajo:** `docs/A-INT-1-verificacion-permisos`

## 1. Objetivo

Registrar las verificaciones de autorización por rol, vigencia del usuario y pertenencia a áreas, vinculando el contrato A-02 con pruebas existentes y separando los resultados observados de las tareas pendientes. Este documento **no redefine permisos** ni implica que todas las funcionalidades del sistema estén implementadas.

**Documento normativo de referencia:** [`docs/contracts/permissions-matrix.md`](../contracts/permissions-matrix.md).

## 2. Criterios de seguridad acordados

- **ADMIN:** tiene acceso global según las reglas específicas de cada recurso.
- **SUPERVISOR:** solo accede a los recursos permitidos de sus áreas activas.
- **EMPLOYEE:** solo accede a los recursos permitidos de sus áreas activas.
- **Usuario inactivo:** sus peticiones a endpoints protegidos deben rechazarse con `401`, incluso si conserva un JWT anterior.
- **Área inactiva:** no otorga permisos a `SUPERVISOR` ni `EMPLOYEE`. Las asociaciones históricas permanecen almacenadas.
- **Recurso ajeno:** cuando corresponde ocultar su existencia, se responde `404`.
- **Fallo al validar autorización:** no debe conceder acceso por defecto.

Los permisos de operaciones concretas se consultan en A-02; no se infieren de que un usuario pueda iniciar sesión.

## 3. Evidencia de ejecución disponible

**Ejecución local informada el 10/11/2026**, con PostgreSQL `manual_maga_test` en `localhost:5433` y Redis lógico `14`, bases reservadas para pruebas:

- Suite completa de la API: **43 suites, 538 tests**.
- **42 suites aprobadas; 537 tests aprobados; 1 test fallido**.
- La suite `test/auth/auth-directory-catalog.e2e-spec.ts` **aprobó** tras la corrección A-QA.2.
- Único fallo: `test/documents/assignments.e2e-spec.ts`, escenario **E22**, por expectativa de visibilidad anterior a A-SEC.
- La corrección A-QA.2 está en **PR #60 abierto** al momento de preparar este checklist; **no debe atribuirse todavía a `develop`**.

Este resultado demuestra que las pruebas indicadas se ejecutaron localmente, **no** que todas las reglas de la matriz tengan cobertura E2E completa. No se certifica la suite global como verde hasta actualizar y aprobar E22.

## 4. Checklist de verificación

**Leyenda:** `VERIFICADO` = caso cubierto por una suite que aprobó en la ejecución local citada; `PENDIENTE` = falta prueba o confirmación específica; `CONFLICTO` = resultado o expectativa desalineados con el acuerdo.

| ID | Escenario | Resultado esperado | Evidencia / responsable | Estado |
|---|---|---|---|---|
| A-INT-01 | `ADMIN`, `SUPERVISOR` y `EMPLOYEE` consultan `GET /api/areas` con JWT válido | `200`, mismo catálogo con `id`, `name`, `isActive` | `test/auth/auth-directory-catalog.e2e-spec.ts` — Equipo A, PR #60 | VERIFICADO (local) |
| A-INT-02 | Consulta de áreas sin token, con JWT inválido o usuario desactivado | `401` | `test/auth/auth-directory-catalog.e2e-spec.ts` — Equipo A | VERIFICADO (local) |
| A-INT-03 | `ADMIN` consulta `GET /api/users?areaIds=...` con áreas válidas | `200`, candidatos elegibles y DTO público estricto | `test/auth/auth-directory-catalog.e2e-spec.ts` — Equipo A, PR #60 | VERIFICADO (local) |
| A-INT-04 | `SUPERVISOR` o `EMPLOYEE` consulta candidatos | `403` | `test/auth/auth-directory-catalog.e2e-spec.ts` — Equipo A | VERIFICADO (local) |
| A-INT-05 | Cambio de rol o desactivación de cuenta con JWT anterior | Se aplica el estado vigente de PostgreSQL; `403` por rol no permitido, `401` por cuenta inactiva | `test/auth/auth-authorization.e2e-spec.ts`, `test/auth/auth-directory-catalog.e2e-spec.ts` — Equipo A | VERIFICADO (local) |
| A-INT-06 | `SUPERVISOR` o `EMPLOYEE` intenta acceder a un recurso de área ajena o inactiva | Acceso denegado; `404` cuando se oculta existencia | `test/auth/auth-authorization.e2e-spec.ts` prueba `AccessService` con PostgreSQL — Equipo A | VERIFICADO (capa de autorización) |
| A-INT-07 | `EMPLOYEE` consulta documento asociado exclusivamente a un área desactivada | No debe figurar en listado; detalle `404`; vínculo histórico se conserva | `test/documents/assignments.e2e-spec.ts`, caso E22 — Equipo C | CONFLICTO (E22) |
| A-INT-08 | `ADMIN` consulta un documento histórico; usuarios no ADMIN consultan documentos de áreas activas compartidas | Según A-02: acceso global de ADMIN y acceso restringido por área para otros roles | Suites de Documentos — Equipo C; confirmar casos concretos y resultados | PENDIENTE (cotejo por caso) |
| A-INT-09 | `EMPLOYEE` ejecuta procedimiento vigente de sus áreas; `ADMIN`/`SUPERVISOR` intentan ejecutarlo | Permitido para EMPLOYEE elegible; `403` para otros roles, según A-02 | Suites de Procedimientos/Ejecuciones — Equipo B; confirmar casos concretos | PENDIENTE (cotejo por caso) |
| A-INT-10 | IA recupera fragmentos y documentos únicamente dentro del alcance autorizado | Filtrado de permisos previo al envío de contexto al modelo | Suites de Chat/Documentos — Equipo C; revisar evidencia específica | PENDIENTE (cotejo por caso) |

## 5. Incidencia abierta — E22 y A-SEC

El test E22 sigue esperando que un `EMPLOYEE` pueda ver un documento perteneciente **solo** a un área inactiva. Esta expectativa contradice la regla de A-02/A-SEC: el área inactiva conserva las referencias históricas, pero **no concede acceso**.

En la ejecución local observada, el listado devolvió `[]` y E22 falló porque esperaba `[doc.id]`. La aserción del detalle no llegó a completarse debido al fallo previo, por lo que **todavía falta confirmar en ese escenario el `404` esperado**.

**Responsable:** Equipo C (Matías), que debe actualizar la spec 008 y el test E22 según el acuerdo compartido. Equipo A verificará regresiones después de la integración, sin cambiar unilateralmente el contrato del módulo de Documentos.

## 6. Seguimiento de integración

| Pendiente | Responsable | Criterio de cierre |
|---|---|---|
| Fusionar A-QA.2 | Equipo A / revisión del repositorio | PR #60 aprobado y fusionado a `develop` |
| Actualizar E22 y spec 008 | Equipo C | Test refleja pérdida de acceso por área inactiva y conserva referencias históricas |
| Validar suite E2E completa | Equipo A + Equipo C | 43/43 suites y todos los tests en verde con base descartable |
| Cotejar permisos de Documentos, Procedimientos y Chat por caso | Equipos C/B/A | Evidencia de test asociada a cada permiso, o pendiente explícito |
| Incorporar E2E al CI | Equipo A (A-CI.2) | PostgreSQL y Redis aislados en GitHub Actions; sin depender de datos de desarrollo |

## 7. Precauciones de ejecución

- `pnpm --filter api test:e2e` ejecuta un reinicio de la base configurada en `TEST_DATABASE_URL`.
- Ejecutar únicamente contra una base **local y descartable** terminada en `_test`, separada de las bases utilizadas por el equipo; comprobar host, puerto y nombre antes de cada ejecución.
- Utilizar una base lógica Redis exclusiva para pruebas. No ejecutar `FLUSHALL` ni limpiar datos compartidos.
- No incluir contraseñas, `.env` ni volcado de bases en commits o PR.
- Un fallo de Jest no debe ocultarse modificando expectativas sin validar primero el contrato funcional.

## 8. Criterio de cierre de A-INT.1

Este checklist se considera **documentado** cuando cada regla relevante tiene estado y responsable, y está **validado** cuando todos los casos prioritarios están respaldados por resultados de pruebas identificables. Son hitos distintos: el primero no afirma que el segundo ya esté completo.
