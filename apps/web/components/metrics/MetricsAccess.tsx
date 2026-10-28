'use client';

// Lets only ADMIN and SUPERVISOR see the metrics panel (HU38). Local on purpose: RequireRole
// takes a single role and is shared, so it is not changed. Like it, another role does not even
// mount the panel, and the API answers 403 anyway.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ScreenState } from '@/components/ui/ScreenState';
import { ApiError, METRICS_MESSAGES, describeMetricsError } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Role } from '@/lib/session';

const ALLOWED: readonly Role[] = ['ADMIN', 'SUPERVISOR'];

export function MetricsAccess({ children }: { children: ReactNode }) {
  const { user, status } = useSession();

  // Until it is known who it is, nothing is mounted.
  if (status === 'loading') return <ScreenState kind="loading" />;
  if (status === 'disabled') {
    return <ScreenState kind="error" message={describeMetricsError(new ApiError(401)).message} />;
  }
  if (!user) return <ScreenState kind="empty" message="Elegí un usuario de prueba" />;

  if (!ALLOWED.includes(user.role)) {
    return (
      <ScreenState
        kind="empty"
        message={METRICS_MESSAGES.noPermission}
        action={
          <Link href="/ejecuciones" className="text-blue-700 underline dark:text-blue-400">
            Ir a ejecutar procedimientos
          </Link>
        }
      />
    );
  }

  return <>{children}</>;
}
