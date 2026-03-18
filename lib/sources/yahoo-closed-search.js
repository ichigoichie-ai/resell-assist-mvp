import fs from 'node:fs/promises';
import { normalizeModel, normalizeText } from '../core/normalize.js';

const fixturesPath = new URL('../../data/source-fixtures.json', import.meta.url);
const YAHOO_BASE_URL = 'https://auctions.yahoo.co.jp';
const DEFAULT_HEADERS = {
  'user-agent': 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'accept-language': 'ja,en-US;q=0.9,en;q=0.8'
};

function normalizePrice(text = '') {
  const digits = text.replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))];
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
      [product.series, compactModel].filter(Boolean).join(' '),
      [seriesCompact, compactModel].filter(Boolean).join(' ')
    ]);
  }

  if (product.category === 'earbuds') {
    return unique([
      [product.series, product.connectivity, compactModel].filter(Boolean).join(' '),
      [product.series, product.connectivity].filter(Boolean).join(' '),
      ['AirPods Pro 2', product.connectivity].filter(Boolean).join(' '),
      ['AirPodsPro2', product.connectivity].filter(Boolean).join(' '),
      [product.series, compactModel].filter(Boolean).join(' '),
      [compactModel].filter(Boolean).join(' ')
    ]);
  }

  return unique([
    [product.series, compactModel, product.makerModel].filter(Boolean).join(' '),
    [product.series, compactModel].filter(Boolean).join(' ')
  ]);
}

function buildFixtureQueryKeywords(product, title) {
  const keywordCandidates = buildKeywordCandidates(product);
  const matchedKeywords = keywordCandidates.filter((keyword) => includesAllKeywordParts(title, keyword));
  return matchedKeywords.length ? matchedKeywords : keywordCandidates.slice(0, 1);
}

async function readFixture(product) {
  const fixtures = JSON.parse(await fs.readFile(fixturesPath, 'utf8'));
  const rows = fixtures.yahoo_closed?.[product.id] ?? [];
  return rows.map((row, index) => ({
    sourceType: 'yahoo_closed',
    sourceItemId: `${product.id}-yahoo-${index + 1}`,
    sourceUrl: row.url,
    fetchedAt: new Date().toISOString(),
    titleRaw: row.title,
    priceJpy: row.price ?? null,
    conditionRaw: row.condition ?? 'used',
    rawPayload: {
      ...row,
      fallback: true,
      queryKeywords: buildFixtureQueryKeywords(product, row.title),
      dedupeQueryCount: buildFixtureQueryKeywords(product, row.title).length
    },
    seedProductId: product.id
  }));
}

function parseYahooRows(html, product, queryKeyword) {
  const matches = [...html.matchAll(/<a href="(https:\/\/auctions\.yahoo\.co\.jp\/jp\/auction\/[^"]+)"[^>]*title="([^"]+)"[\s\S]*?etc:p=(\d+)/g)];
  const rows = matches.map((match, index) => ({
    sourceType: 'yahoo_closed',
    sourceItemId: `${product.id}-yahoo-${index + 1}`,
    sourceUrl: match[1].replace(/&amp;/g, '&'),
    fetchedAt: new Date().toISOString(),
    titleRaw: match[2].replace(/&amp;/g, '&').trim(),
    priceJpy: normalizePrice(match[3]),
    conditionRaw: 'used',
    rawPayload: { provider: 'yahoo-live', queryKeyword, queryKeywords: [queryKeyword] },
    seedProductId: product.id
  }));

  return rows.filter((row) => Number.isFinite(row.priceJpy)).slice(0, 30);
}

function shouldFallback(html, rows) {
  return rows.length === 0 || html.includes('一致する商品はありません');
}

async function fetchKeywordRows(product, keyword) {
  const url = new URL('/closedsearch/closedsearch', YAHOO_BASE_URL);
  url.searchParams.set('p', keyword);
  url.searchParams.set('va', keyword);
  url.searchParams.set('b', '1');
  url.searchParams.set('n', '50');

  const response = await fetch(url, { headers: DEFAULT_HEADERS });
  if (!response.ok) throw new Error(`yahoo status=${response.status}`);
  const html = await response.text();
  const rows = parseYahooRows(html, product, keyword);
  return { html, rows };
}

function buildYahooDedupKey(row) {
  const normalizedTitle = normalizeText(row.titleRaw);
  const compactTitle = normalizeModel(row.titleRaw);
  const compactPrice = row.priceJpy ?? 'na';
  return row.sourceUrl || `${compactTitle}:${normalizedTitle}:${compactPrice}`;
}

function scoreYahooRow(product, row) {
  const normalizedTitle = normalizeText(row.titleRaw);
  const compactTitle = normalizeModel(row.titleRaw);
  let score = 0;

  const keywordHits = [product.series, product.storage, product.connectivity]
    .filter(Boolean)
    .filter((keyword) => normalizedTitle.includes(normalizeText(keyword))).length;
  score += keywordHits * 20;

  const preferredHits = (product.preferredKeywords ?? [])
    .filter((keyword) => normalizedTitle.includes(normalizeText(keyword))).length;
  score += preferredHits * 12;

  const requiredHits = (product.requiredKeywords ?? [])
    .filter((keyword) => normalizedTitle.includes(normalizeText(keyword))).length;
  score += requiredHits * 18;

  const canonical = normalizeModel(product.canonicalModel ?? '');
  if (canonical && compactTitle.includes(canonical)) score += 35;

  const excludes = (product.excludeKeywords ?? []).some((keyword) => normalizedTitle.includes(normalizeText(keyword)));
  if (excludes) score -= 80;

  if (normalizedTitle.includes(normalizeText('本体のみ'))) score -= 12;
  if (normalizedTitle.includes(normalizeText('ケースのみ'))) score -= 30;
  if (normalizedTitle.includes(normalizeText('右耳')) || normalizedTitle.includes(normalizeText('左耳'))) score -= 40;

  return score;
}

function summarizeYahooDebug(product, rows = [], includedRows = [], excludedRows = []) {
  const keywordCandidates = buildKeywordCandidates(product);
  const effectiveRows = rows.filter((row) => {
    if (product.category === 'earbuds' && row.matchedCandidateProductId && row.matchedCandidateProductId !== product.id) return false;
    return true;
  });
  const queryStats = keywordCandidates.map((keyword) => {
    const matching = effectiveRows.filter((row) => {
      const queryKeywords = unique(row.rawPayload?.queryKeywords ?? [row.rawPayload?.queryKeyword]);
      return queryKeywords.includes(keyword) || includesAllKeywordParts(row.titleRaw, keyword);
    });

    const strictPassed = matching.filter((row) => includedRows.some((included) => included.sourceUrl === row.sourceUrl || included.titleRaw === row.titleRaw)).length;
    return {
      keyword,
      hitCount: matching.length,
      strictPassCount: strictPassed
    };
  }).filter((entry) => entry.hitCount > 0);

  const dedupedCount = effectiveRows.length;
  const strictPassedCount = includedRows.length;
  const strictRejectedCount = excludedRows.filter((row) => row.sourceType === 'yahoo_closed').length;
  const strictPassRate = dedupedCount > 0 ? Number((strictPassedCount / dedupedCount).toFixed(2)) : 0;

  return {
    queryStats,
    dedupedCount,
    strictPassedCount,
    strictRejectedCount,
    strictPassRate
  };
}

function dedupeYahooRows(product, rows) {
  const merged = new Map();

  for (const row of rows) {
    const key = buildYahooDedupKey(row);
    const score = scoreYahooRow(product, row);
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
    .slice(0, 40)
    .map((row, index) => ({ ...row, sourceItemId: `${product.id}-yahoo-${index + 1}` }));
}

export async function fetchYahooClosedSearch(product) {
  if (process.env.RESALE_USE_LIVE_FETCH !== '1') return readFixture(product);

  try {
    const keywordCandidates = buildKeywordCandidates(product);
    const unionRows = [];
    let anyUseful = false;

    for (const keyword of keywordCandidates) {
      const { html, rows } = await fetchKeywordRows(product, keyword);
      if (!shouldFallback(html, rows)) anyUseful = true;
      unionRows.push(...rows);
    }

    if (!anyUseful || unionRows.length === 0) {
      throw new Error('yahoo fallback exhausted');
    }

    return dedupeYahooRows(product, unionRows);
  } catch {
    return readFixture(product);
  }
}

export { buildKeywordCandidates, dedupeYahooRows, scoreYahooRow, summarizeYahooDebug };
