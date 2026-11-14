import { readFile, stat } from 'node:fs/promises';
import { resolve, sep } from 'node:path';

const root = resolve(process.argv[2] || 'dist');
const files = [
  'index.html', 'detection-worker.js', 'mediapipe/vision_bundle.js',
  'mediapipe/vision_wasm_internal.js', 'mediapipe/vision_wasm_internal.wasm',
  'mediapipe/vision_wasm_module_internal.js', 'mediapipe/vision_wasm_module_internal.wasm',
  'models/efficientdet_lite0.tflite', 'models/hand_landmarker.task',
  'fonts/pretendard-sub-500.woff2', 'fonts/pretendard-sub-600.woff2',
  'fonts/pretendard-sub-700.woff2', 'fonts/pretendard-sub-800.woff2',
];
for (const file of files) {
  const path = resolve(root, file);
  if (!path.startsWith(root + sep)) throw new Error('Asset path must stay inside output');
  if (!(await stat(path)).size) throw new Error(`Empty deployment asset: ${file}`);
  if (file.endsWith('.wasm')) {
    const buffer = await readFile(path);
    if (!buffer.subarray(0, 4).equals(Buffer.from([0, 97, 115, 109]))) throw new Error(`Invalid WASM asset: ${file}`);
  }
}
const html = await readFile(resolve(root, 'index.html'), 'utf8');
const assets = [...html.matchAll(/(?:src|href)="\/?(assets\/[^"?#]+)(?:\?[^"#]*)?"/g)].map(match => match[1]);
if (!assets.some(file => file.endsWith('.js'))) throw new Error('Built JavaScript bundle is missing');
for (const file of assets) await stat(resolve(root, file));
console.log(`Deployment assets verified (${files.length + assets.length} files).`);
