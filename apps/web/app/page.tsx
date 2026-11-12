import type { Metadata } from 'next';
import { HomeView } from '@/components/home/HomeView';

export const metadata: Metadata = {
  title: 'Inicio · pispIAr · Manual de operaciones',
  description: 'Tu nido de conocimiento operativo: documentos y recorridos paso a paso en pispIAr.',
};

export default function HomePage() {
  return <HomeView />;
}
