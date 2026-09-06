/**
 * In-process job registry.
 *
 * A scan takes ~20 seconds, which is far too long to hold an HTTP request open
 * behind a proxy. So POST /api/scan returns a scanId immediately and the client
 * polls GET /api/scan/[scanId] while the pipeline runs here.
 *
 * A Map is the right amount of machinery. State that matters is already on disk
 * in meta.json, so a process restart loses nothing except the in-flight job -
 * and the next poll reads `status: 'demuxing'` from disk and the client shows
 * the stage list. No queue, no worker, no Redis.
 */
import type { StageEvent } from '../pipeline/orchestrator';

export interface Job {
  scanId: string;
  startedAt: number;
  stages: StageEvent[];
  error: string | null;
  done: boolean;
  kind: 'scan' | 'fix';
}

const jobs = new Map<string, Job>();

export function startJob(scanId: string, kind: Job['kind'] = 'scan'): Job {
  const job: Job = { scanId, startedAt: Date.now(), stages: [], error: null, done: false, kind };
  jobs.set(scanId, job);
  return job;
}

export function getJob(scanId: string): Job | null {
  return jobs.get(scanId) ?? null;
}

export function recordStage(scanId: string, event: StageEvent): void {
  jobs.get(scanId)?.stages.push(event);
}

export function finishJob(scanId: string, error?: unknown): void {
  const job = jobs.get(scanId);
  if (!job) return;
  job.done = true;
  if (error) job.error = error instanceof Error ? error.message : String(error);
}

export function isRunning(scanId: string): boolean {
  const job = jobs.get(scanId);
  return Boolean(job && !job.done);
}
