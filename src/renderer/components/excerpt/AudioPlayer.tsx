import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  computePeaks,
  drawStaticWaveform,
  formatTime,
  pseudoPeaks,
  readToken,
  withAlpha,
} from '../../utils/waveform';

interface AudioPlayerProps {
  /** Saved audio relative path (used when buffer is not provided). */
  audioPath?: string;
  /** Pre-recorded, unsaved audio (e.g. inside the create form). */
  buffer?: ArrayBuffer;
  duration: number | null;
  excerptId: number;
  onDelete?: (() => void) | null;
}

const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioPath, buffer, duration, excerptId, onDelete }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const decodeCtxRef = useRef<AudioContext | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [realDuration, setRealDuration] = useState<number | null>(duration);
  const [peaks, setPeaks] = useState<number[]>(() => pseudoPeaks(excerptId));
  const [hasRealPeaks, setHasRealPeaks] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const colors = useMemo(() => {
    const accent = readToken('--accent', '#8b775a');
    return { bar: withAlpha(accent, 0.28), barPlayed: accent };
  }, []);

  const totalDuration = realDuration ?? duration ?? 0;
  const progress = totalDuration > 0 ? currentTime / totalDuration : 0;

  // (Re)draw whenever data affecting the picture changes.
  useEffect(() => {
    if (canvasRef.current && peaks.length > 0) {
      drawStaticWaveform(canvasRef.current, peaks, progress, colors);
    }
  }, [peaks, progress, colors, loaded]);

  // Resize observer to redraw on layout changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      if (peaks.length > 0) drawStaticWaveform(canvas, peaks, progress, colors);
    });
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [peaks, progress, colors]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
      decodeCtxRef.current?.close().catch(() => { /* ignore */ });
      decodeCtxRef.current = null;
    };
  }, []);

  const ensureAudioEl = (): HTMLAudioElement => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.preload = 'auto';
    }
    return audioRef.current;
  };

  const firstPlay = async () => {
    if (loaded || loading) return;
    setLoading(true);
    setLoadError(false);
    try {
      let buf: ArrayBuffer | null = null;
      if (buffer) {
        buf = buffer;
      } else if (audioPath) {
        const result = await window.cigeAPI.getExcerptAudio(audioPath);
        // IPC 结构化克隆可能返回 ArrayBuffer 或 Uint8Array，统一转为 ArrayBuffer
        if (result instanceof ArrayBuffer) {
          buf = result;
        } else if (result && typeof result === 'object' && 'buffer' in result) {
          const view = result as unknown as { buffer: ArrayBuffer; byteOffset: number; byteLength: number };
          buf = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
        } else if (result && ArrayBuffer.isView(result)) {
          const view = result as ArrayBufferView;
          buf = view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
        }
        if (!buf || buf.byteLength === 0) {
          setLoadError(true); setLoading(false); return;
        }
      }
      const blob = new Blob([buf], { type: 'audio/webm' });
      const url = URL.createObjectURL(blob);
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = url;

      // Decode peaks from a copy (decodeAudioData detaches its input).
      try {
        const Ctor: typeof AudioContext =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctor();
        decodeCtxRef.current = ctx;
        const decoded = await ctx.decodeAudioData(buf.slice(0));
        setPeaks(computePeaks(decoded, 96));
        setHasRealPeaks(true);
        if (decoded.duration && Number.isFinite(decoded.duration) && decoded.duration > 0) {
          setRealDuration(decoded.duration);
        }
      } catch {
        // decoding failed (rare); keep pseudo waveform
      }

      const el = ensureAudioEl();
      el.src = url;
      el.ontimeupdate = () => setCurrentTime(el.currentTime);
      el.onended = () => { setPlaying(false); setCurrentTime(0); };
      el.onloadedmetadata = () => {
        if (el.duration && Number.isFinite(el.duration) && el.duration > 0) {
          setRealDuration(el.duration);
        }
      };
      setLoaded(true);
      await el.play();
      setPlaying(true);
    } catch (e) {
      console.error('[AudioPlayer] firstPlay error:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const togglePlay = async () => {
    const el = ensureAudioEl();
    if (!loaded) { await firstPlay(); return; }
    if (el.paused) { await el.play(); setPlaying(true); }
    else { el.pause(); setPlaying(false); }
  };

  const handleSeek = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!loaded) return;
    const el = ensureAudioEl();
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const dur = realDuration ?? duration ?? el.duration ?? 0;
    if (dur > 0) {
      el.currentTime = ratio * dur;
      setCurrentTime(el.currentTime);
    }
  };

  const shownDuration = realDuration ?? duration;

  return (
    <div className="excerpt-player">
      <button
        className="excerpt-player-btn"
        onClick={togglePlay}
        title={playing ? '暂停' : '播放'}
        aria-label={playing ? '暂停' : '播放'}
      >
        {loading ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="excerpt-player-spin">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.2" opacity="0.25" />
            <path d="M12 7a5 5 0 0 0-5-5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        ) : playing ? (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="3.5" y="3" width="2.4" height="8" rx="0.6" fill="currentColor" />
            <rect x="8.1" y="3" width="2.4" height="8" rx="0.6" fill="currentColor" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M4 2.6L11 7L4 11.4V2.6Z" fill="currentColor" />
          </svg>
        )}
      </button>
      <canvas
        ref={canvasRef}
        className={`excerpt-player-wave${hasRealPeaks ? '' : ' is-pseudo'}`}
        onClick={handleSeek}
      />
      <span className="excerpt-player-time">
        {formatTime(currentTime)} / {formatTime(shownDuration ?? 0)}
      </span>
      {loadError && <span className="excerpt-player-err">音频读取失败</span>}
      {onDelete && (
        <button
          className="excerpt-action-btn excerpt-action-btn-danger"
          onClick={onDelete}
          title="删除录音"
          aria-label="删除录音"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 4H12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M5 4V12C5 12.276 5.105 12.53 5.293 12.707C5.48 12.895 5.724 13 6 13H8C8.276 13 8.52 12.895 8.707 12.707C8.895 12.53 9 12.276 9 12V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            <path d="M5 4L3 4M9 4L11 4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
};

export default AudioPlayer;
