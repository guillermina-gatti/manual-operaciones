import type { Metadata } from 'next';
import { LoginForm } from '@/components/session/LoginForm';

export const metadata: Metadata = {
  title: 'Iniciar sesión · Manual de operaciones',
};

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <section className="w-full max-w-md rounded-2xl border border-zinc-200 p-6 shadow-sm sm:p-8 dark:border-zinc-800">
        <div className="mb-8 space-y-2">
          <p className="text-sm font-semibold text-blue-700 dark:text-blue-300">PispIAr</p>
          <h1 className="text-3xl font-bold tracking-tight">Iniciar sesión</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Ingresá con tu cuenta del Manual de operaciones.
          </p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
