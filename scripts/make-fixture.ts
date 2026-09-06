/**
 * Turn a plain text file into a transcript fixture with synthetic word
 * timings. Used to build eval fixtures and to exercise the detection stack
 * without spending an ASR call.
 *
 *   npx tsx scripts/make-fixture.ts evals/fixtures/clip-01.txt [wordsPerSecond]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import type { Transcript, TranscriptSegment, TranscriptWord } from '../src/types/transcript';

const [, , inputPath, wpsArg] = process.argv;
if (!inputPath) {
  console.error('usage: tsx scripts/make-fixture.ts <text file> [words per second]');
  process.exit(1);
}

const wps = Number(wpsArg ?? 2.6);
const text = readFileSync(inputPath, 'utf8').replace(/\s+/g, ' ').trim();
const tokens = text.split(' ');

const words: TranscriptWord[] = [];
let t = 0;
for (const token of tokens) {
  const dur = Math.round(1000 / wps);
  words.push({ text: token, startMs: t, endMs: t + dur - 40 });
  t += dur;
}

const segments: TranscriptSegment[] = [];
let buf: TranscriptWord[] = [];
for (const w of words) {
  buf.push(w);
  if (/[.!?]$/.test(w.text)) {
    segments.push({
      text: buf.map((b) => b.text).join(' '),
      startMs: buf[0].startMs,
      endMs: w.endMs,
    });
    buf = [];
  }
}
if (buf.length) {
  segments.push({
    text: buf.map((b) => b.text).join(' '),
    startMs: buf[0].startMs,
    endMs: buf[buf.length - 1].endMs,
  });
}

const transcript: Transcript = {
  provider: 'fixture',
  model: 'synthetic',
  language: 'en',
  durationMs: t,
  text,
  words,
  segments,
};

const out = inputPath.replace(/\.txt$/, '.transcript.json');
writeFileSync(out, `${JSON.stringify(transcript, null, 2)}\n`, 'utf8');
console.log(
  `${out}: ${words.length} words, ${segments.length} segments, ${(t / 1000).toFixed(1)}s`,
);
