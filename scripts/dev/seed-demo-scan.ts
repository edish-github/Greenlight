/**
 * DEV ONLY. Bakes a clearly-labelled synthetic sample so the report screen can
 * be built, styled and clicked through with no API keys and no footage.
 *
 *   npx tsx scripts/dev/seed-demo-scan.ts
 *
 * It generates a test-pattern clip with ffmpeg, runs the real pipeline over it,
 * then writes findings by hand. Those findings are FABRICATED - they did not
 * come out of the Gate. That is why the manifest labels this clip a placeholder
 * and why it must be deleted before recording the demo. Its only job is to
 * unblock UI work on a machine with no keys.
 */
import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runFfmpeg } from '../../src/lib/ffmpeg';
import { runScan } from '../../src/pipeline/orchestrator';
import { scoreVerdict } from '../../src/pipeline/score/verdict';
import { loadPack } from '../../src/policy/loader';
import { ARTIFACT, ensureDir, samplesDir, scanDir } from '../../src/store/paths';
import { writeJson } from '../../src/store/scans';
import { bakedScansDir, manifestPath, type SampleManifest } from '../../src/store/samples';
import type { Finding } from '../../src/types/finding';

const TITLE = 'this patch is a fucking disaster';

const LANG = {
  clauseId: 'AFG-LANG-002',
  clauseTitle: 'Profanity used repeatedly or throughout',
  clauseText:
    'Content in which profanity is the focus, or in which it is used repeatedly or throughout, may not be suitable for all advertisers. This is about frequency and focus across the video, not about any single word.',
  clauseTextStatus: 'paraphrase' as const,
  effectiveDate: '2025-07',
  sourceUrl: 'https://support.google.com/youtube/answer/6162278#inappropriate-language',
};

async function main() {
  const clipPath = path.join(samplesDir(), 'clip-placeholder.mp4');
  ensureDir(samplesDir());

  if (!existsSync(clipPath)) {
    await runFfmpeg([
      '-f', 'lavfi', '-i', 'color=c=#132033:s=854x480:d=20',
      '-f', 'lavfi', '-i', 'sine=frequency=320:duration=20',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
      clipPath,
    ]);
  }

  const report = await runScan({
    inputPath: clipPath,
    title: TITLE,
    skipAdjudication: true,
    force: true,
    onStage: (e) => console.log(`  ${e.label.padEnd(13)} ${(e.ms / 1000).toFixed(2)}s  ${e.detail}`),
  });

  const scanId = report.scan.id;

  const findings: Finding[] = [
    {
      ...LANG,
      id: 'f_demo_pkg',
      clauseId: 'AFG-PKG-001',
      clauseTitle: 'Profanity in the title or thumbnail',
      clauseText:
        'Strong or moderate profanity placed in the title or the thumbnail image is excluded from ad inventory regardless of the advertiser settings.',
      surface: 'title',
      startMs: 0,
      endMs: 0,
      evidence: TITLE,
      evidenceType: 'packaging',
      severity: 'no_ads',
      confidence: 0.95,
      rationale: 'Strong profanity on a packaging surface. This rule survived the July 2025 relaxation.',
      remediation: 'packaging_edit',
      detector: 'packaging',
      candidateId: 'pac_demo0',
      state: 'open',
    },
    {
      ...LANG,
      id: 'f_demo_density',
      surface: 'audio',
      startMs: 4_800,
      endMs: 7_400,
      evidence: 'the same fucking bug, shipped twice, in the same fucking quarter',
      evidenceType: 'transcript',
      severity: 'limited_ads',
      confidence: 0.82,
      rationale: 'Four strong terms across the span, eight per minute against a clause threshold of four.',
      remediation: 'bleep',
      detector: 'density',
      candidateId: 'den_demo1',
      state: 'open',
    },
    {
      ...LANG,
      id: 'f_demo_focus',
      clauseId: 'AFG-SENS-001',
      clauseTitle: 'Recent tragedy and sensitive events',
      clauseText:
        'Content focused on a recent tragedy, a mass-casualty event or a major terrorist act is generally not eligible for ad revenue, even where the treatment is respectful or purely factual.',
      sourceUrl: 'https://support.google.com/youtube/answer/6162278#sensitive-events',
      surface: 'video_body',
      startMs: 12_500,
      endMs: 17_000,
      evidence: 'the gunman was named on Sunday and the death toll has been revised twice',
      evidenceType: 'transcript',
      severity: 'no_ads',
      confidence: 0.66,
      rationale: 'Five distinct topic terms sustained across a sixty second window.',
      remediation: 'manual_review',
      detector: 'focus',
      candidateId: 'foc_demo2',
      state: 'open',
    },
  ];

  writeJson(scanId, ARTIFACT.findings, findings);
  writeJson(scanId, ARTIFACT.verdict, scoreVerdict(findings, { degradedCount: 2 }));
  report.scan.counts.findings = findings.length;
  report.scan.counts.candidates = 5;
  writeJson(scanId, ARTIFACT.meta, report.scan);

  const target = path.join(bakedScansDir(), scanId);
  rmSync(target, { recursive: true, force: true });
  ensureDir(bakedScansDir());
  cpSync(scanDir(scanId), target, { recursive: true });
  rmSync(path.join(target, ARTIFACT.audio), { force: true });

  const manifest: SampleManifest = {
    packVersion: loadPack().version,
    bakedAt: new Date().toISOString(),
    clips: [
      {
        id: 'placeholder',
        label: 'Placeholder walkthrough',
        description:
          'Test-pattern footage with hand-written findings, so the report screen works with no keys. Not a real scan. Delete before recording the demo.',
        scanId,
        durationMs: report.scan.durationMs,
        plantedRisks: [
          'profane title',
          'profanity cluster at 0:05',
          'sensitive-events focus at 0:12',
        ],
      },
    ],
  };
  writeFileSync(manifestPath(), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`\nplaceholder baked: ${scanId}`);
  console.log('These findings are hand-written, not adjudicated. Replace with real footage and run `npm run samples`.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
