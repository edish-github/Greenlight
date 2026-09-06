/**
 * DEV TOOLING ONLY. Lives in scripts/ because the running application must
 * never import it (see the directory guide in 02-ARCHITECTURE.md).
 *
 * A deterministic stand-in for the model, so the Gate, the scoring stage and
 * (from Day 3) the report screen can be exercised with no API key, no network
 * and no cost. It applies the clause thresholds mechanically.
 *
 * It is NOT a model and it is NOT part of the product. Nothing it produces goes
 * near the demo. Its only job is to keep UI work unblocked.
 */
import type { ToolCallRequest, ToolCallResult, ToolInvoker } from '../../src/lib/llm';

function num(user: string, key: string): number | null {
  const m = user.match(new RegExp(`^\\s*${key}:\\s*([\\d.]+)`, 'm'));
  return m ? Number(m[1]) : null;
}

function str(user: string, key: string): string | null {
  const m = user.match(new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm'));
  return m ? m[1].trim() : null;
}

export const mockInvoker: ToolInvoker = async (req: ToolCallRequest): Promise<ToolCallResult> => {
  const u = req.user;
  const detector = str(u, 'detector');
  const span = str(u, 'span_ms') ?? '0-0';
  const [startMs, endMs] = span.split('-').map(Number);
  const surface = str(u, 'surface') ?? 'audio';
  const evidence = (str(u, 'evidence') ?? '').slice(0, 280);
  const clauseIds = [...u.matchAll(/^- id: (AFG-[A-Z]+-\d{3})$/gm)].map((m) => m[1]);

  const findings: Record<string, unknown>[] = [];

  if (detector === 'density') {
    const rate = num(u, 'strong_terms_per_minute') ?? 0;
    const limit = num(u, 'threshold_terms_per_minute') ?? 4;
    const id = clauseIds.find((c) => c.startsWith('AFG-LANG'));
    if (id && rate >= limit) {
      findings.push({
        clause_id: id,
        surface,
        start_ms: startMs,
        end_ms: endMs,
        evidence,
        severity: 'limited_ads',
        confidence: 0.82,
        rationale: `[mock] ${rate} strong terms per minute over the span, at or above the clause threshold of ${limit}.`,
      });
    }
  }

  if (detector === 'focus') {
    const distinct = num(u, 'distinct_terms') ?? 0;
    const min = num(u, 'threshold_min_distinct') ?? 3;
    const id = clauseIds[0];
    if (id && distinct >= min + 1) {
      findings.push({
        clause_id: id,
        surface,
        start_ms: startMs,
        end_ms: endMs,
        evidence,
        severity: 'limited_ads',
        confidence: 0.66,
        rationale: `[mock] ${distinct} distinct topic terms sustained across the window.`,
      });
    }
  }

  if (detector === 'packaging') {
    const id = clauseIds.find((c) => c.startsWith('AFG-PKG'));
    if (id) {
      findings.push({
        clause_id: id,
        surface,
        start_ms: 0,
        end_ms: 0,
        evidence,
        severity: 'no_ads',
        confidence: 0.95,
        rationale: '[mock] Profanity present on a packaging surface.',
      });
    }
  }

  // detector === 'lexicon' deliberately returns nothing for isolated use.
  // That is the correct current-policy outcome and the point of the product.

  return {
    toolInput: { findings },
    stopReason: 'tool_use',
    usage: { input: 0, output: 0 },
    ms: 0,
    attempts: 1,
  };
};
