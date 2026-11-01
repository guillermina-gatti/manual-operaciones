# A-02 — Contratos de usuarios, roles y áreas

**Proyecto:** Manual de Operaciones Interactivo con Asistente IA — IntegrarTEC 2026  
**Equipo responsable:** Equipo A — Seguridad y Plataforma  
**Estado:** Propuesta inicial con contratos internos actualizados tras A-13 (PR #30)
**Módulos relacionados:** Autenticación, Documentos, Procedimientos y Auditoría

## 1. Objetivo

Definir la estructura de usuarios y áreas y los contratos que permitirán al resto de los módulos consultar la identidad, el rol y las áreas de cada usuario.

La autorización debe realizarse en el backend y basarse en la información vigente de la base de datos.

## 2. Roles del sistema

El sistema contempla tres roles globales:

| Rol | Descripción |
|---|---|
| `ADMIN` | Administra usuarios, invitaciones, áreas, documentos y procedimientos. |
| `SUPERVISOR` | Consulta información de sus áreas; proponer cambios (HU33) queda fuera del MVP actual. |
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
- Las áreas inactivas conservan sus referencias históricas; las nuevas asociaciones deben rechazarse en el módulo consumidor.

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

Los contratos internos vigentes de Documentos se ampliaron en A-13 (PR #30), manteniendo compatibilidad:

### UsersDirectory

```typescript
export interface DirectoryUser {
  id: string;
  name: string;
  role: Role;
  areaIds: string[];
  isActive: boolean;
}

export abstract class UsersDirectory {
  abstract findById(
    id: string,
  ): Promise<DirectoryUser | null>;
}
```

### AreasDirectory

```typescript
export interface DirectoryArea {
  id: string;
  name: string;
  isActive: boolean;
}

export abstract class AreasDirectory {
  abstract findExistingIds(ids: string[]): Promise<string[]>;
  abstract findByIds(ids: string[]): Promise<DirectoryArea[]>;
}
```

Equipo A implementó los adaptadores Prisma y en memoria, con pruebas unitarias e inyección de dependencias en Documentos.

**Consideraciones:**

- `UsersDirectory` debe devolver los datos necesarios para que Documentos valide responsables y áreas.
- `findExistingIds()` mantiene la consulta de existencia; `findByIds()` devuelve `id`, `name` e `isActive`, incluso en áreas inactivas.
- Las consultas no deben modificar datos.
- Los errores de infraestructura deben poder traducirse al error de disponibilidad acordado con Documentos (503).
- Los directorios pueden recuperar referencias históricas; los módulos consumidores controlan nuevas asignaciones y visibilidad.

## 6. Contrato con autenticación

El Equipo A implementó autenticación y autorización en el backend; el alcance de administración de usuarios y áreas sigue por definir para el MVP.

Se conservarán los nombres públicos que utiliza actualmente el módulo de documentos:

- `JwtAuthGuard`
- `RolesGuard`
- `@Roles()`
- `@CurrentUser()`

El objeto autenticado mantendrá, como mínimo, los campos `id` y `role`, para conservar la compatibilidad con el código existente.

La sesión deberá consultar los permisos actuales, evitando depender de roles o áreas desactualizados dentro del JWT.

La restauración y renovación de sesión se implementaron en A-08/A-09; ver [A-06.5](./A-06.5-restauracion-sesion.md).

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

## 10. Preguntas de planificación inicial (antecedente histórico)

Las preguntas siguientes pertenecen a la propuesta previa a las migraciones y acuerdos recientes; no representan, por sí solas, pendientes vigentes. Consultar la matriz A-02 para decisiones abiertas:

- Si `Role` se implementa como enum Prisma o como string validado.
- Si el nombre de las áreas debe tener una restricción de unicidad, incluida su normalización.
- Cómo se tratan usuarios inactivos cuando figuran como responsables históricos.
- Si un área inactiva puede conservar usuarios o documentos asociados.
- Qué servicios específicos consumirá Cami desde autenticación.
- Cómo registrar la auditoría de modificaciones de usuarios y áreas.
- Cómo se coordinará la migración compartida de Prisma para evitar cambios simultáneos del esquema.

---

**Seguimiento vigente:** los directorios internos de lectura están implementados. Falta definir el alcance de administración del MVP y verificar las integraciones con los módulos consumidores.