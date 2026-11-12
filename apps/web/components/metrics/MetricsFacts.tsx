// A group of numbers inside a metrics card (documents, assistant): its title and a `dl` of label
// and value in two columns. The values come already formatted.
import { useId } from 'react';

interface MetricsFactsProps {
  title: string;
  facts: [label: string, value: string][];
}

export function MetricsFacts({ title, facts }: MetricsFactsProps) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h4 id={headingId} className="text-sm font-semibold text-texto">
        {title}
      </h4>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
        {facts.map(([label, value]) => (
          <div key={label} className="flex flex-col">
            <dt className="text-sm font-semibold text-texto-suave">{label}</dt>
            <dd className="text-2xl font-extrabold text-bosque tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
