// The title of a section of /metricas, with the orange bar on its left. The bar is decorative.
import type { ReactNode } from 'react';
import { SECTION_MARK } from './metrics-design';

export function SectionHeading({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="flex items-center gap-3 text-2xl font-bold text-texto">
      <span aria-hidden="true" className={SECTION_MARK} />
      {children}
    </h2>
  );
}
