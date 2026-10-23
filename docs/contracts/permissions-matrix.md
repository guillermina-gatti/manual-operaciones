# A-02 — Matriz de permisos y reglas de acceso

**Proyecto:** Manual de Operaciones Interactivo con Asistente IA — IntegrarTEC 2026  
**Responsable:** Equipo A — Seguridad y Plataforma  
**Estado:** Borrador para validación entre equipos  
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

### Usuarios y áreas — Equipo A

| Operación | ADMIN | SUPERVISOR | EMPLOYEE |
|---|---|---|---|
| Invitar usuarios | ✅ | ❌ | ❌ |
| Consultar y administrar usuarios | ✅ | ❌ | ❌ |
| Modificar roles | ✅ | ❌ | ❌ |
| Asignar o quitar áreas a usuarios | ✅ | ❌ | ❌ |
| Activar/desactivar usuarios | ✅ | ❌ | ❌ |
| Crear o modificar áreas | ✅ | ❌ | ❌ |
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
- Estas reglas ya están contempladas en la política `document-access.policy.ts` del Equipo C.
- Las operaciones específicas de actualización, archivo y versiones deben mantenerse alineadas con los endpoints que implemente ese equipo.

### Procedimientos y ejecuciones — Equipo B

| Operación | ADMIN | SUPERVISOR | EMPLOYEE |
|---|---|---|---|
| Crear y publicar procedimientos | ✅ | ❌ | ❌ |
| Consultar procedimientos vigentes | ✅ | 🔒 | 🔒 |
| Consultar procedimientos de otras áreas | ✅ | ❌ | ❌ |
| Ejecutar procedimientos de sus áreas | 🟡 | 🟡 | 🔒 |
| Consultar sus propias ejecuciones | 🟡 | 🟡 | ✅ |
| Consultar ejecuciones de empleados de su área | ✅ | 🔒 | ❌ |
| Proponer modificaciones | ✅ | 🟡 | ❌ |
| Aprobar y publicar versiones | ✅ | ❌ | ❌ |

**Pendiente con Equipo B:** confirmar si ADMIN y SUPERVISOR pueden ejecutar procedimientos, y qué operaciones sobre versiones o propuestas se incluyen finalmente en el MVP.

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
| Consultar sus propias ejecuciones | 🟡 | 🟡 | ✅ |

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
| Falla la base de datos durante una consulta necesaria para autorización | Error controlado; nunca conceder acceso por defecto |

## 7. Decisiones pendientes

Antes de considerar aprobada esta matriz, confirmar:

1. Permisos exactos sobre ejecuciones y propuestas de cambios con Equipo B.
2. Tratamiento de áreas desactivadas.
3. Alcance de consultas administrativas sobre conversaciones de IA.
4. Permisos sobre datos del propio perfil.
5. Diferencia entre 403 y 404 para los recursos de cada módulo.
6. Mecanismo de actualización y revocación de sesiones con Equipo A.

---

**Regla principal:** ningún usuario debe obtener más permisos por la falta de información o por un fallo de validación. Ante la imposibilidad de verificar una autorización, el acceso debe denegarse de forma segura.