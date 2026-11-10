'use client';

// The main action of the procedures page, in its header: it takes an ADMIN to the form to create one.
// Anyone else does not see it, because the form is not on the screen for them either.
import Link from 'next/link';
import { LIST_BUTTON_PRIMARY } from '@/components/documents/list-design';
import { useSession } from '@/lib/session';

export function CreateProcedureLink() {
  const { user } = useSession();
  if (user?.role !== 'ADMIN') return null;
  return (
    <Link href="#crear" className={LIST_BUTTON_PRIMARY}>
      Crear procedimiento
    </Link>
  );
}
