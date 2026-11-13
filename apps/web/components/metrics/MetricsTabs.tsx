'use client';

// The two tabs of /metricas. Each tab is a link to the same address with ?seccion=, so it works
// as a plain link too (a new tab, "back"); the arrows, Home and End move between them and open the
// one they land on. Only the open tab is in the Tab order; its panel follows the list.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useId, useRef } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { METRICS_SECTIONS } from '@/lib/metrics/section';
import type { MetricsSection } from '@/lib/metrics/section';
import { TABS_FRAME } from './metrics-design';

interface MetricsTabsProps {
  section: MetricsSection;
  // The address of each tab, with the filters of the address.
  hrefFor: (section: MetricsSection) => string;
  // On the right of the tabs, on their line ("Exportar CSV"); below them on a phone.
  actions?: ReactNode;
  children: ReactNode;
}

export function MetricsTabs({ section, hrefFor, actions, children }: MetricsTabsProps) {
  const id = useId();
  const router = useRouter();
  const tabs = useRef<(HTMLAnchorElement | null)[]>([]);
  const tabId = (tab: MetricsSection) => `${id}-tab-${tab}`;
  const panelId = `${id}-panel`;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = METRICS_SECTIONS.findIndex((tab) => tab.id === section);
    const last = METRICS_SECTIONS.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? current === last
          ? 0
          : current + 1
        : event.key === 'ArrowLeft'
          ? current === 0
            ? last
            : current - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null || next === current) return;
    event.preventDefault();
    tabs.current[next]?.focus();
    router.push(hrefFor(METRICS_SECTIONS[next].id), { scroll: false });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div
          role="tablist"
          aria-label="Secciones de las métricas"
          onKeyDown={onKeyDown}
          className={`${TABS_FRAME} grid grid-cols-2 gap-1 self-stretch rounded-2xl p-1 sm:inline-grid sm:self-start`}
        >
          {METRICS_SECTIONS.map((tab, index) => {
            const selected = tab.id === section;
            return (
              <Link
                key={tab.id}
                ref={(element) => {
                  tabs.current[index] = element;
                }}
                id={tabId(tab.id)}
                href={hrefFor(tab.id)}
                scroll={false}
                role="tab"
                aria-selected={selected}
                aria-controls={selected ? panelId : undefined}
                tabIndex={selected ? 0 : -1}
                className={`flex min-h-[46px] items-center justify-center rounded-xl px-4 text-center text-sm leading-tight font-bold transition-colors focus-visible:outline-naranja motion-reduce:transition-none sm:px-6 sm:text-base ${
                  selected ? 'bg-bosque text-blanco' : 'text-texto hover:bg-salvia'
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>
        {actions}
      </div>
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(section)}
        className="flex min-w-0 flex-col gap-10"
      >
        {children}
      </div>
    </div>
  );
}
