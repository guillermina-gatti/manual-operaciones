'use client';

import { AreasManagementView } from '@/components/admin/AreasManagementView';
import { RequireRole } from '@/components/session/RequireRole';

export default function AdminAreasPage() {
  return (
    <RequireRole
      roles={['ADMIN']}
      deniedMessage="Solo los administradores pueden gestionar las áreas de la organización."
    >
      <AreasManagementView />
    </RequireRole>
  );
}
