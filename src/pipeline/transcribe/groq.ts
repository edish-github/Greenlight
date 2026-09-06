/**
 * ASR tier 1: Groq whisper-large-v3-turbo with word-level timestamps.
 *
 * Word timestamps are non-negotiable. The entire product is span-level; a
 * segment-level transcript would let us say "somewhere in these 8 seconds",
 * which is exactly the coarse verdict YouTube already gives for free.
 */
import { readFileSync } from 'node:fs';
import { env, requireKey } from '../../lib/env';
import type { Transcript, TranscriptSegment, TranscriptWord } from '../../types/transcript';

const ENDPOINT = 'https://api.groq.com/openai/v1/audio/transcriptions';

interface WhisperVerbose {
  language?: string;
  duration?: number;
  text?: string;
  words?: { word: string; start: number; end: number }[];
  segments?: { text: string; start: number; end: number }[];
}

export function normalizeWhisper(
  raw: WhisperVerbose,
  provider: Transcript['provider'],
  model: string,
): Transcript {
  const words: TranscriptWord[] = (raw.words ?? []).map((w) => ({
    text: w.word.trim(),
    startMs: Math.round(w.start * 1000),
    endMs: Math.round(w.end * 1000),
  })).filter((w) => w.text.length > 0);

  const segments: TranscriptSegment[] = (raw.segments ?? []).map((s) => ({
    text: s.text.trim(),
    startMs: Math.round(s.start * 1000),
    endMs: Math.round(s.end * 1000),
  }));

  return {
    provider,
    model,
    language: raw.language ?? null,
    durationMs: Math.round((raw.duration ?? 0) * 1000),
    text: (raw.text ?? words.map((w) => w.text).join(' ')).trim(),
    words,
    segments,
  };
}

export async function transcribeWithGroq(audioPath: string): Promise<Transcript> {
  const key = requireKey('GROQ_API_KEY');
  const model = env.GROQ_ASR_MODEL;

  const form = new FormData();
  const bytes = readFileSync(audioPath);
  form.append('file', new Blob([bytes], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`Groq ASR ${res.status}: ${body.slice(0, 300)}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  return normalizeWhisper((await res.json()) as WhisperVerbose, 'groq', model);
}
