// Admin page: site numbers, users, visits, AI requests and the list of admins.
// All data comes from admin_* database functions; each of them checks private.admins itself,
// so hiding this page from the menu is only a convenience, not the protection.
(function () {
  const $ = s => document.querySelector(s);
  const NAMES = { RU: "Россия", US: "США", CN: "Китай", UA: "Украина", IL: "Израиль", IR: "Иран", DE: "Германия", GB: "Великобритания", FR: "Франция", TR: "Турция", IN: "Индия", JP: "Япония", PL: "Польша", BY: "Беларусь", KZ: "Казахстан", MA: "Марокко", SA: "Саудовская Аравия", BR: "Бразилия", YE: "Йемен" };
  const PAGES = { home: "Главная", news: "Лента", article: "Событие", account: "Кабинет", ratings: "Рейтинг изданий", chat: "Чат с ИИ", admin: "Админка" };
  const GROUPS = { ru: "Российские", ua: "Украинские", eu: "Европейские", us: "Американские", arab: "Арабские", il: "Израильские", ir: "Иранские", tr: "Турецкие", cn: "Китайские", asia: "Азиатские", in: "Индийские", pk: "Пакистанские", cis: "СНГ и Кавказ" };
  const KINDS = { summary: "Пересказ", view: "Взгляд СМИ", chat: "Чат" };
  const PAGE_SIZE = 50;

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const nf = new Intl.NumberFormat("ru-RU");
  const num = n => nf.format(Number(n) || 0);
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
  const MSK = { timeZone: "Europe/Moscow" };
  const when = t => t ? new Date(t).toLocaleString("ru-RU", { ...MSK, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  const dayLabel = d => new Date(d + "T12:00:00Z").toLocaleDateString("ru-RU", { day: "numeric", month: "short", timeZone: "UTC" });
  const country = c => c ? (NAMES[c] || c) : "—";
  const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : null;
  function ago(t) {
    if (!t) return "—";
    const m = Math.round((Date.now() - Date.parse(t)) / 60000);
    if (m < 1) return "только что";
    if (m < 60) return `${m} мин назад`;
    const h = Math.round(m / 60);
    if (h < 24) return `${h} ч назад`;
    const d = Math.round(h / 24);
    return d < 30 ? `${d} ${plural(d, "день", "дня", "дней")} назад` : when(t);
  }
  function cell(row, text, cls) { const td = el("td", cls, text); row.append(td); return td; }
  function emptyRow(tbody, cols, text) { const tr = el("tr"); const td = el("td", "msg", text); td.colSpan = cols; tr.append(td); tbody.append(tr); }
  function errorRow(tbody, cols, e) { tbody.textContent = ""; emptyRow(tbody, cols, e.message); tbody.lastChild.firstChild.classList.add("err"); }
  // "Nickname / e-mail" cell; anonymous visitors show their browser number
  function who(r, visitor) {
    const box = el("div", "who");
    if (r.user_id || r.id) {
      const b = el("b", null, r.display_name || "без ника");
      box.append(b, el("small", null, r.email || r.user_id || r.id));
      box.title = "Открыть карточку пользователя";
    } else box.append(el("b", null, "Гость"), el("small", null, visitor ? "браузер " + visitor.slice(0, 8) : ""));
    return box;
  }
  function openable(tr, uid) { if (!uid) return; tr.classList.add("click"); tr.tabIndex = 0; tr.onclick = () => openUser(uid); tr.onkeydown = e => { if (e.key === "Enter") openUser(uid); }; }

  // ---------- Tabs ----------
  const TABS = ["overview", "users", "visits", "requests", "admins"];
  const loaded = new Set();
  let tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "overview";
  function showTab(name, push) {
    tab = name;
    document.querySelectorAll(".tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
    for (const t of TABS) $("#tab-" + t).hidden = t !== name;
    if (push) history.replaceState(null, "", "#" + name);
    if (!loaded.has(name)) { loaded.add(name); LOAD[name](); }
  }
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => showTab(b.dataset.tab, true));

  // ---------- Overview ----------
  async function loadOverview() {
    const box = $("#tab-overview");
    box.textContent = ""; box.append(el("p", "msg", "Загружаю данные…"));
    let o;
    try { o = await Account.adminOverview(); } catch (e) { box.textContent = ""; box.append(el("p", "msg err", e.message)); return; }
    box.textContent = "";
    const u = o.users, v = o.visits, r = o.requests, c = o.content;
    const tiles = (title, list) => {
      box.append(el("h2", "group-title", title));
      const g = el("div", "tiles");
      for (const [k, val, s] of list) { const t = el("div", "tile"); t.append(el("span", "k", k), el("span", "v", val), el("span", "s", s || "")); g.append(t); }
      box.append(g);
    };
    tiles("Читатели", [
      ["Пользователей", num(u.total), `подтвердили почту: ${num(u.confirmed)}`],
      ["Новых", num(u.new_7d), `сегодня ${num(u.new_today)} · за 30 дней ${num(u.new_30d)}`],
      ["Заходили сегодня", num(u.active_today), `за 7 дней ${num(u.active_7d)} (с входом)`],
      ["VIP-подписок", num(u.vip), "действующих"],
      ["Администраторов", num(u.admins), ""]
    ]);
    tiles("Посещения", [
      ["На сайте сейчас", num(v.online), "за последние 5 минут"],
      ["Сегодня", num(v.today), `посетителей ${num(v.visitors_today)}`],
      ["За 7 дней", num(v.d7), `посетителей ${num(v.visitors_7d)}`],
      ["За 30 дней", num(v.d30), `посетителей ${num(v.visitors_30d)}`],
      ["Без входа", (v.anon_share_30d ?? 0) + "%", `с телефона ${v.mobile_share_30d ?? 0}% · за 30 дней`]
    ]);
    tiles("Запросы к ИИ", [
      ["Пересказы", num(r.summaries_today), `сегодня · всего ${num(r.summaries_total)}`],
      ["Взгляд СМИ", num(r.views_today), `сегодня · всего ${num(r.views_total)}`],
      ["Вопросы в чате", num(r.chat_today), `сегодня · всего ${num(r.chat_total)}`],
      ["Токены чата", num(r.chat_tokens_today), `сегодня · всего ${num(r.chat_tokens_total)}`]
    ]);
    tiles("Содержимое и оплата", [
      ["Комментарии", num(c.comments), `за 7 дней ${num(c.comments_7d)}`],
      ["Сохранённые новости", num(c.saved), ""],
      ["Оценки изданий", num(c.ratings), ""],
      ["Готовые пересказы", num(c.summaries), `обзоров СМИ: ${num(c.media_views)}`],
      ["Оплаты", num(c.payments), `выручка ${num(c.revenue)} ₽ · тестовых ${num(c.test_payments)}`]
    ]);
    if (!v.first) box.append(el("p", "msg", "Посещения записываются с момента запуска админки, поэтому графики пока почти пустые."));
    else box.append(el("p", "msg", "Посещения записываются с " + when(v.first) + ". Время московское."));

    const grid = el("div", "grid2");
    grid.append(dailyChart(o.daily || []));
    const side = el("div", null); side.style.cssText = "display:flex;flex-direction:column;gap:16px";
    side.append(topList("Страницы за 30 дней", (o.pages || []).map(x => [PAGES[x.page] || x.page, x.n])));
    side.append(topList("Страны в ленте за 30 дней", (o.countries || []).map(x => [country(x.country), x.n])));
    if ((o.refs || []).length) side.append(topList("Откуда приходят", o.refs.map(x => [x.ref, x.n])));
    grid.append(side);
    box.append(grid);
  }

  // Bars per day; one measure at a time (switch), hover shows the day's numbers, a table below
  function dailyChart(days) {
    const p = el("div", "panel");
    const head = el("div", "chart-head");
    const title = el("h3"); head.append(title);
    const MEASURES = [["visits", "Посещения"], ["visitors", "Посетители"], ["signups", "Регистрации"], ["requests", "Запросы к ИИ"]];
    let m = "visits";
    const seg = el("div", "seg"); seg.setAttribute("role", "group"); seg.setAttribute("aria-label", "Что показать");
    for (const [k, name] of MEASURES) {
      const b = el("button", null, name); b.type = "button"; b.dataset.v = k;
      b.onclick = () => { m = k; draw(); };
      seg.append(b);
    }
    head.append(seg); p.append(head);
    const bars = el("div", "bars"), axis = el("div", "axis");
    p.append(bars, axis);
    const tip = $("#tip");
    function draw() {
      seg.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === m)));
      const name = MEASURES.find(x => x[0] === m)[1];
      const total = days.reduce((a, d) => a + (Number(d[m]) || 0), 0);
      title.textContent = `${name} по дням: ${num(total)} за 30 дней`;
      bars.textContent = "";
      const max = Math.max(1, ...days.map(d => Number(d[m]) || 0));
      const ymax = el("span", "ymax", num(max)); bars.append(ymax);
      for (const d of days) {
        const col = el("div", "col"); col.tabIndex = 0;
        const label = `${dayLabel(d.day)}: посещений ${num(d.visits)}, посетителей ${num(d.visitors)}, регистраций ${num(d.signups)}, запросов к ИИ ${num(d.requests)}`;
        col.setAttribute("aria-label", label);
        const i = el("i"); i.style.height = ((Number(d[m]) || 0) / max * 100) + "%"; col.append(i);
        const show = e => {
          tip.textContent = `${dayLabel(d.day)} · ${name.toLowerCase()}: ${num(d[m])}`;
          tip.hidden = false;
          const r = col.getBoundingClientRect(), w = tip.offsetWidth;
          tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, (e?.clientX ?? r.left + r.width / 2) - w / 2)) + "px";
          tip.style.top = (r.top + r.height - (r.height * (Number(d[m]) || 0) / max) - 40) + "px";
        };
        col.onpointermove = show; col.onfocus = () => show(null);
        col.onpointerleave = col.onblur = () => { tip.hidden = true; };
        bars.append(col);
      }
      axis.textContent = "";
      if (days.length) axis.append(el("span", null, dayLabel(days[0].day)), el("span", null, dayLabel(days[Math.floor(days.length / 2)].day)), el("span", null, dayLabel(days[days.length - 1].day)));
    }
    draw();
    // The same numbers as a table
    const det = el("details", "tbl"); det.append(el("summary", null, "Таблица по дням"));
    const sc = el("div", "scroll"), t = el("table"), th = el("thead"), hr = el("tr");
    for (const [h, n] of [["День"], ["Посещения", 1], ["Посетители", 1], ["Регистрации", 1], ["Запросы к ИИ", 1]]) hr.append(el("th", n ? "num" : "", h));
    th.append(hr); t.append(th);
    const tb = el("tbody");
    for (const d of [...days].reverse()) { const tr = el("tr"); cell(tr, dayLabel(d.day)); for (const k of ["visits", "visitors", "signups", "requests"]) cell(tr, num(d[k]), "num"); tb.append(tr); }
    t.append(tb); sc.append(t); det.append(sc); p.append(det);
    return p;
  }

  function topList(title, rows) {
    const p = el("div", "panel"); p.append(el("h3", null, title));
    if (!rows.length) { p.append(el("p", "msg", "Пока нет данных.")); return p; }
    const max = Math.max(...rows.map(r => r[1]), 1);
    const ul = el("ul", "hbars");
    for (const [lab, n] of rows.slice(0, 10)) {
      const li = el("li"); li.append(el("span", "lab", lab));
      const tr = el("span", "track"), i = el("i"); i.style.width = (n / max * 100) + "%"; tr.append(i);
      li.append(tr, el("span", "n", num(n))); ul.append(li);
    }
    p.append(ul); return p;
  }

  // ---------- Users ----------
  let userQ = "", userOff = 0;
  async function loadUsers(more) {
    const tb = $("#users");
    if (!more) { userOff = 0; tb.textContent = ""; emptyRow(tb, 10, "Загружаю…"); }
    let rows;
    try { rows = await Account.adminUsers(userQ, PAGE_SIZE, userOff); } catch (e) { errorRow(tb, 10, e); return; }
    if (!more) tb.textContent = "";
    const total = rows[0]?.total || (more ? null : 0);
    if (total != null) $("#user-count").textContent = `${num(total)} ${plural(Number(total), "пользователь", "пользователя", "пользователей")}` + (userQ ? " найдено" : "");
    if (!rows.length && !more) emptyRow(tb, 10, userQ ? "Никого не нашлось." : "Пользователей пока нет.");
    for (const r of rows) {
      const tr = el("tr");
      const td = el("td"); const w = who(r);
      if (r.is_admin) w.prepend(el("span", "tag adm", "АДМИН"));
      if (r.vip_until) w.prepend(el("span", "tag vip", "VIP"));
      if (!r.confirmed) w.append(el("span", "tag bad", "почта не подтверждена"));
      if (r.provider && r.provider !== "email") w.append(el("span", "tag", r.provider));
      td.append(w); tr.append(td);
      cell(tr, when(r.created_at), "when"); cell(tr, ago(r.last_sign_in_at), "when");
      cell(tr, num(r.visits), "num"); cell(tr, ago(r.last_visit), "when");
      cell(tr, num(r.summaries), "num"); cell(tr, num(r.views), "num");
      cell(tr, r.chat_requests ? `${num(r.chat_requests)} · ${num(r.chat_tokens)} ток.` : "0", "num");
      cell(tr, num(r.comments), "num"); cell(tr, num(r.saved), "num");
      openable(tr, r.id);
      tb.append(tr);
    }
    userOff += rows.length;
    $("#users-more").hidden = rows.length < PAGE_SIZE;
  }
  $("#user-search").onsubmit = e => { e.preventDefault(); userQ = $("#user-q").value.trim(); loadUsers(false); };
  $("#users-more").onclick = () => loadUsers(true);

  // ---------- One user ----------
  const dialog = $("#user-dialog");
  dialog.querySelector(".x").onclick = () => dialog.close();
  dialog.addEventListener("click", e => { if (e.target === dialog) dialog.close(); });
  async function openUser(uid) {
    const body = $("#ud-body");
    body.textContent = ""; body.append(el("p", "msg", "Загружаю…"));
    if (!dialog.open) dialog.showModal();
    let d;
    try { d = await Account.adminUser(uid); } catch (e) { body.textContent = ""; body.append(el("p", "msg err", e.message)); return; }
    body.textContent = "";
    const u = d.user || {};
    const h = el("h2", null, u.display_name || u.email || "Пользователь"); h.id = "ud-title"; body.append(h);
    const sub = d.subscription, vipOn = sub && sub.status === "active" && Date.parse(sub.expires_at) > Date.now();
    const facts = el("dl", "facts");
    const fact = (k, v) => { const w = el("div"); w.append(el("dt", null, k), el("dd", null, v)); facts.append(w); };
    fact("Почта", u.email || "—"); fact("Ник", u.display_name || "—"); fact("Вход через", u.provider || "email");
    fact("Регистрация", when(u.created_at)); fact("Последний вход", ago(u.last_sign_in_at));
    fact("Почта подтверждена", u.confirmed ? "да" : "нет"); fact("Администратор", u.is_admin ? "да" : "нет");
    fact("VIP", vipOn ? "до " + when(sub.expires_at) : sub ? "истекла " + when(sub.expires_at) : "нет");
    fact("Мои страны", (u.countries || []).map(country).join(", ") || "—");
    fact("Сохранено новостей", num(d.saved)); fact("Оценок изданий", num(d.ratings)); fact("id", u.id || uid);
    body.append(facts);

    const two = el("div", "grid2");
    two.style.gridTemplateColumns = "repeat(auto-fit,minmax(240px,1fr))";
    two.append(topList("Какие страницы открывал", (d.visit_pages || []).map(x => [PAGES[x.page] || x.page, x.n])));
    two.append(topList("Какие страны смотрел", (d.visit_countries || []).map(x => [country(x.country), x.n])));
    body.append(two);

    body.append(miniTable("Запросы к ИИ", ["Когда", "Что", "Страна", "Подробно"], d.requests || [], (tr, r) => {
      cell(tr, when(r.created_at), "when"); cell(tr, KINDS[r.kind] || r.kind); cell(tr, country(r.country));
      tr.append(detailCell(r));
    }));
    body.append(miniTable("Последние посещения", ["Когда", "Страница", "Страна", "Откуда", "Устройство"], d.visits || [], (tr, r) => {
      cell(tr, when(r.created_at), "when"); cell(tr, PAGES[r.page] || r.page); cell(tr, country(r.country)); cell(tr, r.ref || "—"); cell(tr, r.device === "mobile" ? "телефон" : r.device ? "компьютер" : "—");
    }));
    if ((d.chat_days || []).length) body.append(miniTable("Чат по дням", ["День", "Вопросов", "Токенов"], d.chat_days, (tr, r) => {
      cell(tr, dayLabel(r.day)); cell(tr, num(r.requests), "num"); cell(tr, num(r.tokens), "num");
    }));
    if ((d.payments || []).length) body.append(miniTable("Оплаты", ["Когда", "Сумма", "Статус", "Способ"], d.payments, (tr, r) => {
      cell(tr, when(r.created_at), "when"); cell(tr, num(r.amount) + " ₽", "num"); cell(tr, { succeeded: "оплачено", pending: "ожидает", canceled: "отменено" }[r.status] || r.status); cell(tr, r.provider === "test" ? "тест" : "ЮKassa");
    }));
    if ((d.comments || []).length) body.append(miniTable("Комментарии", ["Когда", "Страна", "Текст"], d.comments, (tr, r) => {
      cell(tr, when(r.created_at), "when"); cell(tr, country(r.country));
      const td = el("td", "detail"); const url = safeUrl(r.url);
      if (url && r.country) { const a = el("a", null, r.body); a.href = `article.html?c=${encodeURIComponent(r.country)}&u=${encodeURIComponent(url)}`; td.append(a); } else td.textContent = r.body;
      tr.append(td);
    }));
  }
  function miniTable(title, heads, rows, fill) {
    const p = el("div"); p.append(el("h3", null, `${title} (${num(rows.length)})`));
    if (!rows.length) { p.append(el("p", "msg", "Нет.")); return p; }
    const sc = el("div", "scroll"); sc.style.maxHeight = "320px"; sc.style.overflowY = "auto";
    const t = el("table"), th = el("thead"), hr = el("tr");
    for (const h of heads) hr.append(el("th", /^(Вопросов|Токенов|Сумма)$/.test(h) ? "num" : null, h));
    th.append(hr); t.append(th);
    const tb = el("tbody");
    for (const r of rows) { const tr = el("tr"); fill(tr, r); tb.append(tr); }
    t.append(tb); sc.append(t); p.append(sc);
    return p;
  }
  // What exactly was asked: the event link, the media group or the chat question
  function detailCell(r) {
    const td = el("td", "detail");
    if (r.kind === "summary") {
      const url = safeUrl(r.detail);
      if (url && r.country) { const a = el("a", null, "событие"); a.href = `article.html?c=${encodeURIComponent(r.country)}&u=${encodeURIComponent(url)}`; td.append(a, " · ", el("small", null, new URL(url).hostname)); }
      else td.textContent = r.detail || "—";
    } else if (r.kind === "view") td.textContent = r.detail ? (GROUPS[r.detail] || r.detail) + " СМИ" : "—";
    else { td.textContent = r.detail || "—"; if (r.ok === false) td.append(" ", el("span", "tag bad", "ИИ не ответил")); }
    return td;
  }

  // ---------- Visits ----------
  let visitsBefore = null;
  async function loadVisits(more) {
    const tb = $("#visits");
    if (!more) { visitsBefore = null; tb.textContent = ""; emptyRow(tb, 6, "Загружаю…"); }
    let rows;
    try { rows = await Account.adminVisits(PAGE_SIZE * 2, visitsBefore); } catch (e) { errorRow(tb, 6, e); return; }
    if (!more) tb.textContent = "";
    if (!rows.length && !more) emptyRow(tb, 6, "Посещений пока нет: они записываются с момента запуска админки.");
    for (const r of rows) {
      const tr = el("tr");
      cell(tr, when(r.created_at), "when");
      const td = el("td"); td.append(who(r, r.visitor)); tr.append(td);
      cell(tr, PAGES[r.page] || r.page); cell(tr, country(r.country)); cell(tr, r.ref || "—");
      cell(tr, r.device === "mobile" ? "телефон" : r.device ? "компьютер" : "—");
      openable(tr, r.user_id);
      tb.append(tr);
    }
    if (rows.length) visitsBefore = rows[rows.length - 1].created_at;
    $("#visits-more").hidden = rows.length < PAGE_SIZE * 2;
  }
  $("#visits-more").onclick = () => loadVisits(true);

  // ---------- Requests ----------
  let reqBefore = null, reqKind = "", reqRows = [];
  async function loadRequests(more) {
    const tb = $("#requests");
    if (!more) { reqBefore = null; reqRows = []; tb.textContent = ""; emptyRow(tb, 6, "Загружаю…"); }
    let rows;
    try { rows = await Account.adminRequests(PAGE_SIZE * 2, reqBefore); } catch (e) { errorRow(tb, 6, e); return; }
    reqRows.push(...rows);
    if (rows.length) reqBefore = rows[rows.length - 1].created_at;
    $("#requests-more").hidden = rows.length < PAGE_SIZE * 2;
    paintRequests();
  }
  function paintRequests() {
    const tb = $("#requests"); tb.textContent = "";
    document.querySelectorAll("#req-kind button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === reqKind)));
    const rows = reqRows.filter(r => !reqKind || r.kind === reqKind);
    if (!rows.length) emptyRow(tb, 6, "Запросов пока нет.");
    for (const r of rows) {
      const tr = el("tr");
      cell(tr, when(r.created_at), "when");
      const td = el("td"); td.append(who(r)); tr.append(td);
      cell(tr, KINDS[r.kind] || r.kind); cell(tr, country(r.country));
      tr.append(detailCell(r));
      cell(tr, r.tokens != null ? num(r.tokens) : "—", "num");
      openable(tr, r.user_id);
      tb.append(tr);
    }
  }
  document.querySelectorAll("#req-kind button").forEach(b => b.onclick = () => { reqKind = b.dataset.v; paintRequests(); });
  $("#requests-more").onclick = () => loadRequests(true);

  // ---------- Admins ----------
  async function loadAdmins() {
    const tb = $("#admins");
    tb.textContent = ""; emptyRow(tb, 4, "Загружаю…");
    let rows;
    try { rows = await Account.adminList(); } catch (e) { errorRow(tb, 4, e); return; }
    tb.textContent = "";
    for (const r of rows) {
      const tr = el("tr");
      const td = el("td"); td.append(who(r)); tr.append(td);
      cell(tr, when(r.added_at), "when");
      cell(tr, r.added_by_email || "—");
      const act = el("td", "num");
      if (r.user_id === Account.user?.id) act.append(el("span", "msg", "это вы"));
      else {
        const b = el("button", "btn danger", "Снять"); b.type = "button";
        b.onclick = async () => {
          if (!confirm(`Снять права администратора у ${r.display_name || r.email}?`)) return;
          b.disabled = true;
          try { await Account.adminRevoke(r.user_id); say(`${r.display_name || r.email} больше не администратор.`, "ok"); loaded.delete("overview"); loaded.delete("users"); loadAdmins(); }
          catch (e) { say(e.message, "err"); b.disabled = false; }
        };
        act.append(b);
      }
      tr.append(act);
      tb.append(tr);
    }
  }
  const grantMsg = $("#grant-msg");
  function say(text, kind) { grantMsg.textContent = text; grantMsg.className = "msg" + (kind ? " " + kind : ""); }
  $("#grant").onsubmit = async e => {
    e.preventDefault();
    const input = $("#grant-target"), target = input.value.trim(), btn = e.target.querySelector("button");
    if (!target) { say("Введите почту, ник или id.", "err"); return; }
    if (!confirm(`Назначить «${target}» администратором? Он увидит эту страницу и сможет назначать и снимать других администраторов.`)) return;
    btn.disabled = true; say("Секунду…");
    try { await Account.adminGrant(target); input.value = ""; say(`«${target}» теперь администратор.`, "ok"); loaded.delete("overview"); loaded.delete("users"); loadAdmins(); }
    catch (err) { say(err.message, "err"); }
    finally { btn.disabled = false; }
  };

  const LOAD = { overview: loadOverview, users: () => loadUsers(false), visits: () => loadVisits(false), requests: () => loadRequests(false), admins: loadAdmins };

  // ---------- Start: only admins get past the gate ----------
  function stamp() { $("#stamp").textContent = "Обновлено в " + new Date().toLocaleTimeString("ru-RU", { ...MSK, hour: "2-digit", minute: "2-digit" }) + " МСК"; }
  $("#reload").onclick = () => { loaded.clear(); loaded.add(tab); LOAD[tab](); stamp(); };

  function gate(title, text, signIn) {
    const g = $("#gate"); g.textContent = "";
    g.append(el("h2", null, title), el("p", null, text));
    if (signIn) { const b = el("button", "btn primary", "Войти"); b.type = "button"; b.onclick = () => Account.openDialog("signin"); g.append(b); }
    g.hidden = false;
  }
  let started = false;
  function check() {
    $("#loading").hidden = true;
    if (!Account.available) { gate("Админка недоступна", "Не загрузился модуль входа. Обновите страницу."); return; }
    if (!Account.user) { $("#app").hidden = true; $("#reload").hidden = true; gate("Нужен вход", "Войдите в аккаунт администратора.", true); return; }
    if (!Account.isAdmin) { $("#app").hidden = true; $("#reload").hidden = true; gate("Только для администраторов", "У вашего аккаунта нет прав администратора. Их может выдать другой администратор."); return; }
    $("#gate").hidden = true; $("#app").hidden = false; $("#reload").hidden = false;
    if (!started) { started = true; showTab(tab, false); stamp(); }
  }
  Account.ready.then(check);
  Account.onChange(ev => { if (ev !== "SAVED" && ev !== "PROFILE") { if (!Account.user) { started = false; loaded.clear(); } check(); } });
})();
