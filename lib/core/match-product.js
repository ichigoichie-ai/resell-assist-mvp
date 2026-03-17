import { normalizeModel, normalizeText } from './normalize.js';

function includesAllNeedles(haystack, needles) {
  return needles.filter(Boolean).every((needle) => haystack.includes(normalizeText(needle)));
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

    return { productId: product.id, score: Number(score.toFixed(2)) };
  }).sort((a, b) => b.score - a.score);

  const best = ranked[0] ?? { productId: null, score: 0 };
  return {
    matchedProductId: best.score >= 0.55 ? best.productId : null,
    matchScore: best.score,
    candidates: ranked.slice(0, 3)
  };
}
