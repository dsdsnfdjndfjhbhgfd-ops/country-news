// Checks every outlet in sources.mjs: the feed answers, holds fresh items (at least 2 in the last
// 3 days) and is written in the language it is listed under. Run by the "Проверить источники" workflow.
// Prints one line per outlet and, at the end, the names that failed.
import { SOURCES } from "./sources.mjs";
import { readFeed, parseFeed } from "./feeds.mjs";

const now = Date.now(), DAY = 86400000;
const CYR = /[а-яё]/i, LAT = /[a-z]/i;

async function check(src) {
  const t = Date.now();
  try {
    const items = parseFeed(await readFeed(src.url, 20000), src);
    const fresh = items.filter(a => now - a.t < 3 * DAY && a.t < now + 3600000);
    const cyr = items.length ? items.filter(a => CYR.test(a.title)).length / items.length : 0;
    const lat = items.length ? items.filter(a => LAT.test(a.title) && !CYR.test(a.title)).length / items.length : 0;
    const newest = items.length ? Math.round((now - Math.max(...items.map(a => a.t))) / 3600000) : null;
    let why = "";
    if (!items.length) why = "no items";
    else if (fresh.length < 2) why = `stale (newest ${newest} h ago)`;
    else if (src.lang === "Russian" && cyr < 0.5) why = `not Russian (${Math.round(cyr * 100)}% Cyrillic)`;
    else if (src.lang === "English" && lat < 0.7) why = `not English (${Math.round(lat * 100)}% Latin)`;
    return { src, ok: !why, why, items: items.length, fresh: fresh.length, ms: Date.now() - t };
  } catch (e) {
    return { src, ok: false, why: e.message.slice(0, 80), items: 0, fresh: 0, ms: Date.now() - t };
  }
}

// A hard limit per outlet: a site that keeps the connection open cannot hold the check
const limited = src => Promise.race([check(src), new Promise(res => setTimeout(() => res({ src, ok: false, why: "no answer in 30 s", items: 0, fresh: 0, ms: 30000 }), 30000))]);
const print = r => console.log(`${r.ok ? "OK  " : "FAIL"} | ${r.src.name} | ${r.src.lang} | items ${r.items}, fresh ${r.fresh} | ${r.ms} ms${r.why ? " | " + r.why : ""}`);
// 25 at a time, so a slow site does not hold the others; each line is printed as soon as it is known
const results = [];
for (let i = 0; i < SOURCES.length; i += 25) {
  const batch = await Promise.all(SOURCES.slice(i, i + 25).map(limited));
  batch.forEach(print);
  results.push(...batch);
}
const ok = results.filter(r => r.ok);
console.log(`\nWorking: ${ok.length} of ${results.length} (Russian ${ok.filter(r => r.src.lang === "Russian").length}, English ${ok.filter(r => r.src.lang === "English").length})`);
console.log("FAILED_JSON " + JSON.stringify(results.filter(r => !r.ok).map(r => [r.src.name, r.why])));
process.exit(0); // timers of abandoned requests must not keep the job alive
