'use client';

import Image from 'next/image';
import Link from 'next/link';
import { REAL_AUTH_ENABLED } from '@/lib/session';
import { AmbientFeathers } from './AmbientFeathers';

const PRIMARY_BUTTON =
  'inline-flex min-h-11 sm:min-h-12 items-center justify-center rounded-xl bg-bosque px-5 py-2.5 text-sm sm:text-base font-semibold text-blanco shadow-sm transition-[background-color,transform] hover:bg-bosque-hover active:translate-y-px motion-reduce:transition-none motion-reduce:active:translate-y-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranja';

const PILLARS = [
  {
    number: '01',
    badgeClass: 'bg-bosque text-blanco',
    title: 'Documentación organizada y vigente',
    description: 'Estructura clara por áreas, responsables asignados y versiones siempre al día.',
  },
  {
    number: '02',
    badgeClass: 'bg-naranja-boton text-blanco',
    title: 'Procedimientos y recorridos paso a paso',
    description: 'Guías simples y accionables para ejecutar cada tarea operativa a tu ritmo.',
  },
  {
    number: '03',
    badgeClass: 'bg-barro text-blanco',
    title: 'Asistente inteligente con citas respaldadas',
    description: 'Respuestas confiables apoyadas directamente en la documentación oficial.',
  },
] as const;

export function PublicHomeView() {
  return (
    <div className="flex flex-1 flex-col bg-fondo text-texto">
      {/* Encabezado institucional */}
      <header className="border-b border-borde bg-blanco">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <Link
              href="/"
              aria-label="Ir al inicio"
              className="flex items-center gap-2.5 rounded-xl border border-borde px-3 py-1.5 transition-colors hover:bg-fondo focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-naranja"
            >
              <Image
                src="/hornero-landing.png"
                alt=""
                width={32}
                height={38}
                aria-hidden="true"
                className="h-8 w-auto object-contain"
                priority
              />
              <span className="text-lg font-extrabold tracking-tight text-bosque">
                pisp<span className="text-naranja">IA</span>r
              </span>
            </Link>
            <span className="hidden text-sm text-texto-suave sm:inline">
              · Manual de operaciones
            </span>
          </div>

          {REAL_AUTH_ENABLED && (
            <Link href="/login" className={PRIMARY_BUTTON}>
              Ingresar →
            </Link>
          )}
        </div>
      </header>

      <main className="flex flex-col">
        {/* Hero institucional con plumas ambientales en los márgenes */}
        <section
          aria-labelledby="home-hero-heading"
          className="relative overflow-hidden bg-fondo py-6 sm:py-8 lg:py-10"
        >
          <AmbientFeathers />

          <div className="relative z-10 mx-auto grid w-full max-w-6xl grid-cols-1 items-center gap-8 px-4 sm:px-6 md:grid-cols-12 lg:gap-10">
            <div className="flex flex-col items-start gap-4 md:col-span-7">
              <span className="inline-flex items-center rounded-full bg-salvia px-3.5 py-1 text-xs font-semibold tracking-wide text-bosque uppercase">
                Conocimiento operativo
              </span>

              <h1
                id="home-hero-heading"
                className="text-3xl font-extrabold tracking-[-0.02em] text-bosque sm:text-4xl lg:text-[42px] lg:leading-[1.12]"
              >
                El nido donde vive el conocimiento de tu organización
              </h1>

              <p className="max-w-xl text-base leading-relaxed text-texto-suave sm:text-lg">
                Documentación clara, procedimientos actualizados y asistencia confiable para que
                cada equipo trabaje con seguridad.
              </p>

              {REAL_AUTH_ENABLED ? (
                <div className="pt-1">
                  <Link href="/login" className={PRIMARY_BUTTON}>
                    Ingresar a la plataforma →
                  </Link>
                </div>
              ) : (
                <div
                  role="note"
                  className="w-full max-w-xl rounded-xl border border-borde bg-salvia p-4 text-sm text-texto"
                >
                  <p className="font-semibold text-bosque">Modo de sesión simulada activo</p>
                  <p className="mt-1 text-texto-suave">
                    Elegí un usuario de prueba en el selector disponible abajo a la derecha para
                    explorar las pantallas según cada rol.
                  </p>
                </div>
              )}
            </div>

            {/* Protagonista gráfico: Hornero oficial sobre su nido de barro */}
            <div className="md:col-span-5">
              <div className="relative flex flex-col items-center justify-between overflow-hidden rounded-3xl bg-bosque px-6 pt-6 pb-5 text-center text-blanco shadow-xl shadow-zinc-900/10 select-none">
                <div className="relative flex w-full items-end justify-center pt-1">
                  <div
                    aria-hidden="true"
                    className="absolute bottom-0 h-18 w-40 rounded-t-full bg-barro"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute bottom-0 h-10 w-12 rounded-t-full bg-barro-puerta"
                  />
                  <Image
                    src="/hornero-landing.png"
                    alt="Hornero de pispIAr sobre su nido de barro"
                    width={176}
                    height={208}
                    className="relative z-10 mb-5 h-36 w-auto object-contain drop-shadow-md sm:h-40"
                    priority
                  />
                </div>
                <p className="mt-4 max-w-xs text-sm leading-relaxed font-medium text-salvia">
                  Tu nido de conocimiento.
                  <br />
                  Siempre en su versión al día.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Sección: ¿Qué es PispIAr? */}
        <section aria-labelledby="home-what-is-heading" className="border-y border-borde bg-blanco py-8 sm:py-10">
          <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
            <h2
              id="home-what-is-heading"
              className="text-2xl font-extrabold tracking-tight text-bosque sm:text-3xl"
            >
              ¿Qué es PispIAr?
            </h2>
            <p className="mt-2.5 text-base leading-relaxed text-texto-suave sm:text-lg">
              Una plataforma de conocimiento operativo que reúne documentación, procedimientos y
              experiencia de trabajo en un único lugar.
            </p>
          </div>
        </section>

        {/* Sección: Nuestro objetivo */}
        <section aria-labelledby="home-objective-heading" className="bg-salvia py-8 sm:py-10">
          <div className="mx-auto w-full max-w-4xl px-4 sm:px-6">
            <div className="border-l-4 border-naranja pl-5 sm:pl-6">
              <h2
                id="home-objective-heading"
                className="text-2xl font-extrabold tracking-tight text-bosque sm:text-3xl"
              >
                Nuestro objetivo
              </h2>
              <p className="mt-2.5 text-base leading-relaxed text-texto sm:text-lg">
                Facilitar el acceso al conocimiento de una organización, ayudar a comprender los
                procesos y ofrecer asistencia para encontrar información confiable.
              </p>
            </div>
          </div>
        </section>

        {/* Sección: Tres pilares de la plataforma */}
        <section aria-labelledby="home-pillars-heading" className="bg-fondo py-8 sm:py-10">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <h2
              id="home-pillars-heading"
              className="text-2xl font-extrabold tracking-tight text-bosque sm:text-3xl"
            >
              Tres pilares de la plataforma
            </h2>

            <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
              {PILLARS.map((pillar) => (
                <article
                  key={pillar.number}
                  className="flex flex-col gap-4 rounded-2xl border border-borde bg-blanco p-6 shadow-sm transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-bosque/30 hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0"
                >
                  <span
                    className={`inline-flex size-10 items-center justify-center rounded-xl text-sm font-bold tabular-nums ${pillar.badgeClass}`}
                  >
                    {pillar.number}
                  </span>
                  <h3 className="text-lg font-bold text-bosque">{pillar.title}</h3>
                  <p className="text-sm leading-relaxed text-texto-suave">{pillar.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Cierre institucional inspirado en el hornero */}
      <footer className="bg-bosque py-10 text-salvia sm:py-12">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 px-4 text-center sm:px-6">
          <p className="text-base leading-relaxed font-medium text-blanco sm:text-lg">
            “Como el hornero construye su nido paso a paso con barro y cuidado, PispIAr ordena el
            saber cotidiano de cada área para que todo el equipo trabaje sobre bases firmes.”
          </p>
          <p className="text-xs tracking-wide text-salvia/80">
            pispIAr · Manual de operaciones
          </p>
        </div>
      </footer>
    </div>
  );
}
