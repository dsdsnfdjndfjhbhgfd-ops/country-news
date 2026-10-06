const COUNTRIES = [["RU", "Россия"], ["US", "США"], ["CN", "Китай"], ["UA", "Украина"], ["IL", "Израиль"], ["IR", "Иран"], ["DE", "Германия"], ["GB", "Великобритания"], ["FR", "Франция"], ["TR", "Турция"], ["IN", "Индия"], ["JP", "Япония"], ["PL", "Польша"], ["BY", "Беларусь"], ["KZ", "Казахстан"], ["MA", "Марокко"], ["SA", "Саудовская Аравия"], ["BR", "Бразилия"]];
const NAME = Object.fromEntries(COUNTRIES);
const main = document.getElementById("main");
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function fmt(ts) { return ts ? new Date(ts).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : ""; }

function render() {
  main.textContent = "";
  if (!Account.available) { main.append(el("div", "empty", "Вход сейчас недоступен: не загрузился модуль входа. Обновите страницу.")); return; }
  if (Account.recovery && Account.user) return renderNewPassword();
  if (!Account.user) return renderSignedOut();

  const who = el("div", "who");
  const left = el("div"); left.append(el("h1", null, "Кабинет"), el("p", null, Account.user.email));
  const out = el("button", "btn", "Выйти"); out.type = "button";
  out.onclick = async () => { await Account.signOut(); };
  if (Account.isAdmin) left.append(el("p", "admin-note", "Вы администратор: можете удалять любые комментарии на страницах событий."));
  who.append(left, out);
  main.append(who);

  // Name shown under the person's comments
  const nm = el("section");
  nm.append(el("h2", null, "Имя в комментариях"), el("p", null, "Его видят другие читатели под вашими комментариями. Почта не показывается."));
  const nf = el("form", "name-form"); nf.noValidate = true;
  const ni = el("input"); ni.id = "display-name"; ni.maxLength = 40; ni.value = Account.displayName; ni.placeholder = "Например, Алексей";
  ni.setAttribute("aria-label", "Имя в комментариях");
  const nb = el("button", "btn", "Сохранить имя"); nb.type = "submit";
  const nmsg = el("p", "msg");
  nf.append(ni, nb, nmsg);
  nf.addEventListener("submit", async e => {
    e.preventDefault(); nb.disabled = true;
    try { await Account.setDisplayName(ni.value); nmsg.textContent = "Имя сохранено. Новые комментарии будут подписаны им."; nmsg.className = "msg ok"; }
    catch (err) { nmsg.textContent = err.message; nmsg.className = "msg err"; }
    finally { nb.disabled = false; }
  });
  nm.append(nf);
  main.append(nm);

  const mine = el("section");
  mine.append(el("h2", null, "Мои страны"), el("p", null, "Эти страны стоят первыми на главной и в ленте, а лента открывается на первой из них."));
  const chips = el("div", "chips");
  const picked = Account.countries;
  for (const [code, name] of COUNTRIES) {
    const b = el("button", null, (picked.includes(code) ? "★ " : "") + name); b.type = "button";
    b.setAttribute("aria-pressed", String(picked.includes(code)));
    b.onclick = async () => { b.disabled = true; await Account.toggleCountry(code); };
    chips.append(b);
  }
  mine.append(chips);
  main.append(mine);

  const sv = el("section");
  const items = Account.savedList();
  sv.append(el("h2", null, `Сохранённые новости${items.length ? " · " + items.length : ""}`), el("p", null, "Сохраняйте события кнопкой «Сохранить» в ленте. Здесь они остаются, даже когда пропадают из ленты."));
  if (!items.length) {
    const e = el("div", "empty"); e.append("Пока ничего не сохранено. "); const a = el("a", null, "Открыть ленту"); a.href = "news.html"; e.append(a); sv.append(e);
  } else {
    const ul = el("ul", "list");
    for (const it of items) {
      const li = el("li"); const body = el("div");
      const a = el("a", "t", it.title); a.href = /^https?:\/\//i.test(it.url || "") ? it.url : "#"; a.target = "_blank"; a.rel = "noopener";
      body.append(a, el("div", "meta", [NAME[it.country] || it.country, it.topic, it.source, fmt(it.published_at)].filter(Boolean).join(", ")));
      if (it.why) body.append(el("p", "why", it.why));
      if (Translate.isForeign(it.title) && /^https?:\/\//i.test(it.url || "")) {
        const tr = el("div", "tr"); tr.append("Перевести статью: ");
        Translate.articleLinks(it.url).forEach(([name, href], k) => { const l = el("a", null, name); l.href = href; l.target = "_blank"; l.rel = "noopener noreferrer"; tr.append(l); if (!k) tr.append(" или "); });
        body.append(tr);
      }
      const rm = el("button", "btn", "Убрать"); rm.type = "button";
      rm.onclick = async () => { rm.disabled = true; try { await Account.toggleSaved(it); } catch (e) { rm.disabled = false; alertMsg(e.message); } };
      li.append(body, rm); ul.append(li);
    }
    sv.append(ul);
  }
  main.append(sv);

  const pw = el("section");
  pw.append(el("h2", null, "Пароль"));
  const ch = el("button", "btn", "Сменить пароль"); ch.type = "button";
  ch.onclick = () => renderNewPassword(true);
  pw.append(ch);
  main.append(pw);
}

function alertMsg(text) { const m = el("p", "msg err", text); main.prepend(m); setTimeout(() => m.remove(), 6000); }

function renderSignedOut() {
  const g = el("div", "gate");
  g.append(el("h2", null, "Войдите в ev.news"), el("p", null, "Аккаунт открывает ленту новостей, позволяет выбрать свои страны и сохранять важные события. Настройки сохраняются на всех ваших устройствах."));
  const row = el("div", "row");
  const a = el("button", null, "Войти"); a.type = "button"; a.onclick = () => Account.openDialog("signin");
  const b = el("button", "alt", "Зарегистрироваться"); b.type = "button"; b.onclick = () => Account.openDialog("signup");
  row.append(a, b); g.append(row); main.append(g);
}

function renderNewPassword(fromCabinet) {
  main.textContent = "";
  const f = el("form", "card");
  f.append(el("h1", null, "Новый пароль"));
  const lab = el("label", null, "Новый пароль, не короче 6 символов"); lab.htmlFor = "np";
  const inp = el("input"); inp.type = "password"; inp.id = "np"; inp.autocomplete = "new-password"; inp.minLength = 6;
  const msg = el("p", "msg");
  const btn = el("button", "btn primary", "Сохранить пароль"); btn.type = "submit";
  f.append(lab, inp, msg, btn);
  if (fromCabinet) { const c = el("button", "btn", "Отмена"); c.type = "button"; c.onclick = render; f.append(c); }
  f.addEventListener("submit", async e => {
    e.preventDefault();
    if (inp.value.length < 6) { msg.textContent = "Пароль должен быть не короче 6 символов."; msg.className = "msg err"; return; }
    btn.disabled = true;
    try { await Account.updatePassword(inp.value); msg.textContent = "Пароль изменён."; msg.className = "msg ok"; setTimeout(render, 1200); }
    catch (err) { msg.textContent = err.message; msg.className = "msg err"; btn.disabled = false; }
  });
  main.append(f); inp.focus();
}

Account.ready.then(render);
Account.onChange(e => { if (e !== "TOKEN_REFRESHED") render(); });
