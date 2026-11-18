import type { Metadata } from 'next';
import Image from 'next/image';
import { Suspense } from 'react';
import { AmbientFeathers } from '@/components/home/AmbientFeathers';
import { LoginForm } from '@/components/session/LoginForm';

export const metadata: Metadata = {
  title: 'Iniciar sesión · Manual de operaciones',
};

export default function LoginPage() {
  return (
    <main className="relative flex min-h-[calc(100vh-65px)] flex-1 items-center justify-center overflow-hidden bg-[#F4F6F5] px-4 py-8 sm:py-12">
      <AmbientFeathers />
      <div className="relative z-10 flex w-full max-w-4xl overflow-hidden rounded-3xl border border-zinc-200/80 bg-white shadow-xl shadow-zinc-900/5">
        {/* Columna Izquierda: Ilustración de marca y hornero */}
        <div className="relative hidden min-h-[580px] w-1/2 flex-col justify-between overflow-hidden bg-[#0B4233] px-10 pt-10 pb-0 text-white select-none md:flex">
          <div className="flex flex-col gap-6">
            <div className="flex items-center gap-3">
              <Image
                src="/hornero-landing.png"
                alt=""
                width={44}
                height={52}
                aria-hidden="true"
                className="h-11 w-auto object-contain"
                priority
              />
              <span className="text-2xl font-extrabold tracking-tight text-white">
                pisp<span className="text-[#E85114]">IA</span>r
              </span>
            </div>

            <div className="space-y-3 pt-4">
              <h2 className="text-4xl font-extrabold leading-[1.12] tracking-tight text-white">
                Tu nido de
                <br />
                conocimiento
              </h2>
              <p className="max-w-xs text-sm leading-relaxed text-[#EEF3F0]/90">
                Procedimientos, manuales y respuestas de tu área, siempre en su versión al día.
              </p>
            </div>
          </div>

          <div className="relative flex w-full items-end justify-end pt-6 pr-2">
            <div
              aria-hidden="true"
              className="absolute right-0 bottom-0 h-32 w-60 rounded-t-full bg-[#9C5A2E]"
            />
            <div
              aria-hidden="true"
              className="absolute right-16 bottom-0 h-18 w-20 rounded-t-full bg-[#5C3420]"
            />
            <Image
              src="/hornero-landing.png"
              alt="pispIAr - Tu nido de conocimiento. Procedimientos, manuales y respuestas de tu área, siempre en su versión al día."
              width={240}
              height={284}
              className="relative z-10 mr-4 mb-10 h-60 w-auto object-contain drop-shadow-md"
              priority
            />
          </div>
        </div>

        {/* Columna Derecha: Formulario de Login */}
        <div className="flex w-full flex-col justify-center p-8 sm:p-12 md:w-1/2">
          <div className="mb-6">
            <h1 className="text-3xl font-extrabold tracking-tight text-[#0B4233] sm:text-4xl">
              ¡Hola de nuevo!
            </h1>
            <p className="mt-2 text-sm text-[#6B7671]">
              Entrá con tu cuenta de la empresa.
            </p>
          </div>
          <Suspense fallback={<p role="status" className="text-sm text-zinc-500">Preparando sesión…</p>}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
