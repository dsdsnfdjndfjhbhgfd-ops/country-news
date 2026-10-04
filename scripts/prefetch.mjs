// Collects news from a fixed list of trusted outlets (their own RSS feeds), keeps the last
// 48 hours, sorts items by country and saves data/<CODE>.json for the site.
// Feeds only hold their latest items, so each run merges with what earlier runs saved.
import { readFile, writeFile, mkdir } from "node:fs/promises";

const SOURCES = [
  // Russian-language
  { name: "ТАСС", url: "https://tass.ru/rss/v2.xml", lang: "Russian" },
  { name: "РИА Новости", url: "https://ria.ru/export/rss2/archive/index.xml", lang: "Russian" },
  { name: "Интерфакс", url: "https://www.interfax.ru/rss.asp", lang: "Russian" },
  { name: "Коммерсантъ", url: "https://www.kommersant.ru/RSS/news.xml", lang: "Russian" },
  { name: "РБК", url: "https://rssexport.rbc.ru/rbcnews/news/30/full.rss", lang: "Russian" },
  { name: "Ведомости", url: "https://www.vedomosti.ru/rss/news", lang: "Russian" },
  { name: "BBC Русская служба", url: "https://feeds.bbci.co.uk/russian/rss.xml", lang: "Russian" },
  { name: "DW на русском", url: "https://rss.dw.com/rdf/rss-ru-all", lang: "Russian" },
  // English
  { name: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml", lang: "English" },
  { name: "The Guardian", url: "https://www.theguardian.com/world/rss", lang: "English" },
  { name: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", lang: "English" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", lang: "English" },
  { name: "Deutsche Welle", url: "https://rss.dw.com/rdf/rss-en-all", lang: "English" },
  { name: "France 24", url: "https://www.france24.com/en/rss", lang: "English" },
  { name: "Politico Europe", url: "https://www.politico.eu/feed/", lang: "English" },
  { name: "CNBC", url: "https://www.cnbc.com/id/100727362/device/rss/rss.html", lang: "English" }
];

// How a country is recognised in a headline or summary. Words match from their start
// ("украин" matches "Украины"); a trailing "!" means the whole word only.
const COUNTRIES = {
  RU: ["росси", "рф!", "москв", "кремл", "путин", "лавров", "песков", "russia", "moscow", "kremlin", "putin", "lavrov"],
  US: ["сша!", "америк", "вашингтон", "белый дом", "белого дома", "трамп", "пентагон", "госдеп", "united states", "u.s.", "america", "washington", "white house", "trump", "pentagon"],
  CN: ["китай", "китае", "китая", "кнр!", "пекин", "си цзиньпин", "china", "chinese", "beijing", "xi jinping"],
  UA: ["украин", "киев", "зеленск", "ukrain", "kyiv", "kiev", "zelensky"],
  IL: ["израил", "нетаньяху", "хамас", "сектор газа", "секторе газа", "israel", "netanyahu", "hamas", "gaza"],
  IR: ["иран", "тегеран", "хаменеи", "iran", "tehran", "khamenei"],
  DE: ["германи", "фрг!", "берлин", "мерц", "бундестаг", "germany", "german", "berlin", "merz", "bundestag"],
  GB: ["великобритан", "британ", "лондон", "стармер", "britain", "british", "uk!", "london", "starmer"],
  FR: ["франци", "париж", "макрон", "france", "french", "paris", "macron"],
  TR: ["турци", "анкар", "стамбул", "эрдоган", "turkey", "türkiye", "turkish", "ankara", "istanbul", "erdogan"]
};
const WINDOW_MS = 48 * 3600 * 1000;

const L = "a-zа-яё0-9";
const matchers = Object.fromEntries(Object.entries(COUNTRIES).map(([code, words]) => [code, words.map(w => {
  const whole = w.endsWith("!"), k = w.replace(/!$/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^${L}])${k}${whole ? `(?![${L}])` : ""}`, "i");
})]));

const decode = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, " ")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const raw = (b, name) => { const m = b.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`)); return m ? m[1] : ""; };
const tag = (b, name) => decode(raw(b, name));
const attr = (b, re) => (b.match(re) || [])[1] || "";
const stamp = d => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

function parseFeed(xml, src) {
  const out = [];
  for (const m of xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) {
    const b = m[2];
    const title = tag(b, "title");
    let link = decode(raw(b, "link")) || attr(b, /<link[^>]*href="([^"]+)"/);
    if (!link) link = tag(b, "guid");
    const date = new Date(tag(b, "pubDate") || tag(b, "dc:date") || tag(b, "updated") || tag(b, "published"));
    const desc = tag(b, "description") || tag(b, "summary");
    const image = attr(b, /<media:content[^>]*url="([^"]+)"/) || attr(b, /<media:thumbnail[^>]*url="([^"]+)"/) ||
      attr(b, /<enclosure[^>]*url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i) || attr(b, /<enclosure[^>]*type="image[^"]*"[^>]*url="([^"]+)"/);
    if (!title || !link || isNaN(date)) continue;
    let domain = src.name;
    try { domain = new URL(link).hostname.replace(/^www\./, ""); } catch {}
    out.push({ url: link.trim(), title, desc: desc.slice(0, 400), seendate: stamp(date), t: date.getTime(),
      socialimage: image.replace(/&amp;/g, "&"), domain, source: src.name, language: src.lang });
  }
  return out;
}

async function fetchFeed(src) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const r = await fetch(src.url, { signal: AbortSignal.timeout(25000), headers: { "User-Agent": "Mozilla/5.0 (compatible; country-news/1.0)", "Accept": "application/rss+xml, application/xml, text/xml, */*" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const items = parseFeed(await r.text(), src);
      console.log(`${src.name}: ${items.length} items`);
      return items;
    } catch (e) {
      console.log(`${src.name}: attempt ${attempt} failed (${e.message})`);
    }
  }
  return [];
}

const now = Date.now();
const fresh = (await Promise.all(SOURCES.map(fetchFeed))).flat().filter(a => now - a.t < WINDOW_MS && a.t < now + 3600000);
console.log(`Fresh items from all outlets: ${fresh.length}`);

await mkdir("data", { recursive: true });
let saved = 0;
for (const [code, res] of Object.entries(matchers)) {
  const mine = fresh.filter(a => res.some(re => re.test(a.title) || re.test(a.desc)));
  let old = [];
  try { old = JSON.parse(await readFile(`data/${code}.json`, "utf8")).items || []; } catch {}
  // Keep earlier items from trusted outlets only (older files may hold other data)
  old = old.filter(a => a.source && SOURCES.some(s => s.name === a.source));
  const byUrl = new Map();
  for (const a of [...old, ...mine]) byUrl.set(a.url, a);
  const items = [...byUrl.values()]
    .filter(a => now - (a.t || 0) < WINDOW_MS)
    .sort((x, y) => y.t - x.t)
    .map(({ desc, ...a }) => a);
  console.log(`${code}: ${mine.length} new, ${items.length} total`);
  await writeFile(`data/${code}.json`, JSON.stringify({ updated: new Date().toISOString(), sources: SOURCES.map(s => s.name), items }));
  saved++;
}
if (!fresh.length) { console.log("No outlet answered"); process.exit(1); }
