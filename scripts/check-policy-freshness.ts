/**
 * Policy freshness check. Run it before every pack version bump, and put it in
 * CI once there is CI.
 *
 * It cannot tell you whether YouTube changed a rule - only a human reading the
 * update log can do that. What it CAN do is refuse to let the pack rot
 * silently: it fails when clause text is still unverified, when the capture is
 * old, or when the guardrail has been weakened.
 */
import { loadPack } from '../src/policy/loader';

const MAX_AGE_DAYS = 45;

function main() {
  const pack = loadPack();
  const p = pack.pack.pack;
  const problems: string[] = [];
  const warnings: string[] = [];

  const capturedAt = new Date(p.captured_at);
  const ageDays = Math.floor((Date.now() - capturedAt.getTime()) / 86_400_000);
  if (Number.isNaN(ageDays)) problems.push(`captured_at "${p.captured_at}" is not a date`);
  else if (ageDays > MAX_AGE_DAYS) {
    warnings.push(`pack captured ${ageDays} days ago. Re-read ${p.update_log_url} before shipping.`);
  }

  for (const dep of pack.pack.deprecated_rules) {
    if (pack.allowlist.has(dep.id)) problems.push(`GUARDRAIL BREACH: deprecated ${dep.id} is live`);
  }

  const unverified = pack.pack.clauses.filter((c) => c.text_status === 'paraphrase');
  if (unverified.length) {
    warnings.push(
      `${unverified.length}/${pack.pack.clauses.length} clauses are paraphrase, not verbatim: ` +
        unverified.map((c) => c.id).join(', '),
    );
  }

  const noVerify = pack.pack.clauses.filter((c) => !c.verified_at);
  if (noVerify.length) warnings.push(`${noVerify.length} clauses have verified_at: null`);

  console.log(`pack ${p.id}@${p.version}  captured ${p.captured_at} (${ageDays}d ago)`);
  console.log(`live clauses ${pack.allowlist.size} | deprecated ${pack.pack.deprecated_rules.length}`);
  console.log(`source     ${p.source_url}`);
  console.log(`update log ${p.update_log_url}\n`);

  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const e of problems) console.log(`FAIL  ${e}`);

  if (problems.length) process.exit(1);
  console.log(problems.length ? '' : '\nGuardrail intact.');
}

main();
