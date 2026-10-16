# Justificación de herramientas

Este documento cumple el requisito R6 de la consigna: para cada herramienta relevante del stack explica qué es y qué rol cumple, por qué la elegimos, qué alternativas consideramos y qué resignamos al elegirla.

Las razones están atadas a las necesidades concretas del proyecto: un manual de operaciones con control de acceso por rol y por área, versiones de procedimientos, procesamiento de documentos y un asistente de IA que responde con la documentación interna.

> Las filas marcadas como *a confirmar* son propuestas que el equipo todavía tiene que validar.

## Frontend

| Herramienta | Rol | Por qué | Alternativas | Qué resignamos |
| --- | --- | --- | --- | --- |
| **Next.js** (React y TypeScript) | Interfaz web: login, registro por invitación, ejecución paso a paso, chat, administración y métricas | Permite proteger rutas por rol con middleware y reenviar `/api` al backend con un *rewrite*, de modo que la cookie del refresh token queda en el mismo dominio que el frontend. Se integra con el Vercel AI SDK para mostrar el chat en streaming. El equipo lo trabajó en el curso. | React con Vite (SPA), Nuxt | Más complejidad que una SPA (componentes de servidor y de cliente); parte de sus funciones se aprovechan mejor desplegando en Vercel |
| **Tailwind CSS** | Estilos | Seis personas construyen muchas pantallas distintas; las clases utilitarias mantienen un diseño consistente sin hojas de estilo duplicadas y facilitan el diseño responsive | CSS Modules, Material UI | Clases largas dentro del JSX; no trae componentes listos y los armamos nosotros |

## Backend

| Herramienta | Rol | Por qué | Alternativas | Qué resignamos |
| --- | --- | --- | --- | --- |
| **NestJS** (Node.js y TypeScript) | API REST con la lógica de negocio | Sus guards y decoradores permiten verificar sesión, rol y área en cada endpoint, que es el requisito central (R2). Los módulos se corresponden con la división del trabajo entre parejas, valida con DTOs y genera Swagger. Usa el mismo lenguaje que el frontend, así compartimos tipos. | Express o Fastify sin framework, API routes de Next.js | Más estructura y código repetitivo que Express; curva de aprendizaje de decoradores e inyección de dependencias |
| **Autenticación propia**: JWT (access token de 15 minutos) y refresh token rotativo en cookie httpOnly, con contraseñas hasheadas con bcrypt o argon2 | Identidad, sesión y registro por invitación | La consigna centra la evaluación en la autenticación. Implementarla nos da control total sobre roles y áreas en el backend, la rotación y revocación de refresh tokens y el enlace de invitación de un solo uso, validado por el equipo docente como registro. | Auth0, Clerk, Supabase Auth, Amazon Cognito | Más código propio y más responsabilidad de seguridad; sin login social ni segundo factor listos para usar |
| **Redis y BullMQ** | Cola de trabajos para procesar documentos | Extraer el texto de un PDF, dividirlo y calcular embeddings puede tardar o fallar a mitad de camino. La cola evita bloquear el pedido del administrador y da reintentos y estados visibles. | pg-boss (cola sobre PostgreSQL), procesar en el mismo pedido | Un servicio más para correr y monitorear |

## Datos

| Herramienta | Rol | Por qué | Alternativas | Qué resignamos |
| --- | --- | --- | --- | --- |
| **PostgreSQL con pgvector** | Base de datos principal y búsqueda semántica | Los datos son fuertemente relacionales (usuarios, áreas, procedimientos, versiones, ejecuciones) y necesitamos integridad referencial y transacciones, por ejemplo al aceptar una invitación. Con pgvector, los embeddings viven en la misma base: el filtro por área y la búsqueda del asistente son una sola consulta SQL, que es lo que impide que la IA vea documentos de otra área. | MongoDB; una base vectorial separada como Pinecone | Los cambios de esquema requieren migraciones; a gran escala pgvector rinde menos que una base vectorial dedicada, algo que no aplica a nuestro volumen |
| **Supabase** | Hosting de PostgreSQL | PostgreSQL administrado, con pgvector y un plan gratuito que no consume los créditos de AWS | Amazon RDS, Neon | Límite de 500 MB; pausa la base tras 7 días de baja actividad (lo evitamos con una tarea programada). Solo usamos la base: no usamos Supabase Auth ni su almacenamiento |
| **Prisma** (*a confirmar*) | ORM y migraciones | Genera tipos desde un único esquema que comparten las tres parejas, versiona las migraciones y parametriza las consultas por defecto (R7). Las búsquedas vectoriales se escriben con `$queryRaw` parametrizado. | TypeORM, Drizzle | El tipo `vector` no es nativo, así que esas consultas se escriben en SQL; menos control fino que SQL puro |
| **Amazon S3** | Almacenamiento de los documentos cargados | Saca los archivos del disco del servidor y permite servirlos con URLs firmadas que vencen en minutos, generadas solo después de validar el permiso del usuario | Supabase Storage, disco de la instancia | Hay que configurar un bucket y permisos de IAM |

## Despliegue

| Herramienta | Rol | Por qué | Alternativas | Qué resignamos |
| --- | --- | --- | --- | --- |
| **Vercel** (plan Hobby) | Deploy del frontend | Despliega Next.js sin configuración, con HTTPS y un preview por cada pull request | AWS Amplify, Netlify | El plan gratuito es solo para uso no comercial y tiene límites mensuales |
| **AWS EC2** con Docker Compose y **Caddy** | Deploy del backend, el worker y Redis | El backend necesita un proceso siempre activo para la cola y el streaming del chat. En una sola instancia corren la API, el worker y Redis con el mismo `docker-compose` que usamos en local, y Caddy obtiene y renueva solo el certificado HTTPS (R4). Fue la opción recomendada por el equipo docente. | Render, Railway, AWS Elastic Beanstalk o ECS | Administramos nosotros la instancia, el dominio y el certificado; el plan gratuito de AWS dura 6 meses desde la creación de la cuenta |
| **GitHub Actions** | Integración y despliegue continuos | Está integrado al repositorio: corre lint, tests y build en cada pull request y actualiza la instancia de AWS autenticándose con OIDC, sin claves fijas | GitLab CI, deploy manual | Minutos gratuitos limitados en repositorios privados |

## Inteligencia artificial

| Herramienta | Rol | Por qué | Alternativas | Qué resignamos |
| --- | --- | --- | --- | --- |
| **Google Gemini API** | Modelo de lenguaje y embeddings del asistente | Su capa gratuita cubre el modelo y los embeddings, suficiente para desarrollar y hacer la demo sin costo | OpenAI, Anthropic (Claude) | En la capa gratuita, Google usa el contenido para mejorar sus productos (aceptable porque la demo usa una empresa ficticia); límites de uso |
| **Vercel AI SDK** | Librería para llamar al modelo desde el backend | Resuelve el streaming de respuestas, el cálculo de embeddings y un modelo simulado para los tests con una sola API. Cambiar de proveedor es cambiar la configuración, no el código del chat. | SDK oficial de Google, LangChain.js | Una capa más entre nuestro código y el proveedor; la API cambia entre versiones mayores |

## Testing

| Herramienta | Rol | Por qué | Alternativas | Qué resignamos |
| --- | --- | --- | --- | --- |
| **Jest y Supertest** | Tests unitarios y de integración del backend | Jest viene configurado con NestJS; Supertest prueba los endpoints reales, incluidos los 401, 403 y 404 que exige la consigna | Vitest | Configuración extra para TypeScript en el monorepo |
| **Playwright** | Tests end-to-end | Prueba los flujos completos en el navegador: registro por invitación, ejecución de un procedimiento y consulta al asistente con la IA simulada | Cypress | Los tests e2e son lentos y más frágiles ante cambios de la interfaz |
