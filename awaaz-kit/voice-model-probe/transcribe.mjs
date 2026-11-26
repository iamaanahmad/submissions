import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as ort from 'onnxruntime-web';
import { createShruti, decodeWav } from 'shruti-onnx';

const [file, ...args] = process.argv.slice(2);
if (!file) {
  console.error('Usage: npm run transcribe -- <recording> [--language auto|en|hi] [--expected "words"]');
  process.exit(2);
}

function option(name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1]) throw new Error(`Missing value for ${name}`);
  return args[index + 1];
}

const language = option('--language', 'auto');
if (!['auto', 'en', 'hi'].includes(language)) throw new Error('Language must be auto, en, or hi');
const expected = option('--expected', null);
const words = (value) => value.toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
function wordErrorRate(reference, candidate) {
  const a = words(reference);
  const b = words(candidate);
  if (!a.length) throw new Error('Expected text needs at least one word');
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const next = [i];
    for (let j = 1; j <= b.length; j += 1) {
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + Number(a[i - 1] !== b[j - 1]));
    }
    row = next;
  }
  return row[b.length] / a.length;
}

ort.env.wasm.numThreads = 1;
const start = performance.now();
const asr = await createShruti({ ort, language: 'hindi' });
const loadMs = Math.round(performance.now() - start);
if (!fs.existsSync(file)) throw new Error(`Recording not found: ${file}`);
// Normalize phone recordings in memory. No converted audio is written to disk.
const converted = spawnSync('ffmpeg', [
  '-nostdin', '-hide_banner', '-loglevel', 'error', '-i', file,
  '-ac', '1', '-ar', '16000', '-f', 'wav', '-c:a', 'pcm_s16le', 'pipe:1',
], { maxBuffer: 64 * 1024 * 1024 });
if (converted.error) throw new Error(`Could not run ffmpeg: ${converted.error.message}`);
if (converted.status !== 0) {
  throw new Error(`Could not decode recording: ${converted.stderr.toString().trim()}`);
}
const bytes = converted.stdout;
const audio = decodeWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
const inferenceStart = performance.now();
const result = await asr.transcribe(audio, { language });
console.log(JSON.stringify({
  transcript: result.text,
  detectedLanguage: result.language,
  requestedLanguage: language,
  ...(expected === null ? {} : { expected, wordErrorRate: wordErrorRate(expected, result.text) }),
  modelLoadMs: loadMs,
  inferenceMs: Math.round(performance.now() - inferenceStart),
  samples: audio.length,
}, null, 2));
