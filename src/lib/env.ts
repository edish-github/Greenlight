/**
 * Environment validation.
 *
 * Two-stage on purpose:
 *
 *   1. `env` — parsed at first access. Shape errors (a bad LOG_LEVEL, a
 *      malformed pack path) throw immediately and loudly.
 *   2. `requireKey()` — provider keys are OPTIONAL at boot and required only
 *      at the point of use.
 *
 * Stage 2 exists because of invariant I5. The cached sample clips must render
 * a full report with zero keys and zero network. If this module threw on a
 * missing GROQ_API_KEY at import time, judge mode would die on a machine with
 * no .env file, which is the one failure we cannot afford.
 */
import { existsSync, readFileSync } from 'node:fs';
import { z } from 'zod';

const EnvSchema = z.object({
  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_ASR_MODEL: z.string().min(1).default('whisper-large-v3-turbo'),
  OPENAI_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default('claude-sonnet-4-6'),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).default('gemini-2.5-flash'),
  GREENLIGHT_DATA_DIR: z.string().min(1).default('scans'),
  GREENLIGHT_PACK: z
    .string()
    .min(1)
    .default('src/policy/packs/youtube-afg-2026.09.yaml'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

function blankToUndefined(v: string | undefined): string | undefined {
  return v === undefined || v.trim() === '' ? undefined : v;
}

function loadDotenvFiles(): void {
  for (const filename of ['.env.local', '.env']) {
    try {
      if (existsSync(filename)) {
        const content = readFileSync(filename, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('#')) continue;
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx > 0) {
            const key = trimmed.slice(0, eqIdx).trim();
            const val = trimmed.slice(eqIdx + 1).trim();
            if (!process.env[key] && val) {
              process.env[key] = val;
            }
          }
        }
      }
    } catch {
      // Ignore file reading errors in constrained environments
    }
  }
}

export function loadEnv(): Env {
  if (cached) return cached;
  loadDotenvFiles();
  const parsed = EnvSchema.safeParse({
    GROQ_API_KEY: blankToUndefined(process.env.GROQ_API_KEY),
    GROQ_ASR_MODEL: blankToUndefined(process.env.GROQ_ASR_MODEL),
    OPENAI_API_KEY: blankToUndefined(process.env.OPENAI_API_KEY),
    ANTHROPIC_API_KEY: blankToUndefined(process.env.ANTHROPIC_API_KEY),
    ANTHROPIC_MODEL: blankToUndefined(process.env.ANTHROPIC_MODEL),
    GEMINI_API_KEY: blankToUndefined(process.env.GEMINI_API_KEY),
    GEMINI_MODEL: blankToUndefined(process.env.GEMINI_MODEL),
    GREENLIGHT_DATA_DIR: blankToUndefined(process.env.GREENLIGHT_DATA_DIR),
    GREENLIGHT_PACK: blankToUndefined(process.env.GREENLIGHT_PACK),
    LOG_LEVEL: blankToUndefined(process.env.LOG_LEVEL),
  });

  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment. Fix .env.local and restart.\n${detail}\n` +
        `See .env.example for the full key list.`,
    );
  }
  cached = parsed.data;
  return cached;
}

export const env = new Proxy({} as Env, {
  get: (_t, prop: string) => loadEnv()[prop as keyof Env],
});

export type ProviderKey = 'GROQ_API_KEY' | 'OPENAI_API_KEY' | 'ANTHROPIC_API_KEY' | 'GEMINI_API_KEY';

export class MissingKeyError extends Error {
  readonly key: ProviderKey;
  constructor(key: ProviderKey) {
    super(
      `${key} is not set. Add it to .env.local (see .env.example). ` +
        `Cached sample clips still work without it.`,
    );
    this.name = 'MissingKeyError';
    this.key = key;
  }
}

/** Throws a message a human can act on, at the moment the key is actually needed. */
export function requireKey(key: ProviderKey): string {
  const value = loadEnv()[key];
  if (!value) throw new MissingKeyError(key);
  return value;
}

export function hasKey(key: ProviderKey): boolean {
  return Boolean(loadEnv()[key]);
}

/** Test hook. Never called by product code. */
export function __resetEnvForTests(): void {
  cached = null;
}
