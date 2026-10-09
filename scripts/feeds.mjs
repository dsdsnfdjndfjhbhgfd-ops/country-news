// Reading the outlets' RSS / Atom feeds. Used by the collector (prefetch.mjs) and by the feed check
// (check-feeds.mjs), so both see a feed the same way.

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

export function parseFeed(xml, src) {
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

// Feed text in its own encoding: some Russian outlets still publish in windows-1251.
// A hard time limit on top of the request's own: a site that keeps sending must not hold the run.
export function readFeed(url, timeout = 25000) {
  let timer;
  const limit = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`no answer in ${timeout / 1000} s`)), timeout + 5000); });
  return Promise.race([download(url, timeout), limit]).finally(() => clearTimeout(timer));
}
async function download(url, timeout) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeout), redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; country-news/1.0)", "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml, */*" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const bytes = new Uint8Array(await r.arrayBuffer());
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 300));
  const enc = ((head.match(/encoding=["']([\w-]+)["']/i) || [])[1] || (r.headers.get("content-type") || "").match(/charset=([\w-]+)/i)?.[1] || "utf-8").toLowerCase();
  try { return new TextDecoder(enc).decode(bytes); } catch { return new TextDecoder("utf-8").decode(bytes); }
}

export async function fetchFeed(src, log = console.log) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const items = parseFeed(await readFeed(src.url), src);
      log(`${src.name}: ${items.length} items`);
      return items;
    } catch (e) {
      log(`${src.name}: attempt ${attempt} failed (${e.message})`);
    }
  }
  return [];
}

// All feeds, at most `limit` at a time: hundreds of connections at once make many of them fail
export async function fetchAll(sources, limit = 24, log = console.log) {
  const out = new Array(sources.length);
  let next = 0;
  async function worker() { while (next < sources.length) { const i = next++; out[i] = await fetchFeed(sources[i], log); } }
  await Promise.all(Array.from({ length: Math.min(limit, sources.length) }, worker));
  return out;
}
