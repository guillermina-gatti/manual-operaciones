# PispIAr — A-21 · Runbook de Despliegue en AWS (EC2 + Docker Compose + Caddy)

> [!IMPORTANT]
> **Estado operativo del documento:** Guía maestra de despliegue para **Manual de Operaciones (PispIAr)**.
> Diferencia explícitamente cada paso según su estado real en el repositorio:
> - **`[VERIFICADO]`**: Implementado y comprobado en código/contenedores locales.
> - **`[PENDIENTE]`**: Requiere ejecución, aprovisionamiento o decisión manual en AWS antes de desplegar.
> - **`[BLOQUEADO]`**: Presenta una brecha técnica que impide declarar el despliegue productivo completo hasta su resolución y verificación (**H-IMP-01** y **H-IMP-02**).

---

## 1. Objetivo y Alcance

Este runbook describe el procedimiento ordenado, reproducible y seguro para desplegar **PispIAr (Manual de Operaciones)** en **AWS**, permitiendo que un operador que no haya participado de la implementación pueda preparar la infraestructura, levantar los contenedores, ejecutar las migraciones, crear el primer usuario `ADMIN`, verificar el funcionamiento y ejecutar un rollback o apagado seguro.

### Documentación existente reutilizada (sin duplicar contenido)
* **Migraciones de producción y protección de índices críticos:** [A-21B.6d-runbook-migraciones-produccion.md](./A-21B.6d-runbook-migraciones-produccion.md) e [inventario A-21B.6a](./A-21B.6a-inventario-migraciones.md).
* **Contrato de entrega, healthchecks y criterios GO/NO-GO base:** [A-21B.7c-handoff-despliegue.md](./A-21B.7c-handoff-despliegue.md).
* **Auditoría y validaciones de variables de entorno:** [A-21B.7a-auditoria-configuracion-produccion.md](./A-21B.7a-auditoria-configuracion-produccion.md).
* **Presupuesto, límites de gasto y apagado seguro:** [A-21a.4-presupuesto-limites-y-apagado.md](./A-21a.4-presupuesto-limites-y-apagado.md).
* **Smoke test de imagen API e imagen migrador:** [A-21B.4-guia-imagen-api-y-smoke-test.md](./A-21B.4-guia-imagen-api-y-smoke-test.md) y [A-21B.6b-imagen-migrador-prisma.md](./A-21B.6b-imagen-migrador-prisma.md).

---

## 2. Arquitectura y Componentes

```text
Navegador (HTTPS 443 / HTTP 80)
  │  https://<ELASTIC_IP>.nip.io
  ▼
AWS EC2 (Docker Compose - red bridge 'internal' 172.28.0.0/16)
  │
  └─► caddy (172.28.0.10) — TLS Let's Encrypt automático + redirección 80 → 443
        ├─ /api/* ──► api:3000 (NestJS + BullMQ Worker)
        └─ /*     ──► web:3001 (Next.js standalone)
                        │
        ┌───────────────┼───────────────┬───────────────┐
        ▼               ▼               ▼               ▼
   RDS PostgreSQL   ElastiCache       AWS S3         AWS SES (HU30)
   16 + pgvector     Redis 7       (IAM Profile)   [BLOQUEADO: H-IMP-02]
   [H-IMP-01 CA]
```

| Componente | Tecnología | Estado en repositorio | Archivo de referencia |
|---|---|---|---|
| **Proxy inverso y TLS** | Caddy `2-alpine` (`nip.io` + Let's Encrypt) | `[VERIFICADO]` sintaxis | [`Caddyfile`](../../Caddyfile) |
| **Orquestación** | Docker Compose (`migrator`, `api`, `web`, `caddy`) | `[VERIFICADO]` sintaxis y TLS estricto (M5.3.2); prueba RDS real `[PENDIENTE]` | [`docker-compose.prod.yml`](../../docker-compose.prod.yml) |
| **Frontend** | Next.js `16.4.1` (`output: "standalone"`, puerto `3001`) | `[VERIFICADO]` build y HTTP | [`apps/web/Dockerfile`](../../apps/web/Dockerfile) |
| **Backend / Worker** | NestJS + BullMQ (puerto `3000`) | `[VERIFICADO]` build y artefactos | [`apps/api/Dockerfile`](../../apps/api/Dockerfile) |
| **Migrador** | Prisma CLI `7.10.0` (one-off) | `[VERIFICADO]` build y aislamiento | [`apps/migrator/package.json`](../../apps/migrator/package.json) |
| **Bootstrap ADMIN** | Script CLI interactivo por TTY | `[VERIFICADO]` tests y guards | [`bootstrap-admin.ts`](../../apps/api/src/scripts/bootstrap-admin.ts) |

---

## 3. Requisitos Previos y Preparación de la Cuenta AWS `[PENDIENTE]`

1. Cuenta AWS activa con presupuesto, titular responsable y alertas de facturación configuradas conforme a [A-21a.4](./A-21a.4-presupuesto-limites-y-apagado.md).
2. Acceso mediante usuario/rol IAM con MFA (no operar con credenciales root).
3. Clave de API de **Google Gemini** (`GOOGLE_GENERATIVE_AI_API_KEY`) si la demostración incluye procesamiento de embeddings y chat RAG.
4. Decisión explícita de resolución sobre los dos bloqueos abiertos: **H-IMP-01** (CA RDS) y **H-IMP-02** (AWS SES).

---

## 4. Elección de Región AWS (`sa-east-1` vs `us-east-1`) `[PENDIENTE]`

No se asume de antemano que una región sea más económica ni se estiman precios sin cotización verificable. Antes de aprovisionar, comparar ambas regiones candidatas en **AWS Pricing Calculator** para la misma arquitectura exacta:

| Criterio de comparación | `sa-east-1` (São Paulo) | `us-east-1` (N. Virginia) | Cómo verificar |
|---|---|---|---|
| **Cómputo EC2 + EBS + Elastic IP** | Verificar tarifa por hora del tipo elegido (`t3.small` / `t3.medium`) y GB EBS gp3 | Verificar tarifa equivalente | AWS Pricing Calculator |
| **RDS PostgreSQL (Single-AZ)** | Verificar instancia `db.t3.micro`/`db.t4g.micro` + almacenamiento + backups | Verificar tarifa equivalente | AWS Pricing Calculator |
| **ElastiCache Redis / Valkey** | Verificar nodo `cache.t3.micro`/`cache.t4g.micro` | Verificar tarifa equivalente | AWS Pricing Calculator |
| **S3 + Transferencia (Data Transfer Out)** | Verificar costo por GB almacenado y salida a Internet | Verificar tarifa equivalente | AWS Pricing Calculator |
| **AWS SES (HU30)** | Verificar disponibilidad de características SES y costo por 1.000 envíos | Verificar tarifa equivalente | Consola SES / Pricing Calculator |
| **Latencia hacia Argentina** | Menor latencia de red hacia usuarios finales en Argentina | Mayor latencia transcontinental | Prueba de latencia / criterio funcional |
| **Disponibilidad de servicios e instancias** | Verificar disponibilidad de tipos `t4g`/`t3` y PostgreSQL 16 + `pgvector` | Verificar disponibilidad | Consola AWS de la región |

**Paso obligatorio previo al aprovisionamiento:**
1. Ingresar a [AWS Pricing Calculator](https://calculator.aws/).
2. Cargar una estimación para la arquitectura equivalente en `us-east-1` y otra en `sa-east-1` (EC2 + EBS + EIP, RDS PostgreSQL, ElastiCache Redis, S3, SES y transferencia mensual estimada).
3. Registrar las URLs de ambas cotizaciones, la fecha de consulta y la región aprobada (priorizando la alternativa de **menor costo total mensual** que satisfaga disponibilidad técnica de RDS/ElastiCache/SES y latencia aceptable).

---

## 5. Red, Security Groups y Conectividad Privada `[PENDIENTE]`

Crear (o reutilizar en la región elegida) una **VPC** con subnets públicas (para EC2) y subnets privadas (para RDS y ElastiCache), configurando tres Security Groups diferenciados:

| Security Group | Recurso | Reglas de Entrada (Inbound) | Reglas de Salida (Outbound) |
|---|---|---|---|
| **`SG-EC2`** | Instancia EC2 | `80/tcp` desde `0.0.0.0/0` (HTTP + ACME HTTP-01)<br>`443/tcp` desde `0.0.0.0/0` (HTTPS)<br>`22/tcp` restringido a IPs autorizadas (o EC2 Instance Connect) | `0.0.0.0/0` (necesario para Let's Encrypt, Gemini, SES, apt/docker) |
| **`SG-RDS`** | RDS PostgreSQL | `5432/tcp` **únicamente** desde origen `SG-EC2` | Por defecto |
| **`SG-Redis`** | ElastiCache Redis | `6379/tcp` **únicamente** desde origen `SG-EC2` | Por defecto |

> [!CAUTION]
> **Prohibido** exponer `5432`, `6379`, `3000` o `3001` a `0.0.0.0/0`. Tanto RDS como ElastiCache deben tener acceso público deshabilitado (`Publicly Accessible = No`).

---

## 6. Aprovisionamiento de Servicios AWS `[PENDIENTE]`

### 6.1. EC2, Elastic IP e IAM Instance Profile
1. **Instancia EC2:**
   * Sistema operativo recomendado: **Ubuntu Server 24.04 LTS (x86_64)**.
   * Recursos mínimos recomendados: `2 vCPU`, `2–4 GB RAM` (ej. `t3.small` o `t3.medium`) y disco raíz **EBS gp3 de al menos 20 GB** (para almacenar capas de build de Node 24 / Next.js / NestJS).
   * Asociar **`SG-EC2`**.
2. **Elastic IP (EIP):**
   * Asignar una **Elastic IP** y asociarla a la instancia EC2 **antes de construir el frontend**.
   * Anotar la IP pública fija (`<ELASTIC_IP>`) para construir `PUBLIC_DOMAIN=<ELASTIC_IP>.nip.io`.
3. **Metadatos IMDSv2 (Obligatorio para contenedores Docker):**
   * Exigir IMDSv2 (`HttpTokens = required`) y configurar **`HttpPutResponseHopLimit = 2`**.
   * *Motivo:* El valor por defecto `1` impide que el SDK de AWS dentro del contenedor `api` (red bridge de Docker, +1 salto) alcance `169.254.169.254` para obtener credenciales temporales de S3.
4. **IAM Role + Instance Profile (asociado a la EC2):**
   * Adjuntar una política con permisos mínimos exclusivos sobre el bucket S3 productivo (`<S3_BUCKET>`):
     * `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` sobre `arn:aws:s3:::<S3_BUCKET>/*`.
     * `s3:ListBucket` sobre `arn:aws:s3:::<S3_BUCKET>`.

### 6.2. Amazon RDS PostgreSQL `[PENDIENTE: validar H-IMP-01 contra RDS real]`
* **Motor:** PostgreSQL `16.x` (compatible con las extensiones `vector` de `pgvector` y `unaccent` requeridas por las migraciones).
* **Acceso:** Subred privada (`SG-RDS`), `Publicly Accessible = No`, backups automáticos habilitados (retención >= 7 días).
* **Usuario administrador maestro:** Conserva privilegios `rds_superuser` necesarios para que `prisma migrate deploy` ejecute `CREATE EXTENSION IF NOT EXISTS vector` y `CREATE EXTENSION IF NOT EXISTS unaccent`.

#### Configuración TLS estricta implementada (`M5.3.2`) `[VERIFICADO en entorno aislado / PENDIENTE contra RDS real]`
* **`DATABASE_URL` compartida:** debe incluir estrictamente `?sslmode=verify-full&sslaccept=strict`.
  * **Prohibido** agregar `sslrootcert=` o `sslcert=` en la URL compartida (`pg` y el motor nativo de Prisma `schema-engine` interpretan `sslcert` de forma incompatible e ignoran o colisionan con `sslrootcert`).
* **Confianza CA por runtime en [`docker-compose.prod.yml`](../../docker-compose.prod.yml#L10-L56):**
  * **`migrator`:** `SSL_CERT_FILE=/etc/ssl/certs/rds-global-bundle.pem` (leído por OpenSSL del binario `schema-engine`).
  * **`api`:** `NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem` (leído por Node.js `tls` al iniciar).
  * **Montaje read-only:** ambos servicios montan `./certs/rds-global-bundle.pem:/etc/ssl/certs/rds-global-bundle.pem:ro` (los servicios `web` y `caddy` no montan este archivo).
* **Exclusiones:** `certs/` y `*.pem` están excluidos de Git ([`.gitignore`](../../.gitignore)) y del contexto Docker ([`.dockerignore`](../../.dockerignore)), por lo que el certificado nunca se versiona ni se embebe en las imágenes.

#### Obtención del certificado CA oficial en el servidor EC2 `[PENDIENTE]`
Descargar el bundle global oficial de Amazon RDS directamente en la instancia EC2 (fuera de Git y antes de levantar Compose):

```bash
mkdir -p certs
curl -fsSL "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem" -o ./certs/rds-global-bundle.pem
chmod 644 ./certs/rds-global-bundle.pem

# Validar estructura PEM y registrar huella SHA-256 local para trazabilidad
# (sha256sum registra el hash local; no acredita autenticidad sin comparar contra un checksum oficial independiente)
openssl crl2pkcs7 -nocrl -certfile ./certs/rds-global-bundle.pem | openssl pkcs7 -print_certs -noout
sha256sum ./certs/rds-global-bundle.pem
```

> [!WARNING]
> **H-IMP-01 permanece `[PENDIENTE]` hasta la validación contra RDS real:**
> La configuración quedó implementada y validada en entorno TLS aislado (`M5.3.1-B` / `M5.3.2`), pero **no debe declararse cerrada ni lista para producción** hasta comprobar la conexión TLS real contra la instancia Amazon RDS provisionada (tanto `migrator` como `api`).

### 6.3. Amazon ElastiCache Redis
* **Motor:** Redis OSS `7.x` (o Valkey compatible).
* **Topología obligatoria:** **Cluster Mode Disabled** (nodo único o replication group sin sharding). *Motivo:* BullMQ ejecuta scripts Lua multi-key que fallan en Redis Cluster Mode.
* **Política de memoria:** `maxmemory-policy = noeviction` (para no perder jobs de BullMQ ni sesiones/rate-limiting por evicción).
* **Red:** Subred privada (`SG-Redis`). Si se habilita *Encryption in-transit*, usar esquema `rediss://` en `REDIS_URL`.

### 6.4. Amazon S3
* Crear bucket privado en la misma `AWS_REGION` que la EC2 (`Block all public access = ON`, cifrado SSE-S3 activado).
* El código (`S3FileStorage`) realiza `PutObject` (con `ChecksumSHA256`), `GetObject` (lectura para embeddings y generación de presigned URLs de 5 minutos) y `DeleteObject` sin necesidad de `AWS_ACCESS_KEY_ID` ni `AWS_SECRET_ACCESS_KEY` cuando la EC2 tiene el IAM Instance Profile.

### 6.5. Correo Electrónico — AWS SES (HU30) `[PENDIENTE OPERATIVO: H-IMP-02]`
* **Proveedor acordado para producción:** **AWS SES** (`INVITATION_EMAIL_PROVIDER=ses`, manteniendo `resend` como proveedor alternativo).
* **Implementado en código (backend):**
  * Adaptador `SesInvitationDeliveryService` (`@aws-sdk/client-sesv2`) con plantilla y validación de remitente compartidas con Resend (`invitation-email-template.ts`).
  * Selección del proveedor en `UsersModule` (`ses` y `resend` en entornos no locales; `local` restringido a `development`/`test`).
  * Validaciones de arranque en `environment.validation.ts` (`INVITATION_EMAIL_PROVIDER=ses`, `AWS_SES_REGION` con fallback a `AWS_REGION`, e `INVITATION_EMAIL_FROM`).
  * Uso de la cadena de credenciales por defecto del AWS SDK (IAM Instance Profile en EC2, sin credenciales estáticas).
* **Pendiente operativo en AWS — H-IMP-02 (no resuelto):**
  1. Definir `INVITATION_EMAIL_FROM` en `.env` de producción.
  2. Verificar la identidad remitente (correo electrónico verificado o dominio con DKIM/SPF) en la **región SES efectiva** (`AWS_SES_REGION` o, si está vacía, `AWS_REGION`).
  3. Otorgar al IAM Instance Profile de la EC2 el permiso mínimo `ses:SendEmail`.
  4. Confirmar **Production Access (salida de SES Sandbox)** en AWS Support o, mientras permanezca en sandbox, verificar las direcciones de destino de prueba.
  5. Verificar en despliegue la configuración efectiva de región (`AWS_SES_REGION` con fallback a `AWS_REGION`) y ejecutar una **prueba real de envío y recepción**.

> [!WARNING]
> **Riesgo de timeout ambiguo (H-IMP-02 / HU30):**
> * `SesInvitationDeliveryService` utiliza `AbortSignal.timeout(10_000)` en `client.send()`. Si AWS SES acepta el mensaje pero la respuesta no llega antes de los 10 segundos, la aplicación recibe un error de timeout, responde **HTTP `503`** y ejecuta la revocación compensatoria de la invitación en PostgreSQL (sin colas ni reintentos automáticos en esta etapa).
> * Mientras no se completen los requisitos operativos de **H-IMP-02** en AWS y `.env`, el envío real de invitaciones permanece **no operativo** en producción (`503`).

---

## 7. Preparación del Servidor EC2 `[PENDIENTE]`

Conectar por SSH a la instancia EC2 (`ubuntu@<ELASTIC_IP>`) e instalar dependencias base:

```bash
# 1. Actualizar paquetes del sistema
sudo apt-get update && sudo apt-get upgrade -y

# 2. Instalar Docker Engine y Docker Compose plugin (repositorio oficial Docker)
sudo apt-get install -y ca-certificates curl gnupg git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# 3. Habilitar Docker sin sudo para el usuario operador (requiere re-login SSH)
sudo usermod -aG docker "$USER"

# 4. Verificar versiones
docker --version
docker compose version
```

Clonar el repositorio en la rama aprobada (`develop` o release tag):

```bash
git clone <URL_REPOSITORIO> manual-operaciones
cd manual-operaciones
git checkout develop
```

---

## 8. Variables de Entorno y Secretos

Crear el archivo `.env` en la raíz del repositorio en EC2 a partir de [`.env.production.example`](../../.env.production.example) y restringir permisos:

```bash
cp .env.production.example .env
chmod 600 .env
```

### Diferencia crítica: Build-Time vs. Runtime `[VERIFICADO]`
* **Build-time (`apps/web/Dockerfile`):**
  * `API_URL=https://<ELASTIC_IP>.nip.io` (obligatoria durante `docker compose build web`). Queda compilada en los manifiestos de `.next/` para el rewrite de Next.js. **Si cambia la IP de la EC2, es obligatorio reconstruir el contenedor `web`.**
  * Ningún secreto debe incluirse en `ARG` de build ni llevar prefijo `NEXT_PUBLIC_`.
* **Runtime (`api` y `migrator`):**
  * `DATABASE_URL=postgresql://<USUARIO>:<PASSWORD>@<RDS_ENDPOINT>:5432/<DB_NAME>?sslmode=verify-full&sslaccept=strict` (sin `sslrootcert` ni `sslcert`), `NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem` (`api`), `SSL_CERT_FILE=/etc/ssl/certs/rds-global-bundle.pem` (`migrator`), `JWT_SECRET` ($\ge 32$ caracteres aleatorios generados con `openssl rand -base64 36`), `REDIS_URL`, `S3_BUCKET`, `AWS_REGION`, `HTTP_TRUSTED_PROXIES=172.28.0.10`, `FRONTEND_URL=https://<ELASTIC_IP>.nip.io`, `PUBLIC_DOMAIN=<ELASTIC_IP>.nip.io`.
  * `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` se dejan **vacías** para usar el IAM Instance Profile de la EC2.
  * Consultar la matriz completa de validaciones en [A-21B.7a](./A-21B.7a-auditoria-configuracion-produccion.md).

---

## 9. Construcción, Caddy HTTPS (`nip.io`) y Orquestación Compose

* **Funcionamiento de Caddy sin dominio propio `[VERIFICADO]`:**
  * [`Caddyfile`](../../Caddyfile) utiliza `{$PUBLIC_DOMAIN}` (`<ELASTIC_IP>.nip.io`).
  * Caddy gestiona automáticamente el desafío ACME (HTTP-01 en puerto `80` / TLS-ALPN-01 en puerto `443`), emite el certificado TLS válido mediante Let's Encrypt, redirige `80 → 443` y renueva antes del vencimiento guardando el estado en el volumen persistente `caddy_data`.
  * Enruta `/api/*` directo a `api:3000` (evitando bucles de rewrite con `web`) y `/*` a `web:3001`.
* **Condiciones necesarias:**
  1. Puertos `80` y `443` abiertos a `0.0.0.0/0` en `SG-EC2`.
  2. No eliminar el volumen `caddy_data` entre recreaciones para no agotar límites de tasa de Let's Encrypt.
  3. **Limitación sin dominio propio:** `*.nip.io` no permite configurar registros DNS propios (DKIM/SPF/MX) para verificar remitentes de correo en AWS SES; mientras no haya dominio propio, la identidad remitente en SES deberá ser una dirección de correo individual verificada o un dominio existente controlado por el equipo.

---

## 10. Ejecución de Migraciones y Puesta en Marcha `[PENDIENTE DE EJECUCIÓN EN AWS]`

0. **Precondiciones obligatorias previas a `docker compose up`:**
   * Aunque `docker compose -f docker-compose.prod.yml config` valide la sintaxis e interpolación correctamente, **no verifica que el archivo del bind mount exista en el host**. Si falta `./certs/rds-global-bundle.pem`, Docker creará un directorio vacío en esa ruta al hacer `up` y fallará la conexión TLS.
   * Verificar explícitamente que el bundle existe como archivo regular y no está vacío; **si cualquiera de las comprobaciones falla, detener el procedimiento**:
     ```bash
     test -f ./certs/rds-global-bundle.pem && test -s ./certs/rds-global-bundle.pem
     ```
1. **Construcción explícita de imágenes `[VERIFICADO en local M4]`:**
   ```bash
   docker compose -f docker-compose.prod.yml build
   ```
2. **Arranque orquestado (migraciones previas + servicios):**
   ```bash
   docker compose -f docker-compose.prod.yml up -d
   ```
   * Primero corre `migrator` ejecutando `prisma migrate deploy` (ver protocolo completo y protección de los 5 índices críticos en [A-21B.6d](./A-21B.6d-runbook-migraciones-produccion.md)).
   * `api` declara `depends_on: migrator: condition: service_completed_successfully`: **si alguna migración falla, `api` no arranca**.
   * **Prohibido** ejecutar `prisma migrate reset`, `prisma db push` o `prisma db seed` en producción.
3. **Verificar que `migrator` finalizó con código `0`:**
   ```bash
   docker compose -f docker-compose.prod.yml ps -a
   docker compose -f docker-compose.prod.yml logs migrator
   ```

---

## 11. Bootstrap Seguro del Primer `ADMIN` `[VERIFICADO en diseño/tests, PENDIENTE ejecución en EC2]`

Ejecutar **una única vez** desde una sesión SSH interactiva (requiere TTY real) inmediatamente después de que `migrator` y `api` estén levantados:

```bash
docker compose -f docker-compose.prod.yml run --rm --no-deps \
  api node dist/scripts/bootstrap-admin.js
```

* El comando solicita por entrada interactiva: correo electrónico, nombre completo (2–100 chars), contraseña oculta (8–128 chars) y confirmación.
* **Garantías verificadas ([bootstrap-admin.ts](../../apps/api/src/scripts/bootstrap-admin.ts)):**
  * Exige `process.stdin.isTTY === true` y rechaza argumentos CLI.
  * Ejecuta en transacción `Serializable` con reintento ante `P2034` y aborto inmediato ante `P2002`.
  * Si ya existe un `ADMIN`, aborta sin modificar ningún registro (código de salida `1`).
  * No crea áreas ni vínculos en `user_areas`; las áreas reales se crean luego desde `/admin/areas`.

---

## 12. Verificaciones Posteriores al Despliegue `[PENDIENTE]`

Ejecutar desde fuera de la instancia (máquina del operador) una vez levantado el stack:

```bash
# 1. Verificar certificado TLS y liveness
curl -fsS https://<ELASTIC_IP>.nip.io/api/health/live
# Esperado: {"status":"ok"}

# 2. Verificar readiness (PostgreSQL + Redis con timeout 1s)
curl -fsS https://<ELASTIC_IP>.nip.io/api/health/ready
# Esperado: {"status":"ok","checks":{"postgresql":"up","redis":"up"}}
```

**Comprobaciones funcionales manuales en navegador (`https://<ELASTIC_IP>.nip.io/login`):**
1. Iniciar sesión con el `ADMIN` creado en el paso 11.
2. Verificar en DevTools que la cookie `refreshToken` tiene flags `HttpOnly`, `Secure`, `SameSite=Lax` y `Path=/api/auth`.
3. Crear un área en `/admin/areas`.
4. Subir un documento PDF y verificar su descarga mediante presigned URL de S3 (confirmando IMDSv2 + IAM Instance Profile).
5. *(Pendiente operativo H-IMP-02)* El envío real de invitaciones por correo desde `/admin/invitaciones` permanece pendiente hasta definir `INVITATION_EMAIL_FROM`, verificar la identidad en la región SES efectiva, otorgar `ses:SendEmail` al Instance Profile, confirmar salida de sandbox (o destinatarios verificados) y validar envío y recepción reales.

---

## 13. Observabilidad, Logs y Diagnóstico de Errores

### Comandos de diagnóstico en EC2
```bash
# Estado y healthchecks de contenedores
docker compose -f docker-compose.prod.yml ps

# Logs en tiempo real por servicio
docker compose -f docker-compose.prod.yml logs -f --tail=100 caddy api web

# Inspeccionar logs de migraciones
docker compose -f docker-compose.prod.yml logs migrator
```

### Errores comunes esperados y diagnóstico rápido
* **`api` no inicia / falla validación:** revisar `docker compose -f docker-compose.prod.yml logs api`; `validateEnvironment` indica el nombre exacto de la variable faltante o inválida sin imprimir su valor.
* **CA no confiable (`unable to get local issuer certificate` en `migrator` o `unable to verify the first certificate` en `api`):** verificar que `./certs/rds-global-bundle.pem` corresponde al bundle oficial de Amazon RDS, que está montado `:ro` en `/etc/ssl/certs/rds-global-bundle.pem`, y que `SSL_CERT_FILE` (`migrator`) / `NODE_EXTRA_CA_CERTS` (`api`) apuntan a esa ruta. **Nunca desactivar la verificación TLS (`sslmode=disable` o `no-verify`).**
* **Hostname no coincide con el certificado (`hostname mismatch` en `migrator` o `Hostname/IP does not match certificate's altnames` en `api`):** comprobar que `DATABASE_URL` usa el endpoint DNS oficial de Amazon RDS (`*.rds.amazonaws.com`), y no una IP ni un alias distinto.
* **Bundle ausente o vacío en el host (`EISDIR`, `Could not read provided CA certificate` o fallo al leer `/etc/ssl/certs/rds-global-bundle.pem`):** si `./certs/rds-global-bundle.pem` es un directorio creado automáticamente por Docker, detener los contenedores (`docker compose -f docker-compose.prod.yml down`), eliminar ese directorio vacío, descargar nuevamente el archivo oficial de AWS (`test -f` y `test -s`) y verificar permisos legibles (`chmod 644`).
* **Fallo general de conexión desde `migrator` o `api` / HTTP `503` en `/api/health/ready`:** revisar conectividad de red / Security Groups (`SG-EC2` → `SG-RDS` puerto `5432`, `SG-EC2` → `SG-Redis` puerto `6379`) y confirmar que `DATABASE_URL` mantiene `?sslmode=verify-full&sslaccept=strict`.
* **Error S3 (`503` al subir/descargar PDF):** verificar que la EC2 tiene asociado el IAM Role y que `HttpPutResponseHopLimit = 2` está configurado en IMDSv2.
* **Caddy no emite certificado HTTPS:** verificar puertos `80` y `443` abiertos a `0.0.0.0/0` en `SG-EC2` y que `PUBLIC_DOMAIN` coincide con `<ELASTIC_IP>.nip.io`.
* **HTTP `503` al crear invitación:** esperado mientras permanezca abierto **H-IMP-02** (falta de `INVITATION_EMAIL_FROM`, identidad no verificada en la región SES efectiva, falta de permiso `ses:SendEmail` en IAM, restricción de SES Sandbox o timeout ambiguo de 10s en `client.send()`).

---

## 14. Backup, Recuperación y Rollback

### Backups y recuperación de datos
* **RDS PostgreSQL:** habilitar backups automáticos diarios en RDS y tomar un **snapshot manual previo** antes de cada release con nuevas migraciones.
* **S3:** activar versionado de objetos en el bucket S3 si se requiere recuperación ante borrados accidentales.
* **Caddy:** respaldar o preservar el volumen `caddy_data`.

### Rollback de aplicación (`web` / `api`)
Si un despliegue sin cambios destructivos de esquema falla:
```bash
git checkout <COMMIT_O_TAG_ANTERIOR>
docker compose -f docker-compose.prod.yml up -d --build
```
*(Si cambió el código de `web` o `API_URL`, reconstruir `web`).*

### Consideraciones especiales sobre rollback de migraciones
* **Prisma `migrate deploy` es únicamente hacia adelante (forward-only):** no existe rollback automático de SQL ya aplicado en producción.
* Ante una migración fallida o incompatible tras aplicarse:
  1. Detener la `api` (`docker compose -f docker-compose.prod.yml stop api`).
  2. Seguir estrictamente [A-21B.6d-runbook-migraciones-produccion.md](./A-21B.6d-runbook-migraciones-produccion.md) (restaurar snapshot de RDS o resolver estado con `prisma migrate resolve` previa inspección).
  3. **Nunca** ejecutar `prisma migrate reset` en producción.

---

## 15. Apagado Seguro y Checklist Final de Producción

Para detener o dar de baja los recursos al finalizar demostraciones y evitar costos innecesarios en AWS, seguir el orden de apagado de [A-21a.4](./A-21a.4-presupuesto-limites-y-apagado.md#L80-L93) (detener servicios Compose, respaldar si aplica, eliminar EC2/EIP/RDS/ElastiCache/S3 según retención y verificar facturación).

### Checklist GO / NO-GO de Producción

* [ ] Cotizaciones de `us-east-1` vs `sa-east-1` revisadas en AWS Pricing Calculator y región aprobada.
* [ ] **Validado H-IMP-01 contra RDS real:** bundle oficial `global-bundle.pem` descargado (`test -f` y `test -s`), montado `:ro` en `migrator` (`SSL_CERT_FILE`) y `api` (`NODE_EXTRA_CA_CERTS`), y conexión TLS `sslmode=verify-full&sslaccept=strict` comprobada en ambos servicios.
* [ ] **Resuelto H-IMP-02:** Adaptador AWS SES verificado en despliegue real, `INVITATION_EMAIL_FROM` definido, identidad remitente verificada en la región SES efectiva (`AWS_SES_REGION` / fallback `AWS_REGION`), permiso mínimo `ses:SendEmail` en IAM Instance Profile, alcance sandbox/Production Access confirmado y prueba real de envío y recepción completada (o aprobado explícitamente operar sin invitaciones por correo).
* [ ] Elastic IP asociada, `HttpPutResponseHopLimit = 2` en EC2, `SG-EC2` (`80/443`), `SG-RDS` (`5432`) y `SG-Redis` (`6379`) configurados.
* [ ] `.env` creado con `chmod 600`, `API_URL=https://<EIP>.nip.io`, `FRONTEND_URL=https://<EIP>.nip.io` y `HTTP_TRUSTED_PROXIES=172.28.0.10`.
* [ ] `migrator` completado con código `0` y los 5 índices críticos preservados.
* [ ] Primer `ADMIN` creado con `bootstrap-admin.js` vía TTY interactivo.
* [ ] `/api/health/live` (`200`), `/api/health/ready` (`200`), TLS Let's Encrypt, login real y subida/descarga S3 verificados.
