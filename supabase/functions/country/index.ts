// News about a country outside the 19 main ones, collected when a reader asks for it.
// - The browser sends only a country code (any country Intl knows, e.g. "IT", "EG").
// - The publications come from the pool the collector publishes every 15 minutes (scripts/pool.mjs):
//   every fresh item of the same ~300 trusted outlets, 48 hours. Nothing is taken from the request.
// - A country is recognised the way the collector does it for the main ones (match.ts): named in the
//   headline, or at least twice in the summary.
// - The result is kept in public.country_feeds and given to every reader until the pool is updated, so a
//   second reader of the same country waits for nothing. Every request is logged in public.country_requests
//   (admin page; daily limit of new collections: 60 per reader, 3000 for the whole site).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { MAIN, matcher, names } from "./match.ts";

const SITES = ["https://evnews.site", "https://dsdsnfdjndfjhbhgfd-ops.github.io/country-news"];
const ORIGINS = ["https://evnews.site", "https://www.evnews.site", "https://dsdsnfdjndfjhbhgfd-ops.github.io"];
const MAX_ITEMS = 3000, USER_DAILY = 60, GLOBAL_DAILY = 3000;

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}
function reply(req: Request, status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}

// Published site data: the first address that answers
async function siteJson(path: string) {
  for (const site of SITES) {
    try { const r = await fetch(site + path, { signal: AbortSignal.timeout(20000) }); if (r.ok) return await r.json(); } catch { /* next address */ }
  }
  return null;
}

type Pool = { updated: string; shards: number; sources: [string, string, string][] };
type Row = [string, string, string, string, number, string];
type Item = { url: string; title: string; desc: string; seendate: string; source: string; language: string; socialimage?: string };

// Shard by shard (newest first), so memory holds one piece of the pool at a time
async function collect(code: string, pool: Pool): Promise<Item[]> {
  const isAbout = matcher(code)!, out: Item[] = [];
  for (let i = 0; i < pool.shards && out.length < MAX_ITEMS; i++) {
    const shard = await siteJson(`/data/pool/${i}.json?v=${encodeURIComponent(pool.updated)}`) as { items?: Row[] } | null;
    if (!shard) throw new Error("pool shard " + i);
    for (const [url, title, desc, seendate, n, image] of shard.items || []) {
      const [source, language, home] = pool.sources[n] || [];
      if (!source || !isAbout(title, desc || "", home === code)) continue;
      out.push({ url, title, desc: desc || "", seendate, source, language, ...(image ? { socialimage: image } : {}) });
      if (out.length >= MAX_ITEMS) break;
    }
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return reply(req, 405, { error: "method" });

  // 1. Who asks: a signed-in reader (the feed is for signed-in readers only)
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  const user = u?.user;
  if (!user) return reply(req, 401, { error: "login_required" });

  // 2. Which country
  let input: { country?: string };
  try { input = await req.json(); } catch { return reply(req, 400, { error: "bad_request" }); }
  const code = String(input.country || "").toUpperCase();
  const n = names(code);
  if (!n) return reply(req, 400, { error: "unknown_country" });
  if (MAIN.has(code)) return reply(req, 400, { error: "main_country" }); // its file is on the site already

  // 3. The current pool; a collection made from it already is shared by everyone
  const pool = await siteJson(`/data/pool.json?t=${Date.now()}`) as Pool | null;
  const { data: kept } = await admin.from("country_feeds").select("items, pool_at, built_at").eq("country", code).maybeSingle();
  const fresh = kept && pool && Date.parse(kept.pool_at) >= Date.parse(pool.updated);
  if (fresh || (kept && !pool)) {
    await admin.from("country_requests").insert({ user_id: user.id, country: code, built: false });
    return reply(req, 200, { country: code, name: n.ru, items: kept.items, updated: kept.pool_at, cached: true, stale: !pool });
  }
  if (!pool) return reply(req, 502, { error: "data_unavailable" });

  // 4. Limits on new collections (a kept one is free)
  const since = new Date(Date.now() - 86400_000).toISOString();
  const [mine, all] = await Promise.all([
    admin.from("country_requests").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("built", true).gte("created_at", since),
    admin.from("country_requests").select("id", { count: "exact", head: true }).eq("built", true).gte("created_at", since),
  ]);
  const over = (mine.count || 0) >= USER_DAILY ? "limit_user" : (all.count || 0) >= GLOBAL_DAILY ? "limit_global" : "";
  if (over) {
    if (kept) return reply(req, 200, { country: code, name: n.ru, items: kept.items, updated: kept.pool_at, cached: true, stale: true });
    return reply(req, 429, { error: over, limit: USER_DAILY });
  }

  // 5. Collect from the pool and keep it for the next readers
  let items: Item[];
  try { items = await collect(code, pool); }
  catch (e) {
    console.log("collect failed: " + (e as Error).message);
    if (kept) return reply(req, 200, { country: code, name: n.ru, items: kept.items, updated: kept.pool_at, cached: true, stale: true });
    return reply(req, 502, { error: "data_unavailable" });
  }
  await Promise.all([
    admin.from("country_feeds").upsert({ country: code, items, n: items.length, pool_at: pool.updated, built_at: new Date().toISOString() }, { onConflict: "country" }),
    admin.from("country_requests").insert({ user_id: user.id, country: code, built: true }),
  ]);
  return reply(req, 200, { country: code, name: n.ru, items, updated: pool.updated, cached: false });
});
