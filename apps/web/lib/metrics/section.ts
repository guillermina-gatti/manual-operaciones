// The tab of /metricas: Procedimientos (by default) or Documentos y asistente. Like the filters, it
// lives only in the address (?seccion=documentos), never in localStorage: the filters, the links and
// the "back" button keep it.
export type MetricsSection = 'procedimientos' | 'documentos';

export const SECTION_PARAM = 'seccion';

export const METRICS_SECTIONS: readonly { id: MetricsSection; label: string }[] = [
  { id: 'procedimientos', label: 'Procedimientos' },
  { id: 'documentos', label: 'Documentos y asistente' },
];

// Without the parameter, or with a value that does not exist, Procedimientos.
export function parseMetricsSection(value: string | null | undefined): MetricsSection {
  return value === 'documentos' ? 'documentos' : 'procedimientos';
}

// An address with the tab: withMetricsSection('/metricas?desde=…', 'documentos')
//   → '/metricas?desde=…&seccion=documentos'. A #fragment stays at the end.
export function withMetricsSection(href: string, section: MetricsSection): string {
  const [path, hash] = href.split('#');
  const withParam = `${path}${path.includes('?') ? '&' : '?'}${SECTION_PARAM}=${section}`;
  return hash === undefined ? withParam : `${withParam}#${hash}`;
}

// What the filters add to each address they go to: the tab of the address, as it is written there.
// Without the parameter nothing is written (it is Procedimientos anyway).
export function keepMetricsSection(raw: string | null | undefined): (href: string) => string {
  if (raw === null || raw === undefined) return (href) => href;
  const section = parseMetricsSection(raw);
  return (href) => withMetricsSection(href, section);
}
