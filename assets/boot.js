// Runs first in <head>: applies the saved theme before the page paints,
// and sends old links like …/country-news/#RU from the home page to the feed.
(function () {
  try {
    var t = localStorage.getItem("cn:theme");
    if (t === "light" || t === "dark") document.documentElement.dataset.theme = t;
  } catch (e) {}
  if (/\/(index\.html)?$/.test(location.pathname) && /^#[A-Z]{2}$/.test(location.hash)) location.replace("news.html" + location.hash);
})();
