import fs from 'node:fs';
import * as ort from 'onnxruntime-web';
import { createShruti, decodeWav } from 'shruti-onnx';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run transcribe -- <16-kHz-mono.wav>');
  process.exit(2);
}

ort.env.wasm.numThreads = 1;
const start = performance.now();
const asr = await createShruti({ ort, language: 'hindi' });
const loadMs = Math.round(performance.now() - start);
const bytes = fs.readFileSync(file);
const audio = decodeWav(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
const inferenceStart = performance.now();
const result = await asr.transcribe(audio, { language: 'en' });
console.log(JSON.stringify({
  transcript: result.text,
  detectedLanguage: result.language,
  modelLoadMs: loadMs,
  inferenceMs: Math.round(performance.now() - inferenceStart),
  samples: audio.length,
}, null, 2));
