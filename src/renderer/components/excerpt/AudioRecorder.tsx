import React, { useEffect, useRef, useState } from 'react';
import { startLiveWaveform, formatTime, readToken } from '../../utils/waveform';

interface AudioRecorderProps {
  onSave: (buffer: ArrayBuffer, durationSec: number) => Promise<void> | void;
  onCancel: () => void;
}

type Status = 'starting' | 'recording' | 'denied' | 'error' | 'saving';

function pickMime(): string {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
  for (const t of types) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(t)) return t;
  }
  return '';
}

const AudioRecorder: React.FC<AudioRecorderProps> = ({ onSave, onCancel }) => {
  const [status, setStatus] = useState<Status>('starting');
  const [elapsed, setElapsed] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const stopWaveRef = useRef<(() => void) | null>(null);
  const savedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const cleanup = () => {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      stopWaveRef.current?.(); stopWaveRef.current = null;
      const mr = mediaRecorderRef.current;
      if (mr && mr.state !== 'inactive') {
        try { mr.stop(); } catch { /* ignore */ }
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      audioCtxRef.current?.close().catch(() => { /* ignore */ });
      audioCtxRef.current = null;
    };

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;

        const Ctor: typeof AudioContext =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const ctx = new Ctor();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);

        const mimeType = pickMime();
        const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mediaRecorderRef.current = mr;
        chunksRef.current = [];
        mr.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
        mr.start(100);

        if (canvasRef.current) {
          stopWaveRef.current = startLiveWaveform(
            analyser,
            canvasRef.current,
            readToken('--accent', '#8b775a')
          );
        }
        startTimeRef.current = Date.now();
        timerRef.current = window.setInterval(() => {
          setElapsed((Date.now() - startTimeRef.current) / 1000);
        }, 200);
        setStatus('recording');
      } catch (err) {
        if (cancelled) return;
        const e = err as { name?: string; message?: string };
        if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
          setStatus('denied');
          setErrorMsg('麦克风权限被拒绝，请在系统设置中允许「词歌」访问麦克风');
        } else {
          setStatus('error');
          setErrorMsg(e?.message || '无法启动录音');
        }
      }
    };

    start();
    return () => { cancelled = true; cleanup(); };
  }, []);

  const handleStop = () => {
    if (savedRef.current) return;
    savedRef.current = true;
    const mr = mediaRecorderRef.current;
    if (!mr || mr.state === 'inactive') {
      // nothing recorded; treat as cancel
      onCancel();
      return;
    }
    setStatus('saving');
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    stopWaveRef.current?.(); stopWaveRef.current = null;

    mr.onstop = async () => {
      const type = mr.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      const buffer = await blob.arrayBuffer();
      let duration = (Date.now() - startTimeRef.current) / 1000;
      try {
        const Ctor: typeof AudioContext =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        const tmpCtx = new Ctor();
        const decoded = await tmpCtx.decodeAudioData(buffer.slice(0));
        if (decoded.duration && Number.isFinite(decoded.duration)) duration = decoded.duration;
        tmpCtx.close();
      } catch {
        // fallback to elapsed timer
      }
      try {
        await onSave(buffer, duration);
      } finally {
        // release mic + audio context now that recording is committed
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        audioCtxRef.current?.close().catch(() => { /* ignore */ });
        audioCtxRef.current = null;
      }
    };
    try { mr.stop(); } catch { /* ignore */ }
  };

  const handleCancel = () => {
    savedRef.current = true;
    onCancel();
  };

  if (status === 'denied' || status === 'error') {
    return (
      <div className="excerpt-audio-error">
        <span className="excerpt-audio-error-msg">{errorMsg}</span>
        <button className="excerpt-audio-link" onClick={onCancel}>关闭</button>
      </div>
    );
  }

  return (
    <div className="excerpt-recorder">
      <div className="excerpt-recorder-head">
        <span className="excerpt-recorder-dot" aria-hidden />
        <span className="excerpt-recorder-timer">{formatTime(elapsed)}</span>
        <span className="excerpt-recorder-label">
          {status === 'saving' ? '保存中…' : status === 'starting' ? '准备中…' : '录制中'}
        </span>
      </div>
      <canvas ref={canvasRef} className="excerpt-recorder-wave" />
      <div className="excerpt-recorder-actions">
        <button
          className="excerpt-action-btn excerpt-action-btn-danger"
          onClick={handleStop}
          title="停止并保存"
          disabled={status !== 'recording'}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="3.5" y="3.5" width="7" height="7" rx="1" fill="currentColor" />
          </svg>
        </button>
        <button className="excerpt-action-btn" onClick={handleCancel} title="取消">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default AudioRecorder;
