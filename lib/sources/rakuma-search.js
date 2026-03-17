import fs from 'node:fs/promises';
import { normalizeText } from '../core/normalize.js';

const fixturesPath = new URL('../../data/source-fixtures.json', import.meta.url);
const RAKUMA_BASE_URL = 'https://fril.jp';
const DEFAULT_HEADERS = {
  'user-agent': 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'accept-language': 'ja,en-US;q=0.9,en;q=0.8'
};

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
}

function normalizePrice(text = '') {
  const digits = String(text).replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

function includesAllKeywordParts(title = '', keyword = '') {
  const normalizedTitle = normalizeText(title);
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) return false;
  return normalizedKeyword.split(' ').filter(Boolean).every((part) => normalizedTitle.includes(part));
}

function buildKeywordCandidates(product) {
  const compactModel = product.canonicalModel ?? null;
  const seriesCompact = product.series?.replace(/\s+/g, '') ?? null;

  if (product.category === 'smartphone') {
    return unique([
      [product.series, product.storage, product.connectivity].filter(Boolean).join(' '),
      [product.series, product.storage].filter(Boolean).join(' '),
      [seriesCompact, product.storage, product.connectivity].filter(Boolean).join(' '),
      [seriesCompact, product.storage].filter(Boolean).join(' '),
      [product.series, compactModel].filter(Boolean).join(' ')
    ]);
  }

  if (product.category === 'earbuds') {
    return unique([
      [product.series, product.connectivity].filter(Boolean).join(' '),
      [product.series, compactModel].filter(Boolean).join(' '),
      [compactModel].filter(Boolean).join(' ')
    ]);
  }

  return unique([
    [product.series, product.storage, product.connectivity].filter(Boolean).join(' '),
    [product.series, compactModel].filter(Boolean).join(' '),
    [product.series, product.color].filter(Boolean).join(' ')
  ]);
}

async function readFixture(product) {
  const fixtures = JSON.parse(await fs.readFile(fixturesPath, 'utf8'));
  const rows = fixtures.rakuma?.[product.id] ?? [];
  return rows.map((row, index) => ({
    sourceType: 'rakuma',
    sourceItemId: `${product.id}-rakuma-${index + 1}`,
    sourceUrl: row.url,
    fetchedAt: new Date().toISOString(),
    titleRaw: row.title,
    priceJpy: row.price ?? null,
    conditionRaw: 'listing',
    rawPayload: { ...row, fallback: true },
    seedProductId: product.id
  }));
}

function parseRakumaRows(html, product, queryKeyword) {
  const blocks = [...html.matchAll(/<div class="item-box">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g)].map((match) => match[1]);
  const rows = blocks
    .map((block, index) => {
      const href = block.match(/<a href="([^"]+)" class="link_search_image"/)?.[1] ?? null;
      const title = block.match(/data-rat-item_name="([^"]+)"/)?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim() ?? null;
      const price = normalizePrice(block.match(/data-rat-price="([^"]+)"/)?.[1] ?? '');
      if (!title || !price || !href) return null;
      return {
        sourceType: 'rakuma',
        sourceItemId: `${product.id}-rakuma-${index + 1}`,
        sourceUrl: new URL(href, RAKUMA_BASE_URL).toString(),
        fetchedAt: new Date().toISOString(),
        titleRaw: title,
        priceJpy: price,
        conditionRaw: 'listing',
        rawPayload: { provider: 'rakuma-live', queryKeyword, queryKeywords: [queryKeyword] },
        seedProductId: product.id
      };
    })
    .filter(Boolean);

  return rows.slice(0, 40);
}

function scoreRakumaRow(product, row) {
  const normalizedTitle = normalizeText(row.titleRaw);
  let score = 0;

  const keywordHits = [product.series, product.storage, product.connectivity, product.color]
    .filter(Boolean)
    .filter((keyword) => normalizedTitle.includes(normalizeText(keyword))).length;
  score += keywordHits * 18;

  const preferredHits = (product.preferredKeywords ?? [])
    .filter((keyword) => normalizedTitle.includes(normalizeText(keyword))).length;
  score += preferredHits * 10;

  const requiredHits = (product.requiredKeywords ?? [])
    .filter((keyword) => normalizedTitle.includes(normalizeText(keyword))).length;
  score += requiredHits * 16;

  const excludes = (product.excludeKeywords ?? [])
    .some((keyword) => normalizedTitle.includes(normalizeText(keyword)));
  if (excludes) score -= 80;

  if (normalizedTitle.includes(normalizeText('ケースのみ'))) score -= 40;
  if (normalizedTitle.includes(normalizeText('本体のみ'))) score -= 10;
  if (normalizedTitle.includes(normalizeText('左耳')) || normalizedTitle.includes(normalizeText('右耳'))) score -= 35;

  return score;
}

function dedupeRakumaRows(product, rows) {
  const merged = new Map();

  for (const row of rows) {
    const key = row.sourceUrl || `${normalizeText(row.titleRaw)}:${row.priceJpy ?? 'na'}`;
    const score = scoreRakumaRow(product, row);
    const existing = merged.get(key);

    if (!existing) {
      merged.set(key, {
        ...row,
        rawPayload: {
          ...row.rawPayload,
          candidateScore: score,
          queryKeywords: unique(row.rawPayload?.queryKeywords ?? [row.rawPayload?.queryKeyword])
        }
      });
      continue;
    }

    const existingScore = existing.rawPayload?.candidateScore ?? -Infinity;
    const queryKeywords = unique([
      ...(existing.rawPayload?.queryKeywords ?? []),
      ...(row.rawPayload?.queryKeywords ?? []),
      row.rawPayload?.queryKeyword
    ]);

    const preferred = score > existingScore ? row : existing;
    merged.set(key, {
      ...preferred,
      rawPayload: {
        ...(preferred.rawPayload ?? {}),
        candidateScore: Math.max(score, existingScore),
        queryKeywords,
        dedupMergedCount: queryKeywords.length
      }
    });
  }

  return [...merged.values()]
    .sort((a, b) => (b.rawPayload?.candidateScore ?? 0) - (a.rawPayload?.candidateScore ?? 0) || (b.priceJpy ?? 0) - (a.priceJpy ?? 0))
    .slice(0, 30)
    .map((row, index) => ({ ...row, sourceItemId: `${product.id}-rakuma-${index + 1}` }));
}

async function fetchKeywordRows(product, keyword) {
  const url = new URL('/s', RAKUMA_BASE_URL);
  url.searchParams.set('query', keyword);
  url.searchParams.set('sort', 'relevance');
  url.searchParams.set('order', 'desc');

  const response = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!response.ok) throw new Error(`rakuma status=${response.status}`);
  const html = await response.text();
  const rows = parseRakumaRows(html, product, keyword);
  return { html, rows };
}

export async function fetchRakumaSearch(product) {
  if (process.env.RESALE_USE_LIVE_FETCH !== '1') return readFixture(product);

  try {
    const keywordCandidates = buildKeywordCandidates(product);
    const unionRows = [];
    let anyUseful = false;

    for (const keyword of keywordCandidates) {
      const { html, rows } = await fetchKeywordRows(product, keyword);
      if (!html.includes('検索キーワードが空欄です') && rows.length > 0) anyUseful = true;
      unionRows.push(...rows);
    }

    const deduped = dedupeRakumaRows(product, unionRows);
    const filtered = deduped.filter((row) => {
      const candidateKeywords = unique(row.rawPayload?.queryKeywords ?? [row.rawPayload?.queryKeyword]);
      return candidateKeywords.some((keyword) => includesAllKeywordParts(row.titleRaw, keyword)) || (row.rawPayload?.candidateScore ?? 0) >= 20;
    });

    if (!anyUseful || filtered.length === 0) throw new Error('rakuma fallback exhausted');
    return filtered;
  } catch {
    return readFixture(product);
  }
}

export { buildKeywordCandidates, dedupeRakumaRows, parseRakumaRows, scoreRakumaRow };
