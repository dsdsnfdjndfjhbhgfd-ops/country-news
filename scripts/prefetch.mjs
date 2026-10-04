// Collects the last 2 days of news for key countries from Google News RSS
// (Russian and English editions) and saves them to data/<CODE>.json for the site.
import { writeFile, mkdir } from "node:fs/promises";

const COUNTRIES = {
  RU: ["Россия", "Russia"], US: ["США", "United States"], CN: ["Китай", "China"],
  UA: ["Украина", "Ukraine"], IL: ["Израиль", "Israel"], IR: ["Иран", "Iran"],
  DE: ["Германия", "Germany"], GB: ["Великобритания", "United Kingdom"],
  FR: ["Франция", "France"], TR: ["Турция", "Turkey"]
};
const EDITIONS = [
  { lang: "Russian", idx: 0, params: "hl=ru&gl=RU&ceid=RU:ru" },
  { lang: "English", idx: 1, params: "hl=en-US&gl=US&ceid=US:en" }
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const decode = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&").trim();
const tag = (block, name) => { const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`)); return m ? decode(m[1]) : ""; };
// GDELT-style timestamp the page already understands: 20261004T153000Z
const stamp = d => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");

async function feed(query, params) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + " when:2d")}&${params}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { "User-Agent": "Mozilla/5.0 (country-news prefetch)" } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.text();
    } catch (e) {
      console.log(`  attempt ${attempt} failed for "${query}": ${e.message}`);
      await sleep(3000 * attempt);
    }
  }
  return null;
}

function parse(xml, lang) {
  const out = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    let title = tag(b, "title");
    const source = tag(b, "source");
    const srcUrl = (b.match(/<source[^>]*url="([^"]+)"/) || [])[1] || "";
    if (source && title.endsWith(" - " + source)) title = title.slice(0, -(source.length + 3));
    const date = new Date(tag(b, "pubDate"));
    let domain = source;
    try { if (srcUrl) domain = new URL(srcUrl).hostname.replace(/^www\./, ""); } catch {}
    if (!title || isNaN(date)) continue;
    out.push({ url: tag(b, "link"), title, seendate: stamp(date), socialimage: "", domain, source, language: lang });
  }
  return out;
}

await mkdir("data", { recursive: true });
let ok = 0;
for (const [code, names] of Object.entries(COUNTRIES)) {
  const items = [];
  let parts = 0;
  for (const ed of EDITIONS) {
    const xml = await feed(names[ed.idx], ed.params);
    if (xml) { items.push(...parse(xml, ed.lang)); parts++; }
    await sleep(1000);
  }
  console.log(`${code}: ${items.length} items`);
  if (!items.length) continue;
  await writeFile(`data/${code}.json`, JSON.stringify({ updated: new Date().toISOString(), complete: parts === EDITIONS.length, items }));
  ok++;
}
console.log(`Saved ${ok} of ${Object.keys(COUNTRIES).length} countries`);
if (!ok) process.exit(1);
