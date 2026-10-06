// Collects news from a fixed list of trusted outlets (their own RSS feeds), keeps the last
// 48 hours, sorts items by country and saves data/<CODE>.json for the site.
// Feeds only hold their latest items, so each run merges with what earlier runs saved.
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import vm from "node:vm";

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
  { name: "Лента.ру", url: "https://lenta.ru/rss/news", lang: "Russian" },
  { name: "Газета.ру", url: "https://www.gazeta.ru/export/rss/first.xml", lang: "Russian" },
  { name: "Euronews на русском", url: "https://ru.euronews.com/rss", lang: "Russian" },
  { name: "БелТА", url: "https://www.belta.by/rss", lang: "Russian" },
  { name: "Tengrinews", url: "https://tengrinews.kz/news.rss", lang: "Russian" },
  { name: "Курсив", url: "https://kz.kursiv.media/feed/", lang: "Russian" },
  { name: "Взгляд", url: "https://vz.ru/rss.xml", lang: "Russian" },
  { name: "Российская газета", url: "https://rg.ru/xml/index.xml", lang: "Russian" },
  { name: "УНИАН", url: "https://rss.unian.net/site/news_rus.rss", lang: "Russian" },
  // English
  { name: "BBC News", url: "https://feeds.bbci.co.uk/news/world/rss.xml", lang: "English" },
  { name: "The Guardian", url: "https://www.theguardian.com/world/rss", lang: "English" },
  { name: "The New York Times", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", lang: "English" },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", lang: "English" },
  { name: "Deutsche Welle", url: "https://rss.dw.com/rdf/rss-en-all", lang: "English" },
  { name: "France 24", url: "https://www.france24.com/en/rss", lang: "English" },
  { name: "Politico Europe", url: "https://www.politico.eu/feed/", lang: "English" },
  { name: "CNBC", url: "https://www.cnbc.com/id/100727362/device/rss/rss.html", lang: "English" },
  { name: "Bloomberg", url: "https://feeds.bloomberg.com/politics/news.rss", lang: "English" },
  { name: "The Washington Post", url: "https://feeds.washingtonpost.com/rss/world", lang: "English" },
  { name: "The Independent", url: "https://www.independent.co.uk/news/world/rss", lang: "English" },
  { name: "South China Morning Post", url: "https://www.scmp.com/rss/91/feed", lang: "English" },
  { name: "The Times of India", url: "https://timesofindia.indiatimes.com/rssfeeds/-2128936835.cms", lang: "English" },
  { name: "The Japan Times", url: "https://www.japantimes.co.jp/feed/", lang: "English" },
  { name: "Notes from Poland", url: "https://notesfrompoland.com/feed/", lang: "English" },
  { name: "The Kyiv Independent", url: "https://kyivindependent.com/news-archive/rss/", lang: "English" },
  { name: "Euronews", url: "https://www.euronews.com/rss", lang: "English" },
  { name: "ABC News", url: "https://abcnews.go.com/abcnews/internationalheadlines", lang: "English" },
  { name: "CBS News", url: "https://www.cbsnews.com/latest/rss/world", lang: "English" },
  { name: "NPR", url: "https://feeds.npr.org/1004/rss.xml", lang: "English" },
  { name: "Financial Times", url: "https://www.ft.com/world?format=rss", lang: "English" },
  { name: "Le Monde", url: "https://www.lemonde.fr/en/rss/une.xml", lang: "English" },
  { name: "Anadolu Agency", url: "https://www.aa.com.tr/en/rss/default?cat=world", lang: "English" },
  { name: "Haaretz", url: "https://www.haaretz.com/srv/haaretz-latest-headlines", lang: "English" },
  { name: "Tehran Times", url: "https://www.tehrantimes.com/rss", lang: "English" },
  { name: "Ukrinform", url: "https://www.ukrinform.net/rss/block-lastnews", lang: "English" },
  { name: "Ukrainska Pravda", url: "https://www.pravda.com.ua/eng/rss/", lang: "English" },
  { name: "Hindustan Times", url: "https://www.hindustantimes.com/feeds/rss/world-news/rssfeed.xml", lang: "English" },
  { name: "The Hindu", url: "https://www.thehindu.com/news/international/feeder/default.rss", lang: "English" },
  { name: "Japan Today", url: "https://japantoday.com/feed", lang: "English" },
  { name: "Kazinform", url: "https://www.inform.kz/rss/eng.xml", lang: "English" },
  { name: "The Astana Times", url: "https://astanatimes.com/feed/", lang: "English" },
  { name: "CGTN", url: "https://www.cgtn.com/subscribe/rss/section/world.xml", lang: "English" },
  { name: "Hespress English", url: "https://en.hespress.com/feed", lang: "English" },
  { name: "North Africa Post", url: "https://northafricapost.com/feed", lang: "English" },
  { name: "Asharq Al-Awsat", url: "https://english.aawsat.com/feed", lang: "English" },
  { name: "The Rio Times", url: "https://www.riotimesonline.com/feed/", lang: "English" },
  { name: "MercoPress", url: "https://en.mercopress.com/rss", lang: "English" }
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
  TR: ["турци", "анкар", "стамбул", "эрдоган", "turkey", "türkiye", "turkish", "ankara", "istanbul", "erdogan"],
  IN: ["индия", "индии", "индию", "индией", "индийск", "нью-дели", "дели!", "моди!", "india!", "indian!", "indians!", "new delhi", "delhi!", "modi!"],
  JP: ["япони", "японск", "японц", "токио", "такаити", "japan", "tokyo", "takaichi"],
  PL: ["польш", "польск", "поляк", "варшав", "туск!", "туска!", "туском!", "туску!", "навроцк", "poland", "polish!", "warsaw", "tusk!", "nawrocki"],
  BY: ["беларус", "белорус", "минск", "лукашенк", "belarus", "minsk", "lukashenko"],
  KZ: ["казахстан", "казахск", "астан", "алмат", "токаев", "kazakh", "astana", "almaty", "tokayev"],
  MA: ["марокк", "рабат", "касабланк", "марракеш", "морокк", "morocco", "moroccan", "rabat!", "casablanca", "marrakech", "marrakesh"],
  SA: ["саудовск", "саудит", "эр-рияд", "бин салман", "saudi", "riyadh", "bin salman"],
  BR: ["бразили", "бразильск", "лула!", "лулы!", "лулу!", "brazil", "lula!", "brasilia", "brasília", "bolsonaro"]
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
  .replace(/&amp;/g, "&")
  .replace(/<[^>]+>/g, " ")   // some feeds encode their HTML twice: strip tags revealed by decoding
  .replace(/\s+/g, " ").trim();
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

await mkdir("data/full", { recursive: true });
await mkdir("data/desc", { recursive: true });
let saved = 0;
for (const [code, res] of Object.entries(matchers)) {
  // The country must be named in the headline, or at least twice in the summary
  const about = a => res.some(re => re.test(a.title)) ||
    res.reduce((n, re) => n + ((a.desc || "").match(new RegExp(re.source, "gi")) || []).length, 0) >= 2;
  const mine = fresh.filter(about);
  let old = [];
  try { old = JSON.parse(await readFile(`data/full/${code}.json`, "utf8")).items || []; }
  catch { try { old = JSON.parse(await readFile(`data/${code}.json`, "utf8")).items || []; } catch {} }
  // Keep earlier items from trusted outlets only (older files may hold other data)
  old = old.filter(a => a.source && SOURCES.some(s => s.name === a.source) && about(a));
  const byUrl = new Map();
  for (const a of [...old, ...mine]) byUrl.set(a.url, a);
  const items = [...byUrl.values()]
    .filter(a => now - (a.t || 0) < WINDOW_MS)
    .sort((x, y) => y.t - x.t)
    .map(a => ({ ...a, desc: (a.desc || "").slice(0, 220) }));
  console.log(`${code}: ${mine.length} new, ${items.length} total`);
  const updated = new Date().toISOString();
  // Full copy (with summaries) for the next run; slim copy with only what the page shows
  await writeFile(`data/full/${code}.json`, JSON.stringify({ updated, items }));
  const slim = items.map(a => ({ url: a.url, title: a.title, seendate: a.seendate, source: a.source, language: a.language, ...(a.socialimage ? { socialimage: a.socialimage } : {}) }));
  await writeFile(`data/${code}.json`, JSON.stringify({ updated, items: slim }));
  // Short summaries for the event page, loaded only when someone opens an event
  const desc = {};
  for (const x of items) if (x.desc) desc[x.url] = x.desc;
  await writeFile(`data/desc/${code}.json`, JSON.stringify(desc));
  saved++;
}
if (!fresh.length) { console.log("No outlet answered"); process.exit(1); }

// ---------- Names used for grouping events ----------
const NAMES = {
  RU: ["Россия", "России"], US: ["США", "США"], CN: ["Китай", "Китае"], UA: ["Украина", "Украине"],
  IL: ["Израиль", "Израиле"], IR: ["Иран", "Иране"], DE: ["Германия", "Германии"],
  GB: ["Великобритания", "Великобритании"], FR: ["Франция", "Франции"], TR: ["Турция", "Турции"],
  IN: ["Индия", "Индии"], JP: ["Япония", "Японии"], PL: ["Польша", "Польше"], BY: ["Беларусь", "Беларуси"], KZ: ["Казахстан", "Казахстане"],
  MA: ["Марокко", "Марокко"], SA: ["Саудовская Аравия", "Саудовской Аравии"], BR: ["Бразилия", "Бразилии"]
};
const EN = { RU: "Russia", US: "United States", CN: "China", UA: "Ukraine", IL: "Israel", IR: "Iran", DE: "Germany", GB: "United Kingdom", FR: "France", TR: "Turkey", IN: "India", JP: "Japan", PL: "Poland", BY: "Belarus", KZ: "Kazakhstan", MA: "Morocco", SA: "Saudi Arabia", BR: "Brazil" };
const core = vm.createContext({ Date, Math, Set, Map, JSON });
vm.runInContext(await readFile("assets/core.js", "utf8"), core);
// The site no longer shows "why it matters" texts: drop the old file from the data
await rm("data/why.json", { force: true });

// ---------- Small summary for the home page ----------
const status = { updated: new Date().toISOString(), sources: SOURCES.map(s => ({ name: s.name, lang: s.lang })), countries: {} };
for (const code of Object.keys(COUNTRIES)) {
  let items = [];
  try { items = JSON.parse(await readFile(`data/${code}.json`, "utf8")).items || []; } catch {}
  const c = { code, ru: NAMES[code][0], en: EN[code], loc: NAMES[code][1] };
  const events = core.cluster(items, c, true, Infinity);
  const top = events[0];
  status.countries[code] = {
    items: items.length, events: events.length,
    top: top ? { title: top.lead.title, domains: top.domains, topic: top.topic[0] } : null
  };
}
await writeFile("data/status.json", JSON.stringify(status));
console.log("Status saved");
