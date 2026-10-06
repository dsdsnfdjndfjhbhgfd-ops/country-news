// 3D effects: cards tilt toward the pointer with a light glare, the planet leans toward it.
// Runs only with a mouse or trackpad and when the system does not ask for reduced motion.
(function () {
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || calm) return;

  const MAX = 7; // degrees
  function bind(node, max) {
    if (node.__tilt) return;
    node.__tilt = true;
    let frame = 0;
    node.addEventListener("pointermove", e => {
      if (e.pointerType !== "mouse") return;
      const r = node.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        node.classList.add("is-tilting");
        node.style.setProperty("--ry", ((x - 0.5) * 2 * max).toFixed(2) + "deg");
        node.style.setProperty("--rx", ((0.5 - y) * 2 * max).toFixed(2) + "deg");
        node.style.setProperty("--gx", (x * 100).toFixed(1) + "%");
        node.style.setProperty("--gy", (y * 100).toFixed(1) + "%");
      });
    });
    node.addEventListener("pointerleave", () => {
      cancelAnimationFrame(frame);
      node.classList.remove("is-tilting");
      node.style.setProperty("--rx", "0deg"); node.style.setProperty("--ry", "0deg");
    });
  }

  // Pages draw content after loading data, so watch for new matching elements
  const RULES = [
    [".card", "tilt", MAX],            // home: country cards
    [".steps li", "tilt", 6],          // home: how it works
    [".how > div", "tilt", 6],         // feed: empty state cards
    [".gate", "tilt", 3],              // sign-in invitation
    [".lead-box", "tilt", 2.5],        // event page: summary and outlets
    [".ev.lead .thumb", "tilt-img", 5],// feed: lead story picture
    [".hero-img", "tilt-img", 4]       // event page picture
  ];
  function scan(root) {
    for (const [sel, cls, max] of RULES) for (const n of root.querySelectorAll(sel)) { n.classList.add(cls); bind(n, max); }
  }
  scan(document);
  new MutationObserver(list => { for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) scan(n.parentNode || n); })
    .observe(document.body, { childList: true, subtree: true });

  // Planet parallax on the home page
  const globe = document.getElementById("globe"), hero = document.querySelector(".hero");
  if (globe && hero) {
    globe.classList.add("parallax");
    hero.addEventListener("pointermove", e => {
      if (e.pointerType !== "mouse" || e.buttons) return; // not while dragging the planet
      const r = hero.getBoundingClientRect();
      globe.style.setProperty("--px", (((e.clientX - r.left) / r.width - 0.5) * 10).toFixed(2) + "deg");
      globe.style.setProperty("--py", ((0.5 - (e.clientY - r.top) / r.height) * 8).toFixed(2) + "deg");
    });
    hero.addEventListener("pointerleave", () => { globe.style.setProperty("--px", "0deg"); globe.style.setProperty("--py", "0deg"); });
  }
})();
