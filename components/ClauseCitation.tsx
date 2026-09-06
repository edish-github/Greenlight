'use client';

import { ExternalLink, FileText, Quote } from 'lucide-react';
import type { Finding } from '../src/types/finding';

interface Props {
  finding: Pick<
    Finding,
    'clauseId' | 'clauseTitle' | 'clauseText' | 'clauseTextStatus' | 'effectiveDate' | 'sourceUrl'
  >;
  /** Collapsed form for dense lists; expanded shows the clause text. */
  compact?: boolean;
}

/**
 * The other signature component.
 *
 * The whole trust argument lives in four things on this card: a clause id that
 * exists in the pack, its effective date, whether the text shown is quoted or
 * summarised, and a link a skeptic can click. Nobody has to take an LLM's word
 * for anything.
 *
 * The `paraphrase` badge is not an apology. It is the difference between a tool
 * that cites and a tool that appears to cite.
 */
export default function ClauseCitation({ finding, compact = false }: Props) {
  const verbatim = finding.clauseTextStatus === 'verbatim';

  return (
    <div className="rounded-md border border-line bg-ink-900/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-slate-600/60 bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] tracking-tight text-slate-200">
          {finding.clauseId}
        </span>
        <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[11px] text-slate-400">
          effective {finding.effectiveDate}
        </span>
        <span
          title={
            verbatim
              ? 'Quoted from the live help centre page and verified.'
              : 'Summarised in our own words from the live help centre page, not quoted. Open the source to read the original wording.'
          }
          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] ${
            verbatim
              ? 'border-[#22c55e]/40 bg-[#22c55e]/10 text-[#7ee2a8]'
              : 'border-slate-600 bg-ink-800 text-slate-400'
          }`}
        >
          {verbatim ? <Quote size={10} /> : <FileText size={10} />}
          {verbatim ? 'verbatim' : 'paraphrase'}
        </span>
      </div>

      <p className="mt-2 text-sm font-medium text-slate-100">{finding.clauseTitle}</p>

      {!compact ? (
        <p className="mt-1.5 max-w-[68ch] text-[13px] leading-relaxed text-slate-400">
          {finding.clauseText}
        </p>
      ) : null}

      <a
        href={finding.sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] text-sky-300 underline decoration-sky-300/30 underline-offset-2 transition-colors hover:text-sky-200 hover:decoration-sky-200"
      >
        Read this clause on YouTube Help
        <ExternalLink size={12} />
      </a>
    </div>
  );
}
