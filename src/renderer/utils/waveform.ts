// Canvas waveform helpers: live recording (AnalyserNode) + static playback (decoded peaks).

export interface WaveformColors {
  bar: string;
  barPlayed: string;
}

export function readToken(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

/** Convert a #hex or rgb() color into an rgba() string with the given alpha. */
export function withAlpha(color: string, alpha: number): string {
  const a = Math.max(0, Math.min(1, alpha));
  const hex = color.trim();
  if (hex.startsWith('#')) {
    let h = hex.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].every((n) => Number.isFinite(n))) return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  const m = hex.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  if (m) return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a})`;
  return hex;
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/** Draw mirrored frequency bars from an AnalyserNode. Returns a stop function. */
export function startLiveWaveform(
  analyser: AnalyserNode,
  canvas: HTMLCanvasElement,
  color: string
): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const dpr = window.devicePixelRatio || 1;
  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(width * dpr));
    canvas.height = Math.max(1, Math.floor(height * dpr));
  };
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  const bins = analyser.frequencyBinCount;
  const data = new Uint8Array(bins);
  const BAR_COUNT = 48;

  let raf = 0;
  const draw = () => {
    analyser.getByteFrequencyData(data);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const w = canvas.width;
    const h = canvas.height;
    const gap = 2 * dpr;
    const barW = (w - gap * (BAR_COUNT - 1)) / BAR_COUNT;
    const mid = h / 2;
    const step = Math.max(1, Math.floor(bins / BAR_COUNT));
    for (let i = 0; i < BAR_COUNT; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += data[i * step + j] || 0;
      const v = (sum / step) / 255;
      const minH = 2 * dpr;
      const barH = Math.max(minH, v * mid * 0.92);
      const x = i * (barW + gap);
      ctx.fillStyle = color;
      const r = Math.max(0, Math.min(barW / 2, 2 * dpr));
      roundRect(ctx, x, mid - barH, barW, barH * 2, r);
      ctx.fill();
    }
    raf = requestAnimationFrame(draw);
  };
  draw();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
  };
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Compute normalized peak amplitudes per bucket from a decoded AudioBuffer. */
export function computePeaks(buffer: AudioBuffer, buckets = 96): number[] {
  const channel = buffer.getChannelData(0);
  const len = channel.length;
  if (len === 0 || buckets <= 0) return new Array(Math.max(buckets, 0)).fill(0);
  const block = Math.floor(len / buckets);
  const peaks: number[] = [];
  let max = 0.0001;
  for (let i = 0; i < buckets; i++) {
    let peak = 0;
    const start = i * block;
    const end = Math.min(start + block, len);
    for (let j = start; j < end; j++) {
      const a = Math.abs(channel[j] || 0);
      if (a > peak) peak = a;
    }
    peaks.push(peak);
    if (peak > max) max = peak;
  }
  return peaks.map((p) => p / max);
}

/** Draw static waveform with progress fill. progress 0..1. */
export function drawStaticWaveform(
  canvas: HTMLCanvasElement,
  peaks: number[],
  progress: number,
  colors: WaveformColors
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(width * dpr));
  canvas.height = Math.max(1, Math.floor(height * dpr));
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const w = canvas.width;
  const h = canvas.height;
  const count = peaks.length || 1;
  const gap = 2 * dpr;
  const barW = (w - gap * (count - 1)) / count;
  const mid = h / 2;
  const minH = 2 * dpr;
  const playedX = w * Math.max(0, Math.min(1, progress));

  for (let i = 0; i < count; i++) {
    const v = peaks[i] ?? 0;
    const barH = Math.max(minH, v * mid * 0.92);
    const x = i * (barW + gap);
    ctx.fillStyle = x <= playedX ? colors.barPlayed : colors.bar;
    const r = Math.max(0, Math.min(barW / 2, 2 * dpr));
    roundRect(ctx, x, mid - barH, barW, barH * 2, r);
    ctx.fill();
  }
}

/** Deterministic pseudo-waveform for the placeholder before real peaks load. */
export function pseudoPeaks(seed: number, buckets = 96): number[] {
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const peaks: number[] = [];
  for (let i = 0; i < buckets; i++) {
    const env = 0.35 + 0.55 * Math.sin((i / buckets) * Math.PI * 2.4 + seed);
    peaks.push(Math.max(0.08, Math.min(1, env * (0.5 + rand() * 0.7))));
  }
  return peaks;
}
