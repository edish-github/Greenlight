export type ScanId = string; // sha256(fileBytes + packVersion + title + thumbHash), truncated

export type ScanStatus =
  | 'queued'
  | 'demuxing'
  | 'transcribing'
  | 'visual'
  | 'detecting'
  | 'adjudicating'
  | 'scoring'
  | 'complete'
  | 'failed';

export type DegradedFlag =
  | 'visual_unavailable'
  | 'asr_fallback_openai'
  | 'asr_fallback_local'
  | 'asr_unavailable'
  | 'adjudication_unavailable'
  | 'packaging_skipped';

export interface ProbeResult {
  durationMs: number;
  sizeBytes: number;
  hasAudio: boolean;
  hasVideo: boolean;
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
}

export interface Scan {
  id: ScanId;
  createdAt: string;
  status: ScanStatus;
  packVersion: string;
  packId: string;
  durationMs: number;
  sourceName: string;
  fileHash: string;
  title: string | null;
  thumbHash: string | null;
  degraded: DegradedFlag[];
  timings: Record<string, number>;
  counts: {
    words: number;
    candidates: number;
    findings: number;
    drops: number;
  };
  probe?: ProbeResult;
  error?: { stage: string; message: string };
  parentScanId?: ScanId; // set on a re-scan; links fixed -> original
}

export const STAGE_LABELS: Record<ScanStatus, string> = {
  queued: 'Queued',
  demuxing: 'Demuxed',
  transcribing: 'Transcribed',
  visual: 'Visual pass',
  detecting: 'Candidates',
  adjudicating: 'Adjudicated',
  scoring: 'Scored',
  complete: 'Complete',
  failed: 'Failed',
};
