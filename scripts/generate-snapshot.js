import fs from 'node:fs/promises';
import { normalizeText } from '../lib/core/normalize.js';
import { matchProduct } from '../lib/core/match-product.js';
import { classifyItem } from '../lib/core/classify-item.js';
import { buildSnapshot } from '../lib/core/aggregate-prices.js';
import { fetchJanparaBuyback } from '../lib/sources/janpara-buyback.js';
import { fetchYahooClosedSearch, summarizeYahooDebug } from '../lib/sources/yahoo-closed-search.js';
import { fetchRakumaSearch } from '../lib/sources/rakuma-search.js';

const root = new URL('../', import.meta.url);
const products = JSON.parse(await fs.readFile(new URL('../data/products-snapshot.json', import.meta.url), 'utf8'));
const rules = JSON.parse(await fs.readFile(new URL('../data/noise-rules.json', import.meta.url), 'utf8'));

async function normalizeAndClassify(sourceItems) {
  return sourceItems.map((item) => {
    const matched = matchProduct(products, item.titleRaw);
    const fallbackProductId = item.seedProductId ?? null;
    const matchedProductId = fallbackProductId ?? matched.matchedProductId ?? null;
    const product = products.find((p) => p.id === matchedProductId) ?? null;
    const classified = classifyItem({
      title: item.titleRaw,
      product,
      rules,
      sourceType: item.sourceType,
      conditionRaw: item.conditionRaw
    });

    return {
      ...item,
      normalizedTitle: normalizeText(item.titleRaw),
      matchedProductId,
      matchedCandidateProductId: matched.matchedProductId ?? null,
      matchScore: matched.matchedProductId ? matched.matchScore : Math.max(matched.matchScore, 0.56),
      matchCandidates: matched.candidates,
      ...classified
    };
  });
}

const allSourceItems = [];
for (const product of products) {
  allSourceItems.push(...await fetchJanparaBuyback(product));
  allSourceItems.push(...await fetchYahooClosedSearch(product));
  allSourceItems.push(...await fetchRakumaSearch(product));
}

const normalizedItems = await normalizeAndClassify(allSourceItems);

const groupedByProduct = Object.fromEntries(products.map((product) => [product.id, {
  janpara_buyback: [],
  yahoo_closed: [],
  rakuma: [],
  excluded: [],
  yahoo_debug: null
}]));

for (const item of normalizedItems) {
  if (!item.matchedProductId || !groupedByProduct[item.matchedProductId]) continue;
  if (item.isNoise) {
    groupedByProduct[item.matchedProductId].excluded.push(item);
    continue;
  }
  groupedByProduct[item.matchedProductId][item.sourceType].push(item);
}

for (const product of products) {
  const group = groupedByProduct[product.id];
  const yahooObserved = normalizedItems.filter((item) => item.sourceType === 'yahoo_closed' && item.matchedProductId === product.id);
  group.yahoo_debug = summarizeYahooDebug(product, yahooObserved, group.yahoo_closed, group.excluded);
}

const snapshots = products.map((product) => buildSnapshot(product, groupedByProduct[product.id]));

const output = {
  generatedAt: new Date().toISOString(),
  products: products.map((product) => ({
    id: product.id,
    displayName: product.displayName,
    category: product.category,
    canonicalModel: product.canonicalModel
  })),
  normalizedItemCount: normalizedItems.length,
  includedItemCount: normalizedItems.filter((item) => !item.isNoise).length,
  excludedItemCount: normalizedItems.filter((item) => item.isNoise).length,
  snapshots,
  debug: {
    normalizedItems
  }
};

await fs.writeFile(new URL('../output/price-snapshots.json', import.meta.url), JSON.stringify(output, null, 2));
console.log(`Generated ${snapshots.length} snapshots -> ${new URL('../output/price-snapshots.json', import.meta.url).pathname}`);
