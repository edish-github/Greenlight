import { readdirSync } from 'node:fs';
import path from 'node:path';
import { runFfmpeg } from '../../lib/ffmpeg';
import { ensureDir } from '../../store/paths';

export interface KeyframeSet {
  dir: string;
  files: string[];
  /** Best-effort presentation timestamps, one per file, in ms. */
  timestampsMs: number[];
}

/**
 * Scene-change selection rather than uniform sampling: 40 frames that each show
 * something new instead of 40 frames of the same talking head. It also bounds
 * vision cost independently of video length - a 60 minute video costs the same
 * as a 3 minute one.
 *
 * Day 4 consumes this. It lives here now because it is 30 lines and it means
 * Monday's vision work has no extraction dependency left to discover.
 */
export async function extractKeyframes(
  inputPath: string,
  outDir: string,
  opts: { max?: number; sceneThreshold?: number } = {},
): Promise<KeyframeSet> {
  const max = opts.max ?? 40;
  const threshold = opts.sceneThreshold ?? 0.4;
  ensureDir(outDir);

  await runFfmpeg([
    '-i', inputPath,
    '-vf', `select='gt(scene,${threshold})',scale=512:-1,showinfo`,
    '-vsync', 'vfr',
    '-frames:v', String(max),
    '-q:v', '4',
    path.join(outDir, '%03d.jpg'),
  ]);

  const files = readdirSync(outDir)
    .filter((f) => f.endsWith('.jpg'))
    .sort()
    .map((f) => path.join(outDir, f));

  return { dir: outDir, files, timestampsMs: [] };
}
