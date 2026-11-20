// ClipForge transcription worker: runs Whisper fully in the browser.
import { pipeline, env } from '../assets/vendor/transformers.min.js';

const base = new URL('../assets/', self.location.href).href;
let manifest = null;
let asr = null;
let loadedModel = null;

async function getManifest() {
  if (!manifest) {
    const r = await fetch(base + 'chunks.json');
    if (!r.ok) throw new Error('Could not load chunks.json (' + r.status + ')');
    manifest = await r.json();
  }
  return manifest;
}

// Big files are split into <15 MB parts; stitch them back together here.
let progressFn = null;
const progressState = { loaded: 0, total: 1 };
async function assemble(key) {
  const man = await getManifest();
  const m = man[key];
  const out = new Uint8Array(m.size);
  let off = 0;
  for (const p of m.parts) {
    const r = await fetch(base + p);
    if (!r.ok) throw new Error('Failed to load ' + p + ' (' + r.status + ')');
    if (r.body && r.body.getReader) {
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        out.set(value, off);
        off += value.length;
        progressState.loaded += value.length;
        progressFn && progressFn();
      }
    } else {
      const b = new Uint8Array(await r.arrayBuffer());
      out.set(b, off);
      off += b.length;
      progressState.loaded += b.length;
      progressFn && progressFn();
    }
  }
  return out;
}

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = base + 'models/';
env.useBrowserCache = false;
env.useCustomCache = true;
env.customCache = {
  async match(name) {
    const n = String(name);
    const man = await getManifest();
    for (const k of Object.keys(man)) {
      if (n === base + k || n.endsWith('/' + k)) {
        const bytes = await assemble(k);
        return new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } });
      }
    }
    return undefined;
  },
  async put() {},
};

let wasmReady = false;
async function prepWasm() {
  if (wasmReady) return;
  const o = env.backends.onnx;
  o.wasm.numThreads = 1;
  o.wasm.proxy = false;
  o.wasm.wasmPaths = { mjs: base + 'vendor/ort-glue.js' };
  const bin = await assemble('vendor/ort.wasm');
  o.wasm.wasmBinary = bin.buffer;
  wasmReady = true;
}

async function load(model) {
  if (asr && loadedModel === model) return;
  const man = await getManifest();
  let total = 0;
  for (const k of Object.keys(man)) {
    if (k.includes(model + '/') || (!wasmReady && k === 'vendor/ort.wasm')) total += man[k].size;
  }
  progressState.loaded = 0;
  progressState.total = total || 1;
  let last = 0;
  progressFn = () => {
    const now = Date.now();
    if (now - last > 120) {
      last = now;
      self.postMessage({ type: 'progress', loaded: progressState.loaded, total: progressState.total });
    }
  };
  await prepWasm();
  if (asr && asr.dispose) { try { await asr.dispose(); } catch (e) {} }
  asr = await pipeline('automatic-speech-recognition', model, { dtype: 'q8', device: 'wasm' });
  loadedModel = model;
  progressFn = null;
  self.postMessage({ type: 'progress', loaded: progressState.total, total: progressState.total });
}

self.onmessage = async (e) => {
  const msg = e.data;
  try {
    if (msg.type === 'load') {
      await load(msg.model);
      self.postMessage({ type: 'loaded', id: msg.id });
    } else if (msg.type === 'run') {
      await load(msg.model);
      const audio = msg.audio; // Float32Array, 16 kHz mono
      const SR = 16000;
      const piece = 30 * SR * 4; // transcribe in ~2 min blocks so progress is visible
      const words = [];
      for (let start = 0; start < audio.length; start += piece) {
        const end = Math.min(audio.length, start + piece);
        const slice = audio.subarray(start, end);
        if (slice.length < SR * 0.3) break;
        const out = await asr(slice, { return_timestamps: 'word', chunk_length_s: 30, stride_length_s: 5 });
        const t0 = msg.offset + start / SR;
        for (const c of out.chunks || []) {
          const txt = (c.text || '').trim();
          if (!txt) continue;
          let s = c.timestamp[0], en = c.timestamp[1];
          if (s == null) continue;
          if (en == null) en = s + 0.3;
          words.push({ w: txt, s: t0 + s, e: t0 + en });
        }
        self.postMessage({ type: 'runprogress', id: msg.id, done: end, total: audio.length });
      }
      self.postMessage({ type: 'result', id: msg.id, words });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: msg.id, message: String(err && err.message || err) });
  }
};
