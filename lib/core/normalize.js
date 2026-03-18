const EXTRA_SYNONYMS = [
  ['usb-c', 'usbc'],
  ['wi-fi', 'wifi'],
  ['simフリー', 'sim free'],
  ['有機el', 'oled'],
  ['第2世代', '2世代'],
  ['第5世代', '5世代'],
  ['pro max', 'promax'],
  ['plus', 'plus'],
  ['mini', 'mini']
];

export function normalizeText(input = '') {
  let text = input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[()（）\[\]【】]/g, ' ')
    .replace(/[‐‑–—]/g, '-')
    .replace(/[\/]/g, ' ')
    .replace(/[^\p{Letter}\p{Number}\s.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  for (const [a, b] of EXTRA_SYNONYMS) {
    if (text.includes(a) && !text.includes(b)) text += ` ${b}`;
    if (text.includes(b) && !text.includes(a)) text += ` ${a}`;
  }

  text = text
    .replace(/iphone\s*/g, 'iphone ')
    .replace(/airpods\s*/g, 'airpods ')
    .replace(/switch\s*/g, 'switch ')
    .replace(/playstation\s*5/g, 'playstation 5')
    .replace(/ps\s*5/g, 'ps5')
    .replace(/\s+/g, ' ')
    .trim();

  return text;
}

export function tokenize(input = '') {
  return normalizeText(input).split(' ').filter(Boolean);
}

export function normalizeModel(input = '') {
  return normalizeText(input).replace(/[^a-z0-9]/g, '');
}
