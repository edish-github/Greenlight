import { statSync } from 'node:fs';
import { runFfprobe } from '../../lib/ffmpeg';
import type { ProbeResult } from '../../types/scan';

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  avg_frame_rate?: string;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: { duration?: string };
}

function parseFps(rate?: string): number | null {
  if (!rate) return null;
  const [n, d] = rate.split('/').map(Number);
  if (!n || !d) return null;
  return Math.round((n / d) * 100) / 100;
}

export async function probe(inputPath: string): Promise<ProbeResult> {
  const { stdout } = await runFfprobe([
    '-v', 'error',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    inputPath,
  ]);

  const data = JSON.parse(stdout) as FfprobeOutput;
  const streams = data.streams ?? [];
  const video = streams.find((s) => s.codec_type === 'video');
  const audio = streams.find((s) => s.codec_type === 'audio');
  const durationSec = Number(data.format?.duration ?? 0);

  return {
    durationMs: Math.round(durationSec * 1000),
    sizeBytes: statSync(inputPath).size,
    hasAudio: Boolean(audio),
    hasVideo: Boolean(video),
    width: video?.width ?? null,
    height: video?.height ?? null,
    fps: parseFps(video?.avg_frame_rate),
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
  };
}
