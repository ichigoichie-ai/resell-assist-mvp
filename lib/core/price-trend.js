function finiteValues(values = []) {
  return values.filter((value) => Number.isFinite(value));
}

function median(values = []) {
  const sorted = [...finiteValues(values)].sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function normalizePoint(entry) {
  if (!entry) return null;
  return {
    snapshotAt: entry.snapshotAt ?? null,
    standard: entry.suggested?.standard ?? entry.standard ?? entry.yahoo?.median ?? null,
    quickSale: entry.suggested?.quickSale ?? entry.quickSale ?? entry.yahoo?.p25 ?? null,
    aggressive: entry.suggested?.aggressive ?? entry.aggressive ?? entry.yahoo?.p75 ?? null,
    confidence: entry.confidence ?? null
  };
}

export function buildTrendSummary(historyEntries = [], currentSnapshot = null) {
  const normalizedHistory = historyEntries.map(normalizePoint).filter(Boolean);
  const current = normalizePoint(currentSnapshot);
  const timeline = [...normalizedHistory, current].filter((item) => Number.isFinite(item?.standard));

  if (timeline.length < 2) {
    return {
      status: 'insufficient',
      label: '推移判定はまだ不可',
      toneClass: 'is-muted',
      deltaJpy: null,
      deltaRatio: null,
      referenceCount: timeline.length,
      baseline: current?.standard ?? null,
      current: current?.standard ?? null,
      thresholdJpy: null,
      thresholdRatio: null,
      hint: '最低2回、できれば3回以上のsnapshotで判定'
    };
  }

  const latest = timeline.at(-1);
  const prev = timeline.at(-2);
  const shortWindow = timeline.slice(-3, -1);
  const baseline = shortWindow.length ? median(shortWindow.map((item) => item.standard)) : prev.standard;
  const deltaJpy = latest.standard - baseline;
  const deltaRatio = baseline > 0 ? deltaJpy / baseline : 0;
  const thresholdRatio = timeline.length >= 4 ? 0.035 : 0.05;
  const thresholdJpy = baseline >= 30000 ? 1500 : baseline >= 10000 ? 800 : 400;
  const isMoving = Math.abs(deltaJpy) >= thresholdJpy && Math.abs(deltaRatio) >= thresholdRatio;

  let status = 'flat';
  let label = '横ばい';
  let toneClass = 'is-flat';

  if (isMoving && deltaJpy > 0) {
    status = 'up';
    label = '価格上昇中';
    toneClass = 'is-up';
  } else if (isMoving && deltaJpy < 0) {
    status = 'down';
    label = '価格下落中';
    toneClass = 'is-down';
  }

  return {
    status,
    label,
    toneClass,
    deltaJpy,
    deltaRatio,
    referenceCount: timeline.length,
    baseline,
    current: latest.standard,
    previous: prev.standard,
    thresholdJpy,
    thresholdRatio,
    hint: shortWindow.length
      ? '直近2回の中央値との比較'
      : '前回snapshotとの比較'
  };
}
