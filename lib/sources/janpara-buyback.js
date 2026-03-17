import fs from 'node:fs/promises';

const fixturesPath = new URL('../../data/source-fixtures.json', import.meta.url);
const JANPARA_BASE_URL = 'https://buy.janpara.co.jp';
const DEFAULT_HEADERS = {
  'user-agent': 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'accept-language': 'ja,en-US;q=0.9,en;q=0.8'
};

function normalizePrice(text = '') {
  const digits = String(text).replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

function buildKeywordCandidates(product) {
  const candidates = [
    [product.series, product.storage, product.connectivity, product.canonicalModel].filter(Boolean).join(' '),
    [product.series, product.storage, product.connectivity].filter(Boolean).join(' '),
    [product.series, product.storage].filter(Boolean).join(' '),
    [product.series, product.canonicalModel].filter(Boolean).join(' '),
    [product.series, product.makerModel].filter(Boolean).join(' '),
    [product.series, product.color].filter(Boolean).join(' '),
    [product.series].filter(Boolean).join(' ')
  ].filter(Boolean);

  return [...new Set(candidates)];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readFixture(product) {
  const fixtures = JSON.parse(await fs.readFile(fixturesPath, 'utf8'));
  const rows = fixtures.janpara_buyback?.[product.id] ?? [];
  return rows.map((row, index) => ({
    sourceType: 'janpara_buyback',
    sourceItemId: `${product.id}-janpara-${index + 1}`,
    sourceUrl: row.url,
    fetchedAt: new Date().toISOString(),
    titleRaw: row.title,
    priceJpyUnused: row.unusedPrice ?? null,
    priceJpyUsedMax: row.usedMax ?? null,
    rawPayload: { ...row, fallback: true },
    seedProductId: product.id
  }));
}

function parseJanparaRows(html, product) {
  const rows = [...html.matchAll(/<p class="tit">([\s\S]*?)<\/p>[\s\S]*?<div class="used_wrap">([\s\S]*?)<\/div>\s*<div class="btn-container">([\s\S]*?)<\/div>/g)]
    .map((match, index) => {
      const title = match[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() ?? null;
      const pricingBlock = match[2] ?? '';
      const detailBlock = match[3] ?? '';
      const unusedPrice = normalizePrice(pricingBlock.match(/<div class="unused">[\s\S]*?<p class="price(?: gray)?">([^<]+)<\/p>/)?.[1] ?? '');
      const usedMax = normalizePrice(pricingBlock.match(/<div class="used">[\s\S]*?<p class="price(?: gray)?">([^<]+)<\/p>/)?.[1] ?? '');
      const detailPath = detailBlock.match(/<p class="detail"><a href="([^"]+)"/)?.[1] ?? null;
      if (!title || (!unusedPrice && !usedMax)) return null;
      return {
        sourceType: 'janpara_buyback',
        sourceItemId: `${product.id}-janpara-${index + 1}`,
        sourceUrl: detailPath ? new URL(detailPath, JANPARA_BASE_URL).toString() : null,
        fetchedAt: new Date().toISOString(),
        titleRaw: title,
        priceJpyUnused: unusedPrice,
        priceJpyUsedMax: usedMax,
        rawPayload: { detailPath, provider: 'janpara-live' },
        seedProductId: product.id
      };
    })
    .filter(Boolean);

  return rows.slice(0, 5);
}

async function fetchSearch(keyword) {
  const url = new URL('/buy/search', JANPARA_BASE_URL);
  url.searchParams.set('keyword', keyword);

  const response = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!response.ok) throw new Error(`janpara status=${response.status}`);
  return response.text();
}

export async function fetchJanparaBuyback(product) {
  if (process.env.RESALE_USE_LIVE_FETCH !== '1') return readFixture(product);

  const keywords = buildKeywordCandidates(product);

  try {
    for (const keyword of keywords) {
      await sleep(1200);
      const html = await fetchSearch(keyword);
      const rows = parseJanparaRows(html, product);
      if (rows.length > 0) return rows.map((row) => ({
        ...row,
        rawPayload: { ...(row.rawPayload ?? {}), queryKeyword: keyword }
      }));
    }
    throw new Error('janpara parse returned 0 rows');
  } catch {
    return readFixture(product);
  }
}

export { buildKeywordCandidates, parseJanparaRows };
