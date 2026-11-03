import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { SessionControls } from '@/components/session/SessionControls';
import { SessionProvider } from '@/lib/session';
import './globals.css';

// Selector de desarrollo: en producción se elimina por completo del bundle.
let DevSessionSwitcher: React.ComponentType | null = null;
if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  DevSessionSwitcher = require('@/components/session/DevSessionSwitcher').DevSessionSwitcher;
}

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Manual de operaciones',
  description: 'Manual de operaciones interactivo con asistente de IA',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SessionProvider>
          <SessionControls />
          {children}
          {DevSessionSwitcher && <DevSessionSwitcher />}
        </SessionProvider>
      </body>
    </html>
  );
}
