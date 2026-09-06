/**
 * Bakes the judge-mode sample clips.
 *
 *   npm run samples
 *
 * Runs the full pipeline over every clip described in
 * public/samples/clips.config.json, then copies the finished scan directories
 * into public/samples/scans/ and writes the manifest the landing page reads.
 *
 * Re-run this after ANY pipeline or pack change. The scan id is derived from
 * the pack version, so a bump silently orphans the old baked scans and the
 * sample cards would 404 - which is exactly the failure you cannot afford on
 * demo day. The script checks for that and says so.
 */
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runScan } from '../src/pipeline/orchestrator';
import { loadPack } from '../src/policy/loader';
import { scanDir, samplesDir, ensureDir } from '../src/store/paths';
import { bakedScansDir, manifestPath, type SampleClip, type SampleManifest } from '../src/store/samples';

interface ClipConfig {
  id: string;
  file: string;
  label: string;
  description: string;
  title?: string;
  thumbnail?: string;
  plantedRisks: string[];
}

async function main() {
  const configPath = path.join(samplesDir(), 'clips.config.json');
  if (!existsSync(configPath)) {
    console.error(`No clip config at ${configPath}. See public/samples/README.md.`);
    process.exit(1);
  }

  const configs = JSON.parse(readFileSync(configPath, 'utf8')) as { clips: ClipConfig[] };
  const pack = loadPack();
  const clips: SampleClip[] = [];
  const missing: string[] = [];

  for (const clip of configs.clips) {
    const source = path.join(samplesDir(), clip.file);
    if (!existsSync(source)) {
      missing.push(clip.file);
      continue;
    }

    console.log(`\nbaking ${clip.id} (${clip.file})`);
    const report = await runScan({
      inputPath: source,
      title: clip.title ?? null,
      thumbnailPath: clip.thumbnail ? path.join(samplesDir(), clip.thumbnail) : null,
      force: true,
      onStage: (e) => console.log(`  ${e.label.padEnd(13)} ${(e.ms / 1000).toFixed(2)}s  ${e.detail}`),
    });

    const target = path.join(bakedScansDir(), report.scan.id);
    rmSync(target, { recursive: true, force: true });
    ensureDir(bakedScansDir());
    cpSync(scanDir(report.scan.id), target, { recursive: true });
    // The extracted wav is large and nothing reads it after the scan.
    rmSync(path.join(target, 'audio.wav'), { force: true });

    clips.push({
      id: clip.id,
      label: clip.label,
      description: clip.description,
      scanId: report.scan.id,
      durationMs: report.scan.durationMs,
      plantedRisks: clip.plantedRisks,
    });

    console.log(
      `  -> ${report.scan.id}  ${report.verdict.status}  ${report.findings.length} findings`,
    );
  }

  const manifest: SampleManifest = {
    packVersion: pack.version,
    bakedAt: new Date().toISOString(),
    clips,
  };
  writeFileSync(manifestPath(), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  console.log(`\nbaked ${clips.length} clip(s) against pack ${pack.version}`);
  console.log(`manifest: ${manifestPath()}`);
  if (missing.length) {
    console.log(`\nMISSING FOOTAGE (skipped): ${missing.join(', ')}`);
    console.log('Record these into public/samples/ and re-run. See public/samples/README.md.');
  }
  console.log('\nNow verify judge mode: disconnect the network and open a sample card.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
