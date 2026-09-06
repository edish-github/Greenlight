/**
 * Provider selection and the fallback ladder.
 *
 * Tier 1 Groq -> tier 2 OpenAI -> tier 3 local -> labelled degraded state.
 * Never throws for a provider problem. Invariant I5: every external dependency
 * has a labelled degraded state, and the caller always gets something it can
 * render.
 */
import { hasKey } from '../../lib/env';
import { logger } from '../../lib/logger';
import type { DegradedFlag } from '../../types/scan';
import type { Transcript } from '../../types/transcript';
import { transcribeWithGroq } from './groq';
import { transcribeWithOpenAI } from './openai';
import { localAsrAvailable, transcribeLocally } from './local';

const log = logger('transcribe');

export interface TranscribeResult {
  transcript: Transcript | null;
  degraded: DegradedFlag[];
  provider: string;
  attempts: { provider: string; ok: boolean; error?: string }[];
}

const EMPTY_REASONS = 'no provider succeeded';

export async function transcribe(audioPath: string): Promise<TranscribeResult> {
  const attempts: TranscribeResult['attempts'] = [];
  const degraded: DegradedFlag[] = [];

  if (hasKey('GROQ_API_KEY')) {
    try {
      const t = await transcribeWithGroq(audioPath);
      attempts.push({ provider: 'groq', ok: true });
      return { transcript: t, degraded, provider: 'groq', attempts };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`groq failed, falling back: ${msg}`);
      attempts.push({ provider: 'groq', ok: false, error: msg });
    }
  } else {
    attempts.push({ provider: 'groq', ok: false, error: 'GROQ_API_KEY not set' });
  }

  if (hasKey('OPENAI_API_KEY')) {
    try {
      const t = await transcribeWithOpenAI(audioPath);
      degraded.push('asr_fallback_openai');
      attempts.push({ provider: 'openai', ok: true });
      return { transcript: t, degraded, provider: 'openai', attempts };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`openai failed, falling back: ${msg}`);
      attempts.push({ provider: 'openai', ok: false, error: msg });
    }
  } else {
    attempts.push({ provider: 'openai', ok: false, error: 'OPENAI_API_KEY not set' });
  }

  if (await localAsrAvailable()) {
    try {
      const t = await transcribeLocally(audioPath);
      degraded.push('asr_fallback_local');
      attempts.push({ provider: 'local', ok: true });
      return { transcript: t, degraded, provider: 'local', attempts };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`local ASR failed: ${msg}`);
      attempts.push({ provider: 'local', ok: false, error: msg });
    }
  } else {
    attempts.push({ provider: 'local', ok: false, error: 'faster_whisper not installed' });
  }

  log.error(`transcription unavailable: ${EMPTY_REASONS}`);
  degraded.push('asr_unavailable');
  return { transcript: null, degraded, provider: 'none', attempts };
}
