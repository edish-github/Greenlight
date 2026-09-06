/**
 * The full pipeline from the terminal. You will live in this all weekend.
 *
 *   npm run scan -- sample.mp4 --title "..." [--no-llm] [--mock-gate] [--force]
 */
import { ffmpegAvailable } from '../src/lib/ffmpeg';
import { runScan } from '../src/pipeline/orchestrator';
import { mockInvoker } from './lib/mock-invoker';

const args = process.argv.slice(2);
const input = args.find((a) => !a.startsWith('--'));
const flag = (n: string) => args.includes(`--${n}`);
const opt = (n: string) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

if (!input) {
  console.error('usage: npm run scan -- <file.mp4> [--title "..."] [--thumb path.jpg] [--no-llm] [--mock-gate] [--force] [--words]');
  process.exit(1);
}

function ts(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}.${String(
    Math.floor((ms % 1000) / 100),
  )}`;
}

async function main() {
  const ff = await ffmpegAvailable();
  if (!ff.ok) {
    console.error(`ffmpeg unavailable: ${ff.error}`);
    process.exit(1);
  }
  console.log(`ffmpeg    ${ff.version}`);

  const report = await runScan({
    inputPath: input!,
    title: opt('title') ?? null,
    thumbnailPath: opt('thumb') ?? null,
    skipAdjudication: flag('no-llm'),
    invoke: flag('mock-gate') ? mockInvoker : undefined,
    force: flag('force'),
    onStage: (e) =>
      console.log(`  ${'\u2713'} ${e.label.padEnd(13)} ${(e.ms / 1000).toFixed(2)}s  ${e.detail}`),
  });

  const { scan, transcript, findings, verdict } = report;
  console.log(`\nscan      ${scan.id}${report.cached ? '  [CACHE HIT - zero external calls]' : ''}`);
  console.log(`pack      ${scan.packId}@${scan.packVersion}`);
  console.log(`degraded  ${scan.degraded.length ? scan.degraded.join(', ') : 'none'}`);
  console.log(`counts    ${JSON.stringify(scan.counts)}`);

  if (flag('words') && transcript) {
    console.log(`\nWORDS (${transcript.words.length}) with millisecond offsets:`);
    for (const w of transcript.words.slice(0, 60)) {
      console.log(`  ${String(w.startMs).padStart(7)}ms - ${String(w.endMs).padStart(7)}ms  ${w.text}`);
    }
    if (transcript.words.length > 60) console.log(`  ... ${transcript.words.length - 60} more`);
  }

  if (findings.length) {
    console.log(`\nFINDINGS (${findings.length})`);
    for (const f of findings) {
      console.log(`  ${ts(f.startMs)}-${ts(f.endMs)}  ${f.severity.toUpperCase().padEnd(11)} ${f.clauseId}  ${f.clauseTitle}`);
      console.log(`      effective ${f.effectiveDate} | ${f.clauseTextStatus} | fix: ${f.remediation}`);
      console.log(`      ${f.sourceUrl}`);
    }
  } else {
    console.log('\nFINDINGS  none');
  }

  console.log(`\n${verdict.headline}   confidence=${verdict.confidence}`);
  console.log(`revenue at risk  ${verdict.revenueAtRisk.currency} ${verdict.revenueAtRisk.low}-${verdict.revenueAtRisk.high}`);
  console.log(`\n${verdict.disclaimer}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
