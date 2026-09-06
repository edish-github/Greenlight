/** ASR tier 2. Same wire format as Groq, different host and model name. */
import { readFileSync } from 'node:fs';
import { requireKey } from '../../lib/env';
import { normalizeWhisper } from './groq';
import type { Transcript } from '../../types/transcript';

const ENDPOINT = 'https://api.openai.com/v1/audio/transcriptions';
const MODEL = 'whisper-1';

export async function transcribeWithOpenAI(audioPath: string): Promise<Transcript> {
  const key = requireKey('OPENAI_API_KEY');

  const form = new FormData();
  const bytes = readFileSync(audioPath);
  form.append('file', new Blob([bytes], { type: 'audio/wav' }), 'audio.wav');
  form.append('model', MODEL);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('timestamp_granularities[]', 'segment');

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI ASR ${res.status}: ${body.slice(0, 300)}`);
  }

  return normalizeWhisper(await res.json(), 'openai', MODEL);
}
