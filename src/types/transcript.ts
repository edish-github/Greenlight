export type AsrProvider = 'groq' | 'openai' | 'local' | 'fixture';

export interface TranscriptWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TranscriptSegment {
  text: string;
  startMs: number;
  endMs: number;
}

export interface Transcript {
  provider: AsrProvider;
  model: string;
  language: string | null;
  durationMs: number;
  text: string;
  words: TranscriptWord[];
  segments: TranscriptSegment[];
}

/** Words overlapping [startMs, endMs]. */
export function wordsInRange(t: Transcript, startMs: number, endMs: number): TranscriptWord[] {
  return t.words.filter((w) => w.endMs >= startMs && w.startMs <= endMs);
}

/** Plain text of a time range. Used to build the +/-20s adjudication window. */
export function textInRange(t: Transcript, startMs: number, endMs: number): string {
  return wordsInRange(t, startMs, endMs)
    .map((w) => w.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
