// What a user reads when the procedure is not there (spec 006, W7). It is the same text if the id does
// not exist, belongs to another area or has no published version: the API answers the same 404 so as
// not to reveal that it exists (R14), and the screen does not tell them apart either.
import Link from 'next/link';
import { BACK_LINK } from '@/components/documents/design';
import { ScreenState } from '@/components/ui/ScreenState';

export function ProcedureNotFound() {
  return (
    <ScreenState
      kind="empty"
      message="No se encontró el procedimiento"
      action={
        <Link href="/procedimientos" className={BACK_LINK}>
          <span aria-hidden="true">←&nbsp;</span>Volver a procedimientos
        </Link>
      }
    />
  );
}
