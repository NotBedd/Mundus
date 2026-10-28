// Whistle STT engine (v0.7.91-NIGHTLY)
// -------------------------------------------------------------
// Streams microphone audio into Cactus Compute's Whistle model
// (https://huggingface.co/Cactus-Compute/whistle) — a 16.9 MB on-device
// speech-to-text model that runs fully locally in a WASM worker via the
// `cactus-needle` browser runtime. No API key, no server, audio never
// leaves the machine.
//
// Streaming contract (per cactus-needle docs):
//   - feed 16 kHz mono Float32 chunks (≈1 s each) via an AsyncIterable
//   - each TranscriptionChunk carries:
//       text    — newly COMMITTED words (two decoder passes agreed): append
//       pending — the unconfirmed tail: REPLACE the previous pending text
//
// The first use downloads the 16.9 MB model from Hugging Face and caches it
// in browser CacheStorage (subsequent sessions load from cache).

/** Microphone capture + resample + streaming plumbing. */
export class SttSession {
  private whistle: WhistleSession | null = null;
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private sinkNode: GainNode | null = null;

  private rawQueue: Float32Array[] = [];
  private resampleBuffer: Float32Array = new Float32Array(0);
  private captureRate = 16000;
  private queueNotify: (() => void) | null = null;
  private finished = false;
  private stoppedByUser = false;
  private lastError: Error | null = null;

  /** Seconds of audio pushed to the model so far (updated on every chunk). */
  receivedSeconds = 0;

  /**
   * Opens the microphone, loads Whistle (downloading the model on first run)
   * and starts streaming transcription chunks to `handlers.onChunk`.
   */
  async start(handlers: SttHandlers): Promise<void> {
    // 1. Microphone first — fail fast on denied permission.
    handlers.onStatus?.('mic');
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });

    // 2. Whistle session (model download ~16.9 MB on first ever use).
    handlers.onStatus?.('model', 0);
    const mod = await import('cactus-needle/browser');
    this.whistle = new mod.Whistle({
      onDownloadProgress: (p: { loaded: number; total?: number; percentage?: number }) => {
        const pct = typeof p.percentage === 'number'
          ? Math.round(p.percentage)
          : p.total ? Math.round((p.loaded / p.total) * 100) : undefined;
        handlers.onStatus?.('model', pct);
      },
    }) as WhistleSession;

    // 3. Audio graph: mic → (resample) → 1 s Float32 chunks @16 kHz.
    handlers.onStatus?.('audio');
    const ctx = new AudioContext({ sampleRate: 16000 });
    this.audioCtx = ctx;
    this.captureRate = ctx.sampleRate; // browser may ignore the requested rate
    this.sourceNode = ctx.createMediaStreamSource(this.mediaStream);
    // ScriptProcessorNode is deprecated but is the only zero-config option
    // that works identically in Electron and the Android WebView (an
    // AudioWorklet would need an extra module URL; keep the nightly simple).
    this.processorNode = ctx.createScriptProcessor(4096, 1, 1);
    this.processorNode.onaudioprocess = (evt) => {
      const input = evt.inputBuffer.getChannelData(0);
      this.rawQueue.push(new Float32Array(input));
      this.queueNotify?.();
    };
    // Route through a muted gain node: the processor only runs when wired
    // into the destination graph, and 0 gain means zero monitoring feedback.
    this.sinkNode = ctx.createGain();
    this.sinkNode.gain.value = 0;
    this.sourceNode.connect(this.processorNode);
    this.processorNode.connect(this.sinkNode);
    this.sinkNode.connect(ctx.destination);

    // 4. Stream loop: pull 1 s chunks, fan results out to handlers.
    console.debug('[stt-debug] creating stream loop');
    const chunkStream = this.whistle.stream(this.pullChunks());
    void (async () => {
      try {
        console.debug('[stt-debug] for-await starting');
        for await (const chunk of chunkStream) {
          console.debug('[stt-debug] chunk received', JSON.stringify(chunk).slice(0, 120));
          this.receivedSeconds = typeof chunk.received === 'number' ? chunk.received : this.receivedSeconds;
          handlers.onChunk?.({
            committedDelta: chunk.text ?? '',
            pending: chunk.pending ?? '',
            receivedSeconds: this.receivedSeconds,
          });
        }
        console.debug('[stt-debug] for-await ENDED (stream complete)');
      } catch (err) {
        console.debug('[stt-debug] for-await THREW', err);
        if (!this.stoppedByUser) {
          this.lastError = err instanceof Error ? err : new Error(String(err));
          handlers.onError?.(this.lastError);
        }
      }
    })();
  }

  /** AsyncIterable of 16 kHz mono chunks (~1 second each) for whistle.stream(). */
  private async *pullChunks(): AsyncIterableIterator<Float32Array> {
    while (!this.finished) {
      const merged = this.drainRaw();
      if (merged.length >= TARGET_RATE) {
        // Emit whole seconds; keep the remainder for the next chunk.
        let offset = 0;
        while (offset + TARGET_RATE <= merged.length) {
          if (offset === 0) console.debug('[stt-debug] yielding chunk', merged.length);
          yield merged.slice(offset, offset + TARGET_RATE);
          offset += TARGET_RATE;
        }
        this.resampleBuffer = merged.slice(offset);
      } else {
        // FIX (v0.7.92-nightly): KEEP the partial audio. drainRaw() empties
        // rawQueue + resampleBuffer, so discarding `merged` here silently
        // dropped ~all captured audio — at normal callback rates merged never
        // reached 1 s, the model never received a single chunk and the session
        // sat in "Listening" forever with no error (the v0.7.91-nightly bug).
        this.resampleBuffer = merged;
        await this.waitForData(120);
      }
    }
    // Flush the final partial chunk so the spoken tail is transcribed too.
    const tail = this.drainRaw();
    if (tail.length > 0) yield tail;
  }

  /** Concatenate queued raw capture (+ any pending resample remainder) into one 16 kHz buffer. */
  private drainRaw(): Float32Array {
    if (this.rawQueue.length === 0 && this.resampleBuffer.length === 0) return new Float32Array(0);
    let rawLen = this.resampleBuffer.length;
    for (const q of this.rawQueue) rawLen += q.length;
    const raw = new Float32Array(rawLen);
    raw.set(this.resampleBuffer, 0);
    let pos = this.resampleBuffer.length;
    for (const q of this.rawQueue) {
      raw.set(q, pos);
      pos += q.length;
    }
    this.rawQueue = [];
    this.resampleBuffer = new Float32Array(0);
    const target = this.captureRate === TARGET_RATE ? raw : resampleLinear(raw, this.captureRate, TARGET_RATE);
    return sanitizeAudioSamples(target);
  }

  private waitForData(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(done, ms);
      this.queueNotify = () => done();
      function done() {
        clearTimeout(timer);
        resolve();
      }
    });
  }

  /** Stop the session and release the microphone + worker. */
  async stop(): Promise<void> {
    this.stoppedByUser = true;
    this.finished = true;
    this.queueNotify?.();
    try { await this.whistle?.close(); } catch { /* already closed */ }
    this.whistle = null;
    try { this.processorNode && (this.processorNode.onaudioprocess = null); } catch { /* ignore */ }
    try { this.sourceNode?.disconnect(); } catch { /* ignore */ }
    try { this.processorNode?.disconnect(); } catch { /* ignore */ }
    try { this.sinkNode?.disconnect(); } catch { /* ignore */ }
    try { await this.audioCtx?.close(); } catch { /* ignore */ }
    this.mediaStream?.getTracks().forEach((t) => t.stop());
    this.audioCtx = null;
    this.sourceNode = null;
    this.processorNode = null;
    this.sinkNode = null;
    this.mediaStream = null;
  }

  /** Error captured by the stream loop, if any. */
  consumeError(): Error | null {
    const e = this.lastError;
    this.lastError = null;
    return e;
  }
}

// ---------------------------------------------------------------------------
// Types (kept local so tsc needs no resolution of cactus-needle internals)
// ---------------------------------------------------------------------------

export const TARGET_RATE = 16000;

export interface SttChunk {
  /** Newly committed text — append it to the transcript. */
  text: string;
  /** Unconfirmed tail — replace the previous pending text. */
  pending: string;
  /** Audio received so far, in seconds. */
  received?: number;
}

export interface SttHandlers {
  onChunk?: (chunk: { committedDelta: string; pending: string; receivedSeconds: number }) => void;
  /** 'mic' → requesting permission; ('model', pct) → loading model; 'audio' → wiring capture. */
  onStatus?: (phase: 'mic' | 'model' | 'audio', downloadPct?: number) => void;
  onError?: (err: Error) => void;
}

interface WhistleSession {
  stream(chunks: AsyncIterable<Float32Array>): AsyncIterableIterator<SttChunk>;
  close(): Promise<void>;
}

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in scripts/test_nightly_features.ts)
// ---------------------------------------------------------------------------

/** Linear-interpolation resampler, good enough for speech at 16 kHz. */
export function resampleLinear(samples: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || samples.length === 0) return samples;
  const ratio = fromRate / toRate;
  const outLen = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const srcPos = i * ratio;
    const i0 = Math.floor(srcPos);
    const i1 = Math.min(i0 + 1, samples.length - 1);
    const frac = srcPos - i0;
    out[i] = samples[i0] * (1 - frac) + samples[i1] * frac;
  }
  return out;
}

/**
 * FIX (v0.7.92-nightly): clamp every sample to [-1, 1] and repair non-finite
 * values. Mic chains with AGC (and some virtual devices) emit peaks slightly
 * above 1.0 or even NaN; the Whistle runtime rejects the whole chunk
 * ("Audio samples must be finite numbers in [-1, 1]") instead of tolerating
 * them, so the engine MUST sanitize before streaming. Returns the same array
 * mutated in place when possible.
 */
export function sanitizeAudioSamples(samples: Float32Array): Float32Array {
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    if (s >= -1 && s <= 1) continue; // fast path (also false for NaN)
    samples[i] = s > 0 ? 1 : s < 0 ? -1 : 0; // NaN (not >0, not <0) → 0
  }
  return samples;
}

/**
 * Assemble the dictation text for the editor from the committed transcript
 * and the latest pending tail. Pending is a REPLACEMENT of the previous
 * pending, so the result is committed + pending (with a joining space when
 * both sides carry word characters).
 */
export function assembleSttText(committed: string, pending: string): string {
  return joinText(committed, pending);
}

/**
 * FIX (v0.7.92-nightly): append a committed delta from a new chunk to the
 * transcript. Whistle commits word groups per chunk WITHOUT leading/trailing
 * spaces ("…into the old" + "tavern, closed…"), so naive concatenation glued
 * words together ("oldtavern", "doorbehind"). joinText() restores the space
 * at the seam while never double-spacing or spacing before punctuation.
 */
export function appendSttCommitted(committed: string, delta: string): string {
  return joinText(committed, delta);
}

/** Join two transcript fragments with exactly one space when needed. */
export function joinText(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  if (/\s$/.test(left) || /^\s/.test(right)) return left + right;
  // Left joiners: trailing dash/paren-open/bracket-open/opening-curly-quote.
  // A straight " is deliberately NOT a joiner — after a closing quote a new
  // sentence needs its space ('coming." We'), and opening straight quotes are
  // far rarer as delta seams.
  // Right joiners: leading closing punctuation / closing curly quotes.
  if (/[-—–(/\[“‘]$/.test(left) || /^[.,;:!?)\]}…”’]/.test(right)) return left + right;
  return left + ' ' + right;
}

/**
 * After stopping, make sure the dictated text is separated from whatever
 * follows it by exactly one space (no glued words, no doubled spaces).
 * Returns the final node value to write back.
 */
export function finalizeDictationText(nodeValue: string, nextChar: string | undefined): string {
  let text = nodeValue.replace(/[ \t]+$/, '');
  if (!text) return text;
  const endsWithJoiner = /[-—–(/\["']$/.test(text);
  const nextIsPunctuation = !!nextChar && /^[.,;:!?)\]}…]$/.test(nextChar);
  if (nextChar && !/\s/.test(nextChar) && !endsWithJoiner && !nextIsPunctuation) {
    text += ' ';
  }
  return text;
}

/** Map a start() failure to a short, user-facing explanation. */
export function describeSttError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message : String(err);
  if (name === 'NotAllowedError' || /permission|denied|NotAllowed/i.test(msg)) return 'Microphone permission denied';
  if (name === 'NotFoundError' || /NotFound|no.*mic|device/i.test(msg)) return 'No microphone found';
  if (/fetch|network|download/i.test(msg)) return 'Could not download the Whistle model (offline?)';
  return msg.length > 80 ? msg.slice(0, 77) + '…' : msg;
}
