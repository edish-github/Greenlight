import { runFfmpeg } from '../../lib/ffmpeg';

/**
 * 16kHz mono PCM. Whisper resamples to 16k anyway, so doing it here keeps the
 * upload small and makes the local fallback tier free of surprises.
 */
export async function extractAudio(inputPath: string, outPath: string): Promise<string> {
  await runFfmpeg([
    '-i', inputPath,
    '-vn',
    '-acodec', 'pcm_s16le',
    '-ar', '16000',
    '-ac', '1',
    outPath,
  ]);
  return outPath;
}
