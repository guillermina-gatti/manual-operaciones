'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function AssistantFloatingButton() {
  const pathname = usePathname();

  // En la propia pantalla del asistente no hace falta el botón.
  if (pathname === '/asistente' || pathname.startsWith('/asistente/')) {
    return null;
  }

  return (
    <Link
      href="/asistente"
      aria-label="Abrir el asistente"
      title="Preguntale al hornero"
      className="fixed bottom-16 right-10 z-[60] flex size-16 items-center justify-center rounded-full bg-[#0B4233] shadow-lg ring-2 ring-[#0B4233] transition-all hover:scale-105 hover:bg-[#0B4233] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#E85114]"
    >
      <Image
        src="/hornero-landing.png"
        alt=""
        width={44}
        height={56}
        className="h-12 w-auto object-contain"
      />
    </Link>
  );
}
