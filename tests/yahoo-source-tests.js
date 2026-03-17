import { buildKeywordCandidates, dedupeYahooRows, scoreYahooRow } from '../lib/sources/yahoo-closed-search.js';
import fs from 'node:fs/promises';

const products = JSON.parse(await fs.readFile(new URL('../data/products-snapshot.json', import.meta.url), 'utf8'));

const iphone = products.find((item) => item.id === 'iphone13-128');
const airpods = products.find((item) => item.id === 'airpodspro2-usbc');

let failures = 0;

const iphoneKeywords = buildKeywordCandidates(iphone);
if (!(iphoneKeywords.length >= 4 && iphoneKeywords.some((item) => item.includes('iPhone13 128GB')))) {
  failures += 1;
  console.error(`FAIL iphone keyword expansion unexpected=${JSON.stringify(iphoneKeywords)}`);
}

const airpodsKeywords = buildKeywordCandidates(airpods);
if (!(airpodsKeywords.length >= 4 && airpodsKeywords.some((item) => item === 'AirPods Pro 2 USB-C') && airpodsKeywords.some((item) => item === 'MTJV3J/A'))) {
  failures += 1;
  console.error(`FAIL airpods keyword expansion unexpected=${JSON.stringify(airpodsKeywords)}`);
}

const duplicateRows = dedupeYahooRows(iphone, [
  {
    sourceType: 'yahoo_closed',
    sourceItemId: 'a',
    sourceUrl: 'https://example.com/a',
    titleRaw: 'iPhone 13 128GB SIMフリー MLIH3J/A',
    priceJpy: 50000,
    rawPayload: { queryKeyword: 'iPhone 13 128GB SIMフリー', queryKeywords: ['iPhone 13 128GB SIMフリー'] }
  },
  {
    sourceType: 'yahoo_closed',
    sourceItemId: 'b',
    sourceUrl: 'https://example.com/a',
    titleRaw: 'iPhone13 128GB MLIH3J/A',
    priceJpy: 50000,
    rawPayload: { queryKeyword: 'iPhone13 128GB', queryKeywords: ['iPhone13 128GB'] }
  }
]);

if (!(duplicateRows.length === 1 && duplicateRows[0].rawPayload.queryKeywords.length === 2)) {
  failures += 1;
  console.error(`FAIL dedupe should union query keywords actual=${JSON.stringify(duplicateRows)}`);
}

const strongScore = scoreYahooRow(airpods, {
  titleRaw: 'AirPods Pro 第2世代 USB-C MTJV3J/A 付属品あり',
  priceJpy: 19800,
  sourceUrl: 'https://example.com/1'
});
const weakScore = scoreYahooRow(airpods, {
  titleRaw: 'AirPods Pro 第2世代 ケースのみ USB-C',
  priceJpy: 4900,
  sourceUrl: 'https://example.com/2'
});

if (!(strongScore > weakScore && weakScore < 0)) {
  failures += 1;
  console.error(`FAIL row scoring should demote partial/noisy titles strong=${strongScore} weak=${weakScore}`);
}

if (failures > 0) {
  console.error(`\n${failures} yahoo source test(s) failed.`);
  process.exit(1);
}

console.log('PASS yahoo source assertions');
