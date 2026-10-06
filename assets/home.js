function applyTheme(t) {
  if (t === "light" || t === "dark") document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  document.querySelectorAll(".theme button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.t === (t || "auto"))));
  try { t === "auto" ? localStorage.removeItem("cn:theme") : localStorage.setItem("cn:theme", t); } catch {}
}
let savedTheme = "auto"; try { savedTheme = localStorage.getItem("cn:theme") || "auto"; } catch {}
applyTheme(savedTheme);
document.querySelectorAll(".theme button").forEach(b => b.onclick = () => { applyTheme(b.dataset.t); Account.saveSettings({ theme: b.dataset.t }); });

const COUNTRIES = [["RU", "Россия"], ["US", "США"], ["CN", "Китай"], ["UA", "Украина"], ["IL", "Израиль"], ["IR", "Иран"], ["DE", "Германия"], ["GB", "Великобритания"], ["FR", "Франция"], ["TR", "Турция"], ["IN", "Индия"], ["JP", "Япония"], ["PL", "Польша"], ["BY", "Беларусь"], ["KZ", "Казахстан"]];
const TOPIC_COLOR = { "Политика": "--t-politics", "Безопасность": "--t-security", "Экономика": "--t-economy" };
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function plural(n, one, few, many) { const a = n % 10, b = n % 100; return a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many; }
function cleanTitle(t) {
  t = String(t || "");
  for (const sep of [" :: ", " | ", " – ", " - "]) { const i = t.indexOf(sep, 30); if (i > 0) t = t.slice(0, i); }
  return t.length > 140 ? t.slice(0, 137).replace(/\s+\S*$/, "") + "…" : t;
}

function drawBoard(status) {
  const board = document.getElementById("board"); board.textContent = "";
  const mine = window.Account ? Account.countries : [];
  const order = [...COUNTRIES].sort((x, y) => (mine.includes(y[0]) - mine.includes(x[0])) || (mine.indexOf(x[0]) - mine.indexOf(y[0])));
  for (const [code, name] of order) {
    const s = status && status.countries && status.countries[code];
    const a = el("a", "card" + (mine.includes(code) ? " mine" : "")); a.href = "news.html#" + code;
    const row = el("div", "row depth-sm"); row.append(el("b", null, (mine.includes(code) ? "★ " : "") + name));
    if (s) row.append(el("span", "n", `${s.events} ${plural(s.events, "событие", "события", "событий")}`));
    a.append(row);
    if (s && s.top) {
      const tp = el("span", "topic", s.top.topic + (s.top.domains > 1 ? `, пишут ${s.top.domains} ${plural(s.top.domains, "издание", "издания", "изданий")}` : ""));
      tp.style.setProperty("--tc", `var(${TOPIC_COLOR[s.top.topic] || "--muted"})`);
      a.append(tp, el("p", "top depth", cleanTitle(s.top.title)));
    }
    a.append(el("span", "go", "Открыть ленту"));
    board.append(a);
  }
}

let lastStatus = null;
const globe = Globe.mount(document.getElementById("globe"), { max: 500 });
drawBoard(null);
Account.onChange(e => { if (e !== "TOKEN_REFRESHED") drawBoard(lastStatus); if (e === "SIGNED_IN" && ["auto","light","dark"].includes(Account.settings.theme)) applyTheme(Account.settings.theme); });
fetch("data/status.json?t=" + Date.now(), { cache: "no-store" })
  .then(r => r.ok ? r.json() : Promise.reject())
  .then(s => {
    lastStatus = s; drawBoard(s); globe.setStatus(s);
    const t = new Date(s.updated), min = Math.round((Date.now() - t) / 60000);
    const total = Object.values(s.countries).reduce((n, c) => n + c.items, 0);
    document.getElementById("live").textContent =
      `Последнее обновление в ${t.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}` +
      (min >= 1 ? ` (${min} ${plural(min, "минуту", "минуты", "минут")} назад)` : " (только что)") +
      `. В базе ${total.toLocaleString("ru-RU")} ${plural(total, "публикация", "публикации", "публикаций")} за двое суток.`;
  })
  .catch(() => { document.getElementById("live").textContent = "Данные обновляются каждые 15–20 минут."; });
