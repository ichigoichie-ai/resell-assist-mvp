import fs from 'fs/promises';
import path from 'path';

const root = path.resolve('/home/kyforever/.openclaw/workspace/resell-assist-mvp');
const dataPath = path.join(root, 'data/products.json');
const snapshotsPath = path.join(root, 'output/price-snapshots.json');
const outDir = path.join(root, 'products');

const yen = (value) => (Number.isFinite(value) ? `¥${Math.round(value).toLocaleString('ja-JP')}` : '—');
const escapeHtml = (value = '') => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const marketLabels = {
  yahooShopping: 'Yahooオークション落札相場',
  rakuma: 'ラクマ出品価格',
  buyback: '買取サービス'
};

function buildReferenceLinks(product) {
  const query = encodeURIComponent(product.name);
  const model = product.searchTokens?.find((token) => /[a-z]{2,}\d|\//i.test(token)) ?? product.name;
  const modelQuery = encodeURIComponent(`${product.name} ${model}`.trim());

  return [
    {
      label: 'メルカリで最新出品を見る',
      href: `https://jp.mercari.com/search?keyword=${query}`,
      note: '取得が難しいため、参考リンクとして最新出品を確認。'
    },
    {
      label: 'Yahooオークション検索で確認',
      href: `https://auctions.yahoo.co.jp/search/search?p=${query}`,
      note: '落札相場とは別に、現行出品の確認用。'
    },
    {
      label: 'ラクマ検索で確認',
      href: `https://fril.jp/s?query=${query}`,
      note: '補助ソースとして現行出品も確認。'
    },
    {
      label: 'じゃんぱら検索で確認',
      href: `https://buy.janpara.co.jp/buy/search?keyword=${modelQuery}`,
      note: '公開買取価格の検索リンク。'
    }
  ];
}

function slugFor(product) {
  return product.id;
}

function marketAverage(market) {
  return Math.round((market.min + market.max) / 2);
}

function buildDescription(product, snapshot) {
  const price = snapshot?.suggested?.standard ? `標準相場は${yen(snapshot.suggested.standard)}` : '標準相場の目安を掲載';
  return `${product.name}の中古価格比較ページ。${price}。買取価格・ヤフオク落札相場・ラクマ価格を比較して、おすすめの売り方を確認できます。`;
}

function buildRelated(products, current) {
  return products
    .filter((item) => item.category === current.category && item.id !== current.id)
    .slice(0, 4);
}

function buildPage(product, snapshot, related) {
  const title = `${product.name}の買取価格・売却相場比較 | 買取比較.net`;
  const description = buildDescription(product, snapshot);
  const canonical = `https://kaitorihikaku.net/products/${slugFor(product)}.html`;
  const standard = snapshot?.suggested?.standard ?? null;
  const quick = snapshot?.suggested?.quickSale ?? null;
  const aggressive = snapshot?.suggested?.aggressive ?? null;
  const notes = snapshot?.notes?.length ? snapshot.notes : product.descriptionHints;
  const sourceBadges = [];
  if (snapshot?.yahoo?.count) sourceBadges.push(`Yahoo ${snapshot.yahoo.count}件`);
  if (snapshot?.rakuma?.count) sourceBadges.push(`ラクマ ${snapshot.rakuma.count}件`);
  if (snapshot?.janpara) sourceBadges.push('買取 1件');

  const marketCards = Object.entries(product.market).map(([key, market]) => `
    <div class="marketCard">
      <strong>${escapeHtml(marketLabels[key] ?? key)}</strong>
      <div class="price">${yen(marketAverage(market))}</div>
      <p class="sub">掲載レンジ ${yen(market.min)} 〜 ${yen(market.max)}</p>
    </div>
  `).join('');

  const relatedLinks = related.map((item) => `
    <a class="relatedLink" href="./${slugFor(item)}.html">${escapeHtml(item.name)}</a>
  `).join('');
  const referenceLinks = buildReferenceLinks(product).map((item) => `
    <a class="relatedLink" href="${escapeHtml(item.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.label)}</a>
  `).join('');

  const specTags = Object.values(product.specs ?? {}).map((value) => `<span class="tag">${escapeHtml(value)}</span>`).join('');
  const noteItems = notes.map((item) => `<li>${escapeHtml(item)}</li>`).join('');

  return `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <link rel="canonical" href="${canonical}" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${canonical}" />
    <style>
      :root { color-scheme: light; --bg:#f3f5f9; --card:#fff; --text:#14171f; --muted:#6c7484; --line:#dde3ee; --brand:#2563eb; }
      * { box-sizing:border-box; }
      body { margin:0; font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; background:var(--bg); color:var(--text); }
      .app { max-width: 920px; margin: 0 auto; padding: 20px 14px 40px; }
      .card { background:var(--card); border:1px solid var(--line); border-radius:18px; padding:16px; box-shadow:0 8px 24px rgba(28,39,60,.05); }
      .stack { display:grid; gap:14px; }
      .hero { display:grid; gap:10px; }
      .eyebrow { color:var(--brand); font-size:13px; font-weight:700; margin:0; }
      h1,h2,h3 { margin:0; }
      .sub { color:var(--muted); line-height:1.5; margin:0; }
      .priceHero { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
      .priceCard,.marketCard { border:1px solid var(--line); border-radius:14px; padding:14px; background:#fcfdff; }
      .price { font-size:28px; font-weight:800; margin:6px 0; }
      .tagRow { display:flex; flex-wrap:wrap; gap:8px; }
      .tag { background:#eef2f7; color:#243046; border-radius:999px; padding:6px 10px; font-size:12px; }
      .marketGrid { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }
      ul { margin:0; padding-left:18px; line-height:1.7; }
      .actions { display:flex; flex-wrap:wrap; gap:10px; }
      .button { background:var(--brand); color:#fff; text-decoration:none; border-radius:12px; padding:12px 16px; font-weight:700; }
      .button.secondary { background:#eef4ff; color:var(--brand); }
      .related { display:flex; flex-wrap:wrap; gap:10px; }
      .relatedLink { background:#fff; border:1px solid var(--line); padding:10px 12px; border-radius:12px; color:#243046; text-decoration:none; }
      @media (max-width: 720px) { .priceHero,.marketGrid { grid-template-columns:1fr; } }
    </style>
    <script type="application/ld+json">${JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: product.name,
      category: product.category,
      description,
      brand: '買取比較.net',
      offers: standard ? {
        '@type': 'Offer',
        priceCurrency: 'JPY',
        price: standard,
        availability: 'https://schema.org/InStock',
        url: canonical
      } : undefined
    })}</script>
  </head>
  <body>
    <div class="app stack">
      <a href="../index.html" class="sub">← トップへ戻る</a>
      <section class="card hero">
        <p class="eyebrow">中古価格比較 / 商品別ページ</p>
        <h1>${escapeHtml(product.name)} の買取価格・売却相場比較</h1>
        <p class="sub">${escapeHtml(description)}</p>
        <div class="tagRow">${specTags}${sourceBadges.map((item) => `<span class="tag">${escapeHtml(item)}</span>`).join('')}</div>
      </section>

      <section class="card">
        <h2>価格の目安</h2>
        <div class="priceHero">
          <div class="priceCard">
            <div class="sub">標準相場</div>
            <div class="price">${yen(standard)}</div>
            <div class="sub">Yahoo落札中央値ベース</div>
          </div>
          <div class="priceCard">
            <div class="sub">すぐ売るなら</div>
            <div class="price">${yen(quick)}</div>
            <div class="sub">買取価格 / 下位相場より</div>
          </div>
          <div class="priceCard">
            <div class="sub">強気価格</div>
            <div class="price">${yen(aggressive)}</div>
            <div class="sub">状態が良ければ狙える上限目安</div>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>販路別の比較</h2>
        <div class="marketGrid">${marketCards}</div>
      </section>

      <section class="card">
        <h2>売る前のチェックポイント</h2>
        <ul>${noteItems}</ul>
      </section>

      <section class="card">
        <h2>おすすめアクション</h2>
        <div class="actions">
          <a class="button" href="../index.html">トップで相場を再検索する</a>
          <a class="button secondary" href="../index.html#query">別の型番を調べる</a>
        </div>
      </section>

      <section class="card">
        <h2>参考リンク</h2>
        <div class="related">${referenceLinks}</div>
      </section>

      <section class="card">
        <h2>関連する商品ページ</h2>
        <div class="related">${relatedLinks || '<span class="sub">関連ページを準備中です。</span>'}</div>
      </section>
    </div>
  </body>
</html>`;
}

async function main() {
  const products = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  const snapshotData = JSON.parse(await fs.readFile(snapshotsPath, 'utf8'));
  const snapshotMap = new Map((snapshotData.snapshots ?? []).map((item) => [item.productId, item]));
  const supportedProducts = products.filter((product) => {
    const snapshot = snapshotMap.get(product.id);
    return Boolean(snapshot?.suggested?.standard);
  });

  await fs.mkdir(outDir, { recursive: true });

  for (const product of supportedProducts) {
    const snapshot = snapshotMap.get(product.id);
    const related = buildRelated(supportedProducts, product);
    const html = buildPage(product, snapshot, related);
    await fs.writeFile(path.join(outDir, `${slugFor(product)}.html`), html, 'utf8');
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://kaitorihikaku.net/</loc></url>
${supportedProducts.map((product) => `  <url><loc>https://kaitorihikaku.net/products/${slugFor(product)}.html</loc></url>`).join('\n')}
</urlset>`;
  await fs.writeFile(path.join(root, 'sitemap.xml'), sitemap, 'utf8');

  console.log(`Generated ${supportedProducts.length} product pages.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
