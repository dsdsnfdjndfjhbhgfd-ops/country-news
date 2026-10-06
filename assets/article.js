// Event page: article.html?c=RU&u=<article url>
// Rebuilds the same event the feed showed (same 48-hour window, same grouping in core.js)
// and shows who reports it, the outlets' own summaries and where to read in full.
const $ = s => document.querySelector(s);

function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  document.querySelectorAll(".theme button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.t === (t || "auto"))));
  try { t === "auto" ? localStorage.removeItem("cn:theme") : localStorage.setItem("cn:theme", t); } catch {}
}
let savedTheme = "auto"; try { savedTheme = localStorage.getItem("cn:theme") || "auto"; } catch {}
applyTheme(savedTheme);
document.querySelectorAll(".theme button").forEach(b => b.onclick = () => { applyTheme(b.dataset.t); Account.saveSettings({ theme: b.dataset.t }); });

const COUNTRIES = {
  RU: ["Россия", "Russia", "России"], US: ["США", "United States", "США"], CN: ["Китай", "China", "Китае"],
  UA: ["Украина", "Ukraine", "Украине"], IL: ["Израиль", "Israel", "Израиле"], IR: ["Иран", "Iran", "Иране"],
  DE: ["Германия", "Germany", "Германии"], GB: ["Великобритания", "United Kingdom", "Великобритании"],
  FR: ["Франция", "France", "Франции"], TR: ["Турция", "Turkey", "Турции"],
  IN: ["Индия", "India", "Индии"], JP: ["Япония", "Japan", "Японии"], PL: ["Польша", "Poland", "Польше"],
  BY: ["Беларусь", "Belarus", "Беларуси"], KZ: ["Казахстан", "Kazakhstan", "Казахстане"],
  MA: ["Марокко", "Morocco", "Марокко"], SA: ["Саудовская Аравия", "Saudi Arabia", "Саудовской Аравии"], BR: ["Бразилия", "Brazil", "Бразилии"]
};

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function plural(n, one, few, many) { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; }
function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : "#"; }
function fmtDate(s) {
  const t = seenTime(s); if (isNaN(t)) return "";
  return new Date(t).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}
function cleanTitle(t) {
  t = String(t || "");
  for (const sep of [" :: ", " | ", " – ", " - "]) { const i = t.indexOf(sep, 30); if (i > 0) t = t.slice(0, i); }
  t = t.replace(/\s+([,.:;!?»)%])/g, "$1").replace(/([«(])\s+/g, "$1");
  return t.length > 220 ? t.slice(0, 217).replace(/\s+\S*$/, "") + "…" : t;
}
function meter(n, color) {
  const m = el("span", "meter");
  m.setAttribute("role", "img");
  m.setAttribute("aria-label", `Пишут ${n} ${plural(n, "издание", "издания", "изданий")}`);
  if (color) m.style.setProperty("--tc", `var(${color})`);
  for (let k = 0; k < 8; k++) m.append(el("i", k < n ? "on" : ""));
  return m;
}
function dedupe(items) {
  const seen = new Set();
  return items.filter(a => { const k = low(a.title).slice(0, 70); if (!a.title || seen.has(k)) return false; seen.add(k); return true; });
}
// One article per outlet (the newest), the lead outlet first
function outlets(g, lead) {
  const by = new Map();
  for (const x of g.items) {
    const k = x.source || x.domain;
    if (!by.has(k) || seenTime(x.seendate) > seenTime(by.get(k).seendate)) by.set(k, x);
  }
  const list = [...by.values()].filter(x => safeUrl(x.url) !== "#");
  const leadKey = lead.source || lead.domain;
  return list.sort((x, y) => ((y.source || y.domain) === leadKey) - ((x.source || x.domain) === leadKey) || seenTime(y.seendate) - seenTime(x.seendate));
}
// A separate browser window next to ev.news; if pop-ups are blocked, the link opens a new tab instead
function openWindow(url) {
  if (safeUrl(url) === "#") return false;
  const w = Math.min(1200, screen.availWidth - 80), h = Math.min(900, screen.availHeight - 80);
  const win = window.open(url, "_blank", `noopener,noreferrer,width=${w},height=${h},left=40,top=40`);
  // With noopener the call returns null even on success, so trust it unless the browser lacks pop-up windows (phones)
  return !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
}
// Summaries from older collections may still carry HTML tags from double-encoded feeds
function plainText(t) { return String(t || "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim(); }
function eventLink(code, url) { return `article.html?c=${code}&u=${encodeURIComponent(url)}`; }

const params = new URLSearchParams(location.search);
const code = (params.get("c") || "").toUpperCase();
const target = params.get("u") || "";
const main = $("#art");

function message(title, text) {
  main.textContent = "";
  main.append(el("h1", null, title), el("p", "src", text));
  const a = el("a", "btn-main", "Открыть ленту"); a.href = COUNTRIES[code] ? "news.html#" + code : "news.html";
  main.append(a);
}

function gate() {
  main.textContent = "";
  const g = el("div", "gate");
  g.append(el("h2", null, "Событие доступно после входа"), el("p", null, "Войдите или зарегистрируйтесь бесплатно, чтобы читать ленту и страницы событий."));
  const row = el("div", "row");
  const a = el("button", null, "Войти"); a.type = "button"; a.onclick = () => Account.openDialog("signin");
  const b = el("button", "alt", "Зарегистрироваться"); b.type = "button"; b.onclick = () => Account.openDialog("signup");
  row.append(a, b); g.append(row); main.append(g);
}

async function fetchJson(path) { const r = await fetch(path); if (!r.ok) throw new Error(r.status); return r.json(); }
async function load() {
  let v = "";
  try { const r = await fetch("data/status.json?t=" + Date.now(), { cache: "no-store" }); if (r.ok) v = (await r.json()).updated || ""; } catch {}
  v = encodeURIComponent(v || String(Math.floor(Date.now() / 60000)));
  const [data, desc] = await Promise.all([
    fetchJson(`data/${code}.json?v=${v}`),
    fetchJson(`data/desc/${code}.json?v=${v}`).catch(() => ({}))
  ]);
  return { items: dedupe(data.items || []), desc };
}

let shown = false;
async function start() {
  if (shown) return;
  if (!COUNTRIES[code] || !/^https?:\/\//i.test(target)) { message("Событие не найдено", "Ссылка неполная. Откройте событие из ленты."); return; }
  $("#back").href = "news.html#" + code;
  $("#back").textContent = "← Лента: " + COUNTRIES[code][0];
  if (!Account.user) { gate(); return; }
  shown = true;
  let d;
  try { d = await load(); }
  catch { shown = false; message("Не удалось загрузить событие", "Проверьте подключение к интернету и обновите страницу."); return; }

  const [ru, en, loc] = COUNTRIES[code];
  const c = { code, ru, en, loc };
  const from = Date.now() - 48 * 3600000;
  const recent = d.items.filter(a => seenTime(a.seendate) >= from);
  const groups = cluster(recent, c, true, Infinity);
  let g = groups.find(x => x.items.some(i => i.url === target));
  if (!g) {
    // The event dropped out of the top list or out of the 48-hour window: show the single article if we still have it
    const one = d.items.find(i => i.url === target);
    if (!one) { message("Событие устарело", "В ленте хранятся только новости за последние двое суток, и этой уже нет."); return; }
    g = { items: [one], lead: one, domains: 1, topic: topicOf(one.title), newest: seenTime(one.seendate), fresh: false };
  }
  render(c, g, groups, d);
}

function render(c, g, groups, d) {
  main.textContent = "";
  const a = g.lead;
  const color = g.topic ? g.topic[1] : null;
  if (color) main.style.setProperty("--tc", `var(${color})`);
  document.title = cleanTitle(a.title) + " · ev.news";

  const crumbs = el("nav", "crumbs"); crumbs.setAttribute("aria-label", "Где вы");
  const cl = el("a", null, c.ru); cl.href = "news.html#" + c.code; crumbs.append(cl);
  if (g.topic) crumbs.append(el("span", null, g.topic[0]));
  main.append(crumbs);

  const facts = el("div", "facts");
  if (g.topic) { const t = el("span", "topic", g.topic[0]); t.style.setProperty("--tc", `var(${color})`); facts.append(t); }
  facts.append(meter(g.domains, color));
  facts.append(el("span", null, g.domains > 1 ? `пишут ${g.domains} ${plural(g.domains, "издание", "издания", "изданий")}` : "одно издание"));
  if (g.fresh) facts.append(el("span", "fresh", "Новое"));
  main.append(facts);

  const title = cleanTitle(a.title);
  const h1 = el("h1", null, title);
  main.append(h1);
  const foreign = Translate.isForeign(a.title, a.language);
  if (foreign) translateHeadline(h1, title);

  const pic = g.items.find(x => x.socialimage && /^https:/.test(x.socialimage));
  if (pic) {
    const img = el("img", "hero-img"); img.src = pic.socialimage; img.alt = ""; img.referrerPolicy = "no-referrer";
    img.onerror = () => img.remove();
    main.append(img);
  }

  // The outlet's own summary from its feed, plus where to read the full article
  const box = el("section", "lead-box");
  box.append(el("span", "label", `${a.source || a.domain}, ${fmtDate(a.seendate)}`));
  // The lead outlet's own summary, or another outlet's summary of the same event
  const withDesc = d.desc[a.url] ? a : g.items.find(x => d.desc[x.url]);
  if (withDesc) {
    box.append(el("p", null, plainText(d.desc[withDesc.url])));
    if (withDesc !== a) box.append(el("span", "label", `Анонс: ${withDesc.source || withDesc.domain}`));
  } else box.append(el("p", null, "Издания не дали анонса в своих лентах. Полный текст доступен на сайте издания."));
  // Choose an outlet: its article opens in a separate window
  const picks = outlets(g, a);
  const pickBox = el("div", "outlets");
  pickBox.append(el("span", "label", picks.length > 1 ? `Читать статью в издании (${picks.length}):` : "Читать статью в издании:"));
  const chips = el("div", "chips");
  picks.forEach((x, k) => {
    const l = el("a", "outlet" + (k === 0 ? " main" : ""));
    l.append(document.createTextNode(x.source || x.domain));
    if (Translate.isForeign(x.title, x.language)) l.append(el("span", "lang", "EN"));
    l.href = safeUrl(x.url); l.target = "_blank"; l.rel = "noopener";
    l.title = `${cleanTitle(x.title)} (${fmtDate(x.seendate)}). Откроется в новом окне`;
    l.addEventListener("click", e => { if (openWindow(x.url)) e.preventDefault(); });
    chips.append(l);
  });
  pickBox.append(chips);
  box.append(pickBox);
  const act = el("div", "actions");
  if (foreign && safeUrl(a.url) !== "#") {
    const tr = el("span", "translate"); tr.append(document.createTextNode("Перевести статью: "));
    Translate.articleLinks(a.url).forEach(([name, href], k) => {
      const l = el("a", null, name); l.href = href; l.target = "_blank"; l.rel = "noopener noreferrer";
      tr.append(l); if (!k) tr.append(document.createTextNode(" или "));
    });
    act.append(tr);
  }
  const isSaved = g.items.some(x => Account.isSaved(x.url));
  const sv = el("button", "save-btn", isSaved ? "Сохранено" : "Сохранить"); sv.type = "button";
  sv.setAttribute("aria-pressed", String(isSaved));
  sv.onclick = async () => {
    sv.disabled = true;
    const already = g.items.find(x => Account.isSaved(x.url));
    try {
      const now = await Account.toggleSaved(already ? { url: already.url } : {
        url: a.url, title, source: a.source || a.domain, country: c.code,
        topic: g.topic ? g.topic[0] : null, why: null, published_at: new Date(g.newest || Date.now()).toISOString()
      });
      sv.textContent = now ? "Сохранено" : "Сохранить"; sv.setAttribute("aria-pressed", String(now));
    } catch (e) { sv.textContent = e.message; }
    sv.disabled = false;
  };
  act.append(sv);
  box.append(act);
  main.append(box);

  main.append(commentsSection(c, g));

  // Every outlet that wrote about it
  const others = g.items.filter(x => x !== a);
  if (others.length) {
    const cov = el("section", "cover");
    cov.append(el("h2", null, "Как об этом пишут"), el("p", null, `Ещё ${others.length} ${plural(others.length, "публикация", "публикации", "публикаций")} об этом событии.`));
    const ol = el("ol");
    for (const x of others) {
      const li = el("li");
      const who = el("span", "who"); who.append(el("b", null, x.source || x.domain), document.createTextNode(`, ${fmtDate(x.seendate)}`));
      if (x.language === "English") who.append(document.createTextNode(", на английском"));
      const l = el("a", "t", cleanTitle(x.title)); l.href = safeUrl(x.url); l.target = "_blank"; l.rel = "noopener";
      li.append(who, l);
      if (d.desc[x.url]) li.append(el("p", "d", plainText(d.desc[x.url])));
      ol.append(li);
    }
    cov.append(ol);
    main.append(cov);
  }
}

// ---------- Comments ----------
function since(iso) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} ${plural(min, "минуту", "минуты", "минут")} назад`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ${plural(h, "час", "часа", "часов")} назад`;
  return new Date(iso).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

function commentsSection(c, g) {
  const urls = g.items.map(i => i.url);
  const sec = el("section", "comments"); sec.id = "comments";
  const h = el("h2", null, "Комментарии");
  const list = el("ol", "c-list");
  const empty = el("p", "c-empty", "Пока никто не прокомментировал. Напишите первым.");
  empty.hidden = true;

  const form = el("form", "c-form"); form.noValidate = true;
  const nameRow = el("div", "c-name");
  const nameLabel = el("label", null, "Ваше имя в комментариях"); nameLabel.htmlFor = "c-name";
  const nameInput = el("input"); nameInput.id = "c-name"; nameInput.maxLength = 40; nameInput.placeholder = "Например, Алексей"; nameInput.autocomplete = "nickname";
  nameRow.append(nameLabel, nameInput);
  nameRow.hidden = !!Account.displayName;
  const area = el("textarea"); area.id = "c-body"; area.rows = 3; area.maxLength = 1000; area.placeholder = "Что вы думаете об этом событии?";
  area.setAttribute("aria-label", "Текст комментария");
  const row = el("div", "c-row");
  const counter = el("span", "c-count", "0 / 1000");
  const send = el("button", "c-send", "Отправить"); send.type = "submit";
  row.append(counter, send);
  const msg = el("p", "c-msg"); msg.setAttribute("role", "status");
  form.append(nameRow, area, row, msg);
  area.addEventListener("input", () => { counter.textContent = `${area.value.length} / 1000`; });

  const items = [];
  function paint() {
    list.textContent = "";
    h.textContent = items.length ? `Комментарии (${items.length})` : "Комментарии";
    empty.hidden = items.length > 0;
    for (const cm of items) {
      const li = el("li");
      const head = el("div", "c-head");
      head.append(el("b", null, cm.author_name || "Читатель"), el("span", null, since(cm.created_at)));
      const own = Account.user && cm.user_id === Account.user.id;
      if (own || Account.isAdmin) {
        const del = el("button", "c-del", own ? "Удалить" : "Удалить как админ"); del.type = "button";
        del.onclick = async () => {
          del.disabled = true;
          try {
            await Account.removeComment(cm.id);
            // The database silently skips rows it does not allow; re-read to be sure it is gone
            const still = (await Account.listComments(urls)).some(x => x.id === cm.id);
            if (still) throw new Error("Не получилось удалить: нет прав.");
            items.splice(items.indexOf(cm), 1); paint();
          }
          catch (e) { del.disabled = false; msg.textContent = e.message; msg.className = "c-msg err"; }
        };
        head.append(del);
      }
      li.append(head, el("p", "c-body", cm.body));
      list.append(li);
    }
  }

  form.addEventListener("submit", async e => {
    e.preventDefault();
    msg.className = "c-msg"; msg.textContent = "";
    if (!area.value.trim()) { msg.textContent = "Напишите комментарий."; msg.classList.add("err"); area.focus(); return; }
    send.disabled = true;
    try {
      if (!Account.displayName) await Account.setDisplayName(nameInput.value);
      nameRow.hidden = true;
      const cm = await Account.addComment(g.lead.url, c.code, area.value);
      items.push(cm); paint();
      area.value = ""; counter.textContent = "0 / 1000";
    } catch (err) { msg.textContent = err.message; msg.classList.add("err"); }
    finally { send.disabled = false; }
  });

  sec.append(h, list, empty, form);
  Account.listComments(urls)
    .then(rows => { items.push(...rows); paint(); if (location.hash === "#comments") sec.scrollIntoView(); })
    .catch(e => { empty.hidden = false; empty.textContent = "Не удалось загрузить комментарии: " + e.message; });
  return sec;
}

// English headline in Russian when Chrome's on-device translator is ready and the reader wants it
async function translateHeadline(h1, original) {
  let want = true; try { want = (JSON.parse(localStorage.getItem("cn:prefs2")) || {}).ruTitles !== false; } catch {}
  if (!want || !Translate.titles.supported || await Translate.titles.availability() !== "available") return;
  try {
    const ru = await Translate.titles.translate(original);
    if (!ru) return;
    h1.textContent = ru; h1.lang = "ru"; h1.classList.add("translated");
    const o = el("p", "orig", "Оригинал: " + original); o.lang = "en";
    h1.after(o);
  } catch {}
}

Account.ready.then(start);
Account.onChange(e => {
  if (e === "SIGNED_IN") start();
  else if (e === "SIGNED_OUT") { shown = false; start(); }
});
