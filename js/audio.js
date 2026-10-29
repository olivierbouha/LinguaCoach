/**
 * audio.js — Enregistrement micro (MediaRecorder) et conversion en WAV 16 kHz mono.
 *
 * Pourquoi WAV ? MediaRecorder produit du WebM/Opus (Chrome) ou du MP4/AAC (Safari), formats que tous les
 * services IA n'acceptent pas. Le WAV PCM 16 bits est universellement accepté (ex. Gemini).
 * Confidentialité : l'enregistrement reste en mémoire (Blob) ; il n'est ni écrit sur disque ni dans IndexedDB,
 * et on le libère (`release`) dès qu'il n'est plus utile.
 */
import { bytesToBase64 } from './utils.js';

export const MAX_RECORD_MS = 20000;

/** Encode des échantillons Float32 [-1,1] en WAV PCM 16 bits mono. */
export function encodeWav(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE');
  w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, sampleRate, true); v.setUint32(28, sampleRate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buffer;
}

/** Décode un Blob audio du navigateur, ré-échantillonne en 16 kHz mono, renvoie { wav: ArrayBuffer, durationMs }. */
export async function blobToWav16k(blob, win = globalThis) {
  const Ctx = win.AudioContext || win.webkitAudioContext;
  if (!Ctx || !win.OfflineAudioContext) throw new Error('Conversion audio indisponible dans ce navigateur.');
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const frames = Math.ceil(decoded.duration * 16000);
    const off = new win.OfflineAudioContext(1, Math.max(frames, 1), 16000);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const rendered = await off.startRendering();
    return { wav: encodeWav(rendered.getChannelData(0), 16000), durationMs: Math.round(decoded.duration * 1000) };
  } finally {
    ctx.close?.();
  }
}

export const wavToBase64 = (wav) => bytesToBase64(new Uint8Array(wav));

/** Enregistreur simple. `stop()` renvoie un Blob ; le micro est toujours libéré. */
export class Recorder {
  #rec = null;
  #stream = null;
  #chunks = [];
  #timer = null;
  #startedAt = 0;

  static supported(win = globalThis) { return !!(win.navigator?.mediaDevices?.getUserMedia && win.MediaRecorder); }

  async start({ maxMs = MAX_RECORD_MS, onAutoStop } = {}) {
    this.#stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    this.#chunks = [];
    this.#rec = new MediaRecorder(this.#stream);
    this.#rec.ondataavailable = (e) => e.data.size && this.#chunks.push(e.data);
    this.#rec.start();
    this.#startedAt = Date.now();
    this.#timer = setTimeout(() => { onAutoStop?.(); }, maxMs);
  }

  stop() {
    return new Promise((resolve) => {
      clearTimeout(this.#timer);
      const rec = this.#rec;
      const finish = () => {
        this.#stream?.getTracks().forEach((t) => t.stop());
        this.#stream = null;
        const type = rec?.mimeType || 'audio/webm';
        resolve({ blob: new Blob(this.#chunks, { type }), durationMs: Date.now() - this.#startedAt });
        this.#chunks = [];
      };
      if (!rec || rec.state === 'inactive') return finish();
      rec.onstop = finish;
      rec.stop();
    });
  }

  /** Abandon : coupe le micro sans rien conserver. */
  cancel() {
    clearTimeout(this.#timer);
    try { if (this.#rec?.state !== 'inactive') this.#rec.stop(); } catch { /* ignore */ }
    this.#stream?.getTracks().forEach((t) => t.stop());
    this.#stream = null;
    this.#chunks = [];
  }
}
