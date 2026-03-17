function sortNumbers(values = []) {
  return [...values].filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  if (low === high) return sorted[low];
  const weight = index - low;
  return Math.round(sorted[low] * (1 - weight) + sorted[high] * weight);
}

function median(sorted) {
  return percentile(sorted, 0.5);
}

function trimmedMean(sorted, trimRate = 0.1) {
  if (!sorted.length) return null;
  const trimCount = Math.floor(sorted.length * trimRate);
  const trimmed = sorted.slice(trimCount, sorted.length - trimCount || sorted.length);
  return Math.round(trimmed.reduce((sum, value) => sum + value, 0) / trimmed.length);
}

export function summarizePrices(values = []) {
  const sorted = sortNumbers(values);
  return {
    count: sorted.length,
    min: sorted[0] ?? null,
    max: sorted.at(-1) ?? null,
    median: median(sorted),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    trimmedMean: trimmedMean(sorted)
  };
}

function summarizeSourceMode(items = [], priceKey = null) {
  const live = items.filter((item) => !item.rawPayload?.fallback);
  const fallback = items.filter((item) => item.rawPayload?.fallback);
  const priced = priceKey
    ? items.filter((item) => Number.isFinite(item[priceKey]))
    : items;

  return {
    total: items.length,
    live: live.length,
    fallback: fallback.length,
    priced: priced.length,
    mode: live.length > 0 ? (fallback.length > 0 ? 'mixed' : 'live') : (fallback.length > 0 ? 'fallback' : 'none')
  };
}

export function buildSnapshot(product, grouped) {
  const yahooItems = grouped.yahoo_closed ?? [];
  const yahooSummary = summarizePrices(yahooItems.map((item) => item.priceJpy));
  const rakumaItems = grouped.rakuma ?? [];
  const rakumaSummary = summarizePrices(rakumaItems.map((item) => item.priceJpy));
  const janparaItems = grouped.janpara_buyback ?? [];
  const janpara = janparaItems[0] ?? null;

  const quickSaleCandidates = [janpara?.priceJpyUsedMax, yahooSummary.p25].filter(Number.isFinite);
  const quickSale = quickSaleCandidates.length ? Math.max(...quickSaleCandidates) : null;
  const standard = yahooSummary.median ?? rakumaSummary.median ?? janpara?.priceJpyUsedMax ?? null;
  const aggressive = yahooSummary.p75 ?? yahooSummary.max ?? rakumaSummary.p75 ?? null;

  const excludedItems = grouped.excluded ?? [];
  const totalYahooObserved = yahooItems.length + excludedItems.filter((item) => item.sourceType === 'yahoo_closed').length;
  const yahooStrictHitCount = yahooItems.filter((item) => {
    const title = item.normalizedTitle ?? '';
    const model = product.canonicalModel?.toLowerCase().replace(/[^a-z0-9]/g, '') ?? null;
    if (model && title.replace(/[^a-z0-9]/g, '').includes(model)) return true;
    if (product.connectivity && title.includes(product.connectivity.toLowerCase())) return true;
    return false;
  }).length;
  const strictScores = yahooItems.map((item) => item.strictScore).filter(Number.isFinite);
  const avgStrictScore = strictScores.length ? strictScores.reduce((sum, value) => sum + value, 0) / strictScores.length : 0;
  const yahooDebug = grouped.yahoo_debug ?? null;

  let confidence = 0.4;
  if (janpara) confidence += 0.15;
  if (yahooSummary.count >= 2) confidence += 0.12;
  if (yahooSummary.count >= 4) confidence += 0.13;
  if (yahooSummary.count >= 6) confidence += 0.08;
  if (rakumaSummary.count >= 1) confidence += 0.04;
  if (totalYahooObserved >= 6 && yahooSummary.count / totalYahooObserved >= 0.45) confidence += 0.04;
  if (yahooSummary.count > 0 && yahooStrictHitCount / yahooSummary.count >= 0.6) confidence += 0.04;
  if (avgStrictScore >= 0.72) confidence += 0.03;
  confidence = Math.min(0.95, Number(confidence.toFixed(2)));

  const notes = [];
  if (grouped.excluded.length) notes.push(`${grouped.excluded.length}件をノイズ除外`);
  if (grouped.yahoo_closed.some((item) => item.itemType === 'main_unit')) notes.push('本体のみを参考件として含む');
  if (janpara) notes.push('じゃんぱら買取を即売り基準に使用');
  if (yahooSummary.count > 0) notes.push('Yahoo落札相場の中央値を主軸に使用');
  if (avgStrictScore > 0) notes.push(`Yahoo strict score平均 ${avgStrictScore.toFixed(2)}`);
  if (rakumaSummary.count > 0) notes.push('ラクマは補助参考値');

  return {
    productId: product.id,
    snapshotAt: new Date().toISOString(),
    sourceModes: {
      yahoo: summarizeSourceMode(yahooItems, 'priceJpy'),
      rakuma: summarizeSourceMode(rakumaItems, 'priceJpy'),
      janpara: summarizeSourceMode(janparaItems, 'priceJpyUsedMax')
    },
    janpara: janpara ? {
      title: janpara.titleRaw,
      unusedPrice: janpara.priceJpyUnused ?? null,
      usedMax: janpara.priceJpyUsedMax ?? null,
      url: janpara.sourceUrl,
      isFallback: Boolean(janpara.rawPayload?.fallback)
    } : null,
    yahoo: yahooSummary,
    yahooDebug,
    rakuma: rakumaSummary,
    suggested: {
      quickSale,
      standard,
      aggressive
    },
    confidence,
    notes
  };
}
