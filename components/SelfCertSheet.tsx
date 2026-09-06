'use client';

import { useMemo } from 'react';
import { ClipboardCheck, CircleDot, Circle } from 'lucide-react';
import type { Finding } from '../src/types/finding';
import { useUIStore } from '../src/store/ui';
import { SEVERITY_LABEL, timecode } from './format';

interface Props {
  findings: Finding[];
}

/**
 * The self-certification answer sheet.
 *
 * The ad suitability questionnaire is a required step in the upload flow, and
 * YouTube tracks how closely a creator's self-ratings match its own decisions.
 * Accurate raters get their input used for the initial monetization decision,
 * so rating accuracy compounds over a channel's life.
 *
 * The problem is that the creator answers it from memory, about a video they
 * have watched forty times and can no longer see clearly. This sheet answers it
 * from evidence instead, and shows the timestamp behind every answer so the
 * creator is rating from the file.
 *
 * It fills nothing in automatically. Greenlight never touches the channel; the
 * creator carries these answers across to YouTube Studio themselves.
 */

type Answer = 'none' | 'present';

interface Question {
  id: string;
  /** The wording a creator will recognise in YouTube Studio. */
  question: string;
  /** Policy categories from the pack that inform this answer. */
  categories: string[];
  /** What to pick when findings exist. Deliberately not a verdict. */
  guidance: string;
}

const QUESTIONS: Question[] = [
  {
    id: 'language',
    question: 'Inappropriate language',
    categories: ['inappropriate_language'],
    guidance:
      'Select the frequency tier that matches what you hear. Frequency and focus decide this, not any single word.',
  },
  {
    id: 'adult',
    question: 'Adult content',
    categories: ['adult_content'],
    guidance: 'Select the tier matching how explicit and how sustained the material is.',
  },
  {
    id: 'violence',
    question: 'Violence',
    categories: ['violence', 'shocking_content'],
    guidance:
      'Say whether the violence is real or fictional, and whether it is the focus or incidental.',
  },
  {
    id: 'sensitive',
    question: 'Controversial issues and sensitive events',
    categories: ['sensitive_events', 'controversial_issues'],
    guidance:
      'Recent tragedy is treated separately from general controversy. Answer both parts honestly.',
  },
  {
    id: 'drugs',
    question: 'Recreational drugs and drug-related content',
    categories: ['recreational_drugs'],
    guidance: 'Context is decisive here: educational and scripted treatments are rated differently.',
  },
  {
    id: 'harmful',
    question: 'Harmful or dangerous acts',
    categories: ['harmful_acts', 'firearms'],
    guidance: 'Say whether the act is imitable and whether instruction is given.',
  },
];

/** Category is not on Finding, so it is recovered from the clause id prefix. */
const CLAUSE_CATEGORY: Record<string, string> = {
  'AFG-LANG': 'inappropriate_language',
  'AFG-PKG': 'inappropriate_language',
  'AFG-VIOL': 'violence',
  'AFG-SENS': 'sensitive_events',
  'AFG-ADULT': 'adult_content',
  'AFG-DRUG': 'recreational_drugs',
  'AFG-HARM': 'harmful_acts',
  'AFG-CONTRO': 'controversial_issues',
  'AFG-FIRE': 'firearms',
  'AFG-SHOCK': 'shocking_content',
};

export function categoryOf(clauseId: string): string {
  const prefix = clauseId.split('-').slice(0, 2).join('-');
  return CLAUSE_CATEGORY[prefix] ?? 'unknown';
}

export default function SelfCertSheet({ findings }: Props) {
  const selectAndSeek = useUIStore((s) => s.selectAndSeek);

  const rows = useMemo(
    () =>
      QUESTIONS.map((q) => {
        const matched = findings
          .filter((f) => f.state !== 'dismissed' && f.state !== 'resolved')
          .filter((f) => q.categories.includes(categoryOf(f.clauseId)))
          .sort((a, b) => a.startMs - b.startMs);
        const answer: Answer = matched.length ? 'present' : 'none';
        return { question: q, matched, answer };
      }),
    [findings],
  );

  const flagged = rows.filter((r) => r.answer === 'present').length;

  return (
    <section className="rounded-lg border border-line bg-ink-900">
      <header className="border-b border-line px-4 py-3">
        <h2 className="inline-flex items-center gap-2 text-sm font-medium text-slate-100">
          <ClipboardCheck size={15} className="text-slate-500" />
          Self-certification answers
        </h2>
        <p className="mt-1.5 max-w-[86ch] text-[13px] leading-relaxed text-slate-500">
          The questionnaire in YouTube Studio, answered from this file rather than from memory.{' '}
          {flagged === 0
            ? 'Nothing in this scan touches any of these categories.'
            : `${flagged} of ${rows.length} categories have evidence behind them.`}{' '}
          Copy these across yourself — Greenlight has no access to your channel.
        </p>
      </header>

      <ul className="divide-y divide-line">
        {rows.map(({ question, matched, answer }) => (
          <li key={question.id} className="px-4 py-3">
            <div className="flex items-start gap-2.5">
              {answer === 'present' ? (
                <CircleDot size={15} className="mt-0.5 shrink-0 text-[#f5a524]" />
              ) : (
                <Circle size={15} className="mt-0.5 shrink-0 text-slate-700" />
              )}

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <p className="text-sm text-slate-200">{question.question}</p>
                  <span
                    className={`rounded border px-1.5 py-0.5 text-[11px] ${
                      answer === 'present'
                        ? 'border-[#f5a524]/40 bg-[#f5a524]/10 text-[#f8c777]'
                        : 'border-slate-700 text-slate-500'
                    }`}
                  >
                    {answer === 'present' ? 'declare this' : 'nothing found'}
                  </span>
                </div>

                {matched.length ? (
                  <>
                    <p className="mt-1.5 max-w-[80ch] text-[13px] leading-relaxed text-slate-500">
                      {question.guidance}
                    </p>
                    <ul className="mt-2 space-y-1.5">
                      {matched.map((f) => (
                        <li key={f.id}>
                          <button
                            type="button"
                            onClick={() => selectAndSeek(f)}
                            className="text-left text-[13px] text-slate-400 transition-colors hover:text-slate-200"
                          >
                            <span className="font-mono tabular-nums text-slate-300">
                              {f.endMs > f.startMs
                                ? `${timecode(f.startMs)}–${timecode(f.endMs)}`
                                : 'title / thumbnail'}
                            </span>
                            <span className="mx-2 text-slate-600">·</span>
                            <span className="font-mono text-slate-500">{f.clauseId}</span>
                            <span className="mx-2 text-slate-600">·</span>
                            {SEVERITY_LABEL[f.severity]}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="mt-1 text-[13px] text-slate-600">
                    No span in this scan matched a clause in this category.
                  </p>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <p className="border-t border-line px-4 py-2.5 text-[13px] leading-relaxed text-slate-500">
        &ldquo;Nothing found&rdquo; means nothing was <em>detected</em>, which is not the same as
        nothing being there. Anything the scan could not check — visuals on a degraded run, or a
        category with no detector yet — is still yours to answer.
      </p>
    </section>
  );
}
