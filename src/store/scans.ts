/**
 * Filesystem persistence, keyed by scan id. No database.
 *
 * A DB buys nothing in a single-user tool and costs schema migrations nobody
 * has time for. Every artifact is a plain file in the scan directory, which
 * also means debugging a bad scan is `cat`, not a query.
 */
import { existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { ARTIFACT, ensureScanDir, scanDir, scanFile, type ArtifactName } from './paths';
import type { Scan } from '../types/scan';

export function writeJson(scanId: string, name: ArtifactName | string, data: unknown): string {
  ensureScanDir(scanId);
  const p = scanFile(scanId, name);
  writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return p;
}

export function readJson<T>(scanId: string, name: ArtifactName | string): T | null {
  const p = scanFile(scanId, name);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

export function saveScan(scan: Scan): Scan {
  writeJson(scan.id, ARTIFACT.meta, scan);
  return scan;
}

export function loadScan(scanId: string): Scan | null {
  return readJson<Scan>(scanId, ARTIFACT.meta);
}

export function scanExists(scanId: string): boolean {
  return existsSync(scanFile(scanId, ARTIFACT.meta));
}

export function deleteScan(scanId: string): void {
  rmSync(scanDir(scanId), { recursive: true, force: true });
}
