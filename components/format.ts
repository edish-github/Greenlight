/**
 * Presentation helpers shared across the report components.
 *
 * Lives in components/ rather than src/ because it is purely about rendering.
 * Nothing here may be imported by the pipeline.
 */
import type { Remediation, Severity } from '../src/types/finding';

/** MM:SS.d - the format the creator will type into their NLE. */
export function timecode(ms: number): string {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const tenths = Math.floor((total % 1000) / 100);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${tenths}`;
}

export function spanLabel(startMs: number, endMs: number): string {
  if (endMs <= 0 && startMs <= 0) return 'packaging';
  return `${timecode(startMs)} – ${timecode(endMs)}`;
}

export function durationLabel(ms: number): string {
  const s = Math.round(ms / 100) / 10;
  return `${s.toFixed(1)}s`;
}

export const SEVERITY_LABEL: Record<Severity, string> = {
  no_ads: 'No ads',
  limited_ads: 'Limited ads',
  advisory: 'Advisory',
};

export const SEVERITY_HEX: Record<Severity, string> = {
  no_ads: '#ff4d5e',
  limited_ads: '#f5a524',
  advisory: '#64748b',
};

export const RESOLVED_HEX = '#22c55e';

export const SEVERITY_CLASS: Record<Severity, { text: string; bg: string; border: string; rail: string }> = {
  no_ads: {
    text: 'text-[#ff8a95]',
    bg: 'bg-[#ff4d5e]/10',
    border: 'border-[#ff4d5e]/40',
    rail: 'bg-[#ff4d5e]',
  },
  limited_ads: {
    text: 'text-[#f8c777]',
    bg: 'bg-[#f5a524]/10',
    border: 'border-[#f5a524]/40',
    rail: 'bg-[#f5a524]',
  },
  advisory: {
    text: 'text-slate-300',
    bg: 'bg-slate-500/10',
    border: 'border-slate-500/40',
    rail: 'bg-slate-500',
  },
};

export const REMEDIATION_LABEL: Record<Remediation, string> = {
  mute: 'Mute the span',
  bleep: 'Bleep the span',
  trim: 'Trim the span',
  blur_region: 'Blur the region',
  packaging_edit: 'Edit the title or thumbnail',
  manual_review: 'Needs your judgement',
};

export const VERDICT_COPY = {
  red: { label: 'No ads', hex: '#ff4d5e', tone: 'border-[#ff4d5e]/45 bg-[#ff4d5e]/10 text-[#ff8a95]' },
  amber: { label: 'Limited ads', hex: '#f5a524', tone: 'border-[#f5a524]/45 bg-[#f5a524]/10 text-[#f8c777]' },
  green: { label: 'Low risk', hex: '#22c55e', tone: 'border-[#22c55e]/45 bg-[#22c55e]/10 text-[#7ee2a8]' },
} as const;

export function money(value: number, currency: string): string {
  const symbol = currency === 'USD' ? '$' : `${currency} `;
  return `${symbol}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

/**
 * Splits an evidence quote so the matched terms can be marked without using
 * dangerouslySetInnerHTML on text that came out of a transcript.
 */
export function highlightParts(text: string, terms: string[]): { text: string; hit: boolean }[] {
  const clean = terms.map((t) => t.trim()).filter(Boolean);
  if (!clean.length) return [{ text, hit: false }];
  const escaped = clean.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`(${escaped.join('|')})`, 'ig');
  return text
    .split(re)
    .filter((part) => part.length > 0)
    .map((part) => ({ text: part, hit: clean.some((t) => t.toLowerCase() === part.toLowerCase()) }));
}
