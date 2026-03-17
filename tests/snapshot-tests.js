import fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const cwd = new URL('../', import.meta.url).pathname;

await execFileAsync('node', ['scripts/generate-snapshot.js'], { cwd });
const output = JSON.parse(await fs.readFile(new URL('../output/price-snapshots.json', import.meta.url), 'utf8'));

let failures = 0;

if (output.snapshots.length !== output.products.length) {
  failures += 1;
  console.error(`FAIL snapshot count should match products actual=${output.snapshots.length} products=${output.products.length}`);
}

if (output.excludedItemCount < 10) {
  failures += 1;
  console.error(`FAIL expected stronger noise exclusions actual=${output.excludedItemCount}`);
}

const airpods = output.snapshots.find((item) => item.productId === 'airpodspro2-usbc');
if (!(airpods?.yahoo?.count === 4 && airpods?.suggested?.standard === 19350 && airpods?.confidence >= 0.9)) {
  failures += 1;
  console.error(`FAIL airpods summary unexpected=${JSON.stringify(airpods)}`);
}

if (!(airpods?.yahooDebug?.dedupedCount === 7 && airpods?.yahooDebug?.strictPassedCount === 4 && airpods?.yahooDebug?.strictPassRate >= 0.55)) {
  failures += 1;
  console.error(`FAIL airpods yahoo debug unexpected=${JSON.stringify(airpods?.yahooDebug)}`);
}

const iphone = output.snapshots.find((item) => item.productId === 'iphone13-128');
if (!(iphone?.janpara?.usedMax === 42000 && iphone?.yahoo?.count === 5 && iphone?.suggested?.quickSale === 48600 && iphone?.confidence >= 0.9)) {
  failures += 1;
  console.error(`FAIL iphone snapshot unexpected=${JSON.stringify(iphone)}`);
}

if (!(iphone?.yahooDebug?.dedupedCount === 9 && iphone?.yahooDebug?.strictPassedCount === 5 && iphone?.yahooDebug?.strictPassRate >= 0.55)) {
  failures += 1;
  console.error(`FAIL iphone yahoo debug unexpected=${JSON.stringify(iphone?.yahooDebug)}`);
}

const switchItem = output.debug.normalizedItems.find((item) => item.titleRaw.includes('ドックのみ'));
if (!(switchItem?.isNoise && switchItem?.noiseReason === 'ドックのみ')) {
  failures += 1;
  console.error(`FAIL switch dock should be noise actual=${JSON.stringify(switchItem)}`);
}

const iphoneMini = output.debug.normalizedItems.find((item) => item.titleRaw.includes('iPhone 13 mini'));
if (!(iphoneMini?.isNoise && iphoneMini?.noiseReason?.includes('iphone 13 mini'))) {
  failures += 1;
  console.error(`FAIL iphone mini variant should be noise actual=${JSON.stringify(iphoneMini)}`);
}

const airpodsBodyOnly = output.debug.normalizedItems.find((item) => item.titleRaw === 'AirPods Pro 第2世代 USB-C 本体');
if (!(airpodsBodyOnly?.isNoise && airpodsBodyOnly?.noiseReason === 'イヤホン本体のみ疑い')) {
  failures += 1;
  console.error(`FAIL airpods body-only should be noise actual=${JSON.stringify(airpodsBodyOnly)}`);
}

const iphoneSimFree = output.debug.normalizedItems.find((item) => item.titleRaw === 'iPhone13 128GB sim free 美品');
if (iphoneSimFree?.isNoise) {
  failures += 1;
  console.error(`FAIL iphone sim-free shorthand should survive strict filter actual=${JSON.stringify(iphoneSimFree)}`);
}

const airpodsModelCase = output.debug.normalizedItems.find((item) => item.titleRaw === 'AirPods Pro 第2世代 MTJV3J/A 本体・ケース');
if (airpodsModelCase?.isNoise) {
  failures += 1;
  console.error(`FAIL airpods model+case listing should survive strict filter actual=${JSON.stringify(airpodsModelCase)}`);
}

const airpodsPure = output.debug.normalizedItems.find((item) => item.titleRaw === 'AirPods Pro 2 USB-C 純正');
if (airpodsPure?.isNoise) {
  failures += 1;
  console.error(`FAIL airpods pro 2 usb-c shorthand should survive strict filter actual=${JSON.stringify(airpodsPure)}`);
}

if (failures > 0) {
  console.error(`\n${failures} snapshot test(s) failed.`);
  process.exit(1);
}

console.log('PASS snapshot pipeline assertions');
