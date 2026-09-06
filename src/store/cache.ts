/**
 * Scan cache.
 *
 * Because the scan id is sha256(fileBytes + packVersion + title + thumbHash),
 * a cache hit is just "this directory exists and the scan completed". Three
 * consequences, all free:
 *
 *   1. Re-runs are instant, so iterating on the report UI burns no API credits.
 *   2. The three sample clips are pre-baked and resolve with ZERO external
 *      calls. That is the path the demo video is recorded from.
 *   3. A pack version bump invalidates everything correctly and automatically.
 */
import { loadScan, scanExists } from './scans';
import type { Scan } from '../types/scan';

export interface CacheHit {
  hit: boolean;
  scan: Scan | null;
  reason: 'complete' | 'missing' | 'incomplete' | 'stale_pack';
}

export function lookup(scanId: string, packVersion: string): CacheHit {
  if (!scanExists(scanId)) return { hit: false, scan: null, reason: 'missing' };
  const scan = loadScan(scanId);
  if (!scan) return { hit: false, scan: null, reason: 'missing' };
  if (scan.packVersion !== packVersion) return { hit: false, scan, reason: 'stale_pack' };
  if (scan.status !== 'complete') return { hit: false, scan, reason: 'incomplete' };
  return { hit: true, scan, reason: 'complete' };
}
