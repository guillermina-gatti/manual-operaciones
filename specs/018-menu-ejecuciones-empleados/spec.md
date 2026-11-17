# Spec 018 · "Ejecuciones" en el menú solo para empleados

- **Responsable:** Micaela Franco (pareja B), con autorización de Camila (pareja A, dueña del menú lateral).
- **Depende de:** la matriz de permisos (`docs/contracts/permissions-matrix.md`: solo EMPLOYEE ejecuta procedimientos), la spec 012 de ejecuciones (Mayra) y el menú lateral `Sidebar.tsx` (Camila).
- **Estado:** a implementar (17/11/2026).

## 1. Problema

El menú lateral muestra "Ejecuciones" a todos los roles. Pero solo los empleados ejecutan procedimientos: si un ADMIN o un SUPERVISOR entra, ve "Solo los empleados pueden ejecutar procedimientos." y la API le responde 403. El ítem lleva a una pantalla que no pueden usar.

## 2. Alcance

**Entra:** mostrar el ítem "Ejecuciones" del menú lateral solo a EMPLOYEE.

**No entra:**
- las pantallas de `/ejecuciones` y su protección, que siguen igual;
- la API, que sigue respondiendo 403 a otros roles;
- los demás ítems del menú (la visibilidad de "Procedimientos" para EMPLOYEE es otra pregunta abierta, Q1 de la spec 017);
- el inicio y métricas, que ya muestran los accesos a ejecuciones solo a empleados.

## 3. Reglas

- **R1 · Quién lo ve.** EMPLOYEE ve "Ejecuciones" en el menú lateral. ADMIN y SUPERVISOR no lo ven.
- **R2 · La protección no cambia.** Si un ADMIN o SUPERVISOR escribe a mano `/ejecuciones`, sigue viendo "Solo los empleados pueden ejecutar procedimientos." y la API sigue respondiendo 403. Esconder el ítem no reemplaza la validación en el servidor.
- **R3 · Lo demás del menú no cambia.** Los otros ítems se ven igual que antes para cada rol.

## 4. Escenarios

**E1 · Empleado (R1)**
- *Dado* Elena o Emilio (EMPLOYEE) con sesión,
- *cuando* ve el menú lateral,
- *entonces* aparece "Ejecuciones" y lleva a `/ejecuciones`.

**E2 · Supervisor (R1)**
- *Dado* Sergio o Sofía (SUPERVISOR) con sesión,
- *cuando* ve el menú lateral,
- *entonces* no aparece "Ejecuciones",
- *y* siguen apareciendo Procedimientos, Métricas y Usuarios y roles.

**E3 · Administrador (R1)**
- *Dado* Ana (ADMIN) con sesión,
- *cuando* ve el menú lateral,
- *entonces* no aparece "Ejecuciones",
- *y* siguen apareciendo todos sus otros ítems.

**E4 · Acceso escribiendo la dirección (R2)**
- *Dado* un ADMIN o SUPERVISOR,
- *cuando* entra a mano a `/ejecuciones`,
- *entonces* ve "Solo los empleados pueden ejecutar procedimientos.", como antes.

## 5. Decisiones

- **D1 · Rama aparte.** Va en `fix/B-executions-menu-employee`, no en la rama del diseño (spec 017), para que cada PR tenga un solo tema.
- **D2 · Cambio mínimo en un archivo ajeno.** Solo se agrega `roles: ['EMPLOYEE']` al ítem, con el OK de Camila. Ella revisa el PR.
