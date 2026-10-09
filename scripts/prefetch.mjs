// Collects news from a fixed list of trusted outlets (their own RSS feeds), keeps the last
// 48 hours, sorts items by country and saves data/<CODE>.json for the site.
// Feeds only hold their latest items, so each run merges with what earlier runs saved.
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";
import vm from "node:vm";
import { loadProviders, runPool } from "./ai-pool.mjs";

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
await rm("data/why.json", { force: true }); // retired file

// ---------- Short summaries ("Кратко") of events, written by an AI model ----------
// Works with any OpenAI-compatible service, set through repository secrets/variables:
//   LLM_API_KEY   key of the service (a secret; never put it into the code)
//   LLM_BASE_URL  optional variable. Default OpenRouter (free ":free" models);
//                 Google Gemini: https://generativelanguage.googleapis.com/v1beta/openai
//                 DeepSeek: https://api.deepseek.com
//   LLM_MODEL     optional variable, one or several model ids separated by commas.
// ANTHROPIC_API_KEY (Claude) also works. Without a key, or when the service fails or is out of
// its free limit, events simply have no summary. The text is built only from the headlines and
// feed summaries of the outlets, not from full articles. Cached by article URL for 3 days.
// The feed shows 25 events per country: all of them get a summary, those higher up first.
// STYLE marks how a summary was written: older ones (shorter, without the inside/outside mark or "why it matters")
// are rewritten after the missing ones.
const PER_RUN = Number(process.env.SUMMARY_PER_RUN) || 800, TOP = 25, STYLE = 4;

let summaries = {};
let meta = {};
try { meta = JSON.parse(await readFile("data/summary.json", "utf8")); summaries = meta.items || {}; } catch {}
for (const [u, v] of Object.entries(summaries)) if (now - (v.at || 0) > 3 * 86400000) delete summaries[u];

const todo = [], redo = [];
for (const code of Object.keys(COUNTRIES)) {
  let items = [];
  try { items = JSON.parse(await readFile(`data/full/${code}.json`, "utf8")).items || []; } catch {}
  const c = { code, ru: NAMES[code][0], en: EN[code], loc: NAMES[code][1] };
  core.cluster(items, c, true).slice(0, TOP).forEach((g, rank) => {
    const have = g.items.map(i => summaries[i.url]).filter(Boolean);
    if (!have.length) todo.push({ code, g, rank });
    else if (!have.some(h => (h.v || 1) >= STYLE)) redo.push({ code, g, rank });
  });
}
// Every country's best events first, then the next ones: the top of each feed is filled soonest
const order = (a, b) => a.rank - b.rank || b.g.score - a.g.score;
todo.sort(order); redo.sort(order);
const providers = loadProviders();
const HAS_AI = providers.length > 0;
const poolState = meta.pool || {};
if (!meta.pool && (meta.lastAskAt || meta.blockedUntil)) poolState.main = { lastAskAt: meta.lastAskAt || 0, blockedUntil: meta.blockedUntil || 0 }; // state of the single-service days
console.log(`Events without a summary: ${todo.length}, with an old short one: ${redo.length}; AI services: ${providers.map(p => p.name).join(", ") || "none (summaries are skipped)"}`);

function prompt(batch) {
  const lines = batch.map((x, i) => {
    const g = x.g;
    // Everything the outlets wrote about this event: up to 4 headlines with their feed summaries
    const seen = new Set(), parts = [];
    for (const a of g.items) {
      if (parts.length >= 6 || seen.has(a.source)) continue;
      seen.add(a.source);
      parts.push(`«${a.title}»` + (a.desc ? ` — ${a.desc}` : "") + ` (${a.source})`);
    }
    return `${i + 1}. Страна: ${NAMES[x.code][0]}. ${parts.join(" | ")}`;
  }).join("\n");
  return `Ты редактор новостной сводки. Для каждого события ниже напиши по-русски информативное изложение из 3–5 предложений, чтобы читатель понял суть, не открывая статьи:
— что именно произошло и чем это закончилось или к чему привело;
— кто участвует: имена с должностями, страны, ведомства, компании;
— где и когда;
— все конкретные детали из текста: цифры, суммы, сроки, число пострадавших, названия документов и решений;
— причины, контекст и позиции сторон, если они названы; цитату или заявление ключевого участника, если оно есть;
— если издания сообщают по-разному или приводят разные данные, кратко укажи это.
Пиши нейтрально, без оценок и прогнозов. Используй только факты из заголовков и анонсов ниже, ничего не добавляй от себя: ни цифр, ни имён, ни причин. Если данных мало, напиши столько, сколько есть, хоть одно предложение, но не выдумывай. Не пиши о том, чего в тексте нет (никаких «дата не указана», «подробности не сообщаются»), и не перечисляй, какие издания об этом написали, если они сообщают одно и то же. Не повторяй заголовок дословно. Если текст на английском, переведи смысл на русский. Внутри текста не используй двойные кавычки ("), только «ёлочки».
Затем для каждого события отдельно напиши «Почему это важно»: 1–2 предложения о том, какие последствия событие может иметь для страны, её жителей, экономики или безопасности, для соседей и мира и что оно меняет. Объясняй значение, а не пересказывай событие ещё раз. Здесь можно опираться на общеизвестный контекст, но не придумывай новых фактов, цифр и имён и не делай уверенных прогнозов: пиши «может», «грозит», «влияет».
Ещё определи для каждого события, внутреннее оно или внешнее для указанной страны:
"in" — происходит внутри страны и касается её самой: внутренняя политика, выборы, законы, назначения, экономика и бюджет, происшествия, теракты и преступления на её территории;
"out" — отношения страны с другими государствами и международными организациями: переговоры, визиты, заявления о других странах, санкции, внешняя торговля, войны и удары с участием других стран, события за её пределами.
Ответь только JSON: {"items":[{"id":1,"scope":"in","summary":"...","why":"..."}]}

${lines}`;
}
// Hand the events to the pool: every free service takes a batch, a failing one passes it on
const kept = { n: 0 };
const pool = HAS_AI ? await runPool({
  providers, state: poolState, jobs: [...todo, ...redo].slice(0, PER_RUN), now, makePrompt: prompt,
  apply(batch, items, p, model) {
    let n = 0;
    for (const r of items) {
      const x = batch[Number(r.id) - 1];
      const text = String(r.summary || "").trim();
      if (!x || text.length < 20) continue;
      // The new text replaces an older one kept under another article of the same event
      for (const i of x.g.items) if (i.url !== x.g.lead.url) delete summaries[i.url];
      const scope = ["in", "out"].includes(r.scope) ? r.scope : undefined;
      const why = String(r.why || "").trim().slice(0, 600) || undefined;
      summaries[x.g.lead.url] = { text: text.slice(0, 1200), why, scope, at: now, country: x.code, title: x.g.lead.title, by: p.name, v: STYLE };
      n++;
    }
    return n;
  }
}) : { done: 0, left: todo.length, report: [] };
console.log(`Summarized ${pool.done} events; ${pool.report.join("; ")}`);
const lastModel = Object.values(poolState).map(s => s.model).filter(Boolean).pop();
await writeFile("data/summary.json", JSON.stringify({
  updated: new Date().toISOString(), model: lastModel || meta.model || (HAS_AI ? "unavailable" : "off"),
  pool: poolState, items: summaries
}));

// ---------- Essays: 200–300 words per country on its main problem in politics, security, economy ----------
// One request per country writes all three. Rewritten every ESSAY_HOURS (6 by default), oldest first.
// Built from the country's current events (with their summaries); kept in data/essays.json.
const ESSAY_TOPICS = ["Политика", "Безопасность", "Экономика"], ESSAY_HOURS = Number(process.env.ESSAY_HOURS) || 6;
let essayMeta = {};
try { essayMeta = JSON.parse(await readFile("data/essays.json", "utf8")); } catch {}
const essays = essayMeta.countries || {}, essayState = essayMeta.pool || {};
const essayJobs = [];
for (const code of Object.keys(COUNTRIES)) {
  const at = Math.min(...ESSAY_TOPICS.map(t => essays[code]?.[t]?.at || 0));
  if (now - at < ESSAY_HOURS * 3600000) continue;
  let items = [];
  try { items = JSON.parse(await readFile(`data/full/${code}.json`, "utf8")).items || []; } catch {}
  const c = { code, ru: NAMES[code][0], en: EN[code], loc: NAMES[code][1] };
  const groups = core.cluster(items, c, true, Infinity);
  const byTopic = Object.fromEntries(ESSAY_TOPICS.map(t => [t, groups.filter(g => g.topic && g.topic[0] === t).slice(0, 8)]));
  if (Object.values(byTopic).every(l => !l.length)) continue;
  essayJobs.push({ code, byTopic, at });
}
essayJobs.sort((a, b) => a.at - b.at);
function essayPrompt([x]) {
  const block = ESSAY_TOPICS.map(t => {
    const lines = x.byTopic[t].map((g, i) => {
      const sum = g.items.map(a => summaries[a.url]).find(Boolean);
      const text = sum ? sum.text : g.items.slice(0, 3).map(a => `«${a.title}»` + (a.desc ? ` — ${a.desc}` : "")).join(" | ");
      return `${i + 1}) ${g.lead.title}. ${text} (пишут изданий: ${g.domains})`;
    });
    return `### ${t}\n` + (lines.join("\n") || "Событий нет.");
  }).join("\n\n");
  return `Ты обозреватель-аналитик. Напиши по-русски три сочинения о стране «${NAMES[x.code][0]}» — по одному на темы «Политика», «Безопасность» и «Экономика». Каждое 200–300 слов.
Сочинение — связный текст о главной проблеме страны в этой сфере сейчас, а не пересказ новостей по очереди:
— в первом абзаце сформулируй проблему;
— дальше раскрой её через события ниже: что происходит, кто участвует и какие у сторон позиции, конкретные факты и цифры;
— объясни причины и связь событий между собой;
— в конце скажи, что стоит на кону и от чего зависит развитие (без прогнозов от себя и без оценок «хорошо/плохо»).
Пиши нейтрально. Все конкретные факты, цифры, имена и даты бери только из событий ниже; общеизвестный фон можно упомянуть одной фразой, но ничего не выдумывай. Если по теме мало событий, напиши короче, но не меньше 120 слов, и не пиши о том, чего в данных нет. Абзацы разделяй пустой строкой (\\n\\n). Внутри текста не используй двойные кавычки ("), только «ёлочки».
Ответь только JSON: {"items":[{"topic":"Политика","title":"заголовок сочинения","text":"..."},{"topic":"Безопасность",...},{"topic":"Экономика",...}]}

События страны за последние двое суток:

${block}`;
}
// The services that can take many requests go first, so a small free quota is not spent on essays
const essayProviders = providers.map(p => ({ ...p, batch: 1 })).sort((a, b) => b.runs - a.runs);
const essayPool = HAS_AI && essayJobs.length ? await runPool({
  providers: essayProviders, state: essayState, jobs: essayJobs, now, makePrompt: essayPrompt, maxBatches: 18,
  apply([x], items, p, model) {
    let n = 0;
    for (const r of items) {
      const t = ESSAY_TOPICS.find(k => k === String(r.topic || "").trim());
      const text = String(r.text || "").replace(/\r/g, "").trim();
      if (!t || text.split(/\s+/).length < 80) continue;
      (essays[x.code] = essays[x.code] || {})[t] = { title: String(r.title || "").trim().slice(0, 160), text: text.slice(0, 4000), at: now, by: p.name };
      n++;
    }
    return n ? 1 : 0;
  }
}) : { done: 0, report: [] };
console.log(`Essays: ${essayJobs.length} countries due, ${essayPool.done} written; ${essayPool.report.join("; ")}`);
await writeFile("data/essays.json", JSON.stringify({ updated: new Date().toISOString(), pool: essayState, countries: essays }));

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
