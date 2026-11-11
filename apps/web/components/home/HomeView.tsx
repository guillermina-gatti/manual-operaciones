'use client';

import Link from 'next/link';
import { REAL_AUTH_ENABLED, useSession } from '@/lib/session';
import type { Role } from '@/lib/session';

interface ModuleCardConfig {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  href: string;
  ctaLabel: string;
}

interface QuickActionConfig {
  id: string;
  label: string;
  description: string;
  href: string;
  variant: 'primary' | 'secondary';
}

interface RoleMetadata {
  label: string;
  summary: string;
  subtitle: string;
  horneroTip: string;
}

const ROLE_METADATA: Record<Role, RoleMetadata> = {
  ADMIN: {
    label: 'Administrador',
    summary:
      'Tenés acceso al catálogo completo de todas las áreas, carga de manuales, seguimiento de revisiones y métricas operativas.',
    subtitle:
      'Gestioná los documentos vigentes, revisá su frescura y analizá las métricas de todas las áreas.',
    horneroTip:
      'Al cargar un documento nuevo o revisar su frescura, asigná siempre un responsable del área para mantener el nido al día.',
  },
  SUPERVISOR: {
    label: 'Supervisor',
    summary:
      'Podés consultar los documentos vigentes de tus áreas asignadas y analizar en qué pasos de los procedimientos se demora o se traba el equipo.',
    subtitle:
      'Consultá la documentación de tus áreas y seguí de cerca las métricas de los recorridos.',
    horneroTip:
      'En el panel de métricas podés detectar rápido qué pasos fluyen y cuáles necesitan un ajuste en las instrucciones.',
  },
  EMPLOYEE: {
    label: 'Empleado',
    summary:
      'Podés buscar y leer los documentos vigentes de tus áreas y ejecutar los recorridos paso a paso a tu ritmo.',
    subtitle:
      'Consultá los manuales de tu área o retomá tus recorridos paso a paso donde los dejaste.',
    horneroTip:
      'Buscá también adentro de los documentos desde el catálogo: no importan las mayúsculas ni las tildes.',
  },
};

const MODULES_BY_ROLE: Record<Role, readonly ModuleCardConfig[]> = {
  EMPLOYEE: [
    {
      id: 'documentos',
      title: 'Documentos',
      subtitle: 'El estante de tu área',
      description:
        'Consultá y buscá adentro de los manuales, guías e instructivos vigentes habilitados para tu sector.',
      href: '/documentos',
      ctaLabel: 'Ver documentos →',
    },
    {
      id: 'procedimientos',
      title: 'Procedimientos',
      subtitle: 'Paso a paso de tu área',
      description:
        'Mirá los procedimientos publicados de tus áreas y repasá sus pasos antes de ejecutarlos.',
      href: '/procedimientos',
      ctaLabel: 'Ver procedimientos →',
    },
    {
      id: 'ejecuciones',
      title: 'Ejecuciones y recorridos',
      subtitle: 'Tu nido va tomando forma',
      description:
        'Elegí un procedimiento publicado para empezarlo desde cero o retomá paso a paso el que tenías en curso.',
      href: '/ejecuciones',
      ctaLabel: 'Ir a ejecuciones →',
    },
    {
      id: 'mi-actividad',
      title: 'Mi actividad',
      subtitle: 'Tus recorridos',
      description: 'Mirá cuánto tardás, tus recorridos completados y cuáles retomar.',
      href: '/ejecuciones/mi-actividad',
      ctaLabel: 'Ver mi actividad →',
    },
  ],
  SUPERVISOR: [
    {
      id: 'documentos',
      title: 'Documentos',
      subtitle: 'El estante de tus áreas',
      description:
        'Consultá los manuales vigentes de tus áreas, revisá los documentos a tu cargo y buscá en su contenido.',
      href: '/documentos',
      ctaLabel: 'Ver documentos →',
    },
    {
      id: 'procedimientos',
      title: 'Procedimientos',
      subtitle: 'Los de tus áreas',
      description:
        'Consultá los procedimientos publicados de tus áreas y sus pasos, tal como los siguen tus equipos.',
      href: '/procedimientos',
      ctaLabel: 'Ver procedimientos →',
    },
    {
      id: 'metricas',
      title: 'Métricas',
      subtitle: 'Dónde se traban',
      description:
        'Analizá cuántas veces se completó cada procedimiento, cuánto lleva cada paso y dónde se abandona.',
      href: '/metricas',
      ctaLabel: 'Ver métricas →',
    },
  ],
  ADMIN: [
    {
      id: 'documentos',
      title: 'Documentos',
      subtitle: 'Catálogo general',
      description:
        'Accedé a los documentos de todas las áreas, administrá su ciclo de vida, versiones e historial.',
      href: '/documentos',
      ctaLabel: 'Ver documentos →',
    },
    {
      id: 'procedimientos',
      title: 'Procedimientos',
      subtitle: 'Crear y editar',
      description:
        'Creá procedimientos, armá sus pasos, asignalos a áreas y publicá nuevas versiones.',
      href: '/procedimientos',
      ctaLabel: 'Gestionar procedimientos →',
    },
    {
      id: 'metricas',
      title: 'Métricas',
      subtitle: 'Dónde se traban',
      description:
        'Supervisá el desempeño de los procedimientos en todas las áreas e identificá cuellos de botella por paso.',
      href: '/metricas',
      ctaLabel: 'Ver métricas →',
    },
  ],
};

const ADMIN_QUICK_ACTIONS: readonly QuickActionConfig[] = [
  {
    id: 'cargar-documento',
    label: '+ Cargar documento →',
    description: 'Subí un nuevo PDF, Markdown o texto al catálogo y asignale áreas y responsable.',
    href: '/documentos/nuevo',
    variant: 'primary',
  },
  {
    id: 'por-revisar',
    label: 'Por revisar →',
    description: 'Revisá los documentos vencidos o próximos a vencer para mantener su frescura.',
    href: '/documentos/por-revisar',
    variant: 'secondary',
  },
];

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E85114]';

const PRIMARY_BUTTON = `inline-flex min-h-12 items-center justify-center rounded-xl bg-[#0B4233] px-6 py-3 text-base font-semibold text-white transition-colors hover:bg-[#1F5848] ${FOCUS_RING}`;

const SECONDARY_BUTTON = `inline-flex min-h-12 items-center justify-center rounded-xl border border-[#0B4233] bg-white px-6 py-3 text-base font-semibold text-[#0B4233] transition-colors hover:bg-[#EEF3F0] ${FOCUS_RING}`;

function DecorativeLeaves() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 120 56"
      className="h-12 w-24 shrink-0 select-none"
      fill="none"
    >
      <path
        d="M16 46C16 24 38 10 64 10C64 32 42 46 16 46Z"
        fill="#1F5848"
      />
      <path
        d="M44 48C44 30 62 16 86 16C86 34 68 48 44 48Z"
        fill="#2E7D5B"
      />
      <path
        d="M72 50C72 36 86 24 106 24C106 38 92 50 72 50Z"
        fill="#6FAF86"
      />
    </svg>
  );
}

function BrandBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B4233] px-3 py-1.5 text-sm font-semibold tracking-tight text-white">
      <span>
        pisp<span className="text-[#E85114]">IA</span>r
      </span>
      <span aria-hidden="true" className="text-[#6FAF86]">
        ·
      </span>
      <span className="font-normal text-[#EEF3F0]">Manual de operaciones</span>
    </span>
  );
}

export function HomeView() {
  const { user, status } = useSession();

  if (status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center bg-[#F6F7F6] px-4 py-16 text-[#1E2B27]">
        <div
          role="status"
          aria-busy="true"
          className="w-full max-w-md rounded-2xl border border-[#E6E9E7] bg-white p-8 text-center shadow-sm"
        >
          <p className="text-base font-semibold text-[#0B4233]">Preparando tu inicio…</p>
          <p className="mt-2 text-sm text-[#6B7671]">
            Estamos verificando tu sesión para mostrarte tus herramientas.
          </p>
        </div>
      </div>
    );
  }

  const isAuthenticated = status === 'ready' && user !== null;
  const roleMeta = isAuthenticated ? ROLE_METADATA[user.role] : null;
  const modules = isAuthenticated ? MODULES_BY_ROLE[user.role] : [];
  const quickActions = isAuthenticated && user.role === 'ADMIN' ? ADMIN_QUICK_ACTIONS : [];

  return (
    <div className="flex-1 bg-[#F6F7F6] text-[#1E2B27]">
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:py-12">
        {/* Hero principal */}
        <section
          aria-labelledby="home-hero-heading"
          className="relative overflow-hidden rounded-2xl border border-[#E6E9E7] bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
            <div className="flex max-w-3xl flex-col gap-4">
              <div>
                <BrandBadge />
              </div>
              <h1
                id="home-hero-heading"
                className="flex flex-col gap-1 text-3xl font-extrabold tracking-[-0.02em] sm:text-[40px] sm:leading-[1.15]"
              >
                {isAuthenticated ? (
                  <>
                    <span className="text-[#0B4233]">¡Buen día, {user.name}!</span>
                    <span className="text-[#E85114]">
                      ¿Qué procedimiento o documento necesitás hoy?
                    </span>
                  </>
                ) : (
                  <>
                    <span className="text-[#0B4233]">Tu nido de conocimiento operativo</span>
                    <span className="text-[#E85114]">
                      Consultá documentos y recorridos paso a paso en pispIAr
                    </span>
                  </>
                )}
              </h1>
              <p className="text-lg text-[#6B7671]">
                {isAuthenticated && roleMeta
                  ? roleMeta.subtitle
                  : 'Accedé a los manuales vigentes, seguí los procedimientos de tu sector y mantené las operaciones al día.'}
              </p>
            </div>
            <DecorativeLeaves />
          </div>

          {/* Estado sin sesión: CTA de login real o aviso de selector simulado */}
          {!isAuthenticated && (
            <div className="mt-8 border-t border-[#E6E9E7] pt-6">
              {REAL_AUTH_ENABLED ? (
                <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-base text-[#1E2B27]">
                    Entrá con tu cuenta para ver los documentos y herramientas de tu área.
                  </p>
                  <Link href="/login" className={PRIMARY_BUTTON}>
                    Ingresar →
                  </Link>
                </div>
              ) : (
                <div
                  role="note"
                  className="rounded-xl border border-[#E6E9E7] bg-[#EEF3F0] p-4 text-base text-[#1E2B27]"
                >
                  <p className="font-semibold text-[#0B4233]">Modo de sesión simulada activo</p>
                  <p className="mt-1 text-sm text-[#6B7671]">
                    Elegí un usuario de prueba en el selector disponible abajo a la derecha para
                    explorar las pantallas según cada rol.
                  </p>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Contenido principal + columna lateral de contexto */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          {isAuthenticated && (
            <div className="flex flex-col gap-8 lg:col-span-8">
              {/* Tarjetas de módulos según rol */}
              <section aria-labelledby="home-modules-heading" className="flex flex-col gap-4">
                <h2 id="home-modules-heading" className="text-xl font-bold text-[#0B4233]">
                  Tus herramientas disponibles
                </h2>
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                  {modules.map((mod) => (
                    <article
                      key={mod.id}
                      className="flex flex-col justify-between rounded-2xl border border-[#E6E9E7] bg-white p-6 shadow-sm sm:p-8"
                    >
                      <div className="flex flex-col gap-2">
                        <span className="text-sm font-semibold text-[#E85114]">{mod.subtitle}</span>
                        <h3 className="text-[22px] font-bold text-[#0B4233]">{mod.title}</h3>
                        <p className="mt-1 text-base text-[#6B7671]">{mod.description}</p>
                      </div>
                      <div className="mt-6 pt-2">
                        <Link href={mod.href} className={PRIMARY_BUTTON}>
                          {mod.ctaLabel}
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {/* Acciones rápidas exclusivas cuando correspondan al rol */}
              {quickActions.length > 0 && (
                <section
                  aria-labelledby="home-quick-actions-heading"
                  className="flex flex-col gap-4 rounded-2xl border border-[#E6E9E7] bg-white p-6 shadow-sm sm:p-8"
                >
                  <div>
                    <h2
                      id="home-quick-actions-heading"
                      className="text-[22px] font-bold text-[#0B4233]"
                    >
                      Acciones rápidas de administración
                    </h2>
                    <p className="mt-1 text-sm text-[#6B7671]">
                      Atajos directos para mantener el catálogo actualizado y al día.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {quickActions.map((action) => (
                      <div
                        key={action.id}
                        className="flex flex-col justify-between gap-4 rounded-xl border border-[#E6E9E7] bg-[#F6F7F6] p-4"
                      >
                        <p className="text-sm text-[#6B7671]">{action.description}</p>
                        <div>
                          <Link
                            href={action.href}
                            className={
                              action.variant === 'primary' ? PRIMARY_BUTTON : SECONDARY_BUTTON
                            }
                          >
                            {action.label}
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {/* Columna lateral derecha: Rol actual + Tip del hornero */}
          <aside
            aria-label="Contexto y ayuda"
            className={`flex flex-col gap-6 ${isAuthenticated ? 'lg:col-span-4' : 'lg:col-span-12'}`}
          >
            {isAuthenticated && roleMeta && (
              <section
                aria-labelledby="home-role-card-heading"
                className="rounded-2xl border border-[#E6E9E7] bg-white p-6 shadow-sm sm:p-8"
              >
                <p className="text-sm font-medium text-[#6B7671]">Tu rol actual</p>
                <div className="mt-2 flex items-center gap-2.5">
                  <span
                    aria-hidden="true"
                    className="inline-block h-2.5 w-2.5 rounded-full bg-[#18894C]"
                  />
                  <h2 id="home-role-card-heading" className="text-[22px] font-bold text-[#0B4233]">
                    {roleMeta.label}
                  </h2>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[#6B7671]">{roleMeta.summary}</p>
              </section>
            )}

            <section
              aria-labelledby="home-hornero-tip-heading"
              className="rounded-2xl border border-[#E6E9E7] bg-[#EEF3F0] p-6 sm:p-8"
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-2.5 w-2.5 rounded-full bg-[#E85114]"
                />
                <h2 id="home-hornero-tip-heading" className="text-lg font-bold text-[#0B4233]">
                  Tip del hornero
                </h2>
              </div>
              <p className="mt-3 text-base leading-relaxed text-[#1E2B27]">
                {isAuthenticated && roleMeta
                  ? roleMeta.horneroTip
                  : 'Cada documento tiene una fecha de revisión para cuidar su frescura y asegurar que siempre trabajes con la versión vigente.'}
              </p>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}
