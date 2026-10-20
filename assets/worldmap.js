// Map of the world on the home page: land as dots, a pulsing mark on every main country, and the
// country's main events popping up one after another as cards with pictures (data/map.json).
// On phones the card appears under the map; a strip of cards below lists every country's main event.
// No libraries: the land outline is the Natural Earth 1:110m map also used by the globe.
(function () {
  const LAND_URL = "assets/vendor/land-110m.json";
  const PLACES = {
    RU: ["Россия", 55.75, 37.62], US: ["США", 38.9, -77.04], CN: ["Китай", 39.9, 116.4], UA: ["Украина", 50.45, 30.52],
    IL: ["Израиль", 31.78, 35.22], IR: ["Иран", 35.69, 51.39], DE: ["Германия", 52.52, 13.4], GB: ["Великобритания", 51.5, -0.13],
    FR: ["Франция", 48.86, 2.35], TR: ["Турция", 39.93, 32.86], IN: ["Индия", 28.61, 77.21], JP: ["Япония", 35.68, 139.69],
    PL: ["Польша", 52.23, 21.01], BY: ["Беларусь", 53.9, 27.56], KZ: ["Казахстан", 51.17, 71.45], MA: ["Марокко", 34.02, -6.84],
    SA: ["Саудовская Аравия", 24.71, 46.68], BR: ["Бразилия", -15.79, -47.88], YE: ["Йемен", 15.37, 44.19]
  };
  const TOPIC = { "Политика": "--t-politics", "Безопасность": "--t-security", "Экономика": "--t-economy" };
  // The part of the world shown: wide on computers, cropped to the countries on phones
  const VIEW = { wide: [-128, 158, -40, 72], narrow: [-82, 146, -30, 68] };
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 12 || h > 14) ? b : c; };
  function ago(t) {
    const m = Math.max(1, Math.round((Date.now() - t) / 60000));
    if (m < 60) return `${m} мин назад`;
    const h = Math.round(m / 60);
    return h < 24 ? `${h} ч назад` : `${Math.round(h / 24)} дн назад`;
  }
  function cleanTitle(t) {
    t = String(t || "");
    for (const sep of [" :: ", " | ", " – ", " - "]) { const i = t.indexOf(sep, 30); if (i > 0) t = t.slice(0, i); }
    return t.length > 130 ? t.slice(0, 127).replace(/\s+\S*$/, "") + "…" : t;
  }
  const link = (code, e) => `article.html?c=${code}&u=${encodeURIComponent(e.url)}`;

  // Minimal TopoJSON decoder for polygon outlines (quantized, delta-encoded arcs), as in globe.js
  function decodeTopo(topo) {
    const [sx, sy] = topo.transform ? topo.transform.scale : [1, 1], [tx, ty] = topo.transform ? topo.transform.translate : [0, 0];
    const arcs = topo.arcs.map(arc => { let x = 0, y = 0; return arc.map(([dx, dy]) => { x += dx; y += dy; return topo.transform ? [x * sx + tx, y * sy + ty] : [dx, dy]; }); });
    const arcPts = i => i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
    const ring = r => r.flatMap(arcPts);
    const rings = [];
    for (const g of Object.values(topo.objects)[0].geometries || []) {
      if (g.type === "Polygon") g.arcs.forEach(r => rings.push(ring(r)));
      else if (g.type === "MultiPolygon") g.arcs.forEach(p => p.forEach(r => rings.push(ring(r))));
    }
    return rings.map(pts => {
      let a = 180, b = -180, c = 90, d = -90;
      for (const [x, y] of pts) { if (x < a) a = x; if (x > b) b = x; if (y < c) c = y; if (y > d) d = y; }
      return { pts, box: [a, b, c, d] };
    });
  }
  function onLand(rings, lon, lat) {
    let inside = false;
    for (const r of rings) {
      const [a, b, c, d] = r.box;
      if (lon < a || lon > b || lat < c || lat > d) continue;
      const p = r.pts;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        const [xi, yi] = p[i], [xj, yj] = p[j];
        if (Math.abs(xj - xi) > 180) continue; // an edge along the 180th meridian (Chukotka, Fiji) would cross the whole map
        if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
      }
    }
    return inside;
  }

  function mount(host, strip) {
    const stage = el("div", "wm-stage");
    const canvas = el("canvas", "wm-land"); canvas.setAttribute("aria-hidden", "true");
    const layer = el("div", "wm-layer");
    const dock = el("div", "wm-dock"); dock.setAttribute("aria-live", "polite");
    stage.append(canvas, layer);
    host.append(stage, dock);

    let rings = null, data = null, view = VIEW.wide, narrow = false;
    const marks = {}, shown = [];          // country -> mark button; cards on the map now
    const turn = {};                        // which event of a country comes next
    let queue = [], timer = 0, paused = false, onScreen = true, hold = 0; // hold: a card the reader picked stays a while

    const project = (lat, lon) => [(lon - view[0]) / (view[1] - view[0]) * 100, (view[3] - lat) / (view[3] - view[2]) * 100];

    function drawLand() {
      const w = stage.clientWidth, h = stage.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = w * dpr; canvas.height = h * dpr; canvas.style.width = w + "px"; canvas.style.height = h + "px";
      const ctx = canvas.getContext("2d");
      ctx.scale(dpr, dpr); ctx.clearRect(0, 0, w, h);
      if (!rings) return;
      const step = narrow ? 5 : 7, r = narrow ? 1.1 : 1.45;
      ctx.fillStyle = "rgba(235,235,245,.22)";
      for (let y = step / 2; y < h; y += step) {
        const lat = view[3] - y / h * (view[3] - view[2]);
        for (let x = step / 2; x < w; x += step) {
          const lon = view[0] + x / w * (view[1] - view[0]);
          if (onLand(rings, lon, lat)) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill(); }
        }
      }
    }

    function card(code, e, cls) {
      const a = el("a", "wm-card" + (cls ? " " + cls : "")); a.href = link(code, e);
      // Without a picture (or when it fails to load) the card gets a cover in the colour of the event's topic
      const cover = () => { const c = el("div", "wm-cover"); c.append(el("span", null, PLACES[code][0])); return c; };
      if (e.topic) a.style.setProperty("--tc", `var(${TOPIC[e.topic] || "--muted"})`);
      if (e.image) {
        const img = el("img"); img.src = e.image; img.alt = ""; img.loading = "lazy"; img.decoding = "async"; img.referrerPolicy = "no-referrer";
        img.onerror = () => img.replaceWith(cover());
        a.append(img);
      } else a.append(cover());
      const body = el("div", "wm-body");
      const meta = el("div", "wm-meta"); meta.append(el("b", null, PLACES[code][0]));
      if (e.topic) { const t = el("span", "wm-topic", e.topic); t.style.setProperty("--tc", `var(${TOPIC[e.topic] || "--muted"})`); meta.append(t); }
      body.append(meta, el("p", null, cleanTitle(e.title)));
      body.append(el("small", null, (e.domains > 1 ? `Пишут ${e.domains} ${plural(e.domains, "издание", "издания", "изданий")}` : e.source) + (e.at ? " · " + ago(e.at) : "")));
      a.append(body);
      return a;
    }

    function nextEvent(code) {
      const list = data[code] || []; if (!list.length) return null;
      const i = turn[code] || 0; turn[code] = (i + 1) % list.length;
      return list[i];
    }

    // A card next to its country's mark: above the mark, or below it when the mark is high on the map
    function pop(code, pinned) {
      const e = nextEvent(code); if (!e) return;
      for (const m of Object.values(marks)) m.classList.toggle("on", false);
      marks[code]?.classList.add("on");
      if (narrow) {
        dock.textContent = ""; dock.append(card(code, e, "in"));
        return;
      }
      const [x, y] = project(PLACES[code][1], PLACES[code][2]);
      const c = card(code, e, y < 42 ? "below" : "above");
      c.style.left = `clamp(8px, calc(${x}% - 130px), calc(100% - 268px))`;
      c.style.top = y + "%";
      c.dataset.code = code;
      layer.append(c);
      requestAnimationFrame(() => c.classList.add("in"));
      shown.push(c);
      if (pinned) c.classList.add("pinned");
      while (shown.length > (pinned ? 1 : 2)) drop(shown[0]);
      for (const s of shown) marks[s.dataset.code]?.classList.add("on");
    }
    function drop(c) {
      shown.splice(shown.indexOf(c), 1);
      c.classList.remove("in"); c.classList.add("out");
      setTimeout(() => c.remove(), 450);
    }

    // The next country: the most covered ones come up more often, never one right next to a card on screen
    function tick() {
      if (paused || !onScreen || document.hidden || !data || Date.now() < hold) return;
      if (!queue.length) queue = Object.keys(data).filter(c => data[c].length).sort((a, b) => (data[b][0].domains || 0) - (data[a][0].domains || 0));
      const busy = shown.map(s => project(PLACES[s.dataset.code][1], PLACES[s.dataset.code][2])[0]);
      let k = queue.findIndex(c => !shown.some(s => s.dataset.code === c) && busy.every(x => Math.abs(x - project(PLACES[c][1], PLACES[c][2])[0]) > 22));
      if (k < 0) k = 0;
      const [code] = queue.splice(k, 1);
      pop(code);
    }
    function play() { clearInterval(timer); if (!calm) timer = setInterval(tick, 3400); }

    function placeMarks() {
      layer.textContent = ""; shown.length = 0;
      for (const [code, [name, lat, lon]] of Object.entries(PLACES)) {
        const [x, y] = project(lat, lon);
        const top = data?.[code]?.[0];
        const m = el("button", "wm-mark"); m.type = "button";
        m.style.left = x + "%"; m.style.top = y + "%";
        if (top?.topic) m.style.setProperty("--tc", `var(${TOPIC[top.topic] || "--accent"})`);
        m.setAttribute("aria-label", `${name}: ${top ? cleanTitle(top.title) : "открыть ленту"}`);
        m.append(el("span", "wm-label", name));
        m.onclick = () => { if (data?.[code]?.length) { hold = Date.now() + 9000; pop(code, true); } else location.href = "news.html#" + code; };
        m.onmouseenter = () => { if (!narrow && data?.[code]?.length && !shown.some(s => s.dataset.code === code)) { paused = true; pop(code, true); } };
        layer.append(m); marks[code] = m;
      }
    }

    function fillStrip() {
      if (!strip) return;
      strip.textContent = "";
      const order = Object.keys(data).filter(c => data[c].length).sort((a, b) => (data[b][0].domains || 0) - (data[a][0].domains || 0));
      for (const code of order) strip.append(card(code, data[code][0], "in"));
    }

    function layout() {
      narrow = host.clientWidth < 700;
      view = narrow ? VIEW.narrow : VIEW.wide;
      const [a, b, c, d] = view, ratio = (b - a) / (d - c);
      stage.style.aspectRatio = `${ratio * (narrow ? 0.62 : 0.6)}`; // equirectangular, slightly stretched north-south
      placeMarks(); drawLand();
      if (narrow && data) { dock.hidden = false; if (!dock.firstChild) tick(); } else { dock.hidden = true; dock.textContent = ""; }
    }

    stage.addEventListener("mouseleave", () => { paused = false; for (const s of [...shown]) if (s.classList.contains("pinned")) drop(s); });
    let rt = 0;
    window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(layout, 200); });
    if ("IntersectionObserver" in window) new IntersectionObserver(es => { onScreen = es[0].isIntersecting; }).observe(stage);

    layout();
    fetch(LAND_URL).then(r => r.ok ? r.json() : Promise.reject()).then(t => { rings = decodeTopo(t); drawLand(); }).catch(() => {});
    fetch("data/map.json?t=" + Math.floor(Date.now() / 300000)).then(r => r.ok ? r.json() : Promise.reject()).then(j => {
      data = j.countries || {};
      layout(); fillStrip();
      tick(); setTimeout(tick, 1200); play();
    }).catch(() => { host.classList.add("wm-empty"); });
  }

  window.WorldMap = { mount };
})();
