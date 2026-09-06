'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileVideo, Loader2, Upload } from 'lucide-react';

const ACCEPT = '.mp4,.mov,.mkv,.webm,.m4v';

export default function Dropzone() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (title.trim()) form.append('title', title.trim());

      const res = await fetch('/api/scan', { method: 'POST', body: form });
      const data = (await res.json()) as { scanId?: string; error?: string };
      if (!res.ok || !data.scanId) {
        setError(data.error ?? 'The upload failed.');
        return;
      }
      router.push(`/report/${data.scanId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const dropped = e.dataTransfer.files?.[0];
          if (dropped) setFile(dropped);
        }}
        onClick={() => inputRef.current?.click()}
        className={`cursor-pointer rounded-lg border border-dashed px-6 py-10 text-center transition-colors ${
          dragging ? 'border-sky-400 bg-sky-400/5' : 'border-slate-700 bg-ink-900 hover:border-slate-600'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="flex items-center justify-center gap-2.5 text-slate-200">
            <FileVideo size={18} className="text-sky-300" />
            <span className="text-sm">{file.name}</span>
            <span className="font-mono text-xs text-slate-500">
              {(file.size / 1e6).toFixed(1)} MB
            </span>
          </div>
        ) : (
          <>
            <Upload size={20} className="mx-auto text-slate-500" />
            <p className="mt-2.5 text-sm text-slate-300">Drop a finished render here</p>
            <p className="mt-1 text-[13px] text-slate-500">
              MP4, MOV, MKV or WebM. The file stays on this machine and never touches your channel.
            </p>
          </>
        )}
      </div>

      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="The title you plan to publish with (optional, but it is scored separately)"
        className="w-full rounded-md border border-line bg-ink-900 px-3 py-2.5 text-sm text-slate-200 placeholder:text-slate-600 focus:border-slate-600"
      />

      {error ? <p className="text-[13px] text-[#ff8a95]">{error}</p> : null}

      <button
        type="button"
        onClick={submit}
        disabled={!file || busy}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-slate-100 px-4 py-2.5 text-sm font-medium text-ink-950 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:bg-ink-800 disabled:text-slate-500"
      >
        {busy ? <Loader2 size={15} className="animate-spin" /> : null}
        {busy ? 'Uploading…' : 'Scan this file'}
      </button>
    </div>
  );
}
