# A-QA.4 — Auditoría de autenticación y autorización de PispIAr

**Dictamen: REVIEW.** El JWT anterior a un cambio de rol respeta el rol que figura en la base en el siguiente pedido. El hallazgo de mayor impacto está en la escritura de ese dato: dos ediciones administrativas concurrentes pueden restituir un rol ADMIN ya revocado. También hay fallas en la protección de cuentas administrativas y en la asignación de áreas al aceptar invitaciones.

**Corte de revisión.** 23/11/2026, rama `test/A-QA-4-auth-permissions`, revisión `c9544bc`. Se contrastaron los contratos con los controllers, guards, servicios, adaptadores y pruebas de la API. Los hallazgos confirmados surgen del código. Los escenarios describen estados sintéticos para revisión y no se ejecutaron contra un despliegue. Las rutas de archivos de las tablas son relativas a `apps/api/`. Referencias funcionales: [matriz A-02](../contracts/permissions-matrix.md) y [contrato de usuarios y áreas](../contracts/users-areas.md).

## Contratos revisados

| Módulo | Decisión de acceso y dato protegido | Evidencia principal |
|---|---|---|
| Autenticación y sesión | Login y refresh exigen cuenta activa. El refresh es opaco, se guarda su hash y se rota con escritura condicional. En rutas protegidas, el guard verifica firma, expiración y formato UUID de `sub`, y reconstruye el usuario con rol vigente y asignaciones a áreas activas. Ausencia de credencial válida o cuenta inactiva da 401. RolesGuard aplica los roles declarados, con prioridad del método sobre la clase, y devuelve 403 por rol insuficiente. | `src/auth/auth.service.ts`, `src/auth/session.service.ts`, `src/auth/guards/jwt-auth.guard.ts`, `src/auth/guards/roles.guard.ts` |
| Usuarios e invitaciones | ADMIN consulta candidatos, administra cuentas e invita. Los candidatos son activos y la respuesta proyecta id, nombre y rol. El registro toma correo, rol y áreas de la invitación consumida. La baja administrativa elimina las sesiones de refresh dentro de la transacción de edición. | `src/users/users.controller.ts`, `src/users/users.service.ts`, `src/users/invitations.service.ts`, `src/auth/auth.service.ts` |
| Áreas | Cualquier cuenta activa puede consultar el catálogo completo, incluidas las áreas inactivas, con id, nombre y estado. Crear o editar exige ADMIN. Ver una entrada del catálogo no concede acceso a su contenido. | `src/areas/areas.controller.ts`, `src/areas/areas.service.ts` |
| Documentos | ADMIN gestiona carga, versiones, archivo, asignaciones y alertas de conflicto. Para EMPLOYEE y SUPERVISOR, listado, búsqueda, detalle y descarga requieren documento activo y área compartida vigente. El detalle oculto y el inexistente comparten 404. La descarga se autoriza antes de firmar el enlace. Revisar requiere además ser responsable o ADMIN. Los nombres históricos en un documento visible están previstos en A-02. | `src/documents/document-access.ts`, `src/documents/document-access.policy.ts`, `src/documents/document-query.service.ts`, `src/documents/document-lifecycle.service.ts`, `src/documents/prisma-documents.repository.ts` |
| Procedimientos | ADMIN administra borradores, publicación, historial y áreas. Los otros roles consultan la versión publicada vigente con pasos cuando comparten un área activa. El visor intersecta las asignaciones del directorio con las áreas activas del guard. | `src/procedures/procedure-access.policy.ts`, `src/procedures/procedure-viewer.ts`, `src/procedures/procedure-view.service.ts`, `src/procedures/procedure-versions.controller.ts` |
| Ejecuciones y métricas | Solo EMPLOYEE inicia, retoma, completa o reinicia. Se verifica área vigente del procedimiento y, en operaciones por id, titularidad. Una ejecución ajena da el mismo 404 que una inexistente. Las métricas personales usan el id del actor. Las agregadas de procedimientos, documentos y asistente admiten ADMIN y SUPERVISOR, con alcance por área para el segundo. | `src/executions/executions.controller.ts`, `src/executions/execution.service.ts`, `src/executions/viewer-areas.ts`, `src/executions/metrics/metrics-access.policy.ts`, `src/documents/metrics/document-metrics.service.ts` |
| Chat y feedback | Chat y streaming usan la identidad del guard. La recuperación limita los fragmentos por área antes de entregarlos al modelo y exige documento activo y versión vigente procesada. El contexto de paso exige visibilidad y, para una versión reemplazada de un usuario no administrador, ejecución propia en curso. Continuar una conversación y valorar un mensaje requieren que la conversación pertenezca al actor. | `src/chat/chat-pipeline.ts`, `src/chat/chat-context.ts`, `src/chat/adapters/prisma-chat-retrieval.ts`, `src/chat/adapters/prisma-chat-repository.ts`, `src/chat/adapters/prisma-chat-feedback-repository.ts` |

## Fallas confirmadas por inspección

| ID y severidad | Camino de código | Escenario aislado e impacto |
|---|---|---|
| H1 · Alta · Una edición parcial restituye permisos | `src/users/users.controller.ts:313` → `src/users/users.service.ts:152` calcula `targetRole` con la lectura inicial aun si el DTO omite el rol. Las líneas 198–213 usan ese valor para modificar áreas y escribir siempre el rol. | Con un administrador destinatario activo, simular una edición de estado que lee ADMIN. Antes de su escritura, otra edición confirma el descenso a EMPLOYEE con área asignada. La primera guarda el rol anterior y vacía las áreas. El próximo pedido del destinatario vuelve a obtener permisos globales porque el guard lee ADMIN de la base. |
| H2 · Media · Puede quedar la organización sin administradores activos | `src/users/users.service.ts:182` cuenta otros administradores antes de abrir la transacción en la línea 198. El resultado no se vuelve a comprobar al escribir. | Con dos administradores activos, representar dos bajas cruzadas ya autorizadas. Ambas lecturas encuentran al otro administrador activo antes de las dos escrituras sobre cuentas distintas. Las dos bajas pueden confirmarse y dejar el panel sin operador habilitado. |
| H3 · Media · La autoprotección depende de cómo se escribe el UUID | `src/users/users.controller.ts:326` pasa el parámetro sin normalizar. `src/auth/session.service.ts:32` acepta UUID sin distinguir mayúsculas. `src/users/users.service.ts:143` compara las cadenas literalmente, pese a que `User.id` es UUID en `prisma/schema.prisma:314`. | Con dos administradores activos, representar la identidad del actor y el destinatario mediante dos grafías válidas del mismo UUID con letras. La consulta identifica la misma cuenta pero la comparación de autoprotección las distingue. El segundo administrador satisface el control de último administrador y la propia baja puede persistirse. Requiere privilegios administrativos previos. |
| H4 · Media · El registro puede crear una asignación nueva a un área inactiva | `src/users/invitations.service.ts:117` valida el área al invitar. Al consumir la invitación, las líneas 297–343 validan su vigencia y copian sus áreas. `src/auth/auth.service.ts:414` crea los vínculos sin releer el estado del área. | Simular una invitación de EMPLOYEE con un área activa y desactivarla antes de la aceptación. El registro crea la cuenta y el vínculo nuevo, en conflicto con el contrato de usuarios y áreas. Mientras el área está inactiva el guard la excluye. Si se reactiva, el vínculo ya creado empieza a otorgar acceso sin otra asignación. |

## Riesgo sujeto al contrato de sesión

**R1 · Media si se exige revocación inmediata del acceso.** En `src/auth/auth.service.ts:162` el access token se emite con 900 segundos de vigencia y sin identificador de sesión. Logout revoca la sesión de refresh en la línea 289. El guard consulta la cuenta, no la sesión (`src/auth/guards/jwt-auth.guard.ts:65`). Con una cuenta activa, un token de acceso emitido antes del cierre sigue siendo aceptable hasta vencer. También puede volver a ser aceptable si la cuenta se desactiva y reactiva dentro de esa ventana. La baja se respeta mientras la cuenta sigue inactiva. Equipo A debe precisar si el cierre o una baja seguida de reactivación deben invalidar inmediatamente los JWT ya emitidos.

## Cobertura y evidencia de ejecución

**Resultado local: 8 suites unitarias aprobadas, 95 de 95 pruebas.** Se ejecutó Jest desde `apps/api` con `--runInBand --no-cache --runTestsByPath`, la configuración unitaria del repositorio y exclusivamente los ocho archivos de la segunda columna. Se usaron contextos HTTP simulados, Prisma simulado y directorios o stores en memoria. Las E2E de la tercera columna se revisaron como código. No se ejecutaron E2E, migraciones, seeds ni limpiezas, ni se abrieron conexiones a servicios externos.

| Alcance | Unitarias ejecutadas, relativas a `src/` | Cobertura adicional inspeccionada, relativa a `test/` |
|---|---|---|
| Identidad y rol | `auth/guards/jwt-auth.guard.spec.ts`, `auth/guards/roles.guard.spec.ts` | `auth/auth-authorization.e2e-spec.ts` contempla token inválido o vencido, cabeceras legadas, baja y cambio de rol con JWT anterior. Parte de la matriz usa un controller de prueba. |
| Usuarios y áreas | `users/users.service.spec.ts`, `areas/areas.service.spec.ts` | `auth/auth-directory-catalog.e2e-spec.ts` cubre acceso al catálogo y candidatos. Las unitarias de usuarios cubren autoprotección con la misma cadena, último administrador en secuencia y validación de áreas. |
| Documentos | `documents/document-access.spec.ts` | `documents/query.e2e-spec.ts` compara el 404 y verifica ausencia de enlace para una descarga ajena. Los dos casos E22 en `documents/assignments.e2e-spec.ts:404` ya contemplan el área única inactiva y la combinación activa/inactiva. |
| Procedimientos | `procedures/procedure-viewer.spec.ts` | `procedures/visibility-areas.e2e-spec.ts` contempla reasignación, baja de la única área y cuenta inactiva. |
| Ejecuciones | `executions/viewer-areas.spec.ts` | `executions/executions.e2e-spec.ts` contempla dos empleados de la misma área, reinicio ajeno y pérdida del área. |
| Chat | `chat/chat-context.spec.ts` | `chat/chat-context.e2e-spec.ts` cubre paso ajeno al área y versión reemplazada. `chat/chat-stream.e2e-spec.ts:189` contempla conversación ajena rechazada antes de abrir la transmisión. |

## Pruebas aisladas recomendadas

Las siguientes son brechas de cobertura. El resultado verde anterior corresponde a los escenarios existentes.

1. **H1 y H2, Equipo A.** Usar un repositorio simulado con estado compartido y barreras explícitas entre lectura y escritura. Para H1, exigir que la edición de estado preserve EMPLOYEE y sus áreas después de la degradación. Para H2, exigir al menos un administrador activo y el rechazo de una de las bajas. Evitar temporizadores que hagan depender el resultado del orden de ejecución de Jest.
2. **H3, Equipo A.** Parametrizar las grafías equivalentes de un UUID en el servicio con un Prisma simulado que devuelva la identidad canónica. Tanto la baja propia como la pérdida del rol propio deben fallar antes de cualquier escritura, incluso si hay otro administrador activo.
3. **H4, Equipo A.** Usar un doble transaccional para invitaciones y registro con un área que cambia de estado entre emisión y consumo. Verificar el rechazo de la asignación nueva y la ausencia de cuenta o vínculos parciales. Acordar qué ocurre con la invitación pendiente.
4. **R1, Equipo A.** Con reloj controlado y store de sesiones en memoria, verificar por separado refresh revocado y acceso anterior al cierre, durante la baja y después de la reactivación. Fijar la expectativa de este último caso según el contrato acordado.
5. **Divulgación entre usuarios, Equipo C.** En el adaptador de feedback, comprobar con Prisma simulado que el filtro incluye simultáneamente mensaje y titular de la conversación. Comparar el 404 del mensaje ajeno con el inexistente y exigir cero escrituras en ambos casos. La cobertura de conversación ajena en streaming ejercita otra operación.

## Coordinación y cierre

- **Equipo A, Seguridad y Plataforma.** Priorizar H1. Revisar en conjunto atomicidad de ediciones, protección del último administrador y comparación canónica de identidad. Acordar con quienes administran usuarios el tratamiento de invitaciones pendientes cuando se desactiva un área.
- **Equipos A y C, Documentos y Chat.** Mantener la distinción entre referencias históricas visibles y áreas que habilitan contenido. Validar la regresión de feedback en el adaptador que escribe el dato.
- **Equipos A y B, Procedimientos y Ejecuciones.** Mantener el 404 uniforme para pérdida de área y ejecución ajena. La matriz deja pendiente el eventual acceso de supervisión a ejecuciones individuales de terceros. El permiso sobre métricas agregadas tiene alcance propio.

**Evaluación final: REVIEW.** Corresponde revisión humana de H1–H4 y definición de R1. Las pruebas focalizadas respaldan los controles de lectura y los casos administrativos secuenciales. La auditoría no verificó el comportamiento de transacciones con PostgreSQL real.

## Seguimiento de correcciones — 23/11/2026

### Alcance

Esta sección complementa la auditoría inicial realizada sobre el commit `c9544bc` y registra los resultados de las correcciones implementadas en la rama `test/A-QA-4-auth-permissions`.

### Commits implementados

| Hallazgo | Commit | Descripción |
|---|---|---|
| H3 | `10a28d9` | Protección ante diferencias de mayúsculas y minúsculas en UUID del administrador |
| H1 | `9fe891f` | Preservación del rol y las áreas en actualizaciones administrativas parciales |
| H2 | `4688b85` | Transacciones serializables y reintentos para proteger al último administrador |
| H4 | `e8e5ce2` | Validación de áreas activas durante el consumo de invitaciones |

### Resultados de validación

- 99 pruebas unitarias aprobadas en las tres suites modificadas durante la auditoría final.
- TypeScript sin errores en las verificaciones ejecutadas.
- Oxlint sin advertencias ni errores.
- `git diff --check` sin observaciones.

### Estado de los hallazgos

**H1 — Parcialmente corregido.** El backend conserva los campos omitidos por el cliente. El formulario administrativo todavía puede reenviar un rol desactualizado. Se requiere coordinación con frontend.

**H2 — Implementado, pendiente de integración.** La protección del último administrador utiliza transacciones `Serializable` y reintentos ante `P2034`. Falta verificar el comportamiento concurrente con PostgreSQL real.

**H3 — Corregido.** Se normalizan los UUID al validar la autoprotección administrativa. Las pruebas unitarias correspondientes aprobaron.

**H4 — Parcialmente corregido.** El consumo de invitaciones rechaza áreas ya inactivas y evita continuar con el registro. Permanece pendiente verificar la desactivación concurrente de áreas durante la transacción.

### Otros pendientes

- Actualizar las descripciones de respuestas HTTP en Swagger.
- Resolver el alcance esperado de revocación de Access Tokens JWT después del cierre de sesión.
- Verificar H2 y H4 mediante pruebas de integración con PostgreSQL descartable.

### Dictamen actualizado

**REVIEW — Apto para abrir un Pull Request en borrador. No aprobado todavía para merge definitivo.**

Las correcciones implementadas cuentan con evidencia unitaria satisfactoria, pero persisten riesgos y verificaciones pendientes que deben resolverse o aceptarse explícitamente antes del merge.