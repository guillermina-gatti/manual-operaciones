import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { DevSessionSwitcher } from '@/components/session/DevSessionSwitcher';
import { SessionControls } from '@/components/session/SessionControls';
import { SessionProvider } from '@/lib/session';
import './globals.css';

const plusJakartaSans = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: 'Manual de operaciones',
  description: 'Manual de operaciones interactivo con asistente de IA',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="es" className={`${plusJakartaSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SessionProvider>
          <SessionControls />
          {children}
          <DevSessionSwitcher />
        </SessionProvider>
      </body>
    </html>
  );
}
