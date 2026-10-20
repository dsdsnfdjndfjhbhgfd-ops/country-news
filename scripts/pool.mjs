// The pool: every fresh publication of every outlet (48 hours), not only those about the 19 main countries.
// Countries outside the main list are collected from it on request by the Edge Function `country`.
// Written as data/pool.json (index: when, how many shards, the outlets) plus data/pool/<n>.json shards,
// so the function can read the pool piece by piece. Each item is a compact row:
//   [url, title, desc, seendate, outlet number, image]
// Feeds only hold their latest items, so each run merges with the pool saved by earlier runs.
import { readFile, writeFile, mkdir, rm } from "node:fs/promises";

const SHARD = 6000, DESC = 200;
const seenTime = s => { const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})/.exec(s || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : NaN; };

export async function readPool(dir = "data") {
  try {
    const index = JSON.parse(await readFile(`${dir}/pool.json`, "utf8"));
    const out = [];
    for (let i = 0; i < index.shards; i++) {
      const rows = JSON.parse(await readFile(`${dir}/pool/${i}.json`, "utf8")).items || [];
      for (const [url, title, desc, seendate, n, image] of rows) {
        const [source, language] = index.sources[n] || [];
        if (source) out.push({ url, title, desc, seendate, t: seenTime(seendate), source, language, socialimage: image || "" });
      }
    }
    return out;
  } catch { return []; }
}

// fresh: this run's items; sources: the outlet list (sources.mjs); keepMs / perSource: same limits as the countries
export async function writePool(fresh, sources, { now = Date.now(), keepMs = 48 * 3600 * 1000, perSource = 600, dir = "data" } = {}) {
  const known = new Map(sources.map((s, i) => [s.name, i]));
  const byUrl = new Map();
  for (const a of [...await readPool(dir), ...fresh]) if (known.has(a.source)) byUrl.set(a.url, a);
  const count = new Map();
  const items = [...byUrl.values()]
    .filter(a => now - (a.t || 0) < keepMs && a.t < now + 3600000)
    .sort((x, y) => y.t - x.t)
    .filter(a => { const n = (count.get(a.source) || 0) + 1; count.set(a.source, n); return n <= perSource; });
  const rows = items.map(a => [a.url, a.title, (a.desc || "").slice(0, DESC), a.seendate, known.get(a.source), /^https:/.test(a.socialimage || "") ? a.socialimage : ""]);
  const updated = new Date(now).toISOString();
  await rm(`${dir}/pool`, { recursive: true, force: true });
  await mkdir(`${dir}/pool`, { recursive: true });
  const shards = Math.ceil(rows.length / SHARD);
  for (let i = 0; i < shards; i++) await writeFile(`${dir}/pool/${i}.json`, JSON.stringify({ updated, items: rows.slice(i * SHARD, (i + 1) * SHARD) }));
  // Outlets as [name, language, home country]: the function counts one mention as enough for an outlet of that country
  await writeFile(`${dir}/pool.json`, JSON.stringify({ updated, shards, items: rows.length, sources: sources.map(s => [s.name, s.lang, s.home || ""]) }));
  return { items: rows.length, shards };
}
