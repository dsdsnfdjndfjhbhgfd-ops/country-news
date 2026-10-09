// A pool of AI services for the "Кратко" summaries. Every service the owner has a key for becomes
// a "provider"; the collector hands batches of events to whichever provider is free, and when one
// runs out of its free limit (429) or fails, the batch goes to the next one.
//
// Providers come from repository secrets/variables (names are the only thing the code knows):
//   LLM_API_KEY  + LLM_BASE_URL [+ LLM_MODEL]   the first service (name "main")
//   LLM_KEY_<NAME>                               a key of one more service, e.g. LLM_KEY_GROQ
//     LLM_BASE_<NAME>   optional, the OpenAI-compatible address (known names have a default)
//     LLM_MODEL_<NAME>  optional, model id(s) separated by commas
//     LLM_BATCH_<NAME>  optional, events per request (default: see KNOWN)
//     LLM_GAP_<NAME>    optional, minutes between requests (default: see KNOWN)
//     LLM_RUNS_<NAME>   optional, requests per collection (default: see KNOWN)
//     LLM_PARALLEL_<NAME> optional, how many of those requests go at the same time (default 1)
//   LLM_MAX_TOKENS                               optional, answer length limit for every service (default 30000)
//   ANTHROPIC_API_KEY                            Claude (name "claude")
// Gemini and Groq are switched off: a provider at their address (or named GEMINI / GROQ) is skipped,
// so all requests go to DeepSeek (now the service in LLM_KEY_EXTRA1 + LLM_BASE_EXTRA1).
// Nothing here prints or stores a key.

const KNOWN = {
  CEREBRAS:   { base: "https://api.cerebras.ai/v1", models: ["llama-3.3-70b", "llama3.1-8b"], batch: 25, gap: 15, runs: 2 },
  MISTRAL:    { base: "https://api.mistral.ai/v1", models: ["mistral-small-latest"], batch: 25, gap: 30, runs: 1 },
  DEEPSEEK:   { base: "https://api.deepseek.com", models: ["deepseek-chat"], batch: 30, gap: 5, runs: 3 },
  OPENROUTER: { base: "https://openrouter.ai/api/v1", batch: 20, gap: 30, runs: 1 },
  TOGETHER:   { base: "https://api.together.xyz/v1", models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo"], batch: 25, gap: 30, runs: 1 },
  SAMBANOVA:  { base: "https://api.sambanova.ai/v1", models: ["Meta-Llama-3.3-70B-Instruct"], batch: 25, gap: 30, runs: 1 },
  NVIDIA:     { base: "https://integrate.api.nvidia.com/v1", models: ["meta/llama-3.3-70b-instruct"], batch: 25, gap: 30, runs: 1 },
  OPENAI:     { base: "https://api.openai.com/v1", models: ["gpt-4o-mini"], batch: 30, gap: 5, runs: 3 }
};

const OFF_NAMES = new Set(["GEMINI", "GROQ"]);
const OFF_BASE = /generativelanguage\.googleapis\.com|api\.groq\.com/i;

// GitHub gives secrets only to steps that name them; ALL_SECRETS carries the whole set as JSON
// and only names that start with LLM_ or ANTHROPIC_ are ever read from it.
export function readEnv(env = process.env) {
  const out = { ...env };
  for (const k of ["ALL_SECRETS", "ALL_VARS"]) {
    try { for (const [n, v] of Object.entries(JSON.parse(env[k] || "{}"))) if (/^(LLM_|ANTHROPIC_)/.test(n) && v && !out[n]) out[n] = String(v); } catch {}
  }
  return out;
}

export function loadProviders(rawEnv = process.env) {
  const env = readEnv(rawEnv), list = [];
  const num = (v, d) => Number(v) > 0 ? Number(v) : d;
  // Long enough for "thinking" models, which reason before they answer
  const maxTokens = num(env.LLM_MAX_TOKENS, 30000);
  const split = v => String(v || "").split(",").map(s => s.trim()).filter(Boolean);
  if (env.LLM_API_KEY) {
    const base = (env.LLM_BASE_URL || "https://openrouter.ai/api/v1").replace(/\/+$/, "");
    if (OFF_BASE.test(base)) console.log("Provider main: Gemini / Groq are switched off, skipped");
    else {
      const known = Object.values(KNOWN).find(k => k.base === base) || {};
      list.push({ name: "main", kind: "openai", key: env.LLM_API_KEY, base, models: split(env.LLM_MODEL), defaults: known.models || [],
        batch: num(env.LLM_BATCH, known.batch || 30), gap: num(env.LLM_GAP, known.gap || 100), runs: num(env.LLM_RUNS, known.runs || 1),
        parallel: num(env.LLM_PARALLEL, 1), maxTokens });
    }
  }
  for (const [n, key] of Object.entries(env)) {
    const m = n.match(/^LLM_KEY_([A-Z0-9]+)$/);
    if (!m || !key) continue;
    const N = m[1], k = KNOWN[N] || {};
    const base = (env["LLM_BASE_" + N] || k.base || "").replace(/\/+$/, "");
    if (OFF_NAMES.has(N) || OFF_BASE.test(base)) { console.log(`Provider ${N}: Gemini / Groq are switched off, skipped`); continue; }
    if (!base) { console.log(`Provider ${N}: no address known, add the variable LLM_BASE_${N}`); continue; }
    list.push({ name: N.toLowerCase(), kind: "openai", key, base, models: split(env["LLM_MODEL_" + N]), defaults: k.models || [],
      batch: num(env["LLM_BATCH_" + N], k.batch || 25), gap: num(env["LLM_GAP_" + N], k.gap || 30), runs: num(env["LLM_RUNS_" + N], k.runs || 1),
      parallel: num(env["LLM_PARALLEL_" + N], 1), maxTokens });
  }
  if (env.ANTHROPIC_API_KEY) list.push({ name: "claude", kind: "claude", key: env.ANTHROPIC_API_KEY, models: [env.ANTHROPIC_MODEL || "claude-haiku-4-5"], defaults: [], batch: 30, gap: 5, runs: 3, parallel: 1, maxTokens: 8000 });
  return list;
}

async function modelsOf(p) {
  if (p.models.length) return p.models;
  if (p.base.includes("openrouter.ai")) {
    try {
      const r = await fetch(p.base + "/models", { signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${p.key}` } });
      if (!r.ok) throw new Error("HTTP " + r.status);
      let ids = ((await r.json()).data || []).map(m => String(m.id).replace(/^models\//, ""));
      ids = ids.filter(id => /:free$/.test(id));
      const rank = id => /deepseek/i.test(id) ? 0 : /(qwen|llama|gemma|mistral)/i.test(id) ? 1 : 2;
      const plain = id => /(r1|reason|think)/i.test(id) ? 1 : 0;
      return ids.sort((x, y) => rank(x) - rank(y) || plain(x) - plain(y)).slice(0, 4);
    } catch (e) { console.log(`${p.name}: could not list models: ${e.message}`); return []; }
  }
  return p.defaults;
}

// One request to one provider; tries its models in turn. Returns { text, model }.
export async function askProvider(p, text) {
  if (p.kind === "claude") {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST", signal: AbortSignal.timeout(120000),
      headers: { "x-api-key": p.key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: p.models[0], max_tokens: p.maxTokens || 8000, messages: [{ role: "user", content: text }] })
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return { text: (await r.json()).content?.[0]?.text || "", model: p.models[0] };
  }
  const models = await modelsOf(p);
  if (!models.length) throw new Error("no model to ask");
  const errors = [];
  for (const model of models) {
    try {
      const call = () => fetch(p.base + "/chat/completions", {
        method: "POST", signal: AbortSignal.timeout(150000), // a slow answer must not hold the whole collection
        headers: { "Authorization": `Bearer ${p.key}`, "Content-Type": "application/json", "HTTP-Referer": "https://github.com/dsdsnfdjndfjhbhgfd-ops/country-news", "X-Title": "ev.news" },
        body: JSON.stringify({ model, temperature: 0.2, max_tokens: p.maxTokens || 30000, messages: [{ role: "user", content: text }] })
      });
      let r = await call();
      if (r.status === 503) { await new Promise(res => setTimeout(res, 8000)); r = await call(); }
      const body = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${body.replace(/\s+/g, " ").slice(0, r.status === 429 ? 900 : 300)}`);
      let data; try { data = JSON.parse(body); } catch { throw new Error(`not JSON: ${body.slice(0, 120)}`); }
      const content = (data.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "");
      if (!content.includes("{")) throw new Error(`no JSON in answer: ${body.slice(0, 120)}`);
      return { text: content, model };
    } catch (e) { errors.push(`${model}: ${e.message}`); }
  }
  throw new Error(errors.join(" | "));
}

// "retry in 1h50m28s" / "try again in 12.5s" -> milliseconds (0 when the text says nothing)
export function retryAfterMs(message) {
  const m = String(message).match(/(?:retry|try again) in (?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?/i);
  return m ? ((+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0)) * 1000 : 0;
}

// Pulls { id, summary } pairs out of a model's answer, also when the JSON is slightly broken
export function parseAnswer(out) {
  const body = out.slice(out.indexOf("{"), out.lastIndexOf("}") + 1);
  try { return JSON.parse(body).items || []; } catch {}
  // Broken JSON: read each {...} object field by field
  const items = [];
  // A value runs up to the next `", "key":` or the closing `"}`, so stray quotes inside it survive
  const field = (obj, k) => {
    const m = obj.match(new RegExp(`"${k}"\\s*:\\s*(?:(\\d+)|"([\\s\\S]*?)"\\s*(?=,\\s*"\\w+"\\s*:|\\}))`));
    return !m ? undefined : m[1] != null ? m[1] : m[2].replace(/\\"/g, "'").replace(/"/g, "'").replace(/\\n/g, "\n");
  };
  for (const [obj] of body.matchAll(/\{[^{}]*"id"[^{}]*\}/g)) {
    const id = field(obj, "id");
    if (id != null) items.push({ id, scope: field(obj, "scope"), summary: field(obj, "summary"), why: field(obj, "why"), topic: field(obj, "topic"), title: field(obj, "title"), text: field(obj, "text") });
  }
  if (!items.length) throw new Error("answer was not valid JSON");
  return items;
}

// The scheduler. `state` is the saved per-provider memory { name: { lastAskAt, blockedUntil, lastError, asked, ok, day } }.
// `jobs` is the list of events still without a summary (best first), `makePrompt(batch)` builds a request,
// `apply(batch, items, provider, model)` stores the answers and returns how many were kept.
// A provider is skipped while it is paused after an error or while its gap since the last request has not passed.
// `deadline` (a time stamp): no new request starts after it, the rest waits for the next collection.
export async function runPool({ providers, state, jobs, now, makePrompt, apply, maxBatches = 40, deadline = Infinity, log = console.log }) {
  let left = jobs.slice(), done = 0;
  const report = [];
  for (const p of providers) {
    const s = state[p.name] = state[p.name] || {};
    if ((s.blockedUntil || 0) > now) { report.push(`${p.name}: paused until ${new Date(s.blockedUntil).toISOString()}`); continue; }
    if (s.lastAskAt && now - s.lastAskAt < p.gap * 60000) { report.push(`${p.name}: next request is not due yet`); continue; }
    if (Date.now() > deadline) { report.push(`${p.name}: out of time, the rest goes to the next run`); continue; }
    let used = 0, runs = Math.min(p.runs, maxBatches), stop = false;
    // `parallel` requests go out together; a round waits for all of them before the next one starts
    while (runs > 0 && left.length && !stop) {
      const round = [];
      for (let k = 0; k < Math.min(p.parallel || 1, runs) && left.length; k++) {
        const batch = left.splice(0, p.batch); // taken out of the queue; returned if the request fails
        round.push(batch);
      }
      runs -= round.length; maxBatches -= round.length;
      s.lastAskAt = now; s.asked = (s.asked || 0) + round.length;
      const results = await Promise.all(round.map(batch => askProvider(p, makePrompt(batch))
        .then(({ text, model }) => ({ batch, kept: apply(batch, parseAnswer(text), p, model), model }))
        .catch(e => ({ batch, error: e }))));
      for (const r of results) {
        if (!r.error) { s.model = r.model; s.lastError = ""; s.ok = (s.ok || 0) + 1; done += r.kept; used += r.kept; continue; }
        left.unshift(...r.batch); // back to the front of the queue: the next service takes it
        s.lastError = String(r.error.message).slice(0, 300);
        log(`${p.name}: ${s.lastError}`);
        if (/JSON/.test(r.error.message)) continue; // a malformed answer costs only this batch
        // Out of quota: wait as long as the service says (at least 30 min). Other failures: 20 min.
        s.blockedUntil = now + (/HTTP 429/.test(r.error.message) ? Math.max(retryAfterMs(r.error.message), 30 * 60000) : /HTTP 40[13]/.test(r.error.message) ? 6 * 3600000 : 20 * 60000); // a rejected key is not retried every run
        stop = true;
      }
      if (Date.now() > deadline) stop = true;
      if (runs > 0 && left.length && !stop) await new Promise(res => setTimeout(res, 7000));
    }
    report.push(`${p.name}: +${used}`);
  }
  return { done, left: left.length, report };
}
