// Dotted 3D globe for the home page, drawn on a 2D canvas (no libraries).
// Land dots come from the Natural Earth 1:110m land map (local copy of world-atlas);
// if it cannot load, the globe still shows its grid and the country markers.
// Drag to turn it, hover a marker to see the country's top story, click to open its feed.
(function () {
  const LAND_URL = "assets/vendor/land-110m.json"; // pinned copy, see assets/vendor/VERSIONS.txt
  const PLACES = {
    RU: ["Россия", 55.75, 37.62], US: ["США", 38.9, -77.04], CN: ["Китай", 39.9, 116.4], UA: ["Украина", 50.45, 30.52],
    IL: ["Израиль", 31.78, 35.22], IR: ["Иран", 35.69, 51.39], DE: ["Германия", 52.52, 13.4], GB: ["Великобритания", 51.5, -0.13],
    FR: ["Франция", 48.86, 2.35], TR: ["Турция", 39.93, 32.86]
  };
  const RAD = Math.PI / 180;
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  function mount(host, opts = {}) {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Вращающийся глобус с отмеченными странами");
    const tip = document.createElement("div"); tip.className = "globe-tip"; tip.hidden = true;
    host.append(canvas, tip);
    const ctx = canvas.getContext("2d");

    let W = 0, H = 0, R = 0, dpr = 1;
    let lon0 = -40, tilt = 38;                  // start over Europe and the Middle East, seen from above
    let spin = reduceMotion ? 0 : 0.06;         // degrees per frame
    let vel = 0, dragging = null, hover = null;
    let land = [], grid = [], colors = {};
    let status = opts.status || null;

    // Evenly spread points over the sphere (Fibonacci lattice)
    function lattice(n) {
      const pts = [], g = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < n; i++) {
        const y = 1 - (i + 0.5) * 2 / n, r = Math.sqrt(1 - y * y), a = i * g;
        pts.push([Math.asin(y) / RAD, Math.atan2(Math.sin(a) * r, Math.cos(a) * r) / RAD]);
      }
      return pts;
    }
    // Light grid: parallels and meridians as dotted lines
    for (let lat = -60; lat <= 60; lat += 30) for (let lo = -180; lo < 180; lo += 3) grid.push([lat, lo]);
    for (let lo = -180; lo < 180; lo += 30) for (let lat = -84; lat <= 84; lat += 3) grid.push([lat, lo]);

    function readColors() {
      const cs = getComputedStyle(document.documentElement);
      const v = n => cs.getPropertyValue(n).trim();
      colors = { land: v("--accent"), sea: v("--line"), ink: v("--ink"), marker: v("--marker") || "#f2b33d", surface: v("--surface"), bg: v("--bg") };
    }

    function resize() {
      const size = Math.min(host.clientWidth, opts.max || 520);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = H = size;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      R = W * 0.37; // leaves room for the orbit ring around the planet
    }

    // Rotate a lat/lon point by the current view; returns screen x, y and depth z (z > 0 faces us)
    function project(lat, lon) {
      const la = lat * RAD, lo = (lon + lon0) * RAD, t = tilt * RAD;
      const x = Math.cos(la) * Math.sin(lo), y = Math.sin(la), z = Math.cos(la) * Math.cos(lo);
      const y2 = y * Math.cos(t) - z * Math.sin(t), z2 = y * Math.sin(t) + z * Math.cos(t);
      return [W / 2 + x * R, H / 2 - y2 * R, z2];
    }

    function draw(time) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2;

      // Atmosphere glow and the sphere body
      const glow = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.22);
      glow.addColorStop(0, colors.land + "55"); glow.addColorStop(1, colors.land + "00");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(cx, cy, R * 1.22, 0, Math.PI * 2); ctx.fill();
      drawOrbit(false, time); // far half of the ring and satellites, hidden behind the planet
      const body = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
      body.addColorStop(0, colors.surface); body.addColorStop(1, colors.bg);
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = colors.sea; ctx.lineWidth = 1; ctx.stroke();

      ctx.fillStyle = colors.sea;
      for (const [la, lo] of grid) { const [x, y, z] = project(la, lo); if (z > 0) ctx.fillRect(x - 0.6, y - 0.6, 1.2, 1.2); }

      ctx.fillStyle = colors.land;
      for (const [la, lo] of land) {
        const [x, y, z] = project(la, lo);
        if (z <= 0) continue;
        ctx.globalAlpha = 0.35 + 0.65 * z;
        const s = 1 + 1.3 * z;
        ctx.fillRect(x - s / 2, y - s / 2, s, s);
      }
      ctx.globalAlpha = 1;

      // Country markers: pulse, size grows with the number of events
      const pulse = reduceMotion ? 0.5 : (Math.sin(time / 600) + 1) / 2;
      const marks = [];
      for (const [code, [name, la, lo]] of Object.entries(PLACES)) {
        const [x, y, z] = project(la, lo);
        if (z <= 0.05) continue;
        const ev = status?.countries?.[code]?.events || 0;
        const r = 3.5 + Math.min(4, Math.sqrt(ev) / 3);
        marks.push({ code, name, x, y, z, r });
        ctx.globalAlpha = (1 - pulse) * 0.5 * z;
        ctx.fillStyle = colors.marker;
        ctx.beginPath(); ctx.arc(x, y, r + 4 + pulse * 8, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = colors.surface; ctx.stroke();
      }
      canvas._marks = marks;
      drawOrbit(true, time);  // near half passes in front of the planet

      if (hover) {
        const m = marks.find(k => k.code === hover);
        if (m) { tip.style.left = m.x + "px"; tip.style.top = m.y + "px"; } else { tip.hidden = true; hover = null; }
      }
    }

    // Animate only while the globe is on screen; it costs nothing when scrolled away
    let visible = true, running = false;
    // A tilted ring around the planet with two satellites. Parametric angle a gives the point
    // (rx·cos a, ry·sin a) on a rotated ellipse; sin a > 0 is the half nearer to the viewer.
    const ORBIT = { k: 1.3, squash: 0.26, rot: -0.3 };
    const SATS = [{ speed: 0.00022, phase: 0, size: 3.2 }, { speed: 0.00014, phase: 2.4, size: 2.4 }];
    function drawOrbit(front, time) {
      const cx = W / 2, cy = H / 2, rx = R * ORBIT.k, ry = rx * ORBIT.squash;
      ctx.save();
      ctx.strokeStyle = colors.land; ctx.lineWidth = 1.2; ctx.setLineDash([2, 6]);
      ctx.globalAlpha = front ? 0.75 : 0.3;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, ORBIT.rot, front ? 0 : Math.PI, front ? Math.PI : 2 * Math.PI);
      ctx.stroke();
      ctx.setLineDash([]);
      for (const s of SATS) {
        const a = reduceMotion ? s.phase + 0.8 : (time * s.speed + s.phase) % (2 * Math.PI);
        const near = Math.sin(a) > 0;
        if (near !== front) continue;
        const px = rx * Math.cos(a), py = ry * Math.sin(a);
        const x = cx + px * Math.cos(ORBIT.rot) - py * Math.sin(ORBIT.rot);
        const y = cy + px * Math.sin(ORBIT.rot) + py * Math.cos(ORBIT.rot);
        const depth = (Math.sin(a) + 1) / 2;           // 0 far … 1 near
        const r = s.size * (0.7 + 0.6 * depth);
        ctx.globalAlpha = 0.35 + 0.65 * depth;
        const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
        halo.addColorStop(0, colors.marker + "aa"); halo.addColorStop(1, colors.marker + "00");
        ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(x, y, r * 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = colors.marker; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }

    function frame(t) {
      if (!visible) { running = false; return; }
      if (!dragging) {
        lon0 += hover ? 0 : spin + vel;
        vel *= 0.94;
      }
      draw(t);
      requestAnimationFrame(frame);
    }
    function start() { if (!running && visible) { running = true; requestAnimationFrame(frame); } }

    function markAt(px, py) {
      let best = null, bd = 18 * 18;
      for (const m of canvas._marks || []) { const d = (m.x - px) ** 2 + (m.y - py) ** 2; if (d < bd) { bd = d; best = m; } }
      return best;
    }
    function showTip(m) {
      hover = m.code;
      const s = status?.countries?.[m.code];
      tip.textContent = "";
      const b = document.createElement("b"); b.textContent = m.name; tip.append(b);
      if (s) {
        const n = document.createElement("span"); n.textContent = `${s.events} событий за 2 дня`; tip.append(n);
        if (s.top) { const t = document.createElement("p"); t.textContent = s.top.title.length > 110 ? s.top.title.slice(0, 107) + "…" : s.top.title; tip.append(t); }
      }
      const go = document.createElement("i"); go.textContent = "Нажмите, чтобы открыть ленту"; tip.append(go);
      tip.hidden = false;
    }

    canvas.addEventListener("pointerdown", e => {
      dragging = { x: e.clientX, y: e.clientY, lon: lon0, tilt, moved: false, t: performance.now() };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener("pointermove", e => {
      const rect = canvas.getBoundingClientRect();
      if (dragging) {
        const dx = e.clientX - dragging.x, dy = e.clientY - dragging.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) dragging.moved = true;
        const k = 180 / (Math.PI * R);
        const prev = lon0;
        lon0 = dragging.lon + dx * k;
        tilt = Math.max(-60, Math.min(60, dragging.tilt + dy * k));
        vel = lon0 - prev;
        tip.hidden = true; hover = null;
        return;
      }
      const m = markAt(e.clientX - rect.left, e.clientY - rect.top);
      canvas.style.cursor = m ? "pointer" : "grab";
      if (m) showTip(m); else { tip.hidden = true; hover = null; }
    });
    canvas.addEventListener("pointerup", e => {
      const d = dragging; dragging = null;
      if (d && !d.moved) {
        const rect = canvas.getBoundingClientRect();
        const m = markAt(e.clientX - rect.left, e.clientY - rect.top);
        if (m) { if (opts.onPick) opts.onPick(m.code); else location.href = "news.html#" + m.code; }
      }
    });
    canvas.addEventListener("pointerleave", () => { if (!dragging) { tip.hidden = true; hover = null; } });

    // Turn the land map into dots: draw land on a hidden flat map, then keep lattice points that fall on it
    async function loadLand() {
      try {
        const topo = await fetch(LAND_URL).then(r => r.ok ? r.json() : Promise.reject());
        const rings = decodeTopo(topo);
        const mw = 720, mh = 360, mc = document.createElement("canvas");
        mc.width = mw; mc.height = mh;
        const m = mc.getContext("2d");
        m.fillStyle = "#000"; m.beginPath();
        for (const ring of rings) ring.forEach(([lo, la], i) => { const x = (lo + 180) / 360 * mw, y = (90 - la) / 180 * mh; i ? m.lineTo(x, y) : m.moveTo(x, y); });
        m.fill("evenodd");
        const px = m.getImageData(0, 0, mw, mh).data;
        land = lattice(14000).filter(([la, lo]) => {
          const x = Math.min(mw - 1, Math.floor((lo + 180) / 360 * mw)), y = Math.min(mh - 1, Math.floor((90 - la) / 180 * mh));
          return px[(y * mw + x) * 4 + 3] > 0;
        });
      } catch { land = []; }
    }

    // Minimal TopoJSON decoder for polygon outlines (quantized, delta-encoded arcs)
    function decodeTopo(topo) {
      const [sx, sy] = topo.transform ? topo.transform.scale : [1, 1];
      const [tx, ty] = topo.transform ? topo.transform.translate : [0, 0];
      const arcs = topo.arcs.map(arc => { let x = 0, y = 0; return arc.map(([dx, dy]) => { x += dx; y += dy; return topo.transform ? [x * sx + tx, y * sy + ty] : [dx, dy]; }); });
      const arcPts = i => i >= 0 ? arcs[i] : arcs[~i].slice().reverse();
      const ring = ids => { const out = []; ids.forEach((id, k) => { const p = arcPts(id); out.push(...(k ? p.slice(1) : p)); }); return out; };
      const rings = [];
      const visit = g => {
        if (g.type === "GeometryCollection") g.geometries.forEach(visit);
        else if (g.type === "Polygon") g.arcs.forEach(r => rings.push(ring(r)));
        else if (g.type === "MultiPolygon") g.arcs.forEach(poly => poly.forEach(r => rings.push(ring(r))));
      };
      Object.values(topo.objects).forEach(visit);
      return rings;
    }

    readColors(); resize();
    new ResizeObserver(resize).observe(host);
    new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", readColors);
    loadLand();
    new IntersectionObserver(([e]) => { visible = e.isIntersecting; start(); }).observe(canvas);
    start();
    return { setStatus(s) { status = s; } };
  }

  window.Globe = { mount };
})();
