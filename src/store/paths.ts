/**
 * Every filesystem path in the application derives from this file.
 *
 * There are no hard-coded paths anywhere else. That single rule is why the
 * Docker deploy will not surprise anyone: change the root here and the whole
 * app moves.
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { env } from '../lib/env';

export function repoRoot(): string {
  return process.cwd();
}

export function dataDir(): string {
  const d = env.GREENLIGHT_DATA_DIR;
  return path.isAbsolute(d) ? d : path.join(repoRoot(), d);
}

export function packPath(): string {
  const p = env.GREENLIGHT_PACK;
  return path.isAbsolute(p) ? p : path.join(repoRoot(), p);
}

export function lexiconPath(name: string): string {
  return path.join(repoRoot(), 'src', 'policy', 'lexicons', name);
}

export function samplesDir(): string {
  return path.join(repoRoot(), 'public', 'samples');
}

export function fixturesDir(): string {
  return path.join(repoRoot(), 'evals', 'fixtures');
}

export function scanDir(scanId: string): string {
  return path.join(dataDir(), scanId);
}

/** Artifact names are a closed set so nothing can invent a file the UI cannot serve. */
export const ARTIFACT = {
  input: 'input.mp4',
  meta: 'meta.json',
  audio: 'audio.wav',
  framesDir: 'frames',
  transcript: 'transcript.json',
  descriptors: 'descriptors.json',
  packaging: 'packaging.json',
  candidates: 'candidates.json',
  findings: 'findings.json',
  drops: 'drops.jsonl',
  verdict: 'verdict.json',
  fixplan: 'fixplan.json',
  fixed: 'fixed.mp4',
  spans: 'spans.json',
  diff: 'diff.json',
} as const;

export type ArtifactName = (typeof ARTIFACT)[keyof typeof ARTIFACT];

export function scanFile(scanId: string, name: ArtifactName | string): string {
  return path.join(scanDir(scanId), name);
}

export function framePath(scanId: string, index: number): string {
  return path.join(scanDir(scanId), ARTIFACT.framesDir, `${String(index).padStart(3, '0')}.jpg`);
}

export function ensureDir(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function ensureScanDir(scanId: string): string {
  ensureDir(path.join(scanDir(scanId), ARTIFACT.framesDir));
  return scanDir(scanId);
}
