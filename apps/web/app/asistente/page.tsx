// /asistente: el chat con el asistente (spec 009, F1). Componente de servidor sin datos: la pantalla
// y la sesión viven en el navegador.
// La altura es la de la pantalla menos la barra superior (h-16): así la lista de mensajes scrollea
// dentro de su espacio y el campo para escribir queda siempre a la vista.
import type { Metadata } from 'next';
import { ChatScreen } from '@/components/chat/ChatScreen';

export const metadata: Metadata = {
  title: 'Asistente · Manual de operaciones',
};

export default function AsistentePage() {
  return (
    <main className="mx-auto flex h-[calc(100dvh-4rem)] w-full max-w-4xl flex-col px-4 py-6">
      <ChatScreen />
    </main>
  );
}