// Accounts for ev.news: sign-up / sign-in with Supabase Auth, plus each user's
// favourite countries, feed settings and saved news (tables: profiles, saved).
// Pages include supabase-js from the CDN, then this file, then use window.Account.
(function () {
  const SUPABASE_URL = "https://bsgidggxlzinntgdnxgt.supabase.co";
  const SUPABASE_KEY = "sb_publishable_E2ZTQHXlOriOj_J4aquDSw_qMmTmRuC"; // publishable key, safe in the browser
  const SITE = location.origin + location.pathname.replace(/[^/]*$/, ""); // folder the site lives in

  const sb = window.supabase && window.supabase.createClient
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
    : null;

  let user = null, recovery = false;
  let profile = { countries: [], settings: {} };
  const saved = new Map(); // url -> row
  const listeners = new Set();
  let resolveReady;
  const ready = new Promise(r => (resolveReady = r));

  function notify(event) { for (const fn of listeners) { try { fn(event); } catch (e) { console.error(e); } } }

  async function loadUserData() {
    const [p, s] = await Promise.all([
      sb.from("profiles").select("countries, settings").eq("id", user.id).maybeSingle(),
      sb.from("saved").select("*").order("created_at", { ascending: false })
    ]);
    profile = { countries: p.data?.countries || [], settings: p.data?.settings || {} };
    if (!p.data) await sb.from("profiles").upsert({ id: user.id }); // accounts made before the trigger existed
    saved.clear();
    for (const row of s.data || []) saved.set(row.url, row);
  }

  async function handle(event, session) {
    const before = user?.id;
    user = session?.user || null;
    if (event === "PASSWORD_RECOVERY") recovery = true;
    if (user && user.id !== before) { try { await loadUserData(); } catch (e) { console.error(e); } }
    if (!user) { profile = { countries: [], settings: {} }; saved.clear(); }
    resolveReady();
    notify(event);
  }

  if (sb) {
    // Supabase advises not to await other calls inside this callback, so defer the work
    sb.auth.onAuthStateChange((event, session) => setTimeout(() => handle(event, session), 0));
    setTimeout(resolveReady, 8000); // never leave pages waiting forever
  } else {
    resolveReady();
  }

  const ERRORS = [
    [/invalid login credentials/i, "Неверная почта или пароль."],
    [/already registered|already exists/i, "Эта почта уже зарегистрирована. Войдите в аккаунт."],
    [/email not confirmed/i, "Почта ещё не подтверждена. Откройте письмо от ev.news и нажмите ссылку в нём."],
    [/rate limit|too many/i, "Слишком много попыток или писем. Попробуйте ещё раз через несколько минут."],
    [/password.*(at least|short|6)/i, "Пароль должен быть не короче 6 символов."],
    [/invalid.*email|email.*invalid|unable to validate email/i, "Проверьте адрес почты."],
    [/same.*password|different from the old/i, "Новый пароль должен отличаться от старого."],
    [/network|fetch/i, "Нет связи с сервером входа. Проверьте интернет и попробуйте снова."]
  ];
  function human(error) {
    const m = String(error?.message || error || "");
    for (const [re, text] of ERRORS) if (re.test(m)) return text;
    return "Не получилось: " + (m || "неизвестная ошибка") + ".";
  }
  function need() { if (!sb) throw new Error("Вход сейчас недоступен: не загрузился модуль входа. Обновите страницу."); }

  // Which social sign-ins are switched on in Supabase (public endpoint, no secrets)
  const PROVIDERS = [["github", "GitHub"]];
  const providersReady = fetch(SUPABASE_URL + "/auth/v1/settings", { headers: { apikey: SUPABASE_KEY } })
    .then(r => r.ok ? r.json() : {}).then(j => j.external || {}).catch(() => ({}));

  let settingsTimer = null;
  async function flushSettings() {
    if (!settingsTimer || !user) return;
    clearTimeout(settingsTimer); settingsTimer = null;
    const { error } = await sb.from("profiles").upsert({ id: user.id, settings: profile.settings, updated_at: new Date().toISOString() });
    if (error) console.error(error);
  }
  // Do not lose a pending change when the page is closed or hidden
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flushSettings(); });
  window.addEventListener("pagehide", flushSettings);

  const Account = {
    ready,
    get available() { return !!sb; },
    get user() { return user; },
    get recovery() { return recovery; },
    get countries() { return profile.countries.slice(); },
    get settings() { return { ...profile.settings }; },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    human,

    async signUp(email, password) {
      need();
      const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: SITE + "account.html" } });
      if (error) throw new Error(human(error));
      // With e-mail confirmation on, there is no session until the link is opened
      return { needsConfirmation: !data.session };
    },
    async signIn(email, password) {
      need();
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(human(error));
    },
    async signOut() { if (sb) await sb.auth.signOut(); },
    async signInWith(provider) {
      need();
      // Come back to the page the person started from (without its #country part)
      const back = location.origin + location.pathname;
      const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: back } });
      if (error) throw new Error(human(error));
    },
    async sendReset(email) {
      need();
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE + "account.html" });
      if (error) throw new Error(human(error));
    },
    async updatePassword(password) {
      need();
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error(human(error));
      recovery = false;
    },

    async setCountries(list) {
      if (!user) return;
      profile.countries = list.slice();
      notify("PROFILE");
      const { error } = await sb.from("profiles").upsert({ id: user.id, countries: profile.countries, updated_at: new Date().toISOString() });
      if (error) console.error(error);
    },
    async toggleCountry(code) {
      const list = profile.countries.includes(code) ? profile.countries.filter(c => c !== code) : [...profile.countries, code];
      await Account.setCountries(list);
      return list.includes(code);
    },
    saveSettings(patch) {
      if (!user) return;
      profile.settings = { ...profile.settings, ...patch };
      clearTimeout(settingsTimer);
      settingsTimer = setTimeout(flushSettings, 400);
    },

    isSaved(url) { return saved.has(url); },
    savedList() { return [...saved.values()]; },
    async toggleSaved(item) {
      if (!user) throw new Error("Войдите, чтобы сохранять новости.");
      if (saved.has(item.url)) {
        const { error } = await sb.from("saved").delete().eq("url", item.url);
        if (error) throw new Error(human(error));
        saved.delete(item.url);
        notify("SAVED");
        return false;
      }
      const { data, error } = await sb.from("saved").insert(item).select().single();
      if (error) throw new Error(human(error));
      saved.set(item.url, data);
      notify("SAVED");
      return true;
    }
  };

  // ---------- Header widget and sign-in dialog ----------
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  let dialog = null;
  function openDialog(mode = "signin") {
    if (!dialog) dialog = buildDialog();
    dialog.setMode(mode);
    dialog.node.showModal();
    dialog.node.querySelector("input[type=email]").focus();
  }

  function buildDialog() {
    const d = el("dialog", "acc-dialog");
    d.setAttribute("aria-labelledby", "acc-title");
    d.innerHTML = `
      <form method="dialog" class="acc-form" novalidate>
        <button type="button" class="acc-close" aria-label="Закрыть">×</button>
        <div class="acc-tabs" role="tablist">
          <button type="button" role="tab" data-mode="signin">Вход</button>
          <button type="button" role="tab" data-mode="signup">Регистрация</button>
        </div>
        <h2 id="acc-title"></h2>
        <p class="acc-lead"></p>
        <div class="acc-social" hidden></div>
        <div class="acc-or" hidden><span>или по почте</span></div>
        <label for="acc-email">Почта</label>
        <input id="acc-email" type="email" autocomplete="email" required placeholder="you@example.com">
        <div class="acc-pass">
          <label for="acc-password">Пароль</label>
          <input id="acc-password" type="password" minlength="6" required>
        </div>
        <p class="acc-msg" role="status" aria-live="polite"></p>
        <button type="submit" class="acc-submit"></button>
        <button type="button" class="acc-link" data-forgot>Забыли пароль?</button>
      </form>`;
    document.body.append(d);
    const form = d.querySelector("form"), msg = d.querySelector(".acc-msg"), submit = d.querySelector(".acc-submit");
    const email = d.querySelector("#acc-email"), pass = d.querySelector("#acc-password");
    let mode = "signin";
    const TEXT = {
      signin: ["Вход в ev.news", "Войдите, чтобы читать ленту, сохранять новости и выбирать свои страны.", "Войти", "current-password"],
      signup: ["Регистрация", "Нужны только почта и пароль. Мы пришлём письмо для подтверждения.", "Зарегистрироваться", "new-password"],
      reset: ["Восстановление пароля", "Пришлём на почту ссылку, по которой можно задать новый пароль.", "Отправить ссылку", ""]
    };
    function setMode(m) {
      mode = m;
      const [title, lead, button, ac] = TEXT[m];
      d.querySelector("#acc-title").textContent = title;
      d.querySelector(".acc-lead").textContent = lead;
      submit.textContent = button;
      d.querySelector(".acc-pass").hidden = m === "reset";
      pass.autocomplete = ac;
      d.querySelector("[data-forgot]").hidden = m !== "signin";
      const social = d.querySelector(".acc-social"), any = social.children.length > 0;
      social.hidden = !any || m === "reset"; d.querySelector(".acc-or").hidden = !any || m === "reset";
      d.querySelectorAll(".acc-tabs button").forEach(b => b.setAttribute("aria-selected", String(b.dataset.mode === m)));
      msg.textContent = ""; msg.className = "acc-msg";
    }
    d.querySelectorAll(".acc-tabs button").forEach(b => b.onclick = () => setMode(b.dataset.mode));
    // Social buttons appear only for providers enabled in Supabase
    providersReady.then(on => {
      const box = d.querySelector(".acc-social");
      for (const [id, name] of PROVIDERS) {
        if (!on[id]) continue;
        const b = el("button", "acc-oauth acc-" + id); b.type = "button";
        b.append(el("span", "acc-ico", "GH"), document.createTextNode("Войти через " + name));
        b.onclick = async () => {
          b.disabled = true; msg.className = "acc-msg"; msg.textContent = "Переходим на " + name + "…";
          try { await Account.signInWith(id); } catch (err) { msg.textContent = err.message; msg.classList.add("err"); b.disabled = false; }
        };
        box.append(b);
      }
      const any = box.children.length > 0;
      box.hidden = !any || mode === "reset";
      d.querySelector(".acc-or").hidden = !any || mode === "reset";
    });
    d.querySelector("[data-forgot]").onclick = () => setMode("reset");
    d.querySelector(".acc-close").onclick = () => d.close();
    d.addEventListener("click", e => { if (e.target === d) d.close(); });
    form.addEventListener("submit", async e => {
      e.preventDefault();
      msg.className = "acc-msg";
      if (!email.value.includes("@")) { msg.textContent = "Введите адрес почты."; msg.classList.add("err"); return; }
      if (mode !== "reset" && pass.value.length < 6) { msg.textContent = "Пароль должен быть не короче 6 символов."; msg.classList.add("err"); return; }
      submit.disabled = true; msg.textContent = "Секунду…";
      try {
        if (mode === "signin") { await Account.signIn(email.value.trim(), pass.value); d.close(); }
        else if (mode === "signup") {
          const r = await Account.signUp(email.value.trim(), pass.value);
          if (r.needsConfirmation) { msg.textContent = `Готово. Мы отправили письмо на ${email.value.trim()}: откройте его и нажмите ссылку, чтобы подтвердить почту. После этого войдите.`; msg.classList.add("ok"); }
          else d.close();
        } else {
          await Account.sendReset(email.value.trim());
          msg.textContent = "Ссылка отправлена. Проверьте почту, в том числе папку «Спам»."; msg.classList.add("ok");
        }
      } catch (err) { msg.textContent = err.message; msg.classList.add("err"); }
      finally { submit.disabled = false; }
    });
    return { node: d, setMode };
  }

  // Renders "Войти" or the account link into every [data-account] slot
  function paintSlots() {
    document.querySelectorAll("[data-account]").forEach(slot => {
      slot.textContent = "";
      if (user) {
        const a = el("a", "acc-me"); a.href = "account.html"; a.title = user.email;
        a.append(el("span", "acc-avatar", (user.email || "?")[0].toUpperCase()), el("span", "acc-name", "Кабинет"));
        slot.append(a);
      } else {
        const b = el("button", "acc-login", "Войти"); b.type = "button";
        b.onclick = () => openDialog("signin");
        slot.append(b);
      }
    });
  }
  Account.openDialog = openDialog;
  Account.onChange(paintSlots);
  ready.then(paintSlots);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", paintSlots); else paintSlots();

  window.Account = Account;
})();
