import { normalizeText } from './normalize.js';

function collectCategoryRules(rules, category) {
  return rules.byCategory?.[category] ?? { strongExclude: [], weakFlags: [] };
}

function includesKeyword(normalizedTitle, keyword = '') {
  const normalizedKeyword = normalizeText(keyword);
  if (!normalizedKeyword) return false;
  return normalizedKeyword.split(' ').filter(Boolean).every((part) => normalizedTitle.includes(part));
}

function hitKeyword(normalizedTitle, keywords = []) {
  return keywords.find((keyword) => includesKeyword(normalizedTitle, keyword)) ?? null;
}

function countHits(normalizedTitle, keywords = []) {
  return keywords.filter((keyword) => includesKeyword(normalizedTitle, keyword)).length;
}

function hasSeriesAliasHit(normalizedTitle, product) {
  if (!product) return false;
  if (product.category === 'earbuds') {
    return includesKeyword(normalizedTitle, 'airpods pro 2') || includesKeyword(normalizedTitle, 'airpodspro2');
  }
  return false;
}

function hasAnyKeyword(normalizedTitle, keywords = []) {
  return keywords.some((keyword) => includesKeyword(normalizedTitle, keyword));
}

function evaluateStrictAdoption({ normalizedTitle, product, sourceType, conditionGrade, itemType, noiseKeyword }) {
  if (!product || sourceType !== 'yahoo_closed') return { adopt: true, reason: null, strictScore: 0.5, strictSignals: [] };
  if (noiseKeyword || conditionGrade === 'junk') {
    return { adopt: false, reason: noiseKeyword ?? 'ジャンク', strictScore: 0, strictSignals: [] };
  }

  const requiredKeywords = product.requiredKeywords ?? [];
  const requiredHits = countHits(normalizedTitle, requiredKeywords);
  const preferredHits = countHits(normalizedTitle, product.preferredKeywords ?? []);
  const modelHit = product.canonicalModel ? includesKeyword(normalizedTitle, product.canonicalModel) : false;
  const seriesHit = (product.series ? includesKeyword(normalizedTitle, product.series) : false) || hasSeriesAliasHit(normalizedTitle, product);
  const storageHit = product.storage ? includesKeyword(normalizedTitle, product.storage) : false;
  const connectivityHit = product.connectivity ? includesKeyword(normalizedTitle, product.connectivity) : false;
  const strictSignals = [];
  let strictScore = 0;

  if (requiredHits > 0) {
    strictScore += 0.22 + Math.min(0.22, requiredHits * 0.11);
    strictSignals.push(`required:${requiredHits}`);
  }
  if (preferredHits > 0) {
    strictScore += Math.min(0.18, preferredHits * 0.06);
    strictSignals.push(`preferred:${preferredHits}`);
  }
  if (seriesHit) {
    strictScore += 0.16;
    strictSignals.push('series');
  }
  if (storageHit) {
    strictScore += 0.12;
    strictSignals.push('storage');
  }
  if (connectivityHit) {
    strictScore += 0.12;
    strictSignals.push('connectivity');
  }
  if (modelHit) {
    strictScore += 0.24;
    strictSignals.push('model');
  }

  if (requiredKeywords.length > 0 && requiredHits === 0) {
    return { adopt: false, reason: '必須語不足', strictScore: Number(strictScore.toFixed(2)), strictSignals };
  }

  if (product.category === 'earbuds') {
    const hasCaseOrSetSignal = [
      'ケース',
      '本体・ケース',
      '箱',
      '付属品',
      '両耳',
      '左右',
      '完品'
    ].some((keyword) => includesKeyword(normalizedTitle, keyword));

    if (hasCaseOrSetSignal) {
      strictScore += 0.12;
      strictSignals.push('set-signal');
    }

    if (includesKeyword(normalizedTitle, '本体') && !hasCaseOrSetSignal) {
      return { adopt: false, reason: 'イヤホン本体のみ疑い', strictScore: Number(strictScore.toFixed(2)), strictSignals };
    }

    const strictEnough = strictScore >= 0.58 || preferredHits > 0 || modelHit || (seriesHit && connectivityHit) || (seriesHit && hasCaseOrSetSignal);
    if (!strictEnough) {
      return { adopt: false, reason: 'イヤホン同定弱い', strictScore: Number(strictScore.toFixed(2)), strictSignals };
    }
  }

  if (product.category === 'smartphone') {
    if (itemType === 'main_unit') return { adopt: false, reason: 'スマホ本体のみ除外', strictScore: Number(strictScore.toFixed(2)), strictSignals };

    const iphoneVariantConflict = [];
    if (includesKeyword(normalizedTitle, 'iphone') && product.series) {
      const expectsMini = includesKeyword(normalizeText(product.series), 'mini');
      const expectsPro = includesKeyword(normalizeText(product.series), 'pro');
      const expectsProMax = includesKeyword(normalizeText(product.series), 'pro max') || includesKeyword(normalizeText(product.series), 'promax');
      const expectsPlus = includesKeyword(normalizeText(product.series), 'plus');

      if (!expectsMini && includesKeyword(normalizedTitle, 'mini')) iphoneVariantConflict.push('mini');
      if (!expectsPlus && includesKeyword(normalizedTitle, 'plus')) iphoneVariantConflict.push('plus');
      if (!expectsProMax && (includesKeyword(normalizedTitle, 'pro max') || includesKeyword(normalizedTitle, 'promax'))) iphoneVariantConflict.push('pro max');
      if (!expectsPro && includesKeyword(normalizedTitle, 'pro') && !includesKeyword(normalizedTitle, 'pro max') && !includesKeyword(normalizedTitle, 'promax')) iphoneVariantConflict.push('pro');
    }

    if (iphoneVariantConflict.length > 0) {
      return { adopt: false, reason: `iPhone派生違い:${iphoneVariantConflict.join(',')}`, strictScore: Number(strictScore.toFixed(2)), strictSignals };
    }

    if (hasAnyKeyword(normalizedTitle, ['ケース', 'カバー', 'フィルム', 'ガラスフィルム', '保護フィルム', '手帳型', 'レンズ保護'])) {
      return { adopt: false, reason: 'スマホアクセサリ疑い', strictScore: Number(strictScore.toFixed(2)), strictSignals };
    }

    const strictEnough = strictScore >= 0.62 || preferredHits > 0 || modelHit || (seriesHit && storageHit && connectivityHit);
    if (!strictEnough) return { adopt: false, reason: 'スマホ同定弱い', strictScore: Number(strictScore.toFixed(2)), strictSignals };
  }

  return { adopt: true, reason: null, strictScore: Number(Math.min(0.99, strictScore).toFixed(2)), strictSignals };
}

export function classifyItem({ title, product, rules, sourceType, conditionRaw }) {
  const normalizedTitle = normalizeText(title);
  const categoryRules = collectCategoryRules(rules, product?.category);
  const strongExclude = [
    ...(rules.common?.strongExclude ?? []),
    ...(categoryRules.strongExclude ?? []),
    ...(product?.excludeKeywords ?? [])
  ];

  const weakFlags = [
    ...(rules.common?.weakFlags ?? []),
    ...(categoryRules.weakFlags ?? [])
  ];

  const noiseKeyword = hitKeyword(normalizedTitle, strongExclude);
  const weakFlag = hitKeyword(normalizedTitle, weakFlags);

  let itemType = 'full_set';
  let conditionGrade = 'used_good';
  const featureFlags = [];

  for (const [type, keywords] of Object.entries(rules.itemTypeRules ?? {})) {
    if (hitKeyword(normalizedTitle, keywords)) {
      itemType = type;
      break;
    }
  }

  if (includesKeyword(normalizedTitle, '本体のみ')) itemType = 'main_unit';
  if (conditionRaw === 'junk' || includesKeyword(normalizedTitle, 'ジャンク')) conditionGrade = 'junk';
  else if (sourceType === 'janpara_buyback') conditionGrade = 'buyback_reference';
  else if (weakFlag) conditionGrade = 'used_fair';

  if (weakFlag) featureFlags.push(weakFlag);

  const adoption = evaluateStrictAdoption({ normalizedTitle, product, sourceType, conditionGrade, itemType, noiseKeyword });
  const isNoise = Boolean(noiseKeyword || conditionGrade === 'junk' || !adoption.adopt);
  const noiseReason = noiseKeyword ?? (conditionGrade === 'junk' ? 'ジャンク' : adoption.reason);

  return {
    itemType,
    conditionGrade,
    isNoise,
    noiseReason,
    featureFlags,
    strictScore: adoption.strictScore,
    strictSignals: adoption.strictSignals
  };
}
