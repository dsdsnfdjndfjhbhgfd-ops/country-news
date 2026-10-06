// Checks an e-mail address at sign-up without sending anything:
// format, typos in popular domains, throwaway mailboxes, and whether the domain
// can receive mail at all (DNS MX/A records via Google's public DNS-over-HTTPS).
// A specific mailbox cannot be confirmed this way: big providers do not reveal it.
(function () {
  const POPULAR = ["gmail.com", "yandex.ru", "ya.ru", "mail.ru", "bk.ru", "inbox.ru", "list.ru", "internet.ru", "rambler.ru",
    "outlook.com", "hotmail.com", "live.com", "icloud.com", "me.com", "yahoo.com", "proton.me", "protonmail.com", "gmx.com", "gmx.de", "yandex.com", "yandex.by", "yandex.kz"];
  const DISPOSABLE = new Set(("mailinator.com 10minutemail.com 10minutemail.net guerrillamail.com guerrillamail.net guerrillamailblock.com sharklasers.com " +
    "grr.la temp-mail.org temp-mail.io tempmail.com tempmail.net tempmailo.com tmpmail.org tmpmail.net yopmail.com yopmail.net yopmail.fr " +
    "trashmail.com trashmail.de getnada.com nada.email dispostable.com maildrop.cc throwawaymail.com fakeinbox.com mintemail.com " +
    "mohmal.com emailondeck.com 1secmail.com 1secmail.net 1secmail.org mail.tm mailnesia.com mytemp.email burnermail.io " +
    "spamgourmet.com moakt.com tempail.com emailfake.com dropmail.me inboxkitten.com mailpoof.com tempr.email discard.email " +
    "mailcatch.com spambox.us getairmail.com fakemail.net tempinbox.com mailtemp.net emltmp.com minuteinbox.com crazymailing.com " +
    "harakirimail.com mail-temp.com tempmailaddress.com temporary-mail.net mailforspam.com spam4.me").split(" "));
  const FORMAT = /^[^\s@"(),:;<>[\]\\]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i;
  const cache = new Map();

  function distance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[a.length][b.length];
  }
  function suggest(domain) {
    if (POPULAR.includes(domain)) return null;
    let best = null, bestD = 3;
    for (const p of POPULAR) { const dd = distance(domain, p); if (dd < bestD) { bestD = dd; best = p; } }
    return bestD <= 2 ? best : null;
  }
  async function dns(name, type) {
    const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error("dns");
    return r.json();
  }
  async function domainReceivesMail(domain) {
    if (cache.has(domain)) return cache.get(domain);
    let result;
    try {
      const mx = await dns(domain, "MX");
      if (mx.Status === 3) result = "missing";                         // no such domain
      else if ((mx.Answer || []).some(a => a.type === 15 && !/^0\s+\.?$/.test(a.data))) result = "ok";
      else if ((mx.Answer || []).some(a => a.type === 15)) result = "nomail"; // "null MX": domain refuses mail
      else {
        const a = await dns(domain, "A");                               // no MX: mail may go to the A record
        result = (a.Answer || []).some(x => x.type === 1) ? "ok" : "nomail";
      }
    } catch { result = "unknown"; }                                     // DNS service unreachable: do not block
    cache.set(domain, result);
    return result;
  }

  // Returns { ok, message, suggestion } — ok:false blocks sign-up
  async function checkEmail(raw) {
    const email = String(raw || "").trim().toLowerCase();
    if (!FORMAT.test(email)) return { ok: false, message: "Проверьте адрес: он должен выглядеть как name@example.com." };
    const [local, domain] = [email.slice(0, email.lastIndexOf("@")), email.slice(email.lastIndexOf("@") + 1)];
    if (DISPOSABLE.has(domain)) return { ok: false, message: "Одноразовая почта не подходит. Укажите свой постоянный адрес." };
    const fix = suggest(domain);
    const status = await domainReceivesMail(domain);
    if (status === "missing") return { ok: false, message: `Почтового домена «${domain}» не существует.`, suggestion: fix && `${local}@${fix}` };
    if (status === "nomail") return { ok: false, message: `Домен «${domain}» не принимает почту.`, suggestion: fix && `${local}@${fix}` };
    if (fix) return { ok: true, message: "", suggestion: `${local}@${fix}` };
    return { ok: true, message: "" };
  }

  window.checkEmail = checkEmail;
})();
