import { normalizeModel, normalizeText } from './normalize.js';

function includesAllNeedles(haystack, needles) {
  return needles.filter(Boolean).every((needle) => haystack.includes(normalizeText(needle)));
}

function hasKeyword(normalizedTitle, keyword = '') {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) return false;
  return normalizedKeyword.split(' ').filter(Boolean).every((part) => normalizedTitle.includes(part));
}

function scoreVariantPenalty(product, normalizedTitle) {
  if (product.category !== 'smartphone' || !hasKeyword(normalizedTitle, 'iphone')) return 0;

  const normalizedSeries = normalizeText(product.series ?? '');
  const expectsMini = hasKeyword(normalizedSeries, 'mini');
  const expectsPlus = hasKeyword(normalizedSeries, 'plus');
  const expectsProMax = hasKeyword(normalizedSeries, 'pro max') || hasKeyword(normalizedSeries, 'promax');
  const expectsPro = hasKeyword(normalizedSeries, 'pro');

  let penalty = 0;
  if (!expectsMini && hasKeyword(normalizedTitle, 'mini')) penalty -= 0.45;
  if (!expectsPlus && hasKeyword(normalizedTitle, 'plus')) penalty -= 0.45;
  if (!expectsProMax && (hasKeyword(normalizedTitle, 'pro max') || hasKeyword(normalizedTitle, 'promax'))) penalty -= 0.55;
  if (!expectsPro && hasKeyword(normalizedTitle, 'pro') && !hasKeyword(normalizedTitle, 'pro max') && !hasKeyword(normalizedTitle, 'promax')) penalty -= 0.45;
  if (['ケース', 'カバー', 'フィルム', '保護フィルム', 'ガラスフィルム', '手帳型'].some((keyword) => hasKeyword(normalizedTitle, keyword))) penalty -= 0.6;

  return penalty;
}

export function matchProduct(products, rawTitle) {
  const normalizedTitle = normalizeText(rawTitle);
  const compactTitle = normalizeModel(rawTitle);

  const ranked = products.map((product) => {
    let score = 0;

    const canonical = normalizeModel(product.canonicalModel ?? '');
    if (canonical && compactTitle.includes(canonical)) score += 0.55;

    if (product.series && normalizedTitle.includes(normalizeText(product.series))) score += 0.2;
    if (product.storage && normalizedTitle.includes(normalizeText(product.storage))) score += 0.1;
    if (product.connectivity && normalizedTitle.includes(normalizeText(product.connectivity))) score += 0.1;
    if (product.color && normalizedTitle.includes(normalizeText(product.color))) score += 0.05;
    if (product.searchKeywords?.length && includesAllNeedles(normalizedTitle, [product.searchKeywords[0]])) score += 0.08;

    const aliasHit = (product.searchKeywords ?? []).some((keyword) => hasKeyword(normalizedTitle, keyword))
      || (product.requiredKeywords ?? []).some((keyword) => hasKeyword(normalizedTitle, keyword));
    if (aliasHit) score += 0.14;

    score += scoreVariantPenalty(product, normalizedTitle);

    return { productId: product.id, score: Number(score.toFixed(2)) };
  }).sort((a, b) => b.score - a.score);

  const best = ranked[0] ?? { productId: null, score: 0 };
  return {
    matchedProductId: best.score >= 0.5 ? best.productId : null,
    matchScore: best.score,
    candidates: ranked.slice(0, 3)
  };
}
