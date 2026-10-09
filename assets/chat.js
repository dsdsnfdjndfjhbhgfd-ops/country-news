// AI chat page (chat.html), VIP only: pick a country and ask about its news or its politics in general.
// The AI gets the country's top events of the last two days (grouped and ranked like the feed, up to 25)
// and the site's essays; the Edge Function "chat" reads their text from the published data itself.
// Limit: 50 000 tokens per reader per day, counted and checked by the server; resets at 00:00 Moscow time.
// A link like chat.html?c=RU&u=<article link> (from the feed) opens the chat with a question about that event.
(function () {
  const $ = s => document.querySelector(s);
  const app = $("#app"), bar = $("#countries");
  const CODES = "RU US CN UA IL IR DE GB FR TR IN JP PL BY KZ MA SA BR".split(" ");
  const NAMES = { RU: "Россия", US: "США", CN: "Китай", UA: "Украина", IL: "Израиль", IR: "Иран", DE: "Германия", GB: "Великобритания", FR: "Франция", TR: "Турция", IN: "Индия", JP: "Япония", PL: "Польша", BY: "Беларусь", KZ: "Казахстан", MA: "Марокко", SA: "Саудовская Аравия", BR: "Бразилия" };
  const ruName = { of: c => NAMES[c] || c }, enName = new Intl.DisplayNames(["en"], { type: "region" });
  const EN = { US: "United States", GB: "United Kingdom", TR: "Turkey" };
  // Locative names help the grouping ignore the country's own name in headlines ("в Казахстане")
  const LOC_RU = { RU: "России", US: "США", CN: "Китае", UA: "Украине", IL: "Израиле", IR: "Иране", DE: "Германии", GB: "Великобритании", FR: "Франции", TR: "Турции", IN: "Индии", JP: "Японии", PL: "Польше", BY: "Беларуси", KZ: "Казахстане", MA: "Марокко", SA: "Саудовской Аравии", BR: "Бразилии" };
  const countryOf = code => ({ code, ru: ruName.of(code), en: EN[code] || enName.of(code), loc: LOC_RU[code] || "" });
  const IDEAS = ["Что главное произошло за эти два дня?", "Кто сейчас главные политические игроки и чего они добиваются?", "Как эти события могут сказаться на экономике?", "Какие главные риски для страны сейчас?"];
  const STORE = "ev:chat:";

  let code = null, usage = null, eventsOpen = false;
  const feeds = {};  // code -> { events, all, loadedAt } | { error }
  const chats = {};  // code -> { msgs, draft, busy, error, pin }

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const fmt = n => Number(n || 0).toLocaleString("ru-RU");
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
  const short = t => { t = String(t || ""); for (const sep of [" :: ", " | ", " – ", " - "]) { const i = t.indexOf(sep, 30); if (i > 0) t = t.slice(0, i); } return t.length > 170 ? t.slice(0, 167).replace(/\s+\S*$/, "") + "…" : t; };
  const eventLink = (c, url) => `article.html?c=${c}&u=${encodeURIComponent(url)}`;

  // The conversation lives in this tab only (sessionStorage), one per country
  function chatOf(c) {
    if (!chats[c]) {
      let msgs = [];
      try { msgs = JSON.parse(sessionStorage.getItem(STORE + c) || "[]"); } catch {}
      chats[c] = { msgs: Array.isArray(msgs) ? msgs : [], draft: "", busy: false, error: "", pin: null };
    }
    return chats[c];
  }
  function keep(c) { try { sessionStorage.setItem(STORE + c, JSON.stringify(chats[c].msgs.slice(-40))); } catch {} }
  function forgetAll() {
    for (const c of CODES) { delete chats[c]; try { sessionStorage.removeItem(STORE + c); } catch {} }
  }

  // The country's top events, as in the feed: last two days, grouped by event, most covered first
  async function loadEvents(c) {
    const have = feeds[c];
    if (have && !have.error && Date.now() - have.loadedAt < 15 * 60000) return have;
    let v = String(Math.floor(Date.now() / 60000));
    try { const r = await fetch("data/status.json?t=" + Date.now(), { cache: "no-store" }); if (r.ok) v = (await r.json()).updated || v; } catch {}
    try {
      const r = await fetch(`data/${c}.json?v=${encodeURIComponent(v)}`);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const items = (await r.json()).items || [];
      const seen = new Set(), from = Date.now() - 48 * 3600000;
      const recent = items.filter(a => { const k = low(a.title).slice(0, 70); if (!a.title || seen.has(k)) return false; seen.add(k); return seenTime(a.seendate) >= from; });
      let marks = {};
      try { const m = await fetch(`data/importance.json?v=${encodeURIComponent(v)}`); if (m.ok) marks = (await m.json()).items || {}; } catch {}
      const rateOf = g => { for (const i of g.items) if (marks[i.url]) return marks[i.url]; return null; };
      const events = cluster(recent, countryOf(c), true, 25, rateOf).map(g => ({ url: g.lead.url, title: short(g.lead.title), source: g.lead.source || g.lead.domain, outlets: g.domains }));
      const all = new Map(items.map(a => [a.url, a]));
      feeds[c] = { events, all, loadedAt: Date.now() };
    } catch (e) {
      console.error(e);
      feeds[c] = { error: true };
    }
    return feeds[c];
  }
  // What the AI is given: the event asked about (from the feed link) first, then the top events
  function eventsFor(c) {
    const f = feeds[c], st = chatOf(c);
    if (!f || f.error) return [];
    const list = f.events.slice();
    if (st.pin) { const i = list.findIndex(e => e.url === st.pin.url); if (i >= 0) list.splice(i, 1); list.unshift(st.pin); }
    return list.slice(0, 25);
  }

  function loadUsage() {
    if (!Account.vip) { usage = null; return; }
    Account.chatStatus().then(u => { if (u) { usage = u; paint(); } });
  }

  // ---------- Country chips ----------
  function paintCountries() {
    bar.textContent = "";
    const mine = Account.countries.filter(c => CODES.includes(c));
    const order = [...mine, ...CODES.filter(c => !mine.includes(c))];
    for (const c of order) {
      const b = el("button", null, ruName.of(c)); b.type = "button";
      b.setAttribute("aria-pressed", String(c === code));
      if (chats[c]?.msgs.length) { const d = el("span", "dot"); d.title = "Есть разговор"; b.append(d); }
      b.onclick = () => pick(c);
      bar.append(b);
    }
  }
  function pick(c, keepFocus = true) {
    if (!CODES.includes(c)) return;
    code = c;
    try { history.replaceState(null, "", location.pathname + "#" + c); } catch {}
    paintCountries(); paint();
    loadEvents(c).then(() => { if (code === c) paint(); });
    if (keepFocus) setTimeout(() => $("#q")?.focus(), 0);
  }

  // ---------- Main area ----------
  // "[3]" in an answer links to the event page of the 3rd event the AI was given
  function answerText(text, urls, c) {
    const p = el("div", "text");
    let last = 0;
    for (const m of text.matchAll(/\[(\d{1,2})\]/g)) {
      const url = urls[Number(m[1]) - 1];
      if (!url) continue;
      p.append(document.createTextNode(text.slice(last, m.index)));
      const a = el("a", "ref", m[1]); a.href = eventLink(c, url); a.title = "Открыть событие";
      p.append(a); last = m.index + m[0].length;
    }
    p.append(document.createTextNode(text.slice(last)));
    return p;
  }

  function gate() {
    const g = el("div", "gate");
    g.append(el("h2", null, "Войдите в ev.news"), el("p", null, "Чат с ИИ доступен читателям с VIP-подпиской. Войдите в аккаунт, чтобы продолжить."));
    const row = el("div", "row");
    const a = el("button", null, "Войти"); a.type = "button"; a.onclick = () => Account.openDialog("signin");
    const b = el("button", "alt", "Зарегистрироваться"); b.type = "button"; b.onclick = () => Account.openDialog("signup");
    row.append(a, b); g.append(row);
    return g;
  }
  function teaser() {
    const box = el("section", "panel");
    box.append(el("h2", null, "Чат доступен с VIP-подпиской"));
    const ul = el("ul", "perks");
    for (const t of ["Вопросы о новостях любой из 18 стран за последние два дня", "Разбор политики, безопасности и экономики страны с позициями сторон", "Ответы со ссылками на события ленты", "До 50 000 токенов в сутки, лимит обновляется в 00:00 по Москве"]) ul.append(el("li", null, t));
    const a = el("a", "buy", "Оформить VIP в кабинете"); a.href = "account.html";
    box.append(ul, a);
    return box;
  }

  function paint() {
    const hadFocus = document.activeElement && document.activeElement.id === "q";
    app.textContent = "";
    if (!Account.available) { app.append(el("p", "err", "Вход сейчас недоступен: не загрузился модуль входа. Обновите страницу.")); return; }
    if (!Account.user) { app.append(gate()); return; }
    if (!Account.vip) { app.append(teaser()); return; }
    if (!code) return;

    const c = code, st = chatOf(c), f = feeds[c], events = eventsFor(c);
    const box = el("section", "panel"); box.setAttribute("aria-label", "Чат с ИИ");
    const head = el("div", "panel-head");
    head.append(el("h2", null, `ИИ о стране: ${ruName.of(c)}`));
    const left = usage ? Math.max(0, usage.limit - usage.used) : null;
    head.append(el("span", "usage", usage ? `Осталось ${fmt(left)} из ${fmt(usage.limit)} токенов на сегодня` : `Лимит: ${fmt(Account.chatLimit)} токенов в сутки`));
    box.append(head);
    if (usage) {
      const m = el("div", "meter" + (left < usage.limit * 0.15 ? " low" : "")); m.setAttribute("role", "img");
      m.setAttribute("aria-label", `Израсходовано ${fmt(usage.used)} из ${fmt(usage.limit)} токенов`);
      const i = el("i"); i.style.width = Math.min(100, usage.used / usage.limit * 100) + "%"; m.append(i);
      box.append(m);
    }

    const log = el("div", "log"); log.setAttribute("role", "log"); log.setAttribute("aria-live", "polite");
    if (!st.msgs.length) {
      log.append(el("p", "lead", "Спросите о конкретной новости или о политике страны в целом. Например:"));
      const ideas = el("div", "ideas");
      for (const q of IDEAS) { const b = el("button", null, q); b.type = "button"; b.disabled = st.busy || !f || f.error; b.onclick = () => send(c, q); ideas.append(b); }
      log.append(ideas);
    }
    for (const m of st.msgs) {
      const row = el("div", "m " + (m.role === "user" ? "me" : "ai"));
      row.append(m.role === "user" ? el("div", "text", m.content) : answerText(m.content, m.urls || [], c));
      log.append(row);
    }
    if (st.busy) { const w = el("div", "m ai wait"); w.append(el("span", "spinner"), document.createTextNode("ИИ думает…")); log.append(w); }
    box.append(log);

    if (!f) { const s = el("p", "status"); s.append(el("span", "spinner"), document.createTextNode("Загружаю новости страны…")); box.append(s); }
    else if (f.error) {
      const s = el("p", "err", "Не удалось загрузить новости страны. ");
      const r = el("button", "linkbtn", "Попробовать ещё раз"); r.type = "button"; r.onclick = () => { delete feeds[c]; pick(c); };
      s.append(r); box.append(s);
    }
    if (st.error) box.append(el("p", "err", st.error));

    const form = el("form", "form");
    const ta = el("textarea"); ta.id = "q"; ta.rows = 2; ta.maxLength = 1000; ta.value = st.draft;
    ta.placeholder = `Вопрос о стране: ${ruName.of(c)}`; ta.setAttribute("aria-label", "Ваш вопрос");
    ta.oninput = () => { st.draft = ta.value; };
    ta.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); } };
    const go = el("button", "send", "Спросить"); go.type = "submit"; go.disabled = st.busy || !f || !!f.error;
    form.onsubmit = e => { e.preventDefault(); send(c, ta.value); };
    form.append(ta, go);
    box.append(form);

    const foot = el("div", "foot");
    if (st.msgs.length && !st.busy) {
      const reset = el("button", "linkbtn", "Новый разговор"); reset.type = "button";
      reset.onclick = () => { st.msgs = []; st.error = ""; st.pin = null; keep(c); paintCountries(); paint(); $("#q")?.focus(); };
      foot.append(reset);
    }
    foot.append(el("span", null, "Enter — отправить, Shift+Enter — новая строка. Длинный разговор расходует больше токенов: ИИ перечитывает его целиком."));
    box.append(foot);

    if (events.length) {
      const d = el("details", "events"); d.open = eventsOpen;
      d.ontoggle = () => { eventsOpen = d.open; };
      d.append(el("summary", null, `События, которые видит ИИ (${events.length})`));
      const ol = el("ol");
      events.forEach((e, k) => {
        const li = el("li", st.pin && st.pin.url === e.url ? "pin" : null);
        const body = el("span"); const a = el("a", null, e.title); a.href = eventLink(c, e.url);
        body.append(a, el("small", null, ` · ${e.source}` + (e.outlets > 1 ? `, пишут ${e.outlets} ${plural(e.outlets, "издание", "издания", "изданий")}` : "")));
        li.append(el("b", null, String(k + 1)), body);
        ol.append(li);
      });
      d.append(ol);
      box.append(d);
    }

    app.append(box);
    log.scrollTop = log.scrollHeight;
    if (hadFocus) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  }

  async function send(c, text) {
    const st = chatOf(c), q = String(text || "").trim();
    if (!q || st.busy) return;
    const urls = eventsFor(c).map(e => e.url);
    st.msgs.push({ role: "user", content: q.slice(0, 1000) });
    st.draft = ""; st.error = ""; st.busy = true;
    if (code === c) { paintCountries(); paint(); }
    try {
      const r = await Account.chat(c, urls, st.msgs.map(m => ({ role: m.role, content: m.content })));
      st.msgs.push({ role: "assistant", content: r.answer, urls: r.urls || urls });
      usage = { used: r.used, limit: r.limit, resetAt: r.resetAt };
    } catch (e) {
      st.msgs.pop(); st.draft = q; st.error = e.message;
      if (e.usage) usage = { used: e.usage.used, limit: e.usage.limit, resetAt: e.usage.resetAt };
    }
    st.busy = false;
    keep(c);
    if (code === c) { paintCountries(); paint(); }
  }

  // ---------- Start ----------
  // From the feed: chat.html?c=RU&u=<link> asks about that event; otherwise #RU or the reader's first country
  async function start() {
    const qs = new URLSearchParams(location.search);
    const fromLink = (qs.get("c") || "").toUpperCase(), pinUrl = qs.get("u");
    const fromHash = location.hash.slice(1).toUpperCase();
    const first = [fromLink, fromHash, ...Account.countries, "RU"].find(c => CODES.includes(c));
    paintCountries();
    if (Account.user) loadUsage();
    pick(first, false);
    if (pinUrl && first === fromLink && /^https?:\/\//i.test(pinUrl)) {
      const f = await loadEvents(first);
      const a = f.all && f.all.get(pinUrl);
      if (a) {
        const st = chatOf(first);
        st.pin = { url: a.url, title: short(a.title), source: a.source || a.domain, outlets: 1 };
        st.draft = `Расскажи подробнее о событии «${short(a.title)}»: что произошло, кто участвует и почему это важно?`;
        if (code === first) paint();
        setTimeout(() => $("#q")?.focus(), 0);
      }
    }
  }
  window.addEventListener("hashchange", () => { const c = location.hash.slice(1).toUpperCase(); if (c !== code && CODES.includes(c)) pick(c, false); });

  let started = false;
  Account.ready.then(() => { started = true; start(); });
  Account.onChange(e => {
    if (!started || e === "TOKEN_REFRESHED") return;
    if (e === "SIGNED_OUT") { forgetAll(); usage = null; }
    if (e === "SIGNED_IN" || e === "INITIAL_SESSION" || e === "VIP") loadUsage();
    paintCountries(); paint();
  });
})();
