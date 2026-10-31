import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { DevSessionSwitcher } from '@/components/session/DevSessionSwitcher';
import { SessionControls } from '@/components/session/SessionControls';
import { SessionProvider } from '@/lib/session';
import './globals.css';

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
          <DevSessionSwitcher />
        </SessionProvider>
      </body>
    </html>
  );
}
