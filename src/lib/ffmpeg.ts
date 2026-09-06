/**
 * The ONLY module in the application allowed to spawn a process.
 *
 * Everything else asks this module for media work. That containment is what
 * keeps the pipeline unit-testable and what makes the Docker deploy boring:
 * there is exactly one place where a binary path can be wrong.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import ffmpegStatic from 'ffmpeg-static';
// ffprobe-static ships a { path } object rather than a bare string.
import ffprobeStatic from 'ffprobe-static';
import { logger } from './logger';

const log = logger('ffmpeg');

export class FfmpegError extends Error {
  readonly code: number | null;
  readonly stderrTail: string;
  readonly args: string[];
  constructor(msg: string, code: number | null, stderrTail: string, args: string[]) {
    super(msg);
    this.name = 'FfmpegError';
    this.code = code;
    this.stderrTail = stderrTail;
    this.args = args;
  }
}

function resolveBinary(candidate: unknown, name: string): string {
  const p =
    typeof candidate === 'string'
      ? candidate
      : candidate && typeof candidate === 'object' && 'path' in candidate
        ? String((candidate as { path: unknown }).path)
        : '';
  if (!p || !existsSync(p)) {
    throw new Error(
      `${name} binary not found. Reinstall node_modules; the static build ships with the package.`,
    );
  }
  return p;
}

export function ffmpegPath(): string {
  return resolveBinary(ffmpegStatic, 'ffmpeg');
}

export function ffprobePath(): string {
  return resolveBinary(ffprobeStatic, 'ffprobe');
}

export interface RunResult {
  stdout: string;
  stderr: string;
  ms: number;
}

interface RunOptions {
  timeoutMs?: number;
  /** Called with each stderr chunk. ffmpeg reports progress on stderr. */
  onStderr?: (chunk: string) => void;
}

function run(bin: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(
        new FfmpegError(
          `Timed out after ${timeoutMs}ms`,
          null,
          stderr.slice(-2000),
          args,
        ),
      );
    }, timeoutMs);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      const s = d.toString();
      stderr += s;
      // Keep memory bounded on long encodes; we only ever surface the tail.
      if (stderr.length > 64_000) stderr = stderr.slice(-32_000);
      opts.onStderr?.(s);
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const ms = Date.now() - started;
      if (code === 0) {
        resolve({ stdout, stderr, ms });
      } else {
        reject(
          new FfmpegError(
            `Exited with code ${code}`,
            code,
            stderr.slice(-2000),
            args,
          ),
        );
      }
    });
  });
}

export async function runFfmpeg(args: string[], opts?: RunOptions): Promise<RunResult> {
  log.debug(`ffmpeg ${args.join(' ')}`);
  const res = await run(ffmpegPath(), ['-hide_banner', '-nostdin', '-y', ...args], opts);
  log.debug(`ffmpeg done in ${res.ms}ms`);
  return res;
}

export async function runFfprobe(args: string[], opts?: RunOptions): Promise<RunResult> {
  log.debug(`ffprobe ${args.join(' ')}`);
  return run(ffprobePath(), ['-hide_banner', ...args], { timeoutMs: 30_000, ...opts });
}

/** Boot check used by the CLI and the health route. Never throws. */
export async function ffmpegAvailable(): Promise<{ ok: boolean; version?: string; error?: string }> {
  try {
    const { stdout } = await run(ffmpegPath(), ['-version'], { timeoutMs: 10_000 });
    return { ok: true, version: stdout.split('\n')[0] };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
