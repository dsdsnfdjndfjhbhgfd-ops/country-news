const $ = s => document.querySelector(s);
// Theme: auto (system), light or dark; remembered in this browser
function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  document.querySelectorAll(".theme button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.t === (t || "auto"))));
  try { t === "auto" ? localStorage.removeItem("cn:theme") : localStorage.setItem("cn:theme", t); } catch {}
}
let savedTheme = "auto"; try { savedTheme = localStorage.getItem("cn:theme") || "auto"; } catch {}
applyTheme(savedTheme);
document.querySelectorAll(".theme button").forEach(b => b.onclick = () => { applyTheme(b.dataset.t); Account.saveSettings({ theme: b.dataset.t }); });
const QUICK = ["Россия","США","Китай","Украина","Израиль","Иран","Германия","Великобритания","Франция","Турция","Индия","Япония","Польша","Беларусь","Казахстан","Марокко","Саудовская Аравия","Бразилия"];
// Countries collected ahead of time by the GitHub Action (scripts/prefetch.mjs)
const PREFETCHED = new Set("RU US CN UA IL IR DE GB FR TR IN JP PL BY KZ MA SA BR".split(" "));
const ALIASES = { "сша":"US","америка":"US","штаты":"US","usa":"US","uk":"GB","англия":"GB","британия":"GB","великобритания":"GB","оаэ":"AE","uae":"AE","эмираты":"AE","корея":"KR","южная корея":"KR","северная корея":"KP","кндр":"KP","чехия":"CZ","молдавия":"MD","киргизия":"KG","белоруссия":"BY","беларусь":"BY","казахстан":"KZ","саудовская аравия":"SA","саудия":"SA","морокко":"MA" };
const EN_FIX = { US:"United States", GB:"United Kingdom", KP:"North Korea", KR:"South Korea", CZ:"Czech Republic", MM:"Myanmar", CD:"Democratic Republic of the Congo", CG:"Republic of the Congo", CI:"Ivory Coast", PS:"Palestine", TR:"Turkey", AE:"United Arab Emirates" };
// Prepositional case for the headline ("в Казахстане")
const LOC = { RU:"России", US:"США", CN:"Китае", UA:"Украине", KZ:"Казахстане", DE:"Германии", TR:"Турции", IL:"Израиле", IN:"Индии", BY:"Беларуси", FR:"Франции", JP:"Японии", GB:"Великобритании", IR:"Иране", UZ:"Узбекистане", KG:"Киргизии", AM:"Армении", AZ:"Азербайджане", GE:"Грузии", PL:"Польше", IT:"Италии", ES:"Испании", BR:"Бразилии", KR:"Южной Корее", KP:"КНДР", SA:"Саудовской Аравии", AE:"ОАЭ", EG:"Египте", MD:"Молдове", TJ:"Таджикистане", MA:"Марокко" };

const ruNames = new Intl.DisplayNames(["ru"], { type: "region" });
const enNames = new Intl.DisplayNames(["en"], { type: "region" });
const index = new Map(); const ruList = [];
const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
for (const a of A) for (const b of A) {
  const code = a + b; let ru, en;
  try { ru = ruNames.of(code); en = enNames.of(code); } catch { continue; }
  if (!ru || ru === code || !en || en === code || !PREFETCHED.has(code)) continue;
  index.set(low(ru), code); index.set(low(en), code);
  ruList.push(ru);
}
for (const [k, v] of Object.entries(ALIASES)) if (PREFETCHED.has(v)) index.set(k, v);
for (const [k, v] of Object.entries(LOC)) if (PREFETCHED.has(k)) index.set(low(v), k);
const dl = $("#countries");
[...new Set(ruList)].sort((x, y) => x.localeCompare(y, "ru")).forEach(n => { const o = document.createElement("option"); o.value = n; dl.append(o); });

function resolve(input) {
  const code = index.get(low(input));
  if (!code) return null;
  return { code, ru: ruNames.of(code), en: EN_FIX[code] || enNames.of(code), loc: LOC[code] || "" };
}

const quick = $("#quick");
const CODE_OF = { "Россия":"RU","США":"US","Китай":"CN","Украина":"UA","Израиль":"IL","Иран":"IR","Германия":"DE","Великобритания":"GB","Франция":"FR","Турция":"TR","Индия":"IN","Япония":"JP","Польша":"PL","Беларусь":"BY","Казахстан":"KZ","Марокко":"MA","Саудовская Аравия":"SA","Бразилия":"BR" };
// Country chips: the user's own countries first, marked with a star; the open one is highlighted
let quickCode = null;
function markQuick(code) {
  quickCode = code;
  quick.querySelectorAll("button").forEach(b => b.toggleAttribute("aria-current", b.dataset.code === code));
}
function paintQuick() {
  quick.querySelectorAll("button").forEach(b => b.remove());
  const mine = Account.countries;
  const order = [...QUICK].sort((a, b) => (mine.includes(CODE_OF[b]) - mine.includes(CODE_OF[a])) || (mine.indexOf(CODE_OF[a]) - mine.indexOf(CODE_OF[b])));
  for (const name of order) {
    const b = document.createElement("button");
    b.type = "button"; b.textContent = (mine.includes(CODE_OF[name]) ? "★ " : "") + name;
    b.dataset.code = CODE_OF[name];
    if (CODE_OF[name] === quickCode) b.setAttribute("aria-current", "true");
    b.onclick = () => run(name);
    quick.append(b);
  }
}
paintQuick();
$("#f").addEventListener("submit", e => { e.preventDefault(); const v = $("#country").value.trim(); if (v) run(v); });

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function setStatus(text, loading) {
  const s = $("#status"); s.textContent = "";
  if (loading) s.append(el("span", "spinner"));
  if (text) s.append(el("span", null, text));
}
function notice(text) { const o = $("#out"); o.textContent = ""; o.append(el("div", "notice", text)); }
function skeleton(c) {
  const o = $("#out"); o.textContent = "";
  const head = el("div", "res-head"); head.append(el("h2", null, c.ru)); head.append(el("p", null, "Собираю публикации"));
  o.append(head);
  for (let i = 0; i < 4; i++) {
    const r = el("div", "sk"); const d = el("div");
    d.append(el("b", "s"), el("b", "h"), el("b", "h2"), el("b", "s"));
    r.append(d, el("i")); o.append(r);
  }
}


// ---------- Data loading ----------
// data/status.json is tiny and always read fresh. Its "updated" stamp versions the bigger
// files, so the browser reuses them from its cache until the collector writes new ones.
async function dataVersion() {
  try {
    const r = await fetch("data/status.json?t=" + Date.now(), { cache: "no-store" });
    if (r.ok) return (await r.json()).updated || "";
  } catch {}
  return String(Math.floor(Date.now() / 60000)); // fallback: a new version every minute
}

// Short AI summaries of events (data/summary.json), loaded together with the country file
let SUMMARY = {}, summaryVersion = "";
async function loadSummary(v) {
  if (v === summaryVersion) return;
  try { const r = await fetch("data/summary.json?v=" + encodeURIComponent(v)); if (r.ok) { SUMMARY = (await r.json()).items || {}; summaryVersion = v; } } catch {}
  try { const r = await fetch("data/essays.json?v=" + encodeURIComponent(v)); if (r.ok) ESSAYS = (await r.json()).countries || {}; } catch {}
}
// Essays: 200–300 words per country on its main problem in politics, security and economy
let ESSAYS = {};
const ESSAY_TOPICS = ["Политика", "Безопасность", "Экономика"];
let essayTab = null, essayOpen = false;
function essayBlock(c) {
  const mine = ESSAYS[c.code] || {};
  const topics = ESSAY_TOPICS.filter(t => mine[t] && mine[t].text);
  if (!topics.length) return null;
  if (!topics.includes(essayTab)) essayTab = topics.includes(view.sphere) ? view.sphere : topics[0];
  const box = el("section", "essay"); box.setAttribute("aria-label", "Обзор страны");
  const head = el("div", "essay-head");
  head.append(el("h3", null, `Обзор: ${c.ru}`));
  const tabs = el("div", "seg"); tabs.setAttribute("role", "group"); tabs.setAttribute("aria-label", "Тема обзора");
  const body = el("div", "essay-body");
  const paint = () => {
    tabs.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.t === essayTab)));
    const e = mine[essayTab]; body.textContent = "";
    if (e.title) body.append(el("h4", null, e.title));
    const paras = e.text.split(/\n\s*\n|\n/).map(x => x.trim()).filter(Boolean);
    paras.forEach((t, k) => { const pEl = el("p", null, t); if (k > 0 && !essayOpen) pEl.hidden = true; body.append(pEl); });
    const foot = el("div", "essay-foot");
    if (paras.length > 1) {
      const more = el("button", "essay-more", essayOpen ? "Свернуть" : "Читать полностью"); more.type = "button";
      more.onclick = () => { essayOpen = !essayOpen; paint(); };
      foot.append(more);
    }
    const words = e.text.split(/\s+/).length;
    foot.append(el("span", null, `${words} слов · ИИ по событиям последних двух дней · обновлено ${ago(e.at)}`));
    body.append(foot);
  };
  for (const t of topics) {
    const b = el("button", null, t); b.type = "button"; b.dataset.t = t;
    b.onclick = () => { essayTab = t; paint(); };
    tabs.append(b);
  }
  head.append(tabs);
  box.append(head, body);
  paint();
  return box;
}
const summaryFor = g => { for (const i of g.items) if (SUMMARY[i.url]) return SUMMARY[i.url].text; return ""; };
const whyFor = g => { for (const i of g.items) if (SUMMARY[i.url]) return SUMMARY[i.url].why || ""; return ""; };
// Inside the country or its relations with others: marked by the AI together with the summary
// Events the AI has not seen yet get a rough guess from the headlines: another country or
// diplomacy named means "out", otherwise "in"
const OTHER = {
  RU: ["росси", "москв", "кремл", "путин", "лавров", "russia", "moscow", "kremlin", "putin"], US: ["сша", "америк", "вашингтон", "трамп", "пентагон", "госдеп", "united states", "washington", "trump", "pentagon"],
  CN: ["китай", "китае", "китая", "кнр", "пекин", "china", "chinese", "beijing"], UA: ["украин", "киев", "зеленск", "всу", "харьков", "одесс", "запорож", "херсон", "донбасс", "ukrain", "kyiv", "zelensky", "kharkiv", "odesa"],
  IL: ["израил", "нетаньяху", "хамас", "газа", "israel", "netanyahu", "hamas", "gaza"], IR: ["иран", "тегеран", "пезешкиан", "хаменеи", "iran", "tehran", "pezeshkian", "khamenei"],
  DE: ["германи", "берлин", "мерц", "germany", "berlin", "merz"], GB: ["британ", "лондон", "стармер", "britain", "british", "london", "starmer"],
  FR: ["франци", "париж", "макрон", "france", "french", "paris", "macron"], TR: ["турци", "анкар", "эрдоган", "turkey", "türkiye", "ankara", "erdogan"],
  IN: ["индии", "индия", "индийск", "нью-дели", "india", "new delhi"], JP: ["япони", "японск", "токио", "japan", "tokyo"],
  PL: ["польш", "польск", "варшав", "poland", "polish", "warsaw"], BY: ["беларус", "белорус", "минск", "лукашенк", "belarus", "minsk", "lukashenko"],
  KZ: ["казахстан", "астан", "токаев", "kazakh", "astana", "tokayev"], MA: ["марокк", "рабат", "morocco", "moroccan"],
  SA: ["саудовск", "эр-рияд", "saudi", "riyadh"], BR: ["бразил", "brazil", "lula"]
};
const ABROAD = ["мид", "посол", "посольств", "дипломат", "переговор", "визит", "саммит", "санкци", "оон", "нато", "евросоюз", "ес ", "снг", "еаэс", "брикс", "шос", "госсекретар", "иностранных дел",
  "embassy", "ambassador", "diplomat", "talks", "summit", "sanction", "united nations", "nato", "european union", "eu ", "brics", "foreign minister", "foreign ministry", "bilateral", "treaty"];
function guessScope(g, code) {
  const t = " " + g.items.slice(0, 4).map(i => low(i.title)).join(" ") + " ";
  const own = new Set(OTHER[code] || []);
  if (Object.entries(OTHER).some(([k, words]) => k !== code && words.some(w => !own.has(w) && t.includes(w)))) return "out";
  if (ABROAD.some(w => new RegExp(`[^a-zа-яё]${w}`).test(t))) return "out";
  return "in";
}
const scopeFor = (g, code) => { for (const i of g.items) { const s = SUMMARY[i.url]; if (s && s.scope) return s.scope; } return guessScope(g, code); };
const SCOPES = [["in", "Внутренние"], ["out", "Внешние"]];

async function loadPrefetched(code) {
  if (!PREFETCHED.has(code)) return null;
  try {
    const v = await dataVersion();
    const [r] = await Promise.all([fetch(`data/${code}.json?v=${encodeURIComponent(v)}`), loadSummary(v)]);
    if (!r.ok) return null;
    const d = await r.json();
    return Array.isArray(d.items) && d.items.length ? d : null;
  } catch { return null; }
}

// Links come from news feeds: only ever open web addresses
function safeUrl(u) { return /^https?:\/\//i.test(u || "") ? u : "#"; }

function dedupe(items) {
  const seen = new Set();
  return items.filter(a => { const k = low(a.title).slice(0, 70); if (!a.title || seen.has(k)) return false; seen.add(k); return true; });
}

let runId = 0;
// Visitors who are not signed in see an invitation instead of the feed
function showGate() {
  shown = null; setStatus("");
  const o = $("#out"); o.textContent = "";
  const g = el("div", "gate");
  if (!Account.available) {
    g.append(el("h2", null, "Вход временно недоступен"), el("p", null, "Не загрузился модуль входа, поэтому лента сейчас закрыта. Обновите страницу через минуту."));
  } else {
    g.append(el("h2", null, "Лента доступна после входа"), el("p", null, "Зарегистрируйтесь бесплатно: нужны только почта и пароль. С аккаунтом можно выбрать свои страны, сохранять новости, а настройки ленты будут одинаковыми на всех устройствах."));
    const row = el("div", "row");
    const a = el("button", null, "Войти"); a.type = "button"; a.onclick = () => Account.openDialog("signin");
    const b = el("button", "alt", "Зарегистрироваться"); b.type = "button"; b.onclick = () => Account.openDialog("signup");
    row.append(a, b); g.append(row);
  }
  o.append(g);
}

async function run(input) {
  if (!Account.user) { showGate(); return; }
  const c = resolve(input);
  if (!c) { setStatus(""); notice(`Страны «${input}» нет в списке. Доступны: ${QUICK.join(", ")}.`); return; }
  const id = ++runId;
  view.all = false;
  $("#country").value = LOC[c.code] || c.ru;
  try { history.replaceState(null, "", "#" + c.code); } catch {}

  skeleton(c);
  setStatus("Загружаю новости…", true);
  const pre = await loadPrefetched(c.code);
  if (id !== runId) return;
  setStatus("");
  if (!pre) { notice("Не удалось загрузить новости. Проверьте подключение к интернету и обновите страницу."); return; }
  render(c, dedupe(pre.items), { at: Date.parse(pre.updated) });
}

// ---------- Rendering ----------
function fmtDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/.exec(s || ""); if (!m) return "";
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}
function ago(ts) {
  const min = Math.round((Date.now() - ts) / 60000);
  if (!isFinite(min)) return "";
  if (min < 2) return "только что";
  if (min < 60) return `${min} ${plural(min, "минуту", "минуты", "минут")} назад`;
  const h = Math.round(min / 60);
  return `${h} ${plural(h, "час", "часа", "часов")} назад`;
}
function cleanTitle(t) {
  t = String(t || "");
  for (const sep of [" :: ", " | ", " – ", " - "]) { const i = t.indexOf(sep, 30); if (i > 0) t = t.slice(0, i); }
  t = t.replace(/\s+([,.:;!?»)%])/g, "$1").replace(/([«(])\s+/g, "$1");
  return t.length > 170 ? t.slice(0, 167).replace(/\s+\S*$/, "") + "…" : t;
}
function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
function meter(n, color) {
  const m = el("span", "meter");
  m.setAttribute("role", "img");
  m.setAttribute("aria-label", `Пишут ${n} ${plural(n, "издание", "издания", "изданий")}`);
  if (color) m.style.setProperty("--tc", `var(${color})`);
  for (let k = 0; k < 8; k++) m.append(el("i", k < n ? "on" : ""));
  return m;
}

// ---------- Viewer settings: period and single-outlet stories ----------
const PERIODS = [["today", "Сегодня"], ["yesterday", "Вчера"], ["3d", "3 дня"], ["week", "Неделя"]];
const PERIOD_TEXT = { "2d": "за 2 дня", today: "за сегодня", yesterday: "за вчера", "3d": "за 3 дня", week: "за неделю" };
const prefs = { period: "2d", singles: true, ruTitles: true };
// Feed view: sphere filter, sort order and whether to show every event
const view = { sphere: "all", scope: "all", sort: "importance", all: false };
const FEED_SIZE = 25;
try { const st = JSON.parse(localStorage.getItem("cn:prefs2")) || {}; prefs.singles = st.singles !== false; prefs.ruTitles = st.ruTitles !== false; } catch {}
function savePrefs() { try { localStorage.setItem("cn:prefs2", JSON.stringify(prefs)); } catch {} }
function inPeriod(items) {
  const from2d = Date.now() - 48 * 3600000;
  if (prefs.period === "2d") return items.filter(a => seenTime(a.seendate) >= from2d);
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const t0 = midnight.getTime(), day = 86400000;
  const [from, to] = { today: [t0, Infinity], yesterday: [t0 - day, t0], "3d": [t0 - 2 * day, Infinity], week: [-Infinity, Infinity] }[prefs.period] || [-Infinity, Infinity];
  return items.filter(a => { const t = seenTime(a.seendate); return isNaN(t) ? prefs.period === "week" : t >= from && t < to; });
}
function seg(label, options, current, onPick) {
  const g = el("div", "seg"); g.setAttribute("role", "group"); g.setAttribute("aria-label", label);
  for (const [v, text] of options) {
    const b = el("button", null, text); b.type = "button";
    b.setAttribute("aria-pressed", String(current === v));
    b.onclick = () => onPick(v);
    g.append(b);
  }
  return g;
}
function controls(rerender, counts) {
  const box = el("div", "controls");
  const left = el("div", "ctl-group");
  left.append(seg("Сфера", [["all", `Все · ${counts.all}`], ...["Политика", "Безопасность", "Экономика"].map(t => [t, `${t} · ${counts[t] || 0}`])],
    view.sphere, v => { view.sphere = v; Account.saveSettings({ sphere: v }); rerender(); }));
  left.append(seg("Внутренние или внешние", [["all", "Внутри и вовне"], ...SCOPES.map(([v, t]) => [v, `${t} · ${counts.scope[v] || 0}`])],
    view.scope, v => { view.scope = v; Account.saveSettings({ scope: v }); rerender(); }));
  left.append(seg("Сортировка", [["importance", "По важности"], ["time", "Сначала новые"]], view.sort, v => { view.sort = v; Account.saveSettings({ sort: v }); rerender(); }));
  box.append(left);
  const sw = el("label", "switch");
  const cb = el("input"); cb.type = "checkbox"; cb.id = "singles"; cb.checked = prefs.singles;
  cb.onchange = () => { prefs.singles = cb.checked; savePrefs(); Account.saveSettings({ singles: prefs.singles }); rerender(); };
  sw.append(cb, el("span", "track"), el("span", null, "Новости из одного издания"));
  const right = el("div", "ctl-group");
  right.append(sw);
  // Only in browsers with a built-in translator (Chrome on a computer)
  if (Translate.titles.supported) {
    const tw = el("label", "switch");
    const tb = el("input"); tb.type = "checkbox"; tb.id = "ru-titles"; tb.checked = prefs.ruTitles;
    const tl = el("span", null, "Заголовки на русском");
    tb.onchange = async () => {
      prefs.ruTitles = tb.checked; savePrefs(); Account.saveSettings({ ruTitles: prefs.ruTitles });
      if (!tb.checked) { showOriginalTitles(); return; }
      try {
        tl.textContent = "Загружаю переводчик…";
        await Translate.titles.prepare(p => { tl.textContent = `Загружаю переводчик… ${Math.round(p * 100)}%`; });
        tl.textContent = "Заголовки на русском";
        translateTitles();
      } catch {
        tl.textContent = "Перевод недоступен в этом браузере";
        tb.checked = false; prefs.ruTitles = false; savePrefs();
      }
    };
    tw.append(tb, el("span", "track"), tl);
    tw.hidden = true; // shown only when this browser can translate English into Russian
    Translate.titles.availability().then(v => {
      tw.hidden = v === "unavailable";
      // Until the language pack is on this device the switch stays off; turning it on downloads the pack
      if (v !== "available") tb.checked = false;
    });
    right.append(tw);
  }
  box.append(right);
  return box;
}

const SLOTS = [[1, "За последний час"], [3, "1–3 часа назад"], [6, "3–6 часов назад"], [12, "6–12 часов назад"], [24, "12–24 часа назад"], [Infinity, "Больше суток назад"]];
function timeSlot(t) { const h = (Date.now() - t) / 3600000; return SLOTS.findIndex(([max]) => h < max); }
let shown = null;
function render(c, allItems, info) {
  shown = { c, allItems, info };
  markQuick(c.code);
  const items = inPeriod(allItems);
  const everything = cluster(items, c, prefs.singles, Infinity);
  const counts = { all: everything.length, scope: {} };
  for (const g of everything) counts[g.topic[0]] = (counts[g.topic[0]] || 0) + 1;
  let list = view.sphere === "all" ? everything : everything.filter(g => g.topic[0] === view.sphere);
  for (const g of list) { g.scope = scopeFor(g, c.code); counts.scope[g.scope] = (counts.scope[g.scope] || 0) + 1; }
  if (view.scope !== "all") list = list.filter(g => g.scope === view.scope);
  // "Newest first": split into time slots, most important first within each slot
  if (view.sort === "time") {
    for (const g of list) g.slot = timeSlot(g.newest);
    list = [...list].sort((x, y) => x.slot - y.slot || y.domains - x.domains || y.score - x.score || y.newest - x.newest);
  }
  const groups = view.all ? list : list.slice(0, FEED_SIZE);
  const out = $("#out"); out.textContent = "";
  const head = el("div", "res-head");
  const title = el("div", "title"); title.append(el("h2", null, c.ru));
  const isMine = Account.countries.includes(c.code);
  const star = el("button", "star-btn", isMine ? "★ В моих странах" : "☆ Добавить в мои страны"); star.type = "button";
  star.setAttribute("aria-pressed", String(isMine));
  star.onclick = async () => { star.disabled = true; await Account.toggleCountry(c.code); };
  title.append(star);
  head.append(title);
  let meta = (groups.length < list.length ? `Показано ${groups.length} из ${list.length} событий` : `${list.length} ${plural(list.length, "событие", "события", "событий")}`) + ` из ${items.length} ${plural(items.length, "публикации", "публикаций", "публикаций")} ${PERIOD_TEXT[prefs.period]}`;
  if (info.partial) meta = "Загружаю остальные источники…";
  if (info.failed) meta += ". Часть источников не ответила";
  head.append(el("p", null, meta));
  if (info.at) {
    const up = el("p", "updated");
    const paint = () => {
      const t = new Date(info.at), next = new Date(info.at + 15 * 60000);
      const hm = d => d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
      const day = t.toDateString() === new Date().toDateString() ? "" : " " + t.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
      up.textContent = `Новости обновлены${day} в ${hm(t)}, ${ago(info.at)}. ` +
        (next > Date.now() ? `Следующее обновление около ${hm(next)}.` : "Следующее обновление ожидается в ближайшие минуты.");
    };
    paint();
    clearInterval(window.__upTimer); window.__upTimer = setInterval(() => up.isConnected ? paint() : clearInterval(window.__upTimer), 30000);
    head.append(up);
  }
  out.append(head);
  const rerender = () => { const y = window.scrollY; render(shown.c, shown.allItems, shown.info); window.scrollTo(0, y); };
  out.append(controls(rerender, counts));
  const essay = essayBlock(c); if (essay) out.append(essay);

  if (!groups.length) {
    if (!info.partial) out.append(el("div", "notice", false
      ? "За последнюю неделю важных событий не найдено. Попробуйте позже или выберите другую страну."
      : `Важных событий ${PERIOD_TEXT[prefs.period]} не найдено.` + (prefs.singles ? " Данные обновляются каждые 15 минут, загляните позже." : " Включите новости из одного издания.")));
    return;
  }
  const ol = el("ol", "events");
  const discuss = []; // comment links, filled with counts after the list is drawn
  let lastSlot = -1;
  groups.forEach((g, i) => {
    if (view.sort === "time" && g.slot !== lastSlot) {
      lastSlot = g.slot;
      const n = groups.filter(x => x.slot === g.slot).length;
      const h = el("li", "slot"); h.append(el("h3", null, SLOTS[g.slot][1]), el("span", null, `${n} ${plural(n, "событие", "события", "событий")}, сначала важные`));
      ol.append(h);
    }
    const a = g.lead;
    const li = el("li", "ev" + (i === 0 && view.sort !== "time" ? " lead" : ""));
    const body = el("div", "body");
    const color = g.topic ? g.topic[1] : null;
    if (color) li.style.setProperty("--tc", `var(${color})`);

    const facts = el("div", "facts");
    if (g.topic) { const t = el("span", "topic", g.topic[0]); t.style.setProperty("--tc", `var(${color})`); facts.append(t); }
    facts.append(meter(g.domains, color));
    facts.append(el("span", null, g.domains > 1 ? `пишут ${g.domains} ${plural(g.domains, "издание", "издания", "изданий")}` : "одно издание"));
    if (g.fresh) facts.append(el("span", "fresh", "Новое"));
    if (g.scope) facts.append(el("span", "scope " + g.scope, g.scope === "out" ? "Внешняя повестка" : "Внутри страны"));
    body.append(facts);

    const h = el("h3"); const link = el("a", null, cleanTitle(a.title));
    // Headline opens the event page on this site; outlets' own links stay in the line below
    link.href = `article.html?c=${c.code}&u=${encodeURIComponent(a.url)}`;
    const foreign = Translate.isForeign(a.title, a.language);
    if (foreign) { link.dataset.orig = cleanTitle(a.title); link.lang = "en"; }
    h.append(link); body.append(h);
    const brief = summaryFor(g);
    if (brief) { const s = el("p", "brief"); s.append(el("b", null, "Кратко. "), document.createTextNode(brief)); body.append(s); }
    const why = whyFor(g);
    if (why) { const s = el("p", "brief why"); s.append(el("b", null, "Почему это важно. "), document.createTextNode(why)); body.append(s); }

    const src = el("div", "src");
    if (a.language === "English") { src.append(el("span", "lang", "EN")); src.append(document.createTextNode(" ")); }
    const own = el("a", null, a.source || a.domain); own.href = safeUrl(a.url); own.target = "_blank"; own.rel = "noopener"; own.title = "Открыть статью на сайте издания";
    src.append(own, document.createTextNode(`, ${fmtDate(a.seendate)}`));
    const doms = new Set([a.source || a.domain]);
    const more = g.items.filter(x => !doms.has(x.source || x.domain) && doms.add(x.source || x.domain)).slice(0, 3);
    if (more.length) {
      src.append(document.createTextNode(". Также: "));
      more.forEach((x, k) => {
        const l = el("a", null, x.source || x.domain); l.href = safeUrl(x.url); l.target = "_blank"; l.rel = "noopener"; l.title = cleanTitle(x.title);
        src.append(l); if (k < more.length - 1) src.append(document.createTextNode(", "));
      });
    }
    // Foreign article: open it translated into Russian
    if (foreign && safeUrl(a.url) !== "#") {
      const tr = el("div", "translate");
      tr.append(document.createTextNode("Перевести статью: "));
      Translate.articleLinks(a.url).forEach(([name, href], k) => {
        const l = el("a", null, name); l.href = href; l.target = "_blank"; l.rel = "noopener noreferrer";
        tr.append(l); if (k === 0) tr.append(document.createTextNode(" или "));
      });
      src.append(tr);
    }
    const isSaved = g.items.some(x => Account.isSaved(x.url));
    const sv = el("button", "save-btn", isSaved ? "Сохранено" : "Сохранить"); sv.type = "button";
    sv.setAttribute("aria-pressed", String(isSaved));
    sv.onclick = async () => {
      sv.disabled = true;
      const already = g.items.find(x => Account.isSaved(x.url));
      try {
        await Account.toggleSaved(already ? { url: already.url } : {
          url: a.url, title: cleanTitle(a.title), source: a.source || a.domain, country: c.code,
          topic: g.topic ? g.topic[0] : null, why: null, published_at: new Date(g.newest).toISOString()
        });
      } catch (e) { sv.disabled = false; sv.textContent = e.message; }
    };
    const cl = el("a", "c-link", "Обсудить");
    cl.href = `article.html?c=${c.code}&u=${encodeURIComponent(a.url)}#comments`;
    const acts = el("div", "acts"); acts.append(sv, cl);
    const foot = el("div", "foot"); foot.append(src, acts); body.append(foot);
    discuss.push({ cl, urls: g.items.map(x => x.url) });
    li.append(body);

    const pic = g.items.find(x => x.socialimage && /^https:/.test(x.socialimage));
    if (pic) {
      const img = el("img", "thumb"); img.src = pic.socialimage; img.alt = ""; img.loading = i < 2 ? "eager" : "lazy"; img.decoding = "async"; img.referrerPolicy = "no-referrer";
      img.onerror = () => { img.remove(); li.classList.add("noimg"); };
      li.append(img);
    } else li.classList.add("noimg");
    ol.append(li);
  });
  out.append(ol);
  translateTitles();
  fillCommentCounts(discuss);
  if (list.length > FEED_SIZE) {
    const more = el("button", "more", view.all ? `Показать только ${FEED_SIZE} главных` : `Показать все события (${list.length})`);
    more.type = "button";
    more.onclick = () => {
      view.all = !view.all;
      if (view.all) rerender(); else { render(shown.c, shown.allItems, shown.info); $(".res-head").scrollIntoView(); }
    };
    out.append(more);
  }
}

// "Комментарии: N" under events people have discussed
async function fillCommentCounts(discuss) {
  const counts = await Account.commentCounts([...new Set(discuss.flatMap(d => d.urls))]);
  for (const d of discuss) {
    const n = d.urls.reduce((k, u) => k + (counts[u] || 0), 0);
    if (n && d.cl.isConnected) { d.cl.textContent = `Комментарии: ${n}`; d.cl.classList.add("has"); }
  }
}

// Headlines in English shown in Russian (original kept in the tooltip)
async function translateTitles() {
  if (!Translate.titles.supported || !prefs.ruTitles) return;
  if (await Translate.titles.availability() !== "available") return; // the switch downloads it on click
  for (const a of document.querySelectorAll(".ev h3 a[data-orig]")) {
    try {
      const ru = await Translate.titles.translate(a.dataset.orig);
      if (ru && a.isConnected && prefs.ruTitles) { a.textContent = ru; a.lang = "ru"; a.title = "Оригинал: " + a.dataset.orig; a.classList.add("translated"); }
    } catch { return; }
  }
}
function showOriginalTitles() {
  for (const a of document.querySelectorAll(".ev h3 a[data-orig]")) { a.textContent = a.dataset.orig; a.lang = "en"; a.removeAttribute("title"); a.classList.remove("translated"); }
}

// Keep an open page current: re-read the data every 5 minutes and when the tab comes back
async function refresh() {
  if (!shown || !PREFETCHED.has(shown.c.code) || document.visibilityState !== "visible") return;
  const c = shown.c, pre = await loadPrefetched(c.code);
  if (!pre || !shown || shown.c.code !== c.code) return;
  const y = window.scrollY;
  render(c, dedupe(pre.items), { at: Date.parse(pre.updated) });
  window.scrollTo(0, y);
}
setInterval(refresh, 5 * 60000);
let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") hiddenAt = Date.now();
  else if (Date.now() - hiddenAt > 60000) refresh();
});

// Open a country straight from the link, e.g. …/country-news/#KZ
function applyAccountSettings() {
  const st = Account.settings;
  if (typeof st.singles === "boolean") { prefs.singles = st.singles; savePrefs(); }
  if (["all", "Политика", "Безопасность", "Экономика"].includes(st.sphere)) view.sphere = st.sphere;
  if (["importance", "time"].includes(st.sort)) view.sort = st.sort;
  if (["all", "in", "out"].includes(st.scope)) view.scope = st.scope;
  if (["auto", "light", "dark"].includes(st.theme)) applyTheme(st.theme);
  if (typeof st.ruTitles === "boolean") { prefs.ruTitles = st.ruTitles; savePrefs(); }
}
function startCountry() {
  const fromHash = location.hash.slice(1).toUpperCase();
  const code = /^[A-Z]{2}$/.test(fromHash) && PREFETCHED.has(fromHash) ? fromHash : (Account.countries[0] || "RU");
  run(ruNames.of(code));
}
let started = false;
function begin() { if (started || !Account.user) return; started = true; applyAccountSettings(); startCountry(); }
Account.ready.then(() => { paintQuick(); if (Account.user) begin(); else showGate(); });
Account.onChange(event => {
  if (event === "SIGNED_IN" || event === "INITIAL_SESSION") {
    paintQuick(); begin();
  } else if (event === "SIGNED_OUT") {
    started = false; paintQuick(); showGate();
  } else if (event === "PROFILE" || event === "SAVED") {
    paintQuick();
    if (shown) { const y = window.scrollY; render(shown.c, shown.allItems, shown.info); window.scrollTo(0, y); }
  }
});
