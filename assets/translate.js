// Translation helpers.
// 1) Whole articles: links that open the original article translated into Russian
//    by Yandex Translate or Google Translate (works in any browser, nothing to set up).
// 2) Headlines: Chrome's built-in on-device translator (Translator API), when the
//    browser has it. Text never leaves the device; elsewhere this part stays hidden.
(function () {
  const LATIN = /[a-z]/i, CYRILLIC = /[а-яё]/i;

  function isForeign(title, language) {
    if (language) return language !== "Russian";
    return LATIN.test(title || "") && !CYRILLIC.test(title || "");
  }
  function articleLinks(url) {
    const u = encodeURIComponent(url);
    return [
      ["Яндекс", `https://translate.yandex.ru/translate?url=${u}&lang=en-ru`],
      ["Google", `https://translate.google.com/translate?sl=auto&tl=ru&u=${u}`]
    ];
  }

  const supported = typeof self !== "undefined" && "Translator" in self;
  let translator = null, preparing = null;
  const cache = new Map();

  // "available": ready now; "downloadable"/"downloading": needs a click to fetch the language pack
  let avail = null;
  function availability() {
    if (!supported) return Promise.resolve("unavailable");
    if (!avail || translator) avail = self.Translator.availability({ sourceLanguage: "en", targetLanguage: "ru" }).catch(() => "unavailable");
    return avail;
  }
  // Call from a click when the language pack still has to be downloaded
  function prepare(onProgress) {
    if (translator) return Promise.resolve(translator);
    if (!preparing) {
      preparing = self.Translator.create({
        sourceLanguage: "en", targetLanguage: "ru",
        monitor(m) { if (onProgress) m.addEventListener("downloadprogress", e => onProgress(e.loaded)); }
      }).then(t => (translator = t)).catch(e => { preparing = null; throw e; });
    }
    return preparing;
  }
  async function translate(text) {
    if (cache.has(text)) return cache.get(text);
    const t = translator || (await availability() === "available" ? await prepare() : null);
    if (!t) return null;
    const out = await t.translate(text);
    cache.set(text, out);
    return out;
  }

  window.Translate = { isForeign, articleLinks, titles: { supported, availability, prepare, translate } };
})();
