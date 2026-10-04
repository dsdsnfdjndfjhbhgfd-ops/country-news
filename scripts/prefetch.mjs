// Collects GDELT articles for popular countries and saves them to data/<CODE>.json,
// so the site can show these countries instantly without waiting for GDELT.
import { writeFile, mkdir } from "node:fs/promises";

const COUNTRIES = {
  RU: "Russia", US: "United States", CN: "China", UA: "Ukraine", KZ: "Kazakhstan",
  DE: "Germany", TR: "Turkey", IL: "Israel", IN: "India", BY: "Belarus",
  FR: "France", JP: "Japan", GB: "United Kingdom", IR: "Iran", UZ: "Uzbekistan",
  KG: "Kyrgyzstan", AM: "Armenia", AZ: "Azerbaijan", GE: "Georgia", PL: "Poland",
  IT: "Italy", ES: "Spain", BR: "Brazil", KR: "South Korea", KP: "North Korea",
  SA: "Saudi Arabia", AE: "United Arab Emirates", EG: "Egypt", MD: "Moldova", TJ: "Tajikistan"
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
let last = 0;

async function gdelt(query) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const wait = 6000 - (Date.now() - last);
    if (wait > 0) await sleep(wait);
    last = Date.now();
    try {
      const url = "https://api.gdeltproject.org/api/v2/doc/doc?query=" + encodeURIComponent(query) +
        "&mode=artlist&format=json&maxrecords=75&timespan=7d&sort=hybridrel";
      const r = await fetch(url, { signal: AbortSignal.timeout(60000) });
      const txt = await r.text();
      last = Date.now();
      if (!r.ok) throw new Error("HTTP " + r.status);
      return JSON.parse(txt).articles || [];
    } catch (e) {
      console.log(`  attempt ${attempt} failed for "${query}": ${e.message}`);
      await sleep(8000 * attempt);
    }
  }
  return null;
}

// Split the list between parallel jobs: SHARD=0..SHARDS-1 (each job runs on its own runner, so GDELT limits apply separately)
const SHARDS = Number(process.env.SHARDS || 1), SHARD = Number(process.env.SHARD || 0);
const mine = Object.entries(COUNTRIES).filter((_, i) => i % SHARDS === SHARD);

const OUT = process.env.OUT_DIR || "data";
await mkdir(OUT, { recursive: true });
let ok = 0;
for (const [code, name] of mine) {
  console.log(code, name);
  const ru = await gdelt(`${name} sourcelang:russian`);
  const en = await gdelt(`${name} sourcelang:english`);
  if (!ru && !en) { console.log("  skipped"); continue; }
  const keep = a => ({ url: a.url, title: a.title, seendate: a.seendate, socialimage: a.socialimage, domain: a.domain, language: a.language, sourcecountry: a.sourcecountry });
  const items = [...(ru || []), ...(en || [])].map(keep);
  await writeFile(`${OUT}/${code}.json`, JSON.stringify({ updated: new Date().toISOString(), complete: !!(ru && en), items }));
  ok++;
}
console.log(`Saved ${ok} of ${mine.length} countries`);
if (!ok) process.exit(1);
