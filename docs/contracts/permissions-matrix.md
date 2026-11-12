# A-02 — Matriz de permisos y reglas de acceso

**Proyecto:** Manual de Operaciones Interactivo con Asistente IA — IntegrarTEC 2026  
**Responsable:** Equipo A — Seguridad y Plataforma  
**Estado:** Acuerdos con Equipo C y criterio de Equipo B incorporado para revisión; otros permisos siguen pendientes

**Actualización:** 01/11/2026 (acuerdos comunicados el 31/10/2026)

**Base revisada:** `develop@3bafc1228878c6f6b83b890931d8dc64927421ac`

**Complementa:** `docs/contracts/users-areas.md`

## 1. Objetivo

Establecer qué operaciones puede realizar cada rol y bajo qué condiciones.

Los permisos no dependen únicamente del rol: también deben considerar las áreas asignadas, el estado del usuario y el estado del recurso.

## 2. Roles

- **ADMIN:** administrador global del sistema.
- **SUPERVISOR:** supervisor con acceso limitado a las áreas que tiene asignadas.
- **EMPLOYEE:** empleado con acceso limitado a sus áreas.

Cada usuario posee un rol global y puede pertenecer a múltiples áreas.

## 3. Matriz de permisos

**Leyenda:**
- ✅ Permitido.
- ❌ Denegado.
- 🔒 Permitido solamente si cumple las condiciones indicadas.
- 🟡 Pendiente de validación con el equipo responsable.
- ⏸️ Fuera del alcance del MVP actual; sus permisos futuros siguen sin definir.

> **Alcance:** esta matriz registra permisos y acuerdos funcionales. No implica que todos los endpoints de todas las filas estén implementados.

### Usuarios y áreas — Equipo A

| Operación | ADMIN | SUPERVISOR | EMPLOYEE |
|---|---|---|---|
| Invitar usuarios | ✅ | ❌ | ❌ |
| Consultar y administrar usuarios | ✅ | ❌ | ❌ |
| Modificar roles | ✅ | ❌ | ❌ |
| Asignar o quitar áreas a usuarios | ✅ | ❌ | ❌ |
| Activar/desactivar usuarios | ✅ | ❌ | ❌ |
| Crear o modificar áreas | ✅ | ❌ | ❌ |
| Consultar catálogo de áreas (`GET /api/areas`) | ✅ | ✅ | ✅ |
| Consultar candidatos a responsables (`GET /api/users?areaIds=...`) | ✅ | ❌ | ❌ |
| Consultar datos de su propia cuenta | ✅ | ✅ | ✅ |
| Iniciar y cerrar su propia sesión | ✅ | ✅ | ✅ |

Todos los accesos requieren autenticación, excepto login, registro por invitación y los endpoints expresamente públicos.

### Documentos — Equipo C

| Operación | ADMIN | SUPERVISOR | EMPLOYEE |
|---|---|---|---|
| Cargar documentos | ✅ | ❌ | ❌ |
| Consultar documentos activos de sus áreas | ✅ | 🔒 | 🔒 |
| Consultar documentos de otras áreas | ✅ | ❌ | ❌ |
| Consultar documentos archivados | ✅ | ❌ | ❌ |
| Asignar responsable de un documento | 🔒 | ❌ | ❌ |
| Gestionar documentos | ✅ | ❌ | ❌ |

**Condiciones:**

- ADMIN puede ver todos los documentos.
- SUPERVISOR y EMPLOYEE únicamente pueden consultar documentos `ACTIVE` que compartan al menos un área con el usuario.
- El responsable debe compartir al menos un área con el documento, salvo que sea ADMIN.
- El catálogo de candidatos es exclusivo para ADMIN y solo incluye usuarios activos elegibles para asignaciones nuevas.
- Al crear o modificar una asignación, se rechazan responsables inactivos y áreas inactivas **nuevamente agregadas**; se conservan las asociaciones históricas que no cambian.
- Equipo C enriquecerá las respuestas de Documentos autorizadas con los nombres y estados `isActive` de responsable, áreas y último revisor cuando el bloque de revisión resulte visible. No se creará `GET /api/users/names`.
- Equipo C conservará el responsable actual en `OwnerField` aunque ya no sea candidato, y validará al responsable en backend solo cuando el ADMIN lo cambie.
- La política actual de visibilidad de Documentos no se amplía por la consulta de nombres.
- Las operaciones específicas de actualización, archivo y versiones deben mantenerse alineadas con los endpoints que implemente ese equipo.

### Procedimientos y ejecuciones — Equipo B

| Operación | ADMIN | SUPERVISOR | EMPLOYEE |
|---|---|---|---|
| Crear y publicar procedimientos | ✅ | ❌ | ❌ |
| Consultar procedimientos vigentes | ✅ | 🔒 | 🔒 |
| Consultar procedimientos de otras áreas | ✅ | ❌ | ❌ |
| Ejecutar procedimientos de sus áreas | ❌ | ❌ | 🔒 |
| Consultar sus propias ejecuciones | ❌ | ❌ | ✅ |
| Consultar ejecuciones de empleados de su área | 🟡 | 🟡 | ❌ |
| Proponer modificaciones (HU33) | ⏸️ | ⏸️ | ⏸️ |
| Aprobar y publicar versiones | ✅ | ❌ | ❌ |

**Criterio MVP propuesto por Equipo B y adoptado en esta revisión por A:** solamente `EMPLOYEE` puede iniciar, consultar sus propias ejecuciones y completar pasos. Ejecuta solo procedimientos de sus áreas vigentes; cuando el recurso no pertenece a sus áreas, corresponde `404`. Un `ADMIN` o `SUPERVISOR` no puede ejecutar (`403` por rol). Esto no cambia sus permisos de consulta de métricas.

**Fuera de alcance:** las propuestas de modificación dependen de HU33 y de versiones publicadas (HU32); su diseño y permisos futuros aún no fueron definidos. La consulta de ejecuciones de terceros es una operación distinta y necesita validación específica, no se deduce del permiso de ejecutar.

**Áreas inactivas en procedimientos:** agregar un área inactiva devuelve `400`, igual que una inexistente; una referencia histórica ya asociada se conserva y su nombre se presenta con ` (inactiva)`. Equipo B documentará e implementará estas reglas en HU10, sin modificar contratos compartidos unilateralmente.

### Asistente de IA — Equipo C

| Operación | ADMIN | SUPERVISOR | EMPLOYEE |
|---|---|---|---|
| Consultar al asistente | ✅ | 🔒 | 🔒 |
| Recuperar fragmentos de documentos autorizados | ✅ | 🔒 | 🔒 |
| Acceder a fragmentos de otras áreas | ✅ | ❌ | ❌ |
| Consultar sus propias conversaciones | ✅ | ✅ | ✅ |
| Consultar conversaciones ajenas | 🟡 | ❌ | ❌ |

El filtro de acceso se debe aplicar **antes de enviar los fragmentos al modelo de IA**.

No alcanza con pedirle al modelo que ignore documentos no autorizados.

### Auditoría y métricas

| Operación | ADMIN | SUPERVISOR | EMPLOYEE |
|---|---|---|---|
| Consultar auditoría global | ✅ | ❌ | ❌ |
| Consultar métricas generales | ✅ | ❌ | ❌ |
| Consultar métricas de sus áreas | ✅ | 🔒 | ❌ |
| Consultar sus propias ejecuciones | ❌ | ❌ | ✅ |

Los detalles de las métricas disponibles deberán validarse con Equipo B.

## 4. Condiciones obligatorias de acceso

### Usuario inactivo

Si `User.isActive = false`:

- No puede iniciar sesión.
- No puede utilizar endpoints protegidos.
- Sus refresh tokens deben revocarse.
- El backend debe rechazar su acceso aunque su access token aún no haya expirado.

Respuesta esperada: `401 Unauthorized`.

### Cambio de rol

Los roles deben consultarse desde la información vigente del servidor.

Si un administrador cambia un usuario de SUPERVISOR a EMPLOYEE, el nuevo rol debe aplicarse desde la siguiente petición autenticada.

### Cambio de áreas

Cuando se retira un área a un usuario:

- Pierde acceso a los documentos y procedimientos de esa área en la siguiente petición.
- No se modifican automáticamente los responsables de documentos anteriores.
- No se reasignan automáticamente los recursos existentes.

### Área inactiva

El `JwtAuthGuard` carga únicamente pertenencias a áreas con `isActive=true`. Por ello, `SUPERVISOR` y `EMPLOYEE` no acceden a documentos o procedimientos vinculados **exclusivamente** a áreas inactivas; `ADMIN` conserva el acceso global según la política propia de cada recurso.

La desactivación **no borra** relaciones históricas. Los listados de nombres pueden mostrar un área inactiva con la etiqueta ` (inactiva)`; las nuevas asociaciones deben ser rechazadas por el módulo dueño del recurso.

### Usuario sin áreas

Un usuario sin áreas asignadas no puede consultar recursos restringidos por pertenencia a áreas.

ADMIN conserva sus permisos globales.

### Recurso sin áreas compartidas

Si el usuario no es ADMIN y no comparte áreas con el recurso, se deniega el acceso.

Para documentos y procedimientos ajenos, se utilizará `404 Not Found` cuando corresponda ocultar su existencia.

## 5. Diferencia entre autenticación y autorización

**Autenticación:** comprueba quién realiza la petición.

Ejemplo: validar el access token y confirmar que la cuenta continúa activa.

**Autorización:** comprueba qué puede hacer ese usuario.

Ejemplo: verificar que tiene el rol requerido y pertenece al área del documento.

El `JwtAuthGuard` resuelve la autenticación; el `RolesGuard` verifica roles. La pertenencia a áreas y el estado del recurso requieren comprobaciones adicionales en el módulo correspondiente.

## 6. Casos de prueba mínimos

| Caso | Resultado esperado |
|---|---|
| Empleado sin token consulta un documento | 401 |
| Empleado intenta cargar un documento | 403 |
| Empleado consulta documento activo de su área | Permitido |
| Empleado consulta documento de otra área | 404 |
| Supervisor consulta documento archivado | 404 |
| ADMIN consulta documento archivado | Permitido |
| Usuario desactivado intenta utilizar JWT vigente | 401 |
| Usuario pierde un área y vuelve a consultar | Acceso denegado |
| Usuario tiene varias áreas y comparte una con el documento | Permitido |
| Usuario sin áreas consulta documentos restringidos | Sin acceso |
| EMPLOYEE inicia ejecución de un procedimiento de una de sus áreas activas | Permitido según Equipo B |
| ADMIN o SUPERVISOR intenta iniciar una ejecución | 403 |
| EMPLOYEE intenta ejecutar un procedimiento de otra área | 404 |
| Recurso vinculado solo a un área desactivada, consultado por EMPLOYEE | No visible |
| ADMIN consulta candidatos para una asignación nueva | Permitido con áreas activas válidas |
| EMPLOYEE o SUPERVISOR consulta el listado de candidatos | 403 |
| Falla la base de datos durante una consulta necesaria para autorización | Error controlado; nunca conceder acceso por defecto |

## 7. Decisiones pendientes

**Decisiones y propuestas consolidadas tras los intercambios del 31/10/2026:**

- Equipo B propuso ejecución y consulta de ejecuciones propias solo para `EMPLOYEE`, por áreas. Equipo A incorpora ese criterio en esta revisión; corresponde comunicar la conformidad a B para que retire la marca de provisional. Proponer modificaciones queda fuera del MVP, pendiente de HU33.
- Equipos B y C: los vínculos con áreas inactivas se conservan históricamente; no pueden incorporarse como nuevas asignaciones.
- Equipo C: listado de candidatos reservado a `ADMIN`; nombres históricos incluidos en respuestas autorizadas de Documentos, sin endpoint nuevo.
- Equipo A: el guard excluye áreas inactivas del contexto autenticado. Se mantiene sin excepción especial para SUPERVISOR y EMPLOYEE.

**Todavía pendiente de confirmación o implementación:**

1. Permisos de consulta de ejecuciones de otras personas (no confundir con consultar las propias).
2. Permisos futuros para HU33 y detalles de versiones que no estén cubiertos por las specs actuales.
3. Alcance de consultas administrativas sobre conversaciones de IA.
4. Permisos sobre datos del propio perfil.
5. Diferencia entre `403` y `404` en otras operaciones específicas por recurso.
6. Mecanismos administrativos adicionales de usuarios y áreas que no estén implementados.
7. Integración de nombre y estado de usuarios/áreas en los DTO de Documentos y comprobación E2E con base real (Equipo C).

---

**Regla principal:** ningún usuario debe obtener más permisos por la falta de información o por un fallo de validación. Ante la imposibilidad de verificar una autorización, el acceso debe denegarse de forma segura.