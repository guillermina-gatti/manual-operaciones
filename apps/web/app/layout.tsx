import type { Metadata } from 'next';
import { Suspense } from 'react';
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import { SessionControls } from '@/components/session/SessionControls';
import { SessionProvider } from '@/lib/session';
import './globals.css';

// Selector de desarrollo: en producción se elimina por completo del bundle.
let DevSessionSwitcher: React.ComponentType | null = null;
if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DevSessionSwitcher = require('@/components/session/DevSessionSwitcher').DevSessionSwitcher;
}

export const metadata: Metadata = {
  title: 'Manual de operaciones',
  description: 'Manual de operaciones interactivo con asistente de IA',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="h-dvh flex flex-col">
        <SessionProvider>
          <Suspense fallback={<div className="flex h-dvh w-full overflow-hidden bg-[#F6F7F6] text-[#1E2B27]">{children}</div>}>
            <SessionControls>{children}</SessionControls>
          </Suspense>
          {DevSessionSwitcher && <DevSessionSwitcher />}
        </SessionProvider>
      </body>
    </html>
  );
}