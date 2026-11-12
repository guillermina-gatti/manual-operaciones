'use client';

// The header of /procedimientos (spec 006, W2 and W3): the same title for every role; the subtitle
// says what each one does here.
import { PageHeader } from '@/components/documents/list-design';
import { useSession } from '@/lib/session';

const SUBTITLES = {
  ADMIN: 'Creá un procedimiento y armá su borrador con pasos y áreas.',
  OTHERS: 'Consultá los procedimientos publicados de tus áreas, paso a paso.',
} as const;

export function ProceduresHeader() {
  const { user } = useSession();
  const subtitle = user?.role === 'ADMIN' ? SUBTITLES.ADMIN : SUBTITLES.OTHERS;

  return <PageHeader title="Procedimientos" subtitle={subtitle} />;
}
