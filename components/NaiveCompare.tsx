'use client';

import { AlertTriangle, CircleAlert, CircleCheck, ExternalLink, ShieldCheck } from 'lucide-react';
import type { CompareDocument } from '../src/store/compare';
import { spanLabel } from './format';

interface Props {
  doc: CompareDocument;
}

/**
 * The comparison panel.
 *
 * Left: a real model given a transcript and asked to find policy violations,
 * with no policy data supplied. Right: the same clip through Greenlight.
 *
 * The panel refuses to invent the left-hand column. Until
 * `npm run compare:capture` has run against a live model, `status` is
 * "placeholder" and this component says so plainly instead of showing a
 * fabricated response. A comparison built on made-up evidence would undermine
 * the exact argument it is trying to make.
 */
export default function NaiveCompare({ doc }: Props) {
  const captured = doc.status === 'captured';

  return (
    <div className="space-y-6">
      {!captured ? (
        <div className="flex items-start gap-2.5 rounded-md border border-[#f5a524]/35 bg-[#f5a524]/[0.07] px-3.5 py-3 text-[13px] leading-relaxed text-[#f3d19a]">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" />
          <p className="max-w-[92ch]">
            The left-hand column has not been captured yet. Run{' '}
            <code className="font-mono text-[#f8d9a4]">npm run compare:capture</code> with an API
            key to record a real model response. Nothing on this page is written by hand, so until
            that runs there is nothing to show there.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------------------------------------------------------------- */}
        <section className="rounded-lg border border-[#ff4d5e]/30 bg-ink-900">
          <header className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-medium text-slate-100">
              A model asked to find policy violations
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
              Transcript in, verdict out. No policy data supplied, so every rule it names comes from
              memory.
            </p>
            {doc.naive.model ? (
              <p className="mt-1.5 font-mono text-[11px] text-slate-600">{doc.naive.model}</p>
            ) : null}
          </header>

          <div className="space-y-3 p-4">
            {doc.naive.citesDeprecatedRule ? (
              <div className="rounded-md border border-[#ff4d5e]/40 bg-[#ff4d5e]/10 px-3 py-2.5">
                <p className="inline-flex items-center gap-2 text-[13px] font-medium text-[#ff8a95]">
                  <CircleAlert size={14} />
                  This response relies on a rule that no longer exists
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-[#f7b4bb]">
                  Matched: {doc.naive.deprecatedRuleMatches.join(', ')}
                </p>
              </div>
            ) : null}

            {doc.naive.issues.length ? (
              <ul className="space-y-2">
                {doc.naive.issues.map((issue, i) => (
                  <li key={i} className="rounded-md border border-line bg-ink-850 p-3">
                    <p className="text-[13px] leading-relaxed text-slate-300">{issue.rule}</p>
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-slate-500">
                      <span>severity: {issue.severity}</span>
                      <span>where: {issue.location}</span>
                      <span className="text-[#ff8a95]">clause: none</span>
                      <span className="text-[#ff8a95]">effective date: none</span>
                      <span className="text-[#ff8a95]">source: none</span>
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed border-slate-700 p-4 text-[13px] text-slate-500">
                {captured
                  ? 'The model returned no itemised list. The raw response is below.'
                  : 'Nothing captured yet.'}
              </p>
            )}

            {doc.naive.rawResponse ? (
              <details className="rounded-md border border-line bg-ink-850">
                <summary className="cursor-pointer px-3 py-2 text-[13px] text-slate-400 hover:text-slate-200">
                  Raw response, unedited
                </summary>
                <pre className="gl-scroll max-h-80 overflow-auto whitespace-pre-wrap border-t border-line px-3 py-2.5 font-mono text-[12px] leading-relaxed text-slate-400">
                  {doc.naive.rawResponse}
                </pre>
              </details>
            ) : null}

            <details className="rounded-md border border-line bg-ink-850">
              <summary className="cursor-pointer px-3 py-2 text-[13px] text-slate-400 hover:text-slate-200">
                The exact prompt used
              </summary>
              <pre className="gl-scroll max-h-60 overflow-auto whitespace-pre-wrap border-t border-line px-3 py-2.5 font-mono text-[12px] leading-relaxed text-slate-500">
                {doc.naive.systemPrompt}
                {'\n\n'}
                {doc.naive.userPromptPreview}
              </pre>
            </details>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="rounded-lg border border-[#22c55e]/30 bg-ink-900">
          <header className="border-b border-line px-4 py-3">
            <h2 className="text-sm font-medium text-slate-100">Greenlight on the same clip</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
              The model may only cite clauses from the loaded pack. Anything else is dropped before
              it reaches this screen.
            </p>
            <p className="mt-1.5 font-mono text-[11px] text-slate-600">pack {doc.packVersion}</p>
          </header>

          <div className="space-y-3 p-4">
            {doc.greenlight.clearedSpans.length ? (
              <div className="rounded-md border border-[#22c55e]/35 bg-[#22c55e]/[0.07] px-3 py-2.5">
                <p className="inline-flex items-center gap-2 text-[13px] font-medium text-[#7ee2a8]">
                  <CircleCheck size={14} />
                  {doc.greenlight.clearedSpans.length} span
                  {doc.greenlight.clearedSpans.length === 1 ? '' : 's'} detected and cleared
                </p>
                <ul className="mt-2 space-y-1.5">
                  {doc.greenlight.clearedSpans.map((span, i) => (
                    <li key={i} className="text-[13px] leading-relaxed text-slate-400">
                      <span className="font-mono text-slate-300">
                        {spanLabel(span.startMs, span.endMs)}
                      </span>{' '}
                      — {span.why}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {doc.greenlight.findings.length ? (
              <ul className="space-y-2">
                {doc.greenlight.findings.map((f, i) => (
                  <li key={i} className="rounded-md border border-line bg-ink-850 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded border border-slate-600/60 bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-200">
                        {f.clauseId}
                      </span>
                      <span className="rounded border border-slate-700 px-1.5 py-0.5 font-mono text-[11px] text-slate-400">
                        effective {f.effectiveDate}
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">
                        {spanLabel(f.startMs, f.endMs)}
                      </span>
                    </div>
                    <p className="mt-2 text-[13px] text-slate-300">{f.clauseTitle}</p>
                    <a
                      href={f.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-sky-300 hover:text-sky-200"
                    >
                      Source <ExternalLink size={11} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-md border border-dashed border-slate-700 p-4 text-[13px] text-slate-500">
                {captured
                  ? 'Nothing on this clip matched a clause in the current pack.'
                  : 'Run the capture to populate this column from the real pipeline.'}
              </p>
            )}

            {doc.greenlight.dropped.length ? (
              <div className="rounded-md border border-line bg-ink-850 p-3">
                <p className="inline-flex items-center gap-2 text-[13px] text-slate-300">
                  <ShieldCheck size={14} className="text-slate-500" />
                  Rejected before reaching this screen
                </p>
                <ul className="mt-2 space-y-1 font-mono text-[11px] text-slate-500">
                  {doc.greenlight.dropped.map((d) => (
                    <li key={d.reason}>
                      {d.reason}: {d.count}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </section>
      </div>

      {/* ------------------------------------------------------------------ */}
      <section className="rounded-lg border border-line bg-ink-900 p-4">
        <h2 className="text-sm font-medium text-slate-100">
          What the pack records about these rules
        </h2>
        <p className="mt-1 max-w-[88ch] text-[13px] leading-relaxed text-slate-500">
          Deleted rules are kept as data, not deleted from the repo. The loader asserts that none of
          these ids can enter the allowlist, and a unit test asserts it again independently — which
          is why Greenlight cannot emit them no matter what a model believes.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {doc.deprecatedRules.map((rule) => (
            <article key={rule.id} className="rounded-md border border-line bg-ink-850 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded border border-slate-700 bg-ink-800 px-1.5 py-0.5 font-mono text-[11px] text-slate-400 line-through">
                  {rule.id}
                </span>
                <span className="rounded border border-[#ff4d5e]/40 bg-[#ff4d5e]/10 px-1.5 py-0.5 font-mono text-[11px] text-[#ff8a95]">
                  removed {rule.removedOn}
                </span>
              </div>
              <p className="mt-2 text-[13px] text-slate-300">{rule.title}</p>
              <p className="mt-1.5 max-w-[62ch] text-[13px] leading-relaxed text-slate-500">
                {rule.evidence}
              </p>
              <p className="mt-2 max-w-[62ch] text-[13px] leading-relaxed text-slate-500">
                <span className="text-slate-400">Why it persists: </span>
                {rule.whyPeopleStillBelieveIt}
              </p>
              <a
                href={rule.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-sky-300 hover:text-sky-200"
              >
                YouTube&rsquo;s update log <ExternalLink size={11} />
              </a>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
