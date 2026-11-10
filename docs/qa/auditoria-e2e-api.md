# C-02 — Auditoría de pruebas E2E de la API

**Proyecto:** PispIAr — IntegrarTEC 2026
**Equipo:** A — Seguridad y Plataforma
**Fecha:** 10/11/2026
**Estado:** Auditoría estática inicial, sin ejecución de E2E

## 1. Objetivo

Identificar la cobertura de pruebas de integración existente, verificar los mecanismos de aislamiento de datos y registrar los riesgos que deben resolverse antes de ejecutar o ampliar las pruebas E2E.

## 2. Inventario de pruebas

Se identificaron 43 archivos `*.e2e-spec.ts` en `apps/api/test/`:

| Módulo | Archivos |
|---|---:|
| Autenticación | 4 |
| Documentos | 16 |
| Procedimientos | 9 |
| Ejecuciones | 4 |
| Chat | 3 |
| Procesamiento | 5 |
| Generales | 2 |
| **Total** | **43** |

También existen cinco archivos de integración web en `apps/web/e2e/integracion/`.

El inventario no equivale a una ejecución exitosa ni acredita cobertura completa de todos los requisitos.

## 3. Configuración E2E de la API

Archivos revisados:

- `apps/api/test/jest-e2e.json`
- `apps/api/test/global-setup.ts`
- `apps/api/test/setup-env.ts`
- `apps/api/test/test-database.ts`

La suite utiliza Jest y `ts-jest`, con `maxWorkers: 1`.

El `globalSetup` ejecuta `prisma migrate reset --force` sobre la base configurada para testing.

### Protecciones identificadas

- Uso obligatorio de `TEST_DATABASE_URL`.
- Nombre de base terminado en `_test`.
- Verificación de host local antes del reset.
- Rechazo de coincidencias con la base de desarrollo configurada.
- Uso obligatorio de `TEST_REDIS_URL`.
- Comprobaciones de aislamiento para Redis.

**Precaución:** no ejecutar las pruebas E2E antes de verificar las variables de entorno y confirmar que la base de pruebas puede ser reiniciada sin pérdida de datos importantes.

## 4. Estado de integración continua

El workflow `.github/workflows/ci.yml` ejecuta:

- Lint API.
- Tests unitarios API.
- Build API.
- Lint Web.
- Tests unitarios Web.
- Build Web.

Actualmente no ejecuta las suites E2E de API ni las pruebas de integración web.

Por lo tanto, un CI exitoso no garantiza que todas las integraciones con PostgreSQL y Redis funcionen correctamente.

## 5. Hallazgo C-02-H01 — Conflicto de visibilidad

**Prioridad:** Alta
**Archivo:** `apps/api/test/documents/assignments.e2e-spec.ts`
**Escenario:** E22 de la spec 008

El test E22 espera que un EMPLOYEE continúe viendo documentos asociados exclusivamente a un área desactivada.

La corrección A-SEC del Equipo A restringe ese acceso utilizando las áreas activas autorizadas por `JwtAuthGuard`.

### Comportamiento propuesto por A-SEC

- EMPLOYEE y SUPERVISOR no obtienen acceso mediante áreas inactivas.
- Las asociaciones y referencias históricas permanecen almacenadas.
- ADMIN conserva su acceso global.
- Los documentos no autorizados se excluyen del listado y devuelven 404 en el detalle.

### Acción pendiente

Coordinar con el Equipo C la actualización del criterio de visibilidad de la spec 008 y del test E22.

No modificar el test únicamente para obtener un resultado exitoso sin confirmar primero el contrato funcional.

## 6. Hallazgo C-02-H02 — Ausencia de E2E en CI

**Prioridad:** Media-alta

El workflow actual no ejecuta pruebas E2E.

Antes de incorporarlas es necesario definir una infraestructura aislada de PostgreSQL y Redis, sus variables de entorno, el procedimiento de migraciones y la limpieza segura de datos.

## 7. Próximas acciones

1. Acordar el comportamiento del escenario E22 con el Equipo C.
2. Verificar el aislamiento efectivo de PostgreSQL y Redis en el entorno local.
3. Ejecutar una suite E2E seleccionada en una base descartable.
4. Registrar los resultados y corregir fallos confirmados.
5. Evaluar la incorporación progresiva de E2E al CI.

## 8. Criterio de cierre

La auditoría estará completa cuando el inventario esté registrado, los conflictos de comportamiento tengan responsables identificados y exista un procedimiento seguro para ejecutar pruebas E2E sin afectar datos de desarrollo.