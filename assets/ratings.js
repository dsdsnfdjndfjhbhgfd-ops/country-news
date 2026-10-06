// Outlet ratings page: totals come from the outlet_stats() database function (no voter
// identities), the reader's own scores from outlet_ratings (row-level security: own rows only).
(function () {
  const $ = s => document.querySelector(s);
  const list = $("#list"), podium = $("#podium"), msg = $("#msg"), summary = $("#summary");
  const M = 3; // how many "average" votes every outlet starts with, so one 5-star vote cannot top the list
  let stats = [], mine = {}, lang = "all", sort = "rating";
  try { lang = localStorage.getItem("ev:rate-lang") || "all"; sort = localStorage.getItem("ev:rate-sort") || "rating"; } catch {}

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  const num = x => x.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const plural = (n, a, b, c) => { const m10 = n % 10, m100 = n % 100; return m10 === 1 && m100 !== 11 ? a : m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20) ? b : c; };
  const votesText = n => n ? `${n} ${plural(n, "оценка", "оценки", "оценок")}` : "ещё нет оценок";
  const safeUrl = u => /^https:\/\//i.test(u || "") ? u : null;
  function say(text, kind = "") { msg.textContent = text; msg.className = "msg" + (kind ? " " + kind : ""); }

  function starsBar(avg, label) {
    const s = el("span", "stars"); s.setAttribute("role", "img"); s.setAttribute("aria-label", label);
    const i = el("i"); i.style.width = (Math.max(0, Math.min(5, avg || 0)) / 5 * 100) + "%"; s.append(i);
    return s;
  }

  function computed() {
    const total = stats.reduce((a, s) => a + s.votes, 0);
    const sum = stats.reduce((a, s) => a + (s.average || 0) * s.votes, 0);
    const C = total ? sum / total : 3;
    return stats.map(s => ({ ...s, average: s.average == null ? null : Number(s.average), weighted: s.votes ? (s.votes * Number(s.average) + M * C) / (s.votes + M) : null }));
  }
  const byRating = (a, b) => (b.weighted ?? -1) - (a.weighted ?? -1) || b.votes - a.votes || a.outlet.localeCompare(b.outlet, "ru");

  function render() {
    const all = computed();
    const ranked = all.filter(s => s.votes).sort(byRating);
    const place = new Map(ranked.map((s, i) => [s.outlet, i + 1]));

    // Summary line
    const total = all.reduce((a, s) => a + s.votes, 0);
    summary.textContent = "";
    const add = (b, t) => { const p = el("span"); p.append(el("b", null, b), " " + t); summary.append(p); };
    add(String(all.length), plural(all.length, "издание", "издания", "изданий"));
    add(String(total), plural(total, "оценка", "оценки", "оценок") + " всего");
    add(String(ranked.length), "с оценками");
    if (Account.user) { const n = Object.keys(mine).length; add(String(n), "оценено вами"); }

    // Podium: the three best-rated outlets
    podium.textContent = "";
    const top = ranked.slice(0, 3);
    podium.hidden = top.length === 0;
    const order = top.length === 3 ? [top[1], top[0], top[2]] : top; // classic podium: 2-1-3
    for (const s of order) {
      const p = place.get(s.outlet);
      const li = el("li", "p" + p);
      li.append(el("span", "place", p + " место"), el("span", "nm", s.outlet), el("span", "score", num(s.average)));
      li.append(starsBar(s.average, `Средняя оценка ${num(s.average)} из 5`), el("span", "stat", votesText(s.votes)));
      podium.append(li);
    }

    // Full list
    let rows = all.filter(s => lang === "all" || s.lang === lang);
    if (sort === "rating") rows.sort(byRating);
    else if (sort === "votes") rows.sort((a, b) => b.votes - a.votes || byRating(a, b));
    else rows.sort((a, b) => a.outlet.localeCompare(b.outlet, "ru"));

    list.textContent = "";
    for (const s of rows) {
      const p = place.get(s.outlet);
      const li = el("li", "row" + (p && p <= 3 ? " top3" : ""));
      li.append(el("span", "rank", p ? String(p) : "—"));

      const body = el("div");
      const url = safeUrl(s.site);
      const name = el(url ? "a" : "span", "name", s.outlet);
      if (url) { name.href = url; name.target = "_blank"; name.rel = "noopener noreferrer"; }
      body.append(name, el("span", "lang", s.lang === "ru" ? "рус" : "англ"));
      const st = el("div", "stat");
      if (s.votes) {
        st.append(starsBar(s.average, `Средняя оценка ${num(s.average)} из 5`), el("b", null, num(s.average)), votesText(s.votes));
        const h = el("span", "hist"); h.title = "Сколько поставили 1, 2, 3, 4 и 5 звёзд: " + s.dist.join(", ");
        const max = Math.max(...s.dist, 1);
        for (const n of s.dist) { const b = el("span"); b.style.height = Math.round(2 + n / max * 16) + "px"; h.append(b); }
        st.append(h);
      } else st.append(starsBar(0, "Оценок пока нет"), votesText(0));
      body.append(st);
      li.append(body);

      // The reader's own score
      const box = el("div", "mine");
      const my = mine[s.outlet] || 0;
      box.append(el("small", null, my ? "Ваша оценка" : "Оценить"));
      const rate = el("div", "rate"); rate.setAttribute("role", "group"); rate.setAttribute("aria-label", "Оценка изданию " + s.outlet);
      for (let n = 1; n <= 5; n++) {
        const b = el("button", n <= my ? "on" : "", "★"); b.type = "button";
        b.setAttribute("aria-label", `${n} из 5`); b.setAttribute("aria-pressed", String(n === my));
        b.onclick = () => vote(s.outlet, n, rate);
        rate.append(b);
      }
      box.append(rate);
      if (my) { const c = el("button", "clear", "убрать оценку"); c.type = "button"; c.onclick = () => vote(s.outlet, 0, rate); box.append(c); }
      li.append(box);
      list.append(li);
    }
    if (!rows.length) list.append(el("li", "row", "Нет изданий для этого фильтра."));
  }

  async function vote(outlet, score, group) {
    if (!Account.user) { say("Войдите, чтобы ставить оценки. Смотреть рейтинг можно без входа."); Account.openDialog("signin"); return; }
    group.setAttribute("aria-busy", "true");
    try {
      if (score && mine[outlet] !== score) { await Account.rateOutlet(outlet, score); mine[outlet] = score; say(`«${outlet}»: ваша оценка ${score} из 5.`, "ok"); }
      else { await Account.unrateOutlet(outlet); delete mine[outlet]; say(`Оценка «${outlet}» убрана.`, "ok"); }
      stats = await Account.outletStats();
      render();
    } catch (e) { say(e.message, "err"); group.removeAttribute("aria-busy"); }
  }

  // Filters
  function paintControls() {
    document.querySelectorAll("#lang button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === lang)));
    $("#sort").value = sort;
  }
  document.querySelectorAll("#lang button").forEach(b => b.onclick = () => {
    lang = b.dataset.v; try { localStorage.setItem("ev:rate-lang", lang); } catch {}
    paintControls(); render();
  });
  $("#sort").onchange = e => { sort = e.target.value; try { localStorage.setItem("ev:rate-sort", sort); } catch {} render(); };
  paintControls();

  async function loadMine() {
    try { mine = await Account.myRatings(); } catch (e) { mine = {}; console.error(e); }
  }

  async function start() {
    if (!Account.available) { list.textContent = ""; say("Рейтинг сейчас недоступен: не загрузился модуль входа. Обновите страницу.", "err"); return; }
    await Account.ready;
    try {
      [stats] = await Promise.all([Account.outletStats(), loadMine()]);
      render();
    } catch (e) { list.textContent = ""; say(e.message, "err"); }
  }
  // Signing in or out changes which stars are "yours"
  let lastUser = null;
  Account.onChange(async () => {
    const id = Account.user?.id || null;
    if (id === lastUser || !stats.length) { lastUser = id; return; }
    lastUser = id; await loadMine(); if (!Account.user) say(""); render();
  });
  Account.ready.then(() => { lastUser = Account.user?.id || null; });
  start();
})();
