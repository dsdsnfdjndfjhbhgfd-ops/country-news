// Collects news from a fixed list of trusted outlets (their own RSS feeds), keeps the last
// 48 hours, sorts items by country and saves data/<CODE>.json for the site.
// Feeds only hold their latest items, so each run merges with what earlier runs saved.
import { readFile, writeFile, mkdir } from "node:fs/promises";
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
  // The country must be named in the headline, or at least twice in the summary
  const about = a => res.some(re => re.test(a.title)) ||
    res.reduce((n, re) => n + ((a.desc || "").match(new RegExp(re.source, "gi")) || []).length, 0) >= 2;
  const mine = fresh.filter(about);
  let old = [];
  try { old = JSON.parse(await readFile(`data/${code}.json`, "utf8")).items || []; } catch {}
  // Keep earlier items from trusted outlets only (older files may hold other data)
  old = old.filter(a => a.source && SOURCES.some(s => s.name === a.source) && about(a));
  const byUrl = new Map();
  for (const a of [...old, ...mine]) byUrl.set(a.url, a);
  const items = [...byUrl.values()]
    .filter(a => now - (a.t || 0) < WINDOW_MS)
    .sort((x, y) => y.t - x.t)
    .map(a => ({ ...a, desc: (a.desc || "").slice(0, 220) }));
  console.log(`${code}: ${mine.length} new, ${items.length} total`);
  await writeFile(`data/${code}.json`, JSON.stringify({ updated: new Date().toISOString(), sources: SOURCES.map(s => s.name), items }));
  saved++;
}
if (!fresh.length) { console.log("No outlet answered"); process.exit(1); }

// ---------- "Why it matters": short AI explanations for the top events ----------
// Uses Claude when the repository has an ANTHROPIC_API_KEY secret, otherwise the free
// GitHub Models endpoint with the workflow's own token. Explanations are cached by article
// URL, so each event is explained once.
const NAMES = {
  RU: ["Россия", "России"], US: ["США", "США"], CN: ["Китай", "Китае"], UA: ["Украина", "Украине"],
  IL: ["Израиль", "Израиле"], IR: ["Иран", "Иране"], DE: ["Германия", "Германии"],
  GB: ["Великобритания", "Великобритании"], FR: ["Франция", "Франции"], TR: ["Турция", "Турции"]
};
const EN = { RU: "Russia", US: "United States", CN: "China", UA: "Ukraine", IL: "Israel", IR: "Iran", DE: "Germany", GB: "United Kingdom", FR: "France", TR: "Turkey" };
const PER_RUN = 24, BATCH = 12, TOP = 12;

const core = vm.createContext({ Date, Math, Set, Map, JSON });
vm.runInContext(await readFile("assets/core.js", "utf8"), core);

let why = {};
try { why = JSON.parse(await readFile("data/why.json", "utf8")).items || {}; } catch {}
for (const [u, v] of Object.entries(why)) if (now - (v.at || 0) > 3 * 86400000) delete why[u];

const todo = [];
for (const code of Object.keys(COUNTRIES)) {
  let items = [];
  try { items = JSON.parse(await readFile(`data/${code}.json`, "utf8")).items || []; } catch {}
  const c = { code, ru: NAMES[code][0], en: EN[code], loc: NAMES[code][1] };
  for (const g of core.cluster(items, c, true).slice(0, TOP)) {
    if (g.items.some(i => why[i.url])) continue;
    todo.push({ code, g });
  }
}
todo.sort((a, b) => (b.g.domains >= 2) - (a.g.domains >= 2) || b.g.score - a.g.score);
// Without a Claude key, explanations come from the page's built-in rules (assets/core.js)
const queue = process.env.ANTHROPIC_API_KEY ? todo.slice(0, PER_RUN) : [];
console.log(`Events without explanation: ${todo.length}, explaining ${queue.length}`);

function prompt(batch) {
  const lines = batch.map((x, i) => {
    const g = x.g, srcs = [...new Set(g.items.map(a => a.source))].slice(0, 4).join(", ");
    const desc = g.items.map(a => a.desc).find(Boolean) || "";
    return `${i + 1}. Страна: ${NAMES[x.code][0]}. Заголовок: ${g.lead.title}` + (desc ? `. Анонс: ${desc}` : "") + `. Источники: ${srcs}.`;
  }).join("\n");
  return `Ты редактор новостной сводки. Для каждой новости ниже напиши по-русски 1–2 коротких предложения: почему это событие важно для указанной страны (возможные последствия для её политики, безопасности, экономики или жизни людей).
Пиши нейтрально, без оценок и без пересказа заголовка. Опирайся только на заголовок и анонс, не выдумывай фактов, цифр и имён. Не начинай со слов «Это важно, потому что».
Ответь только JSON: {"items":[{"id":1,"why":"..."}]}

${lines}`;
}

async function ask(text) {
  if (process.env.ANTHROPIC_API_KEY) {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: AbortSignal.timeout(90000),
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || "claude-haiku-4-5", max_tokens: 3000, messages: [{ role: "user", content: text }] })
    });
    if (!r.ok) throw new Error(`Claude HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return (await r.json()).content?.[0]?.text || "";
  }
  if (!process.env.GITHUB_TOKEN) throw new Error("no model credentials");
  // GitHub Models: current endpoint first, then the older Azure-hosted one
  const tries = [
    ["https://models.github.ai/inference/chat/completions", process.env.GH_MODEL || "openai/gpt-4.1-mini"],
    ["https://models.inference.ai.azure.com/chat/completions", "gpt-4o-mini"]
  ];
  const errors = [];
  for (const [url, model] of tries) {
    try {
      const r = await fetch(url, {
        method: "POST", signal: AbortSignal.timeout(90000),
        headers: { "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`, "Content-Type": "application/json", "Accept": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
        body: JSON.stringify({ model, temperature: 0.2, response_format: { type: "json_object" }, messages: [{ role: "user", content: text }] })
      });
      const body = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${body.slice(0, 160)}`);
      let data; try { data = JSON.parse(body); } catch { throw new Error(`not JSON: ${body.slice(0, 120)}`); }
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error(`empty answer: ${body.slice(0, 120)}`);
      return content;
    } catch (e) { errors.push(`${new URL(url).host} ${e.message}`); }
  }
  throw new Error(errors.join(" | "));
}

let explained = 0, lastError = "";
for (let i = 0; i < queue.length; i += BATCH) {
  const batch = queue.slice(i, i + BATCH);
  try {
    const out = await ask(prompt(batch));
    const json = JSON.parse(out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1));
    for (const r of json.items || []) {
      const x = batch[Number(r.id) - 1];
      const text = String(r.why || "").trim();
      if (!x || text.length < 20) continue;
      why[x.g.lead.url] = { why: text.slice(0, 400), at: now, country: x.code, title: x.g.lead.title };
      explained++;
    }
  } catch (e) {
    console.log("Explanations failed: " + e.message);
    lastError = e.message;
    break;
  }
}
console.log(`Explained ${explained} events`);
await writeFile("data/why.json", JSON.stringify({ updated: new Date().toISOString(), model: process.env.ANTHROPIC_API_KEY ? "claude" : "github-models", lastError, items: why }));

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
