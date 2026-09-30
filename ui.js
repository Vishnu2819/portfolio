// DOM-side behaviour: scroll → chapter progress, rail, reveal, theme, skill filter,
// cursor, loader. Works on its own, so the page still functions if WebGL fails.
(() => {
  const root = document.documentElement;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];

  // Shared state read by scene.js
  const J = (window.journey = {
    c: 0, stops: [], filter: 'all', sceneOK: false,
    reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
  });

  const sections = $$('.chapter');
  const railBtns = $$('.rail button');
  const railFill = $('.rail-track i');
  const bar = $('.progress i');
  let active = -1, ticking = false;

  // Scroll position where each chapter is centred in the viewport.
  // On narrow screens each chapter opens with an empty "art window", so the stop is its top edge.
  const narrow = matchMedia('(max-width: 820px), (max-aspect-ratio: 1/1)');
  function measure() {
    const max = root.scrollHeight - innerHeight;
    const flat = narrow.matches && !root.classList.contains('no-gl');
    J.stops = sections.map((s, i) => {
      const r = s.getBoundingClientRect(), top = r.top + scrollY;
      return Math.min(max, Math.max(0, flat && i > 0 ? top : top + r.height / 2 - innerHeight / 2));
    });
    update();
  }

  function update() {
    ticking = false;
    const y = scrollY, s = J.stops, n = s.length;
    let c = 0;
    if (y >= s[n - 1]) c = n - 1;
    else if (y > s[0]) {
      let i = 0;
      while (i < n - 2 && y > s[i + 1]) i++;
      c = i + (y - s[i]) / Math.max(1, s[i + 1] - s[i]);
    }
    J.c = c;
    const a = Math.round(c);
    if (a !== active) {
      active = a;
      railBtns.forEach((b, i) => b.setAttribute('aria-current', i === a));
    }
    const max = root.scrollHeight - innerHeight;
    const p = max > 0 ? y / max : 0;
    railFill.style.transform = `scaleY(${p})`;
    bar.style.transform = `scaleX(${p})`;
  }

  addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  addEventListener('resize', measure);
  addEventListener('load', measure);
  document.fonts?.ready.then(measure);
  measure();

  const go = (i) => {
    i = Math.max(0, Math.min(sections.length - 1, i));
    scrollTo({ top: J.stops[i], behavior: J.reduced ? 'auto' : 'smooth' });
  };
  railBtns.forEach((b, i) => b.addEventListener('click', () => go(i)));

  // In-page links land on the chapter's "centre" rather than its top edge.
  $$('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const i = sections.findIndex((s) => '#' + s.id === a.getAttribute('href'));
    if (i < 0) return;
    e.preventDefault();
    go(i);
  }));

  addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey || /input|textarea/i.test(e.target.tagName)) return;
    if (e.key === 'j') go(active + 1);
    if (e.key === 'k') go(active - 1);
  });

  // Reveal panels once they enter view
  const io = new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
  }), { threshold: 0.18 });
  sections.forEach((s) => io.observe(s));

  // Theme
  const darkMq = matchMedia('(prefers-color-scheme: dark)');
  const theme = () => root.dataset.theme || (darkMq.matches ? 'dark' : 'light');
  const syncMeta = () => $('meta[name="theme-color"]').setAttribute('content', theme() === 'dark' ? '#111315' : '#f3efe7');
  $('#theme').addEventListener('click', () => {
    const next = theme() === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch (e) {}
    syncMeta();
    dispatchEvent(new Event('themechange'));
  });
  darkMq.addEventListener('change', () => { syncMeta(); dispatchEvent(new Event('themechange')); });
  syncMeta();

  // Skill filter (also driven by clicking stars in the scene)
  const chips = $$('.chips button'), groups = $$('.skill-group');
  J.setFilter = (cat) => {
    J.filter = cat;
    chips.forEach((b) => b.setAttribute('aria-pressed', b.dataset.cat === cat));
    groups.forEach((g) => g.classList.toggle('dim', cat !== 'all' && g.dataset.cat !== cat));
    dispatchEvent(new CustomEvent('skillfilter', { detail: cat }));
  };
  chips.forEach((b) => b.addEventListener('click', () => {
    const cat = b.dataset.cat;
    J.setFilter(J.filter === cat && cat !== 'all' ? 'all' : cat);
  }));

  // Custom cursor (fine pointers only). The trailing ring stops its loop when settled.
  if (matchMedia('(pointer: fine)').matches && !J.reduced) {
    root.classList.add('has-cursor');
    const dot = $('#cursor'), ring = $('#cursor-ring');
    let x = -100, y = -100, rx = x, ry = y, raf = 0;
    const loop = () => {
      rx += (x - rx) * 0.2; ry += (y - ry) * 0.2;
      ring.style.transform = `translate(${rx}px,${ry}px)`;
      raf = Math.abs(x - rx) + Math.abs(y - ry) > 0.3 ? requestAnimationFrame(loop) : 0;
    };
    addEventListener('pointermove', (e) => {
      x = e.clientX; y = e.clientY;
      dot.style.transform = `translate(${x}px,${y}px)`;
      if (!raf) raf = requestAnimationFrame(loop);
    }, { passive: true });
    document.addEventListener('pointerover', (e) => {
      root.classList.toggle('cursor-link', !!e.target.closest?.('a, button'));
    });
  }

  // Loader: hide when the scene is ready, or fall back to the plain layout.
  const hide = () => root.classList.add('loaded');
  addEventListener('scene:ready', () => { root.classList.remove('no-gl'); hide(); measure(); });
  setTimeout(() => {
    if (!J.sceneOK) { root.classList.add('no-gl'); measure(); }
    hide();
  }, 4500);

  $('#year').textContent = new Date().getFullYear();
})();
