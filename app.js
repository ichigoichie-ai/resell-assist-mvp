import {
  buildSearchIndex,
  computeMarkets,
  effortLabels,
  marketLabels,
  marketSourceLabels,
  priceSuggestions,
  rankRecommendations,
  searchProducts,
  speedLabels
} from './lib/core.js';
import { buildTrendSummary } from './lib/core/price-trend.js';

const queryInput = document.getElementById('query');
const searchBtn = document.getElementById('searchBtn');
const emptyState = document.getElementById('emptyState');
const resultSection = document.getElementById('resultSection');
const productName = document.getElementById('productName');
const productCategory = document.getElementById('productCategory');
const priceRange = document.getElementById('priceRange');
const marketGrid = document.getElementById('marketGrid');
const recommendations = document.getElementById('recommendations');
const priceCards = document.getElementById('priceCards');
const titleOutput = document.getElementById('titleOutput');
const descriptionOutput = document.getElementById('descriptionOutput');
const checklist = document.getElementById('checklist');
const productSpecs = document.getElementById('productSpecs');
const snapshotSummary = document.getElementById('snapshotSummary');
const snapshotDate = document.getElementById('snapshotDate');
const snapshotTags = document.getElementById('snapshotTags');
const snapshotNotes = document.getElementById('snapshotNotes');
const trendSummary = document.getElementById('trendSummary');
const trendBadge = document.getElementById('trendBadge');
const trendMeta = document.getElementById('trendMeta');
const trendNotes = document.getElementById('trendNotes');

let products = [];
let productsLoaded = false;
let snapshotMap = new Map();
let snapshotHistoryMap = new Map();

searchBtn.disabled = true;
searchBtn.textContent = '読み込み中…';

function applySnapshotToProducts(data, snapshots) {
  const map = new Map((snapshots?.snapshots ?? []).map((snapshot) => [snapshot.productId, snapshot]));
  snapshotMap = map;

  return data.map((product) => {
    const snapshot = map.get(product.id);
    if (!snapshot) return product;

    const next = structuredClone(product);
    next.snapshot = snapshot;
    if (snapshot.yahoo?.count > 0) {
      next.market.yahooShopping.min = snapshot.yahoo.p25 ?? snapshot.yahoo.min ?? next.market.yahooShopping.min;
      next.market.yahooShopping.max = snapshot.yahoo.p75 ?? snapshot.yahoo.max ?? next.market.yahooShopping.max;
    }
    if (snapshot.rakuma?.count > 0) {
      next.market.rakuma.min = snapshot.rakuma.p25 ?? snapshot.rakuma.min ?? next.market.rakuma.min;
      next.market.rakuma.max = snapshot.rakuma.p75 ?? snapshot.rakuma.max ?? next.market.rakuma.max;
    }
    if (snapshot.janpara) {
      next.market.buyback.min = snapshot.janpara.usedMax ?? next.market.buyback.min;
      next.market.buyback.max = snapshot.janpara.unusedPrice ?? snapshot.janpara.usedMax ?? next.market.buyback.max;
    }
    return next;
  });
}

Promise.all([
  fetch('./data/products.json').then((r) => {
    if (!r.ok) throw new Error('products.json load failed');
    return r.json();
  }),
  fetch('./output/price-snapshots.json')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null),
  fetch('./output/price-history.json')
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
])
  .then(([data, snapshots, history]) => {
    snapshotHistoryMap = buildSnapshotHistoryMap(history);
    products = applySnapshotToProducts(data, snapshots).map(buildSearchIndex);
    productsLoaded = true;
    searchBtn.disabled = false;
    searchBtn.textContent = '相場をみる';
    renderPresetChips();
  })
  .catch(() => {
    emptyState.classList.remove('hidden');
    resultSection.classList.add('hidden');
    emptyState.innerHTML = '<h2>データを読み込めない</h2><p>ページを再読み込みしてください。</p>';
    searchBtn.disabled = false;
    searchBtn.textContent = '再試行';
  });

function yen(value) {
  return `¥${Math.round(value).toLocaleString('ja-JP')}`;
}

function escapeHtml(value = '') {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatSnapshotDate(value) {
  if (!value) return 'ローカル既定値';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'ローカル既定値';
  return `${date.toLocaleDateString('ja-JP')} ${date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
}

function renderSpecTags(tags = [], className = 'tag') {
  return tags.map((tag) => `<span class="${className}">${escapeHtml(tag)}</span>`).join('');
}

function sourceModeLabel(name, stats) {
  if (!stats || stats.mode === 'none') return `${name}: データなし`;
  if (stats.mode === 'live') return `${name}: live ${stats.live}件`;
  if (stats.mode === 'fallback') return `${name}: fallback ${stats.fallback}件`;
  return `${name}: live ${stats.live}件 / fallback ${stats.fallback}件`;
}

function buildSnapshotHistoryMap(historyData) {
  const entries = historyData?.history ?? historyData?.snapshots ?? [];
  const map = new Map();

  entries.forEach((entry) => {
    if (!entry?.productId) return;
    const list = map.get(entry.productId) ?? [];
    list.push(entry);
    map.set(entry.productId, list);
  });

  for (const [productId, list] of map.entries()) {
    list.sort((a, b) => new Date(a.snapshotAt ?? 0).getTime() - new Date(b.snapshotAt ?? 0).getTime());
    map.set(productId, list);
  }

  return map;
}

function formatTrendDelta(deltaJpy, deltaRatio) {
  if (!Number.isFinite(deltaJpy) || !Number.isFinite(deltaRatio)) return '比較データ不足';
  const signedYen = `${deltaJpy > 0 ? '+' : deltaJpy < 0 ? '-' : ''}${yen(Math.abs(deltaJpy))}`;
  const signedRatio = `${deltaRatio > 0 ? '+' : deltaRatio < 0 ? '-' : ''}${Math.abs(deltaRatio * 100).toFixed(1)}%`;
  return `${signedYen} / ${signedRatio}`;
}

function getSnapshotStatus(product) {
  const snapshot = product.snapshot ?? snapshotMap.get(product.id) ?? null;
  const yahooCount = snapshot?.yahoo?.count ?? 0;
  const rakumaCount = snapshot?.rakuma?.count ?? 0;
  const buybackCount = snapshot?.janpara ? 1 : 0;
  const totalComparableCount = yahooCount + rakumaCount + buybackCount;

  if (!snapshot) {
    return {
      snapshot,
      isAvailable: false,
      totalComparableCount,
      state: 'missing',
      label: 'snapshot未対応',
      badge: 'ローカルSKUのみ',
      toneClass: 'is-unsupported',
      note: '価格取得コアは未連携。ローカルSKU辞書の既定レンジで表示します。'
    };
  }

  if (totalComparableCount === 0) {
    return {
      snapshot,
      isAvailable: false,
      totalComparableCount,
      state: 'seeded',
      label: 'snapshot候補化のみ',
      badge: '比較データなし',
      toneClass: 'is-seeded',
      note: 'SKUは追加済みですが、比較件数はまだ0件。いまはローカル既定レンジ中心です。'
    };
  }

  return {
    snapshot,
    isAvailable: true,
    totalComparableCount,
    state: 'supported',
    label: 'snapshot反映あり',
    badge: `比較データ ${totalComparableCount}件`,
    toneClass: 'is-supported',
    note: 'snapshotの比較データを反映しています。'
  };
}

function candidatePriceLabel(product) {
  const status = getSnapshotStatus(product);
  if (status.snapshot?.suggested?.standard && status.isAvailable) return `標準 ${yen(status.snapshot.suggested.standard)}`;
  const markets = computeMarkets(product);
  return `${yen(Math.min(...markets.map((m) => m.min)))}〜${yen(Math.max(...markets.map((m) => m.max)))}`;
}

function presetToneLabel(product) {
  const status = getSnapshotStatus(product);
  if (status.state === 'supported') return 'snapshot反映';
  if (status.state === 'seeded') return 'SKU追加済み';
  return 'ローカルのみ';
}

function renderPresetGroup(title, description, items, toneClass = '') {
  if (!items.length) return '';
  return `
    <div class="presetGroup ${toneClass}">
      <div class="presetGroupHeader">
        <strong>${escapeHtml(title)}</strong>
        <span class="sub small">${escapeHtml(description)}</span>
      </div>
      <div class="chips">
        ${items.map((product) => `
          <button class="chip chipRich ${toneClass}" data-preset="${escapeHtml(product.name)}">
            <span>${escapeHtml(product.series ?? product.name)}</span>
            <small>${escapeHtml(presetToneLabel(product))}</small>
          </button>
        `).join('')}
      </div>
    </div>
  `;
}

function renderPresetChips() {
  const host = document.querySelector('.chips');
  if (!host || !products.length) return;

  const supported = products.filter((product) => getSnapshotStatus(product).state === 'supported').slice(0, 6);
  const seeded = products.filter((product) => getSnapshotStatus(product).state === 'seeded').slice(0, 6);
  const missing = products.filter((product) => getSnapshotStatus(product).state === 'missing').slice(0, 4);

  host.outerHTML = `
    <div class="presetStack">
      ${renderPresetGroup('すぐ試せる例', 'snapshot比較データつき', supported, 'is-supported')}
      ${renderPresetGroup('SKU追加済みの例', '候補化はできるが比較件数はまだ薄い', seeded, 'is-seeded')}
      ${renderPresetGroup('ローカル辞書のみ', 'snapshot未接続SKU', missing, 'is-unsupported')}
    </div>
  `;

  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      queryInput.value = btn.dataset.preset;
      runSearch();
    });
  });
}

function renderSnapshotSummary(product) {
  const status = getSnapshotStatus(product);
  const { snapshot } = status;
  const history = snapshotHistoryMap.get(product.id) ?? [];
  const trend = buildTrendSummary(history, snapshot);

  snapshotSummary.classList.remove('hidden', 'is-supported', 'is-seeded', 'is-unsupported');
  snapshotSummary.classList.add(status.toneClass);
  trendSummary.classList.remove('hidden');

  if (!snapshot) {
    snapshotDate.textContent = 'ローカルSKUのみ';
    snapshotTags.innerHTML = renderSpecTags([
      '価格取得コアは未連携',
      '候補表示・ローカル相場は利用可'
    ]);
    snapshotNotes.textContent = status.note;
  } else if (!status.isAvailable) {
    snapshotDate.textContent = formatSnapshotDate(snapshot.snapshotAt);
    snapshotTags.innerHTML = renderSpecTags([
      'SKU候補は追加済み',
      '比較データ 0件',
      typeof snapshot.confidence === 'number' ? `仮信頼度 ${(snapshot.confidence * 100).toFixed(0)}%` : '仮推定'
    ]);
    snapshotNotes.textContent = status.note;
  } else {
    const coverage = [];
    if (snapshot.yahoo?.count) coverage.push(`Yahoo ${snapshot.yahoo.count}件`);
    if (snapshot.rakuma?.count) coverage.push(`ラクマ ${snapshot.rakuma.count}件`);
    if (snapshot.janpara?.usedMax || snapshot.janpara?.unusedPrice) coverage.push('買取 1件');
    if (typeof snapshot.confidence === 'number') coverage.push(`信頼度 ${(snapshot.confidence * 100).toFixed(0)}%`);
    if (snapshot.sourceModes) {
      coverage.push(sourceModeLabel('Yahoo', snapshot.sourceModes.yahoo));
      coverage.push(sourceModeLabel('ラクマ', snapshot.sourceModes.rakuma));
      coverage.push(sourceModeLabel('買取', snapshot.sourceModes.janpara));
    }

    snapshotDate.textContent = formatSnapshotDate(snapshot.snapshotAt);
    snapshotTags.innerHTML = renderSpecTags(coverage);
    snapshotNotes.textContent = snapshot.notes?.length ? snapshot.notes.join(' / ') : status.note;
  }

  trendBadge.textContent = trend.label;
  trendBadge.className = `trendBadge ${trend.toneClass}`;
  trendMeta.innerHTML = renderSpecTags([
    `基準 ${trend.baseline ? yen(trend.baseline) : '—'}`,
    `現在 ${trend.current ? yen(trend.current) : '—'}`,
    `変化 ${formatTrendDelta(trend.deltaJpy, trend.deltaRatio)}`,
    `閾値 ±${trend.thresholdJpy ? yen(trend.thresholdJpy) : '—'} / ±${trend.thresholdRatio ? `${(trend.thresholdRatio * 100).toFixed(1)}%` : '—'}`,
    `比較点 ${trend.referenceCount}回`
  ]);
  trendNotes.textContent = `${trend.hint}。MVPでは差額と変化率の両方が閾値を超えたときだけ「上昇中 / 下落中」にします。`;
}

function renderSuggestions(candidates, title = '近い候補') {
  const items = candidates.map(({ product, score }, index) => {
    const status = getSnapshotStatus(product);
    return `
      <button type="button" class="candidateCard ${status.toneClass} ${index === 0 ? 'is-top' : ''}" data-candidate-id="${product.id}">
        <div class="candidateRank">候補 ${index + 1}</div>
        <div class="candidateTop">
          <div>
            <strong>${escapeHtml(product.name)}</strong>
            <div class="sub small">${escapeHtml(product.category)} / ${escapeHtml(product.series ?? '候補')}</div>
          </div>
          <div class="candidateScore">一致度 ${score}</div>
        </div>
        <div class="candidateMetaRow">
          <span class="candidatePrice">${candidatePriceLabel(product)}</span>
          <span class="candidateStatus ${status.toneClass}">${status.label}</span>
        </div>
        <div class="candidateHint">${status.badge} ・ ${status.note}</div>
        <div class="tagRow candidateTags">${renderSpecTags(product.specBadges ?? [])}</div>
      </button>
    `;
  }).join('');

  emptyState.classList.remove('hidden');
  resultSection.classList.add('hidden');
  emptyState.innerHTML = `
    <h2>${escapeHtml(title)}</h2>
    <p>同シリーズが複数見つかりました。容量・通信種別・世代に加えて、snapshot反映状況まで見比べて選べます。</p>
    <div class="candidateLegend">
      <span class="candidateLegendItem is-supported">snapshot反映あり</span>
      <span class="candidateLegendItem is-seeded">SKU追加済み / 比較データ薄め</span>
      <span class="candidateLegendItem is-unsupported">snapshot未対応</span>
    </div>
    <div class="candidateList">${items}</div>
  `;

  emptyState.querySelectorAll('[data-candidate-id]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const product = products.find((item) => item.id === btn.dataset.candidateId);
      if (product) renderProduct(product);
    });
  });
}

function renderProduct(product) {
  const markets = computeMarkets(product);
  const globalMin = Math.min(...markets.map((m) => m.min));
  const globalMax = Math.max(...markets.map((m) => m.max));
  const status = getSnapshotStatus(product);
  const snapshot = status.snapshot;

  productName.textContent = product.name;
  productCategory.textContent = `${product.category} / ${product.series ?? 'ローカル拡張データ'} / ${status.badge}`;
  productSpecs.innerHTML = renderSpecTags(product.specBadges ?? []);
  priceRange.textContent = snapshot?.suggested?.standard && status.isAvailable ? `標準 ${yen(snapshot.suggested.standard)}` : `${yen(globalMin)} 〜 ${yen(globalMax)}`;
  priceRange.classList.remove('is-supported', 'is-seeded', 'is-unsupported');
  priceRange.classList.add(status.toneClass);
  renderSnapshotSummary(product);

  marketGrid.innerHTML = markets.map((m) => {
    const sourceTag = m.key === 'yahooShopping'
      ? (snapshot?.yahoo?.count ? `snapshot ${snapshot.yahoo.count}件反映` : status.state === 'seeded' ? '比較データなし / ローカル既定値' : 'snapshot未対応')
      : m.key === 'rakuma'
        ? (snapshot?.rakuma?.count ? `snapshot ${snapshot.rakuma.count}件反映` : status.state === 'seeded' ? '比較データなし / ローカル既定値' : 'snapshot未対応')
        : (snapshot?.janpara ? 'snapshot 1件反映' : status.state === 'seeded' ? '比較データなし / ローカル既定値' : 'snapshot未対応');

    return `
      <div class="marketCard ${sourceTag.includes('未対応') || sourceTag.includes('比較データなし') ? status.toneClass : ''}">
        <div class="marketTop">
          <div>
            <strong>${marketLabels[m.key] ?? m.key}</strong>
            <div class="marketMeta">掲載相場 ${yen(m.min)} 〜 ${yen(m.max)}</div>
          </div>
          <div class="net">手取り ${yen(m.net)}</div>
        </div>
        <div class="marketMeta">
          <span>${marketSourceLabels[m.key] ?? '参考価格'}</span>
          <span>${sourceTag}</span>
          <span>平均想定価格 ${yen(m.avg)}</span>
          <span>手数料 ${yen(m.fee)}</span>
          <span>送料 ${yen(m.shipping)}</span>
        </div>
        <div class="tagRow">
          <span class="tag">${speedLabels[m.speed]}</span>
          <span class="tag">${effortLabels[m.effort]}</span>
        </div>
      </div>
    `;
  }).join('');

  recommendations.innerHTML = rankRecommendations(markets).map((r) => `
    <div class="recommendCard ${status.toneClass}">
      <strong>${r.title}</strong>
      <div>${marketLabels[r.market.key] ?? r.market.key}</div>
      <p class="sub small">${r.reason}</p>
    </div>
  `).join('');

  const suggestedPrices = snapshot?.suggested && status.isAvailable
    ? [
        { label: '早売れ価格', value: snapshot.suggested.quickSale, note: 'snapshotの即売り寄り提案' },
        { label: '標準価格', value: snapshot.suggested.standard, note: 'Yahoo落札中央値ベース' },
        { label: '強気価格', value: snapshot.suggested.aggressive, note: '上位四分位を意識した提案' }
      ]
    : priceSuggestions(markets).map((p) => ({ ...p, note: `${p.note} / ${status.state === 'seeded' ? 'SKU追加済みだが比較件数は未反映' : 'ローカルSKU辞書ベース'}` }));

  priceCards.innerHTML = suggestedPrices.map((p) => `
    <div class="priceCard ${status.isAvailable ? '' : status.toneClass}">
      <strong>${p.label}</strong>
      <div class="net">${yen(p.value)}</div>
      <p class="sub small">${p.note}</p>
    </div>
  `).join('');

  titleOutput.value = `${product.name} ${product.titleKeywords.join(' ')}`.trim();
  descriptionOutput.value = `${product.name} の出品用たたき台です。\n\n【状態】\n・動作確認済み\n・大きな不具合なし\n・状態は写真でご確認ください\n\n【補足】\n${product.descriptionHints.map((h) => `・${h}`).join('\n')}\n\n【発送】\n・丁寧に梱包して発送します\n・中古品のため細かな状態差はご了承ください`;

  checklist.innerHTML = [
    '本体・付属品・箱の有無を確認',
    '傷や汚れの写真を3〜5枚撮影',
    '型番 / 容量 / カラーを確認',
    '初期化・アカウント解除を実施',
    '発送サイズと梱包材を確認'
  ].map((item) => `<li>${item}</li>`).join('');

  emptyState.classList.add('hidden');
  resultSection.classList.remove('hidden');
}

function runSearch() {
  if (!productsLoaded) {
    emptyState.classList.remove('hidden');
    resultSection.classList.add('hidden');
    emptyState.innerHTML = '<h2>読み込み中</h2><p>数秒待ってからもう一度試してください。</p>';
    return;
  }

  const result = searchProducts(products, queryInput.value);

  if (!result.best) {
    if (result.candidates.length > 0) {
      renderSuggestions(result.candidates, '候補一覧');
      return;
    }

    emptyState.classList.remove('hidden');
    resultSection.classList.add('hidden');
    emptyState.innerHTML = '<h2>まだ候補がない</h2><p>いまは iPhone / AirPods / Switch / iPad / PS5 / Apple Watch 近辺に対応。型番・容量でも試せます。</p>';
    return;
  }

  if (result.ambiguous) {
    renderSuggestions(result.candidates.slice(0, 5), '候補が複数あります');
    return;
  }

  renderProduct(result.best.product);
}

searchBtn.addEventListener('click', runSearch);
queryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') runSearch();
});

document.querySelectorAll('[data-preset]').forEach((btn) => {
  btn.addEventListener('click', () => {
    queryInput.value = btn.dataset.preset;
    runSearch();
  });
});

document.querySelectorAll('[data-copy-target]').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const target = document.getElementById(btn.dataset.copyTarget);
    try {
      await navigator.clipboard.writeText(target.value);
      btn.textContent = 'コピー済み';
      setTimeout(() => { btn.textContent = 'コピー'; }, 1200);
    } catch {
      btn.textContent = '失敗';
      setTimeout(() => { btn.textContent = 'コピー'; }, 1200);
    }
  });
});
