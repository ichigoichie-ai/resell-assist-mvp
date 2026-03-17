import fs from 'node:fs/promises';
import { buildSearchIndex, computeMarkets, findProduct, normalizeQuery, priceSuggestions, rankRecommendations, searchProducts } from '../lib/core.js';

const products = JSON.parse(await fs.readFile(new URL('../data/products.json', import.meta.url), 'utf8')).map(buildSearchIndex);

const cases = [
  ['iPhone13 128', 'iphone13-128'],
  ['iphone 13 256gb sim free', 'iphone13-256'],
  ['iphone 13 mini 128', 'iphone13mini-128'],
  ['AirPodsPro2', 'airpodspro2-lightning'],
  ['airpods pro usb-c', 'airpodspro2-usbc'],
  ['switch oled white', 'switch-oled-white'],
  ['switch 有機EL ネオン', 'switch-oled-neon'],
  ['ipad air5 wifi 64gb', 'ipad-air5-64-wifi'],
  ['ipad air 第5世代 wifi 256gb', 'ipad-air5-256-wifi'],
  ['ipad air 第5世代 cellular 256gb', 'ipad-air5-256-cellular'],
  ['ps5 cfi-2000a', 'ps5-slim-standard'],
  ['ps5 slim digital', 'ps5-slim-digital'],
  ['applewatch se 2 44mm', 'apple-watch-se2-44-gps'],
  ['apple watch se2 cellular 44mm', 'apple-watch-se2-44-cellular'],
  ['炊飯器 5合', null]
];

let failures = 0;

for (const [query, expectedId] of cases) {
  const result = findProduct(products, query);
  const actual = result?.id ?? null;
  if (actual !== expectedId) {
    failures += 1;
    console.error(`FAIL query=${query} expected=${expectedId} actual=${actual}`);
  }
}

const ambiguousIpad = searchProducts(products, 'ipad air 5');
if (!ambiguousIpad.ambiguous || ambiguousIpad.candidates.length < 4) {
  failures += 1;
  console.error('FAIL ipad air 5 should return multiple close candidates');
}

const ambiguousAirPods = searchProducts(products, 'airpods pro 2');
if (!ambiguousAirPods.ambiguous || ambiguousAirPods.candidates.length < 2) {
  failures += 1;
  console.error('FAIL airpods pro 2 should surface both lightning and usb-c candidates');
}

const weakButUseful = searchProducts(products, 'iphone 13');
if (weakButUseful.candidates.length < 3) {
  failures += 1;
  console.error('FAIL broad iphone 13 query should still surface multiple variants');
}

const sample = products.find((p) => p.id === 'iphone13-128');
const markets = computeMarkets(sample);
const ranked = rankRecommendations(markets);
const suggestions = priceSuggestions(markets);

if (ranked[0].market.key !== 'yahooShopping') {
  failures += 1;
  console.error(`FAIL best-price expected=yahooAuction(actual key=yahooShopping) actual=${ranked[0].market.key}`);
}

if (!(suggestions[0].value < suggestions[1].value && suggestions[1].value < suggestions[2].value)) {
  failures += 1;
  console.error('FAIL price suggestions should be ascending');
}

const normalized = normalizeQuery('ＡｉｒＰｏｄｓ　Ｐｒｏ　第2世代 USB-C');
if (!(normalized.includes('airpods pro') && normalized.includes('第2世代') && normalized.includes('2世代') && normalized.includes('usbc'))) {
  failures += 1;
  console.error(`FAIL normalizeQuery full-width handling unexpected output=${normalized}`);
}

const specBadges = products.find((p) => p.id === 'ipad-air5-256-cellular')?.specBadges ?? [];
if (!(specBadges.includes('第5世代') && specBadges.includes('256GB') && specBadges.includes('Cellular'))) {
  failures += 1;
  console.error(`FAIL spec badges missing expected values=${specBadges.join(',')}`);
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed.`);
  process.exit(1);
}

console.log(`PASS ${cases.length + 7} assertions`);
