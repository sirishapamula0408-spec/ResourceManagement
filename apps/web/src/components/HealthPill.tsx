import type { Rag } from '../lib/api';

const RAG: Record<Rag, { label: string; className: string }> = {
  green: { label: 'On track', className: 'bg-green-soft text-green' },
  amber: { label: 'At risk', className: 'bg-amber-soft text-amber' },
  red: { label: 'Off track', className: 'bg-red-soft text-red' },
};

/** Health (RAG) as a coloured pill; `title` can carry the reasons. */
export function HealthPill({ rag, title }: { rag: Rag; title?: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${RAG[rag].className}`}
    >
      <i className="inline-block h-2 w-2 rounded-full bg-current" aria-hidden="true" />
      {RAG[rag].label}
    </span>
  );
}
