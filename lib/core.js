export const marketLabels = {
  yahooShopping: 'Yahooオークション',
  rakuma: 'ラクマ',
  buyback: '買取サービス'
};

export const marketSourceLabels = {
  yahooShopping: '参考価格: Yahooオークション落札相場ベース',
  rakuma: '参考価格: C2C出品価格ベース',
  buyback: '参考価格: 公開買取価格ベース'
};

export const speedLabels = { fast: '売れる速度: 速い', medium: '売れる速度: 普通', slow: '売れる速度: 遅め' };
export const effortLabels = { low: '手間: 少ない', medium: '手間: 普通', high: '手間: 多い' };

const STORAGE_SYNONYMS = [
  ['128gb', '128 gb'],
  ['256gb', '256 gb'],
  ['512gb', '512 gb'],
  ['1tb', '1000gb']
];

const COMMON_SYNONYMS = [
  ['第2世代', '2世代'],
  ['第5世代', '5世代'],
  ['有機el', 'oled'],
  ['wi-fi', 'wifi'],
  ['セルラー', 'cellular'],
  ['simフリー', 'sim free'],
  ['usb-c', 'usbc'],
  ['デジタルエディション', 'digital'],
  ['ディスクドライブ', 'disc']
];

const LIGHT_TOKENS = new Set(['apple', 'nintendo', 'sony', 'sim', 'free', 'wifi', 'wi-fi', 'cellular', 'gps']);

export function normalizeQuery(input = '') {
  let text = input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[()（）\[\]【】]/g, ' ')
    .replace(/[+＋]/g, ' plus ')
    .replace(/[‐‑–—]/g, '-')
    .replace(/\bgb\b/g, 'gb')
    .replace(/\bmm\b/g, 'mm')
    .replace(/[^\p{Letter}\p{Number}\s.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [a, b] of [...STORAGE_SYNONYMS, ...COMMON_SYNONYMS]) {
    if (text.includes(a)) text += ` ${b}`;
    if (text.includes(b)) text += ` ${a}`;
  }

  text = text
    .replace(/iphone\s*/g, 'iphone ')
    .replace(/ipad\s*/g, 'ipad ')
    .replace(/airpods\s*/g, 'airpods ')
    .replace(/switch\s*/g, 'switch ')
    .replace(/ps5\s*/g, 'ps5 ')
    .replace(/apple\s*watch/g, 'apple watch')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

function tokenWeight(token) {
  if (!token) return 0;
  if (LIGHT_TOKENS.has(token)) return 5;
  if (/^(\d+gb|\d+mm|cfi-?\d+[a-z]?|m\d|a\d+|第\d+世代|\d+世代)$/i.test(token)) return 18;
  if (/^\d+$/.test(token)) return 10;
  if (token.length <= 2) return 4;
  if (token.length <= 4) return 8;
  return 12;
}

export function collectSpecBadges(product) {
  const preferredOrder = ['generation', 'storage', 'connectivity', 'size', 'edition', 'model', 'chip', 'color'];
  const entries = Object.entries(product.specs ?? {});
  const sorted = entries.sort((a, b) => preferredOrder.indexOf(a[0]) - preferredOrder.indexOf(b[0]));
  return sorted.map(([, value]) => value).filter(Boolean);
}

export function buildSearchIndex(product) {
  const specValues = Object.values(product.specs ?? {});
  const parts = [
    product.name,
    product.series,
    ...(product.aliases ?? []),
    ...(product.searchTokens ?? []),
    ...(product.titleKeywords ?? []),
    ...specValues
  ];

  const normalizedStrings = [...new Set(parts.map((part) => normalizeQuery(part)).filter(Boolean))];
  const tokenSet = new Set(normalizedStrings.flatMap((text) => text.split(' ').filter(Boolean)));

  return {
    ...product,
    specBadges: collectSpecBadges(product),
    normalizedStrings,
    tokenSet: [...tokenSet]
  };
}

function scoreProduct(product, normalizedQuery, queryTokens) {
  let score = 0;
  const queryJoined = queryTokens.join(' ');

  for (const candidate of product.normalizedStrings) {
    if (candidate === normalizedQuery) score = Math.max(score, 140);
    else if (candidate.startsWith(normalizedQuery) || normalizedQuery.startsWith(candidate)) score = Math.max(score, 110);
    else if (candidate.includes(normalizedQuery) || normalizedQuery.includes(candidate)) score = Math.max(score, 92);
  }

  let tokenHits = 0;
  let strongHits = 0;
  let weightedHits = 0;

  for (const token of queryTokens) {
    const exactHit = product.tokenSet.includes(token);
    const partialHit = !exactHit && product.tokenSet.some((candidateToken) => candidateToken.includes(token) || token.includes(candidateToken));

    if (exactHit || partialHit) {
      tokenHits += 1;
      const weight = tokenWeight(token);
      weightedHits += exactHit ? weight : Math.round(weight * 0.55);
      if (weight >= 10) strongHits += 1;
    }
  }

  score += weightedHits;

  if (queryTokens.length > 1 && tokenHits === queryTokens.length) score += 20;
  if (queryTokens.length > 1 && strongHits >= Math.max(1, queryTokens.length - 1)) score += 12;
  if (queryJoined && product.normalizedStrings.some((candidate) => candidate.includes(queryJoined))) score += 8;
  if (product.category && normalizedQuery.includes(normalizeQuery(product.category))) score += 5;

  return { score, tokenHits, strongHits };
}

export function searchProducts(products, query, { limit = 5 } = {}) {
  const normalizedQuery = normalizeQuery(query);
  if (!normalizedQuery) return { normalizedQuery, best: null, candidates: [], ambiguous: false };

  const queryTokens = normalizedQuery.split(' ').filter(Boolean);
  const ranked = products
    .map((product) => {
      const item = product.normalizedStrings ? product : buildSearchIndex(product);
      return { product: item, ...scoreProduct(item, normalizedQuery, queryTokens) };
    })
    .filter((entry) => entry.score >= 18 && entry.tokenHits > 0)
    .sort((a, b) => b.score - a.score);

  const candidates = ranked.slice(0, limit);
  const best = candidates[0] ?? null;
  const second = candidates[1] ?? null;
  const hasSpecificVariantToken = queryTokens.some((token) => /^(\d+gb|\d+mm|wifi|wi-fi|cellular|セルラー|gps|cfi-?\d+[a-z]?|第\d+世代|\d+世代|mini|usb-c|usbc|digital|disc)$/i.test(token));
  const ambiguous = Boolean(
    best && second &&
    second.score >= best.score - (hasSpecificVariantToken ? 10 : 35) &&
    second.strongHits >= Math.max(1, best.strongHits - 1)
  );

  return { normalizedQuery, best, candidates, ambiguous };
}

export function findProduct(products, query) {
  return searchProducts(products, query).best?.product ?? null;
}

export function computeMarkets(product) {
  return Object.entries(product.market).map(([key, market]) => {
    const avg = (market.min + market.max) / 2;
    const fee = avg * market.feeRate;
    const net = avg - fee - market.shipping;
    return { key, ...market, avg, fee, net };
  });
}

function scoreSpeed(speed) {
  return speed === 'fast' ? 3 : speed === 'medium' ? 2 : 1;
}

function scoreEffort(effort) {
  return effort === 'low' ? 1 : effort === 'medium' ? 2 : 3;
}

export function rankRecommendations(markets) {
  const bestPrice = [...markets].sort((a, b) => b.net - a.net)[0];
  const fastest = [...markets].sort((a, b) => scoreSpeed(b.speed) - scoreSpeed(a.speed))[0];
  const easiest = [...markets].sort((a, b) => scoreEffort(a.effort) - scoreEffort(b.effort))[0];

  return [
    { title: '高く売りたい', market: bestPrice, reason: '手数料と送料を引いた手取り想定がいちばん高い' },
    { title: '早く売りたい', market: fastest, reason: '流動性が高く、売却スピード重視向き' },
    { title: '手間を減らしたい', market: easiest, reason: '出品や交渉の手間が少ない' }
  ];
}

export function priceSuggestions(markets) {
  const avgNet = markets.reduce((sum, m) => sum + m.net, 0) / markets.length;
  const quick = Math.round(avgNet * 0.92 / 100) * 100;
  const normal = Math.round(avgNet / 100) * 100;
  const strong = Math.round(avgNet * 1.08 / 100) * 100;

  return [
    { label: '早売れ価格', value: quick, note: 'すぐ売りたい時向け' },
    { label: '標準価格', value: normal, note: 'まずはここから' },
    { label: '強気価格', value: strong, note: '状態が良いなら試す' }
  ];
}
