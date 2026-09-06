/**
 * Anthropic client: timeout, one retry, structured tool-use output.
 *
 * The adjudicator never asks for free text. It asks the model to call a tool
 * whose input schema is fixed, and the tool input is then parsed by Zod at the
 * boundary. Anything that fails the schema is dropped and counted (see
 * pipeline/adjudicate/drops.ts), never coerced into shape.
 */
import Anthropic from '@anthropic-ai/sdk';
import { env, requireKey, hasKey } from './env';
import { logger } from './logger';

const log = logger('llm');

let client: Anthropic | null = null;

export function anthropic(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: requireKey('ANTHROPIC_API_KEY'), maxRetries: 0 });
  }
  return client;
}

export interface ToolCallRequest {
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  /** JSON Schema for the tool input. Mirrors the Zod contract in adjudicate/schema.ts. */
  inputSchema: Record<string, unknown>;
  maxTokens?: number;
  timeoutMs?: number;
  temperature?: number;
}

export interface ToolCallResult {
  /** Raw tool input, unvalidated. The Gate validates it. */
  toolInput: unknown | null;
  stopReason: string | null;
  usage: { input: number; output: number };
  ms: number;
  attempts: number;
}

/**
 * Gemini client implementation for free adjudication via Google AI Studio.
 */
async function callGemini(req: ToolCallRequest): Promise<ToolCallResult> {
  const started = Date.now();
  const key = requireKey('GEMINI_API_KEY');
  const model = env.GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

  const systemWithFormat = `${req.system}\n\nYou MUST return a JSON object matching this schema:\n${JSON.stringify(req.inputSchema, null, 2)}`;

  const body = {
    systemInstruction: { parts: [{ text: systemWithFormat }] },
    contents: [{ role: 'user', parts: [{ text: req.user }] }],
    generationConfig: {
      temperature: req.temperature ?? 0,
      maxOutputTokens: req.maxTokens ?? 2048,
      responseMimeType: 'application/json',
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(req.timeoutMs ?? 45_000),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Gemini API ${res.status}: ${errText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  let toolInput: unknown = null;
  if (text) {
    try {
      toolInput = JSON.parse(text);
    } catch {
      toolInput = null;
    }
  }

  return {
    toolInput,
    stopReason: data?.candidates?.[0]?.finishReason ?? 'STOP',
    usage: {
      input: data?.usageMetadata?.promptTokenCount ?? 0,
      output: data?.usageMetadata?.candidatesTokenCount ?? 0,
    },
    ms: Date.now() - started,
    attempts: 1,
  };
}

/**
 * Invoke the model and return the raw tool input.
 *
 * Deliberately returns `toolInput: null` rather than throwing when the model
 * declines to call the tool. "No findings" is a normal and frequent outcome
 * and must not look like an error anywhere in the stack.
 */
export async function callTool(req: ToolCallRequest): Promise<ToolCallResult> {
  const started = Date.now();
  const timeoutMs = req.timeoutMs ?? 45_000;
  let lastErr: unknown = null;

  if (!hasKey('ANTHROPIC_API_KEY') && hasKey('GEMINI_API_KEY')) {
    return callGemini(req);
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await anthropic().messages.create(
        {
          model: env.ANTHROPIC_MODEL,
          max_tokens: req.maxTokens ?? 2048,
          temperature: req.temperature ?? 0,
          system: req.system,
          messages: [{ role: 'user', content: req.user }],
          tools: [
            {
              name: req.toolName,
              description: req.toolDescription,
              input_schema: req.inputSchema as Anthropic.Tool['input_schema'],
            },
          ],
          tool_choice: { type: 'tool', name: req.toolName },
        },
        { timeout: timeoutMs },
      );

      const block = res.content.find((c) => c.type === 'tool_use');
      return {
        toolInput: block && block.type === 'tool_use' ? block.input : null,
        stopReason: res.stop_reason,
        usage: { input: res.usage.input_tokens, output: res.usage.output_tokens },
        ms: Date.now() - started,
        attempts: attempt,
      };
    } catch (e) {
      lastErr = e;
      log.warn(`attempt ${attempt} failed: ${e instanceof Error ? e.message : String(e)}`);
      if (attempt === 1) await new Promise((r) => setTimeout(r, 800));
    }
  }

  if (hasKey('GEMINI_API_KEY')) {
    log.info('Falling back to Gemini adjudicator...');
    return callGemini(req);
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/**
 * The function signature the Gate depends on. Tests inject a mock implementing
 * this type, which is how tests/gate.test.ts proves the allowlist guardrail
 * without a network call or an API key.
 */
export type ToolInvoker = (req: ToolCallRequest) => Promise<ToolCallResult>;

export const liveInvoker: ToolInvoker = callTool;
