import Dropzone from '../components/Dropzone';
import SampleClips from '../components/SampleClips';
import { hydrateSampleScans, readManifest } from '../src/store/samples';
import type { SampleClip } from '../src/store/samples';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function loadSamples(): SampleClip[] {
  // Restores the committed sample scans into the live data directory on first
  // use. After that they are ordinary cached scans.
  hydrateSampleScans();
  const manifest = readManifest();
  // No manifest yet means no footage recorded yet. SampleClips renders a
  // labelled empty state rather than three dead cards - a broken sample card is
  // worse than an honest gap.
  return manifest?.clips ?? [];
}

export default function LandingPage() {
  const samples = loadSamples();

  return (
    <main className="mx-auto max-w-[820px] px-6 py-16">
      <h1 className="max-w-[20ch] text-[40px] font-semibold leading-[1.1] tracking-tight text-slate-50">
        YouTube tells you <span className="text-[#f5a524]">that</span> your video got the yellow
        icon.
      </h1>
      <p className="mt-3 max-w-[52ch] text-[17px] leading-relaxed text-slate-400">
        Greenlight tells you which six seconds, cites the clause with its effective date, and
        renders you a corrected file.
      </p>

      <div className="mt-10">
        <Dropzone />
      </div>

      <section className="mt-12">
        <h2 className="text-sm font-medium text-slate-300">Or open a pre-scanned clip</h2>
        <p className="mb-3 mt-1 text-[13px] text-slate-500">
          Full report, no upload, no waiting.
        </p>
        <SampleClips samples={samples} />
      </section>

      <section className="mt-14 border-t border-line pt-8">
        <h2 className="text-sm font-medium text-slate-300">What this does not do</h2>
        <ul className="mt-3 max-w-[68ch] space-y-2 text-[13px] leading-relaxed text-slate-500">
          <li>
            It does not predict YouTube&rsquo;s decision. YouTube reviews the whole video in context
            and its systems can be wrong.
          </li>
          <li>It does not touch your channel. No sign-in, no uploads, no writes of any kind.</li>
          <li>It does not identify music. Music is flagged as present for you to check licensing.</li>
          <li>
            It does not guess at policy. Every clause it cites lives in a versioned file with a date
            and a link, and a clause that is not in that file cannot appear in a report.
          </li>
        </ul>
      </section>
    </main>
  );
}
