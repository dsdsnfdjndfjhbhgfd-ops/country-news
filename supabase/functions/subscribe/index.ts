// VIP subscription for ev.news: 30 days for VIP_PRICE_RUB (250 by default).
//
// Two modes, chosen by this project's secrets (Edge Functions → Secrets):
// - Test (no YOOKASSA_SHOP_ID / YOOKASSA_SECRET_KEY): "buying" activates VIP at once, nothing is charged.
// - YooKassa (both secrets set): a payment is created and the reader is sent to YooKassa's page;
//   VIP is switched on when YooKassa reports the payment as succeeded (notification to this function,
//   or the reader's "check" after coming back). The payment is always re-read from YooKassa's API,
//   so a forged notification changes nothing.
//   Optional: YOOKASSA_RECEIPT=1 adds a receipt (54-FZ) with the reader's e-mail, YOOKASSA_VAT_CODE (default 1).
//
// Requests from the site (signed in): { action: "buy" } or { action: "check" }.
// YooKassa notifications: set https://<project>.supabase.co/functions/v1/subscribe as the HTTP notification URL.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SITE = "https://dsdsnfdjndfjhbhgfd-ops.github.io/country-news/";
const ORIGINS = ["https://dsdsnfdjndfjhbhgfd-ops.github.io"];
const PRICE = Number(Deno.env.get("VIP_PRICE_RUB")) || 250;
const DAYS = 30;
const SHOP = Deno.env.get("YOOKASSA_SHOP_ID") || "", SECRET = Deno.env.get("YOOKASSA_SECRET_KEY") || "";
const LIVE = !!(SHOP && SECRET);

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

async function yookassa(path: string, init: RequestInit = {}) {
  const r = await fetch("https://api.yookassa.ru/v3" + path, {
    ...init,
    signal: AbortSignal.timeout(20000),
    headers: { Authorization: "Basic " + btoa(`${SHOP}:${SECRET}`), "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`yookassa ${r.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

// Adds DAYS to whatever VIP time the reader still has
async function activate(userId: string, provider: "test" | "yookassa") {
  const { data: cur } = await admin.from("subscriptions").select("expires_at").eq("user_id", userId).maybeSingle();
  const from = Math.max(Date.now(), cur ? Date.parse(cur.expires_at) : 0);
  const expires = new Date(from + DAYS * 86400000).toISOString();
  await admin.from("subscriptions").upsert({
    user_id: userId, plan: "vip", status: "active", provider, expires_at: expires, updated_at: new Date().toISOString(),
    ...(cur && Date.parse(cur.expires_at) > Date.now() ? {} : { started_at: new Date().toISOString() }),
  });
  return expires;
}

// Brings our record of a YooKassa payment in line with YooKassa's own; switches VIP on once
async function sync(paymentId: string) {
  const p = await yookassa("/payments/" + encodeURIComponent(paymentId));
  const { data: row } = await admin.from("payments").select("id, user_id, status, amount_rub").eq("provider_payment_id", p.id).maybeSingle();
  if (!row) return null;
  const paidRight = p.status === "succeeded" && p.paid && p.amount?.currency === "RUB" && Number(p.amount?.value) >= Number(row.amount_rub);
  if (paidRight && row.status !== "succeeded") {
    // Only the request that flips pending → succeeded extends the subscription
    const { data: flipped } = await admin.from("payments").update({ status: "succeeded", updated_at: new Date().toISOString() })
      .eq("id", row.id).neq("status", "succeeded").select("id");
    if (flipped?.length) await activate(row.user_id, "yookassa");
  } else if (p.status === "canceled" && row.status === "pending") {
    await admin.from("payments").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("id", row.id);
  }
  return p.status as string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(req) });
  if (req.method !== "POST") return reply(req, 405, { error: "method" });
  let body: { action?: string; event?: string; object?: { id?: string } };
  try { body = await req.json(); } catch { return reply(req, 400, { error: "bad_request" }); }

  // 1. Notification from YooKassa: never trusted as is, the payment is re-read from the API
  if (body.event && body.object?.id) {
    if (LIVE) { try { await sync(String(body.object.id)); } catch (e) { console.log(String(e)); } }
    return reply(req, 200, { ok: true });
  }

  // 2. Requests from the site: a signed-in reader
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u } = token ? await admin.auth.getUser(token) : { data: { user: null } };
  const user = u?.user;
  if (!user) return reply(req, 401, { error: "login_required" });

  if (body.action === "buy") {
    if (!LIVE) {
      // Test mode: a payment record for the history, and VIP at once
      await admin.from("payments").insert({ user_id: user.id, amount_rub: PRICE, status: "succeeded", provider: "test" });
      const expires = await activate(user.id, "test");
      return reply(req, 200, { mode: "test", expires_at: expires });
    }
    const value = PRICE.toFixed(2);
    const payment: Record<string, unknown> = {
      amount: { value, currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: SITE + "account.html?vip=return" },
      description: `VIP-подписка ev.news на ${DAYS} дней`,
      metadata: { user_id: user.id },
    };
    if (Deno.env.get("YOOKASSA_RECEIPT") === "1" && user.email) {
      payment.receipt = {
        customer: { email: user.email },
        items: [{ description: `VIP-подписка ev.news на ${DAYS} дней`, quantity: "1.00", amount: { value, currency: "RUB" },
          vat_code: Number(Deno.env.get("YOOKASSA_VAT_CODE")) || 1, payment_mode: "full_payment", payment_subject: "service" }],
      };
    }
    try {
      const p = await yookassa("/payments", { method: "POST", headers: { "Idempotence-Key": crypto.randomUUID() }, body: JSON.stringify(payment) });
      await admin.from("payments").insert({ user_id: user.id, amount_rub: PRICE, status: "pending", provider: "yookassa", provider_payment_id: p.id });
      return reply(req, 200, { mode: "yookassa", confirmation_url: p.confirmation?.confirmation_url });
    } catch (e) {
      console.log(String(e));
      return reply(req, 502, { error: "payment_unavailable" });
    }
  }

  if (body.action === "check") {
    // Back from YooKassa: look at the reader's last pending payment right away, without waiting for the notification
    if (LIVE) {
      const { data: last } = await admin.from("payments").select("provider_payment_id").eq("user_id", user.id)
        .eq("provider", "yookassa").eq("status", "pending").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (last?.provider_payment_id) { try { await sync(last.provider_payment_id); } catch (e) { console.log(String(e)); } }
    }
    return reply(req, 200, { ok: true });
  }

  return reply(req, 400, { error: "bad_request" });
});
