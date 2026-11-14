# PispIAr — A-14 / HU29 · Contrato de Invitaciones y Registro de Usuarios

**Proyecto:** Manual de Operaciones Interactivo con Asistente IA — IntegrarTEC 2026
**Equipo responsable:** Equipo A — Seguridad y Plataforma
**Rama de implementación:** `feat/HU29-user-invitations`
**Estado:** Implementado y verificado (M1 a M5.4)
**Módulos relacionados:** Usuarios (`UsersModule`), Autenticación (`AuthModule`), Sesiones (`SessionService`) y Frontend (`apps/web`)

---

## 1. Objetivo

Definir el contrato técnico, modelo de datos, reglas de seguridad y flujo de usuario del sistema de **invitaciones de un solo uso y registro público de cuentas** (**HU29**).

En PispIAr no existe el auto-registro libre: toda cuenta nueva se origina cuando un `ADMIN` autenticado emite una invitación definiendo el correo electrónico, el rol global y las áreas asignadas. El destinatario únicamente completa su nombre y contraseña al consumir el enlace válido.

---

## 2. Modelo de Datos en PostgreSQL (`schema.prisma`)

Implementado en la migración [`20261105022235_add_user_invitations`](../../apps/api/prisma/migrations/20261105022235_add_user_invitations/migration.sql):

### `UserInvitation` (`user_invitations`)

| Campo | Tipo Prisma / SQL | Descripción |
| :--- | :--- | :--- |
| `id` | `UUID` (`@id @default(uuid())`) | Identificador único de la invitación. |
| `email` | `VarChar(255)` | Correo electrónico normalizado en minúsculas. |
| `role` | `Role` (`ADMIN`, `SUPERVISOR`, `EMPLOYEE`) | Rol global que tendrá el usuario al registrarse. |
| `tokenHash` | `VarChar(255)` (`@unique`, `token_hash`) | Hash SHA-256 hexadecimal del token de invitación (nunca el token en texto plano). |
| `expiresAt` | `Timestamptz(3)` (`expires_at`) | Fecha y hora de expiración (48 horas desde su emisión). |
| `acceptedAt` | `Timestamptz(3)?` (`accepted_at`) | Fecha y hora en que fue consumida para crear el usuario (`null` mientras está pendiente). |
| `revokedAt` | `Timestamptz(3)?` (`revoked_at`) | Fecha y hora de revocación por contingencia o reemisión (`null` si no fue revocada). |
| `createdById` | `UUID` (`created_by_id`) | FK hacia `users(id)` (`ON DELETE RESTRICT`) que identifica al `ADMIN` emisor. |
| `createdAt` | `Timestamptz(3)` (`created_at`) | Fecha de creación. |
| `updatedAt` | `Timestamptz(3)` (`updated_at`) | Última actualización. |

### `UserInvitationArea` (`user_invitation_areas`)

| Campo | Tipo Prisma / SQL | Descripción |
| :--- | :--- | :--- |
| `invitationId` | `UUID` (`invitation_id`) | FK hacia `user_invitations(id)` (`ON DELETE CASCADE`). |
| `areaId` | `UUID` (`area_id`) | FK hacia `areas(id)` (`ON DELETE RESTRICT`). |

### Índices y Restricciones de Integridad

- **Índice único parcial (`user_invitations_one_pending_per_email_idx`):**
  ```sql
  CREATE UNIQUE INDEX "user_invitations_one_pending_per_email_idx"
  ON "user_invitations"("email")
  WHERE ("accepted_at" IS NULL AND "revoked_at" IS NULL);
  ```
  - **Por qué la condición SQL es `WHERE ("accepted_at" IS NULL AND "revoked_at" IS NULL)`:** PostgreSQL exige que toda expresión en el predicado `WHERE` de un índice parcial sea `IMMUTABLE`, por lo que no admite `expires_at > NOW()` (`NOW()` es `STABLE`).
  - **Invitaciones aceptadas o revocadas:** al tener `accepted_at IS NOT NULL` o `revoked_at IS NOT NULL`, quedan automáticamente fuera del índice parcial y se conservan como historial sin bloquear futuras invitaciones para el mismo correo.
  - **Invitaciones vencidas (no bloquean reemisión):** si existe una fila con `accepted_at IS NULL` y `revoked_at IS NULL` pero ya vencida (`expires_at <= now`), `InvitationsService.createInvitation()` no rechaza la solicitud: dentro de una única transacción interactiva (`prisma.$transaction`) ejecuta primero un `updateMany` condicional atómico:
    ```ts
    await tx.userInvitation.updateMany({
      where: {
        id: existingInvitation.id,
        acceptedAt: null,
        revokedAt: null,
        expiresAt: { lte: now },
      },
      data: { revokedAt: now },
    });
    ```
    Al marcar `revoked_at = now`, la invitación vencida sale del índice único parcial en el acto y la transacción inserta inmediatamente la nueva invitación. Si el `updateMany` devuelve `count === 0` (porque otra petición concurrente la modificó), lanza `409 Conflict`.

---

## 3. Contratos HTTP

### 3.1. Emitir Invitación (Administrativo)

- **Ruta:** `POST /api/users/invitations`
- **Autenticación y Autorización:** Bearer JWT válido + rol `ADMIN` (`JwtAuthGuard`, `RolesGuard`, `@Roles('ADMIN')`).
- **Cuerpo de solicitud (`CreateInvitationDto`):**
  ```json
  {
    "email": "nuevo.integrante@empresa.com",
    "role": "EMPLOYEE",
    "areaIds": ["0a000000-0000-4000-8000-000000000001"]
  }
  ```
- **Reglas de validación:**
  - `email`: obligatorio, formato válido, hasta 255 caracteres; se normaliza con `trim().toLowerCase()`.
  - `role`: obligatorio (`ADMIN`, `SUPERVISOR` o `EMPLOYEE`).
  - `areaIds`:
    - Si `role` es `ADMIN`: no debe tener áreas asignadas (`[]` u omitido; si incluye elementos responde `400 Bad Request`).
    - Si `role` es `SUPERVISOR` o `EMPLOYEE`: debe incluir al menos un UUID válido sin duplicados, y **todas** las áreas deben existir en PostgreSQL con `isActive: true` (`400 Bad Request` si alguna no existe o está inactiva).
- **Respuesta exitosa (`201 Created` — `InvitationResponse`):**
  ```json
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "nuevo.integrante@empresa.com",
    "role": "EMPLOYEE",
    "areaIds": ["0a000000-0000-4000-8000-000000000001"],
    "expiresAt": "2026-11-12T15:00:00.000Z",
    "createdAt": "2026-11-10T15:00:00.000Z",
    "invitationUrl": "http://localhost:3001/registro#token=AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdE"
  }
  ```
  > **Nota:** `invitationUrl` se incluye en la respuesta JSON **únicamente** cuando `NODE_ENV` es `development` o `test` (canal local). En cualquier otro entorno se omite (`undefined`).

| Código HTTP | Condición |
| :--- | :--- |
| `201 Created` | Invitación persistida y entregada por el canal configurado. |
| `400 Bad Request` | Correo inválido, rol inválido, combinación inválida de rol y áreas, o área inexistente/inactiva. |
| `401 Unauthorized` | Sin token Bearer, token vencido/inválido o usuario administrador inactivo. |
| `403 Forbidden` | Usuario autenticado con rol `SUPERVISOR` o `EMPLOYEE`. |
| `409 Conflict` | Ya existe un usuario registrado con ese correo (activo o inactivo) o una invitación pendiente vigente. |
| `503 Service Unavailable` | Canal de entrega no disponible/no configurado en el entorno, `FRONTEND_URL` inválida o fallo de base de datos (si el fallo ocurre en la entrega tras crear la invitación, esta se revoca automáticamente). |

---

### 3.2. Validar Token de Invitación (Público)

- **Ruta:** `POST /api/auth/invitations/validate`
- **Autenticación:** Público (`@Public()`), protegido por rate limiting dual en Redis.
- **Por qué `POST`:** el token viaja en el cuerpo JSON y nunca en query params ni en la URL solicitada al backend, evitando su exposición en logs de acceso HTTP o historiales de proxies.
- **Cuerpo de solicitud (`ValidateInvitationDto`):**
  ```json
  {
    "token": "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdE"
  }
  ```
- **Respuesta exitosa (`200 OK` — `ValidateInvitationResponse`):**
  ```json
  {
    "valid": true,
    "email": "nuevo.integrante@empresa.com",
    "role": "EMPLOYEE"
  }
  ```

| Código HTTP | Condición |
| :--- | :--- |
| `200 OK` | Token válido, pendiente y vigente. |
| `400 Bad Request` | Token ausente o con formato distinto de 43 caracteres `base64url`. |
| `404 Not Found` | No existe ninguna invitación asociada al hash del token. |
| `410 Gone` | La invitación ya fue aceptada (`acceptedAt !== null`), revocada (`revokedAt !== null`) o expiró (`expiresAt <= now`). |
| `429 Too Many Requests` | Umbral de intentos superado en Redis (por IP o por hash de token). |
| `503 Service Unavailable` | Redis o PostgreSQL no disponibles (comportamiento *fail-closed*). |

---

### 3.3. Registrar Usuario con Invitación (Público)

- **Ruta:** `POST /api/auth/register`
- **Autenticación:** Público (`@Public()`), protegido por rate limiting dual en Redis.
- **Cuerpo de solicitud (`RegisterWithInvitationDto`):**
  ```json
  {
    "token": "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdE",
    "name": "María López",
    "password": "PasswordSegura123"
  }
  ```
- **Reglas de entrada y seguridad de privilegios:**
  - El cuerpo **no admite `email`, `role` ni `areaIds`** (`ValidationPipe` con `whitelist: true` y `forbidNonWhitelisted: true` rechaza cualquier propiedad adicional con `400 Bad Request`).
  - `name`: entre 2 y 150 caracteres luego de `trim()`.
  - `password`: entre 8 y 128 caracteres, sin espacios al inicio ni al final, con al menos una letra minúscula, una letra mayúscula y un número.
- **Ejecución transaccional y sesión inicial:**
  1. Verifica y consume atómicamente la invitación mediante `updateMany` condicional (`acceptedAt: null`, `revokedAt: null`, `expiresAt > now`).
  2. Comprueba que el correo no haya sido registrado en `users` (`409 Conflict`).
  3. Re-verifica que todas las áreas asociadas a la invitación continúen con `isActive: true` al momento del registro (`400 Bad Request` si alguna fue desactivada tras la emisión, revirtiendo la transacción).
  4. Hashea la contraseña con `PasswordService` (`bcrypt`) y crea los registros en `User` y `UserArea` con el rol y las áreas de la invitación.
  5. Crea la `Session` inicial en PostgreSQL, establece la cookie `refreshToken` (`HttpOnly`, `SameSite=Lax`, `Path=/api/auth`, `Secure` en producción) y firma el `accessToken` JWT de 15 minutos. Si la emisión del JWT fallara tras crear la sesión, ejecuta una revocación compensatoria (`sessionService.revokeById`) antes de responder `503`.
- **Respuesta exitosa (`201 Created` — `LoginHttpResponse`):**
  ```json
  {
    "accessToken": "<JWT-de-15-minutos>",
    "user": {
      "id": "22222222-2222-4222-8222-222222222222",
      "name": "María López",
      "email": "nuevo.integrante@empresa.com",
      "role": "EMPLOYEE"
    }
  }
  ```

| Código HTTP | Condición |
| :--- | :--- |
| `201 Created` | Usuario creado, invitación consumida y sesión iniciada (JWT + cookie `HttpOnly`). |
| `400 Bad Request` | Formato inválido de token/nombre/contraseña, campos no permitidos o área asignada desactivada antes de registrarse. |
| `404 Not Found` | Token de invitación inexistente. |
| `409 Conflict` | Correo ya registrado o colisión concurrente en el consumo de la invitación. |
| `410 Gone` | Invitación previamente aceptada, revocada o vencida. |
| `429 Too Many Requests` | Límite de intentos de registro superado en Redis. |
| `503 Service Unavailable` | Indisponibilidad de Redis, PostgreSQL o firma de sesión. |

---

## 4. Arquitectura de Seguridad y Flujo en Frontend (`apps/web`)

1. **Transporte del token en fragmento (`#token=`):**
   - El enlace tiene la forma `<FRONTEND_URL>/registro#token=<43_chars_base64url>`.
   - El fragmento `#` permanece en el navegador y no se transmite al servidor Next.js ni en cabeceras `Referer`.
2. **Limpieza inmediata de la URL y React Strict Mode (`apps/web/app/registro/page.tsx`):**
   - Al montar la página, se extrae el token desde `window.location.hash` (guardándolo en `tokenRef`) y se limpia inmediatamente el fragmento mediante `window.history.replaceState(null, '', cleanUrl)`, conservando `pathname` y `search` (por ejemplo `?returnTo=/documentos`).
   - La promesa de `validateInvitation()` se conserva en `validationPromiseRef` para evitar peticiones HTTP duplicadas durante el doble montaje de React Strict Mode.
3. **Protección de sesión activa (`real-session.tsx` y `page.tsx`):**
   - Si el navegador ya tiene una sesión autenticada (`status === 'ready' && user !== null`), `/registro` no valida ni consume la invitación y muestra un aviso con enlace a `/documentos`.
   - `registerSession()` verifica sincrónicamente la ausencia de sesión activa antes de emitir `POST /api/auth/register`, se coordina con `loginSession()`, `logoutSession()`, `refreshSession()` y `restoreSession()`, y almacena el `accessToken` exclusivamente en memoria RAM.
4. **Persistencia del formulario ante errores:**
   - Mientras `registerSession()` está en vuelo o si el registro falla (`409`, `410`, `429`, `503`), `RegisterForm` permanece montado conservando el nombre ingresado por el usuario y mostrando un mensaje de error seguro (`AuthClientError`) sin exponer detalles internos del servidor.

---

## 5. Variables de Entorno y Entrega en Despliegue

| Variable | Requerida en | Descripción y Reglas de Validación |
| :--- | :--- | :--- |
| `FRONTEND_URL` | `apps/api` | URL base para construir `/registro#token=...`. En `development`/`test` admite `http:` o `https:` con fallback a `http://localhost:3001` (puerto de desarrollo de `apps/web` según convención D3 del plan 002 y `README.md`: `pnpm --filter web dev -p 3001`, mientras la API corre en `http://localhost:3000`). En cualquier otro entorno (`production`, `staging`, etc.) es **obligatoria**, debe usar `https:` y no puede contener credenciales, query string (`?`) ni fragmentos (`#`). Nunca se utiliza el header `Host` de la solicitud. |
| `NODE_ENV` | `apps/api` / `apps/web` | Define el entorno de ejecución (`development`, `test`, `production`). `LocalInvitationDeliveryService` solo opera en `development` o `test`; en cualquier otro entorno aplica *fail-closed* (`503`) hasta contar con un proveedor real de correo (`channel: 'email'`, `delivered: true`). |
| `REDIS_URL` | `apps/api` | Conexión a Redis utilizada por `AuthRateLimiterService` para los límites de login, validación de invitación y registro. |
| `JWT_SECRET` | `apps/api` | Secreto obligatorio al iniciar el módulo (`AuthService.onModuleInit`) para firmar y verificar los `accessToken` de 15 minutos. |

## 6. A-INV-EMAIL — Entrega real de invitaciones

### Objetivo

Incorporar un proveedor de correo transaccional para enviar invitaciones de registro a usuarios, conservando el mecanismo local de desarrollo y las garantías de seguridad de HU29.

### Proveedor elegido

Se propone **Resend**, mediante su API HTTP, para enviar correos de invitación en producción.

La elección busca simplificar la integración y minimizar los costos iniciales de infraestructura.

### Configuración

| Variable | Descripción |
|---|---|
| `INVITATION_EMAIL_PROVIDER` | Selecciona `local` o `resend`. |
| `RESEND_API_KEY` | Credencial privada para autenticar solicitudes al proveedor. |
| `INVITATION_EMAIL_FROM` | Dirección remitente autorizada en un dominio verificado. |
| `FRONTEND_URL` | Dirección base del frontend utilizada para generar el enlace de registro. |

### Reglas de funcionamiento

1. **Desarrollo y test:** el adaptador local conserva el comportamiento actual y puede devolver `invitationUrl`, sin enviar correos externos.
2. **Producción:** requiere el proveedor `resend` correctamente configurado. No se permite utilizar el canal local.
3. **Configuración incompleta:** el servicio rechaza la operación antes de crear la invitación, con HTTP 503.
4. **Entrega por correo:** el mensaje contiene el enlace `/registro#token=...`, generado por el backend.
5. **Seguridad:** la API nunca devuelve el token ni `invitationUrl` en la respuesta de producción.
6. **Privacidad:** las credenciales, los tokens y los enlaces completos de invitación no deben registrarse en logs.
7. **Fallo del proveedor:** debe mantenerse el mecanismo de revocación compensatoria existente, respondiendo HTTP 503.
8. **Compatibilidad:** no se modifican las reglas actuales de validación, expiración de 48 horas, consumo único ni asignación de roles y áreas.

### Consideraciones de implementación

- `InvitationDeliveryService` continuará siendo la abstracción utilizada por `UsersController`.
- `LocalInvitationDeliveryService` permanecerá disponible para desarrollo y test.
- Se incorporará un adaptador específico para Resend.
- La selección del adaptador se realizará mediante inyección de dependencias de NestJS.
- Una respuesta exitosa del proveedor acredita la aceptación de la solicitud de envío, no garantiza que el correo haya llegado a la bandeja del destinatario.
- Las pruebas automatizadas utilizarán proveedores simulados y no requerirán credenciales reales.

### Estado

**A-INV-EMAIL.1:** definición de configuración y contrato.

**Pendiente:** implementación del adaptador, selección mediante configuración, pruebas unitarias, integración y verificación de envío real.

## 7. A-INV-EMAIL — Verificación y despliegue

### Estado de implementación

Se incorporó `ResendInvitationDeliveryService` como adaptador de correo transaccional y se configuró su selección mediante inyección de dependencias en `UsersModule`.

El adaptador local continúa disponible para desarrollo y pruebas. Los entornos no locales requieren la selección explícita de Resend.

### Variables requeridas para producción

```dotenv
NODE_ENV=production
INVITATION_EMAIL_PROVIDER=resend
RESEND_API_KEY=<configurar-como-secreto>
INVITATION_EMAIL_FROM=PispIAr <invitaciones@dominio-verificado.com>
FRONTEND_URL=https://frontend-del-proyecto.com
```

Estos valores son ilustrativos y no deben copiarse literalmente como credenciales ni dominios reales.

### Requisitos previos para habilitar el envío

- Registrar y verificar un dominio remitente en Resend.
- Crear una API key con permisos de envío.
- Configurar las variables en el entorno seguro del backend, sin subir secretos a GitHub.
- Confirmar que `FRONTEND_URL` apunta al frontend público mediante HTTPS.
- Verificar que `/registro` funciona en el dominio del frontend.

### Validaciones de seguridad

- En desarrollo y test se utiliza exclusivamente el adaptador local.
- En producción no se permite utilizar el adaptador local.
- La configuración incompatible produce HTTP 503.
- Las configuraciones faltantes se rechazan antes de generar invitaciones.
- La respuesta de producción no expone el enlace ni el token.
- Las solicitudes al proveedor incorporan una clave de idempotencia derivada del hash del token.
- Los errores externos se transforman en mensajes seguros.
- Si falla el envío, el controlador intenta revocar la invitación.

### Limitaciones conocidas

1. Una respuesta exitosa de Resend confirma que el proveedor aceptó la solicitud, pero no garantiza la entrega en la bandeja del destinatario.
2. Si el proveedor acepta el mensaje y luego se interrumpe la comunicación antes de que el backend reciba la confirmación, el mecanismo de contingencia puede revocar una invitación cuyo correo ya fue emitido.
3. La idempotencia del proveedor reduce duplicaciones durante su período de retención, pero no resuelve por sí sola las entregas ambiguas.
4. No se implementaron webhooks de seguimiento de entrega, rebotes ni reenvío automático de invitaciones. Quedan fuera del alcance actual.

### Criterios de cierre

- Pruebas unitarias del adaptador aprobadas.
- Pruebas de selección del proveedor aprobadas.
- Pruebas existentes de invitaciones y registro sin regresiones.
- Compilación y lint correctos.
- CI del Pull Request en verde.
- Configuración real de dominio y credenciales documentada como requisito de despliegue.
- Prueba real de recepción del correo pendiente hasta disponer del dominio y entorno de envío configurados.