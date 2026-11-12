// /asistente: el chat con el asistente (spec 009, F1). Componente de servidor sin datos: la pantalla
// y la sesión viven en el navegador.
import type { Metadata } from 'next';
import { ChatScreen } from '@/components/chat/ChatScreen';

export const metadata: Metadata = {
  title: 'Asistente · Manual de operaciones',
};

export default function AsistentePage() {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col px-4 py-8">
      <ChatScreen />
    </main>
  );
}