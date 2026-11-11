import type { Metadata } from 'next';
import Image from 'next/image';
import { Suspense } from 'react';
import { LoginForm } from '@/components/session/LoginForm';

export const metadata: Metadata = {
  title: 'Iniciar sesión · Manual de operaciones',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-[calc(100vh-65px)] flex-1 items-center justify-center bg-[#F4F6F5] px-4 py-8 sm:py-12">
      <div className="flex w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-xl shadow-zinc-900/5 border border-zinc-200/80">
        {/* Columna Izquierda: Ilustración de marca y hornero */}
        <div className="relative hidden w-1/2 min-h-[580px] bg-[#0B4233] md:block select-none">
          <Image
            src="/login-banner.png"
            alt="pispIAr - Tu nido de conocimiento. Procedimientos, manuales y respuestas de tu área, siempre en su versión al día."
            fill
            sizes="(min-width: 768px) 50vw, 0vw"
            className="object-cover object-left-top"
            priority
          />
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
