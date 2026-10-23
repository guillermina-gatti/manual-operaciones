# A-02 — Contratos de usuarios, roles y áreas

**Proyecto:** Manual de Operaciones Interactivo con Asistente IA — IntegrarTEC 2026  
**Equipo responsable:** Equipo A — Seguridad y Plataforma  
**Estado:** Propuesta técnica para validar con el equipo  
**Módulos relacionados:** Autenticación, Documentos, Procedimientos y Auditoría

## 1. Objetivo

Definir la estructura de usuarios y áreas y los contratos que permitirán al resto de los módulos consultar la identidad, el rol y las áreas de cada usuario.

La autorización debe realizarse en el backend y basarse en la información vigente de la base de datos.

## 2. Roles del sistema

El sistema contempla tres roles globales:

| Rol | Descripción |
|---|---|
| `ADMIN` | Administra usuarios, invitaciones, áreas, documentos y procedimientos. |
| `SUPERVISOR` | Consulta información de sus áreas y puede proponer cambios en los procedimientos. |
| `EMPLOYEE` | Ejecuta procedimientos y consulta documentos y al asistente, según sus áreas asignadas. |

### Reglas

- Cada usuario posee un único rol global.
- Un usuario puede pertenecer a varias áreas.
- El rol no depende del área.
- `ADMIN` puede consultar información de todas las áreas según las reglas de cada recurso.
- `SUPERVISOR` y `EMPLOYEE` solo acceden a los recursos permitidos de sus áreas.
- Las reglas específicas de documentos y procedimientos son responsabilidad de sus respectivos módulos.

## 3. Entidades propuestas

### User

Representa a una persona registrada en el sistema.

| Campo | Tipo propuesto | Descripción |
|---|---|---|
| `id` | UUID | Identificador único |
| `name` | String | Nombre del usuario |
| `email` | String | Correo único |
| `passwordHash` | String | Contraseña almacenada mediante hash |
| `role` | Role | Rol global |
| `isActive` | Boolean | Estado de habilitación |
| `createdAt` | DateTime | Fecha de creación |
| `updatedAt` | DateTime | Última modificación |

**Reglas:**

- El correo no puede repetirse.
- La contraseña nunca se almacena en texto plano ni se devuelve en las respuestas.
- Un usuario desactivado no puede autenticarse ni acceder a endpoints protegidos.
- Los cambios de rol y estado deben registrarse en auditoría.
- El usuario se crea al aceptar una invitación válida, no al emitirla.

### Area

Representa un sector organizacional de la empresa.

| Campo | Tipo propuesto | Descripción |
|---|---|---|
| `id` | UUID | Identificador único |
| `name` | String | Nombre del área |
| `isActive` | Boolean | Estado del área |
| `createdAt` | DateTime | Fecha de creación |
| `updatedAt` | DateTime | Última modificación |

**Reglas:**

- El nombre debe identificar un área de manera inequívoca.
- Solo administradores pueden crear, modificar o desactivar áreas.
- No se permite eliminar un área que tenga usuarios o recursos relacionados, según las reglas del MVP.
- Debe definirse si las áreas inactivas pueden conservar asignaciones históricas.

### UserArea

Representa la relación entre usuarios y áreas.

| Campo | Tipo propuesto | Descripción |
|---|---|---|
| `userId` | UUID | Identificador del usuario |
| `areaId` | UUID | Identificador del área |

**Reglas:**

- Relación muchos a muchos.
- La combinación `userId + areaId` no puede repetirse.
- Solo pueden asignarse áreas existentes y habilitadas.
- Cuando se modifica la asignación de áreas, los permisos deben reflejarse en la siguiente petición autenticada.

## 4. Relación entre entidades

```text
User 1 ─── N UserArea N ─── 1 Area
```

Un usuario puede tener múltiples asignaciones y un área puede tener múltiples usuarios.

## 5. Contratos compartidos con el Equipo C

El módulo de documentos ya define los siguientes contratos, que deben conservarse.

### UsersDirectory

```typescript
export interface DirectoryUser {
  id: string;
  role: Role;
  areaIds: string[];
}

export abstract class UsersDirectory {
  abstract findById(
    id: string,
  ): Promise<DirectoryUser | null>;
}
```

### AreasDirectory

```typescript
export abstract class AreasDirectory {
  abstract findExistingIds(
    ids: string[],
  ): Promise<string[]>;
}
```

El Equipo A deberá implementar adaptadores reales usando Prisma y proveerlos mediante inyección de dependencias.

**Consideraciones:**

- `UsersDirectory` debe devolver los datos necesarios para que Documentos valide responsables y áreas.
- `AreasDirectory` debe devolver únicamente los identificadores existentes.
- Las consultas no deben modificar datos.
- Los errores de infraestructura deben poder traducirse al error de disponibilidad acordado con Documentos (503).
- Debe acordarse el tratamiento de usuarios y áreas inactivos, sin cambiar unilateralmente estos contratos.

## 6. Contrato con autenticación

El Equipo A debe implementar los mecanismos de autenticación y autorización.

Se conservarán los nombres públicos que utiliza actualmente el módulo de documentos:

- `JwtAuthGuard`
- `RolesGuard`
- `@Roles()`
- `@CurrentUser()`

El objeto autenticado mantendrá, como mínimo, los campos `id` y `role`, para conservar la compatibilidad con el código existente.

La sesión deberá consultar los permisos actuales, evitando depender de roles o áreas desactualizados dentro del JWT.

Las decisiones sobre refresh tokens, revocación y gestión de sesiones se documentarán junto con la implementación de autenticación.

## 7. Reglas de acceso acordadas

1. Solo los administradores pueden cargar documentos.
2. Los administradores pueden consultar todos los documentos, incluidos los archivados.
3. Los demás roles solo pueden consultar documentos `ACTIVE` que compartan al menos un área con el usuario.
4. Un responsable de documento debe compartir alguna de sus áreas, excepto cuando es administrador.
5. Un usuario desactivado debe perder el acceso inmediatamente.
6. Un cambio de áreas debe afectar los permisos desde la siguiente petición autenticada.
7. Los cambios de área no reasignan automáticamente documentos existentes.
8. El módulo de Documentos sigue siendo responsable de aplicar sus políticas específicas.

## 8. Reglas de seguridad

- Los permisos se validan en el servidor.
- Nunca se confía únicamente en valores enviados por el frontend.
- No se incluyen contraseñas, hashes ni información sensible en las respuestas.
- El acceso a recursos ajenos debe respetar los códigos HTTP acordados.
- Los cambios administrativos relevantes deben generar auditoría.
- Las consultas del asistente de IA deben respetar el mismo aislamiento por áreas que los documentos.

## 9. Pruebas mínimas

Se deberán comprobar:

- Un usuario puede pertenecer a varias áreas.
- No se permite duplicar asignaciones.
- El correo debe ser único.
- Un usuario inactivo no puede utilizar endpoints protegidos.
- Los cambios de rol se reflejan sin esperar a que expire el access token.
- Los cambios de área se reflejan en la siguiente petición.
- `UsersDirectory` devuelve el contrato acordado.
- `AreasDirectory` identifica correctamente las áreas existentes.
- Un fallo de base de datos no se confunde con un registro inexistente.

## 10. Decisiones pendientes

Antes de generar migraciones, validar con el Equipo A y los módulos consumidores:

- Si `Role` se implementa como enum Prisma o como string validado.
- Si el nombre de las áreas debe tener una restricción de unicidad, incluida su normalización.
- Cómo se tratan usuarios inactivos cuando figuran como responsables históricos.
- Si un área inactiva puede conservar usuarios o documentos asociados.
- Qué servicios específicos consumirá Cami desde autenticación.
- Cómo registrar la auditoría de modificaciones de usuarios y áreas.
- Cómo se coordinará la migración compartida de Prisma para evitar cambios simultáneos del esquema.

---

**Criterio de finalización del contrato:** el Equipo A y los módulos consumidores confirman los modelos, los identificadores, las interfaces públicas y las reglas de acceso antes de crear las migraciones.