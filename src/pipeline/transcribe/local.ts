/**
 * ASR tier 3: local faster-whisper via a Python subprocess.
 *
 * This is the offline tier. It exists so that "no network at all" degrades to
 * slow rather than to broken. Optional: if python3 or faster_whisper is not
 * installed the ladder records asr_unavailable and the scan continues with
 * packaging findings only.
 */
import { spawn } from 'node:child_process';
import { normalizeWhisper } from './groq';
import type { Transcript } from '../../types/transcript';

const SCRIPT = `
import json, sys
from faster_whisper import WhisperModel
model = WhisperModel("base", device="cpu", compute_type="int8")
segments, info = model.transcribe(sys.argv[1], word_timestamps=True)
words, segs, text = [], [], []
for s in segments:
    segs.append({"text": s.text, "start": s.start, "end": s.end})
    text.append(s.text)
    for w in (s.words or []):
        words.append({"word": w.word, "start": w.start, "end": w.end})
json.dump({"language": info.language, "duration": info.duration,
           "text": "".join(text), "words": words, "segments": segs}, sys.stdout)
`;

export function localAsrAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn('python3', ['-c', 'import faster_whisper']);
    p.on('error', () => resolve(false));
    p.on('close', (code) => resolve(code === 0));
  });
}

export function transcribeLocally(audioPath: string): Promise<Transcript> {
  return new Promise((resolve, reject) => {
    const p = spawn('python3', ['-c', SCRIPT, audioPath]);
    let out = '';
    let err = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('error', reject);
    p.on('close', (code) => {
      if (code !== 0) return reject(new Error(`local ASR exited ${code}: ${err.slice(-400)}`));
      try {
        resolve(normalizeWhisper(JSON.parse(out), 'local', 'faster-whisper-base'));
      } catch (e) {
        reject(e);
      }
    });
  });
}
