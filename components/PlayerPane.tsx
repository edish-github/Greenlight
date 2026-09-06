'use client';

import { useCallback, useEffect, useRef } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { useUIStore } from '../src/store/ui';
import { timecode } from './format';

interface Props {
  src: string;
  poster?: string;
  label?: string;
}

/**
 * The video, plus the imperative seek the rest of the report drives.
 *
 * The seek handler is registered into the store on mount, so RiskTimeline and
 * FindingCard can move the playhead without a ref being threaded through four
 * components.
 */
export default function PlayerPane({ src, poster, label }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const registerSeek = useUIStore((s) => s.registerSeek);
  const setCurrentTime = useUIStore((s) => s.setCurrentTime);
  const setDuration = useUIStore((s) => s.setDuration);
  const setPlaying = useUIStore((s) => s.setPlaying);
  const isPlaying = useUIStore((s) => s.isPlaying);
  const currentTimeMs = useUIStore((s) => s.currentTimeMs);
  const durationMs = useUIStore((s) => s.durationMs);
  const pendingSeekMs = useUIStore((s) => s.currentTimeMs);

  const seek = useCallback((ms: number) => {
    const video = videoRef.current;
    if (!video) return;
    // readyState 0 means metadata has not landed; remember it and apply on load.
    if (video.readyState === 0) {
      video.addEventListener('loadedmetadata', () => {
        video.currentTime = ms / 1000;
      }, { once: true });
      return;
    }
    video.currentTime = ms / 1000;
  }, []);

  useEffect(() => {
    registerSeek(seek);
    // Apply any position chosen before this component mounted (report hydrate
    // pre-seeks to the worst finding, which usually happens first).
    if (pendingSeekMs > 0) seek(pendingSeekMs);
    return () => registerSeek(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerSeek, seek]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
  };

  const restart = () => {
    seek(0);
    setCurrentTime(0);
  };

  const scrub = (event: React.ChangeEvent<HTMLInputElement>) => {
    const ms = Number(event.target.value);
    setCurrentTime(ms);
    seek(ms);
  };

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-ink-900">
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        preload="metadata"
        playsInline
        className="aspect-video w-full bg-black"
        onLoadedMetadata={(e) => setDuration(Math.round(e.currentTarget.duration * 1000))}
        onTimeUpdate={(e) => setCurrentTime(Math.round(e.currentTarget.currentTime * 1000))}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
      />

      <div className="flex items-center gap-3 border-t border-line px-3 py-2.5">
        <button
          type="button"
          onClick={toggle}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          className="grid h-9 w-9 place-items-center rounded-md bg-ink-700 text-slate-100 transition-colors hover:bg-ink-600"
        >
          {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
        </button>

        <button
          type="button"
          onClick={restart}
          aria-label="Back to start"
          className="grid h-9 w-9 place-items-center rounded-md text-slate-400 transition-colors hover:bg-ink-800 hover:text-slate-200"
        >
          <RotateCcw size={15} />
        </button>

        <input
          type="range"
          min={0}
          max={Math.max(durationMs, 1)}
          step={100}
          value={Math.min(currentTimeMs, Math.max(durationMs, 1))}
          onChange={scrub}
          aria-label="Scrub video"
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-ink-700 accent-slate-200"
        />

        <div className="font-mono text-xs tabular-nums text-slate-400">
          <span className="text-slate-100">{timecode(currentTimeMs)}</span>
          <span className="px-1 text-slate-600">/</span>
          {timecode(durationMs)}
        </div>
      </div>

      {label ? (
        <div className="border-t border-line px-3 py-1.5 text-xs text-slate-500">{label}</div>
      ) : null}
    </div>
  );
}
