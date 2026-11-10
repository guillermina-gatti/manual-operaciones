'use client';

// The section "Versiones" of a procedure (spec 015, R8): the timeline with its loading, empty and
// error states. What can be done with the versions (publish, new version) goes in as children.
import { useId } from 'react';
import type { ReactNode } from 'react';
import { LIST_PANEL } from '@/components/documents/list-design';
import { ScreenState } from '@/components/ui/ScreenState';
import type { ApiResource } from '@/lib/api';
import type { VersionHistoryItem } from '@/lib/procedures';
import { Skeleton } from './Skeleton';
import { VersionTimeline } from './VersionTimeline';

interface VersionsSectionProps {
  versions: ApiResource<VersionHistoryItem[]>;
  children?: ReactNode;
}

function Content({ versions }: Pick<VersionsSectionProps, 'versions'>) {
  if (versions.status === 'loading' || versions.status === 'idle') {
    return (
      <ScreenState kind="loading" label="Cargando las versiones…">
        <Skeleton heights={['h-16', 'h-16']} />
      </ScreenState>
    );
  }
  if (versions.status === 'error') {
    return (
      <ScreenState kind="error" message="No pudimos cargar las versiones." onRetry={versions.reload} />
    );
  }
  if (versions.data.length === 0) {
    return <ScreenState kind="empty" message="Todavía no hay versiones." />;
  }
  return <VersionTimeline versions={versions.data} />;
}

export function VersionsSection({ versions, children }: VersionsSectionProps) {
  const titleId = useId();
  return (
    <section aria-labelledby={titleId} className={`${LIST_PANEL} flex min-w-0 flex-col gap-5`}>
      <h2 id={titleId} className="text-xl font-bold">
        Versiones
      </h2>
      <Content versions={versions} />
      {versions.status === 'success' && children}
    </section>
  );
}
