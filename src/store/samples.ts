/**
 * Judge mode.
 *
 * Pre-computed sample scans are committed under public/samples/scans/ so a
 * fresh clone can open a full report with no keys, no network and no waiting.
 * `scans/` is gitignored (it is working state), so on first use the committed
 * sample directories are copied into the live data directory. After that they
 * behave exactly like any other scan - same cache path, same report route, same
 * code. Nothing about the sample path is a special case at read time, which is
 * the point: the demo runs the real product.
 */
import { cpSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { dataDir, ensureDir, samplesDir } from './paths';
import { logger } from '../lib/logger';

const log = logger('samples');

export interface SampleClip {
  id: string;
  label: string;
  description: string;
  scanId: string;
  durationMs: number;
  plantedRisks: string[];
}

export interface SampleManifest {
  packVersion: string;
  bakedAt: string;
  clips: SampleClip[];
}

export function bakedScansDir(): string {
  return path.join(samplesDir(), 'scans');
}

export function manifestPath(): string {
  return path.join(samplesDir(), 'samples.json');
}

export function readManifest(): SampleManifest | null {
  try {
    return JSON.parse(readFileSync(manifestPath(), 'utf8')) as SampleManifest;
  } catch {
    return null;
  }
}

let hydrated = false;

/** Copy any committed sample scan into the live data dir. Idempotent, cheap. */
export function hydrateSampleScans(force = false): number {
  if (hydrated && !force) return 0;
  hydrated = true;

  const source = bakedScansDir();
  if (!existsSync(source)) return 0;

  let copied = 0;
  ensureDir(dataDir());
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const target = path.join(dataDir(), entry.name);
    if (existsSync(target) && !force) continue;
    cpSync(path.join(source, entry.name), target, { recursive: true });
    copied++;
  }
  if (copied) log.info(`restored ${copied} pre-computed sample scan(s)`);
  return copied;
}
