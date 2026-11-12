'use client';

import { RequireRole } from '@/components/session/RequireRole';
import { UsersAndRolesView } from '@/components/users/UsersAndRolesView';
import { useSession } from '@/lib/session';

export default function UsuariosPage() {
  const { user } = useSession();

  return (
    <RequireRole
      roles={['ADMIN', 'SUPERVISOR']}
      deniedMessage="Solo los supervisores y administradores pueden gestionar usuarios y roles a cargo."
    >
      {user && <UsersAndRolesView user={user} />}
    </RequireRole>
  );
}
