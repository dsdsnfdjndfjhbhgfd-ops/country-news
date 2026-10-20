// Cookie notice: what ev.news keeps in the browser, and the reader's choice.
// The site sets no cookies of its own; it uses the browser's local storage for the same things
// (sign-in, theme, feed settings). "Принять" also keeps a random browser number for visit statistics
// (account.js, ev:vid); "Только необходимые" keeps it only while the tab is open.
// The choice is stored as ev:cookies = "all" | "necessary"; any [data-cookie-settings] element reopens the notice.
(function () {
  const KEY = "ev:cookies";
  const read = () => { try { return localStorage.getItem(KEY) || ""; } catch { return ""; } };
  let bar = null;

  function choose(v) {
    try {
      localStorage.setItem(KEY, v);
      if (v !== "all") localStorage.removeItem("ev:vid");
      else if (!localStorage.getItem("ev:vid") && sessionStorage.getItem("ev:vid")) localStorage.setItem("ev:vid", sessionStorage.getItem("ev:vid")); // the same visitor as before the choice
    } catch {}
    if (bar) { bar.classList.add("out"); setTimeout(() => { bar?.remove(); bar = null; }, 300); }
  }

  function open() {
    if (bar) return;
    bar = document.createElement("div");
    bar.className = "cookie-bar"; bar.setAttribute("role", "dialog"); bar.setAttribute("aria-live", "polite");
    bar.setAttribute("aria-labelledby", "cookie-title");
    bar.innerHTML = `
      <div class="cookie-text">
        <b id="cookie-title">Cookie и данные в браузере</b>
        <p>ev.news хранит в браузере вход в аккаунт, тему и настройки ленты, а для статистики посещений — случайный номер браузера. Рекламы и сторонних трекеров на сайте нет.</p>
      </div>
      <div class="cookie-acts">
        <button type="button" class="cookie-min">Только необходимые</button>
        <button type="button" class="cookie-ok">Принять</button>
      </div>`;
    bar.querySelector(".cookie-ok").onclick = () => choose("all");
    bar.querySelector(".cookie-min").onclick = () => choose("necessary");
    document.body.append(bar);
  }

  window.CookieConsent = { get: read, open, allowsStats: () => read() === "all" };
  document.addEventListener("click", e => { const t = e.target.closest && e.target.closest("[data-cookie-settings]"); if (t) { e.preventDefault(); open(); } });
  const start = () => { if (!read()) open(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
