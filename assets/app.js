/* Parametric Gallery — grid + post lightbox. No dependencies. */
(function () {
  'use strict';

  const SITE = window.SITE || {};
  const $ = (sel) => document.querySelector(sel);

  // ── Site chrome from config ──
  document.title = (SITE.wordmark || 'Parametric Gallery') + ' — 参数化设计作品集';
  $('#wordmark').textContent = SITE.wordmark || 'PARAMETRIC GALLERY';
  $('#hero-title').textContent = SITE.heroTitle || 'Parametric Studies';
  $('#hero-sub').textContent = SITE.heroSubtitle || '';
  $('#footer-author').textContent = `© ${new Date().getFullYear()} ${SITE.author || ''}`.trim();
  if (SITE.link && SITE.link.url) {
    const a = $('#external-link');
    a.textContent = SITE.link.label || 'Link';
    a.href = SITE.link.url;
    a.hidden = false;
  }

  const grid = $('#grid');
  const filtersEl = $('#filters');
  const emptyEl = $('#empty');

  let projects = [];
  let activeYear = 'all';

  // ── Lightbox state ──
  const lb = $('#lightbox');
  const lbImg = $('#lb-img');
  const lbTitle = $('#lb-title');
  const lbDate = $('#lb-date');
  const lbCounter = $('#lb-counter');
  const lbThumbs = $('#lb-thumbs');
  const lbPrev = $('#lb-prev');
  const lbNext = $('#lb-next');
  let current = null; // { project, index }
  let lastFocus = null;
  let swallowClick = false; // suppress the synthetic click that follows a swipe
  let showSeq = 0; // invalidates stale image-preload callbacks

  // Safari throttles history calls (SecurityError past ~100/30s) — never let
  // fast keyboard paging take the lightbox down with it.
  function setHash(hash) {
    try {
      history.replaceState(null, '', hash || location.pathname + location.search);
    } catch (_) { /* ignore */ }
  }

  // Attach hash navigation up front so a later render error can't kill it.
  window.addEventListener('hashchange', openFromHash);

  loadProjects()
    .then((list) => {
      projects = list;
      renderFilters();
      renderGrid();
      openFromHash();
    })
    .catch(() => {
      emptyEl.hidden = false;
    });

  // Two sources, in priority order:
  //   1. A committed manifest.json (optional — for offline / private repos, or
  //      if you ran scripts/build-manifest.js).
  //   2. The live GitHub Contents API listing of images/ (default, zero build).
  async function loadProjects() {
    try {
      const r = await fetch('manifest.json', { cache: 'no-store' });
      if (r.ok) {
        const data = await r.json();
        const ps = (data.projects || []).filter((p) => p.images && p.images.length);
        if (ps.length) return ps;
      }
    } catch (_) { /* no committed manifest — fall through to live listing */ }

    if (SITE.repo && window.GalleryCore) {
      const files = await listRepoImages(SITE.repo, SITE.branch || 'main');
      return GalleryCore.groupFiles(files).projects.filter((p) => p.images.length);
    }
    return [];
  }

  // Lists images/ via the public GitHub API (no auth needed for public repos).
  // One request per page load; the result is cached for the session and reused
  // if a later request is rate-limited (60/hour/IP unauthenticated).
  async function listRepoImages(repo, branch) {
    const url = `https://api.github.com/repos/${repo}/contents/images?ref=${encodeURIComponent(branch)}`;
    const cacheKey = `pg:list:${repo}:${branch}`;
    try {
      const r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw new Error('GitHub API ' + r.status);
      const items = await r.json();
      if (!Array.isArray(items)) throw new Error('unexpected API response');
      // Contents API returns up to 1000 entries per directory — ample here.
      const files = items.filter((i) => i.type === 'file').map((i) => i.name);
      try { sessionStorage.setItem(cacheKey, JSON.stringify(files)); } catch (_) {}
      return files;
    } catch (e) {
      try {
        const cached = JSON.parse(sessionStorage.getItem(cacheKey));
        if (Array.isArray(cached)) return cached;
      } catch (_) {}
      throw e;
    }
  }

  function fmtDate(iso) {
    return iso ? iso.replace(/-/g, '.') : '';
  }

  // ── Year filter chips ──
  function renderFilters() {
    const years = [...new Set(projects.map((p) => (p.date || '').slice(0, 4)).filter(Boolean))]
      .sort()
      .reverse();
    if (years.length < 2) return; // no point filtering a single year

    const chips = [['all', 'ALL', projects.length]].concat(
      years.map((y) => [y, y, projects.filter((p) => (p.date || '').startsWith(y)).length])
    );

    for (const [value, label, count] of chips) {
      const b = document.createElement('button');
      b.className = 'filter-chip' + (value === activeYear ? ' active' : '');
      b.setAttribute('aria-pressed', value === activeYear ? 'true' : 'false');
      b.innerHTML = `${label}<span class="count">${count}</span>`;
      b.addEventListener('click', () => {
        activeYear = value;
        filtersEl.querySelectorAll('.filter-chip').forEach((c) => {
          c.classList.remove('active');
          c.setAttribute('aria-pressed', 'false');
        });
        b.classList.add('active');
        b.setAttribute('aria-pressed', 'true');
        renderGrid();
      });
      filtersEl.appendChild(b);
    }
  }

  // ── Gallery grid ──
  function renderGrid() {
    grid.innerHTML = '';
    const visible = projects.filter(
      (p) => activeYear === 'all' || (p.date || '').startsWith(activeYear)
    );
    emptyEl.hidden = visible.length > 0;
    $('#footer-count').textContent =
      `${projects.length} POSTS / ${projects.reduce((n, p) => n + p.images.length, 0)} PLATES`;

    for (const p of visible) {
      const card = document.createElement('button');
      card.className = 'card';
      card.setAttribute('aria-label', `${p.title}，${p.images.length} 张图`);

      const img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = p.images[0];
      img.alt = p.title;
      img.addEventListener('load', () => img.classList.add('loaded'), { once: true });
      if (img.complete) img.classList.add('loaded');

      const veil = document.createElement('div');
      veil.className = 'card-veil';

      const info = document.createElement('div');
      info.className = 'card-info';
      info.innerHTML =
        `<div><span class="card-title"></span><span class="card-date">${fmtDate(p.date)}</span></div>` +
        (p.images.length > 1 ? `<span class="card-count">${p.images.length} 图</span>` : '');
      info.querySelector('.card-title').textContent = p.title;

      card.append(img, veil, info);
      card.addEventListener('click', () => openPost(p, 0, card));
      grid.appendChild(card);
    }
  }

  // ── Lightbox ──
  function openPost(project, index, focusOrigin) {
    current = { project, index };
    lastFocus = focusOrigin || document.activeElement;
    lb.hidden = false;
    document.body.classList.add('lb-open');

    lbTitle.textContent = project.title;
    lbDate.textContent = fmtDate(project.date) || '—';

    lbThumbs.innerHTML = '';
    project.images.forEach((src, i) => {
      const t = document.createElement('button');
      t.className = 'lb-thumb';
      t.setAttribute('aria-label', `第 ${i + 1} 张`);
      const ti = document.createElement('img');
      ti.src = src;
      ti.alt = '';
      ti.loading = 'lazy';
      t.appendChild(ti);
      t.addEventListener('click', () => show(i));
      lbThumbs.appendChild(t);
    });

    show(index);
    (project.images.length > 1 ? lbNext : lb.querySelector('.lb-close')).focus();
  }

  function show(i) {
    if (!current) return;
    const { project } = current;
    current.index = (i + project.images.length) % project.images.length;

    lbImg.classList.add('fading');
    const src = project.images[current.index];
    const idx = current.index;
    const seq = ++showSeq; // only the newest show() may touch the DOM
    const pre = new Image();
    pre.onload = pre.onerror = () => {
      if (seq !== showSeq || !current) return; // superseded or closed
      lbImg.src = src;
      lbImg.alt = `${project.title} — ${idx + 1}/${project.images.length}`;
      requestAnimationFrame(() => lbImg.classList.remove('fading'));
    };
    pre.src = src;

    lbCounter.textContent = `${current.index + 1} / ${project.images.length}`;
    const single = project.images.length === 1;
    lbPrev.disabled = single;
    lbNext.disabled = single;

    lbThumbs.querySelectorAll('.lb-thumb').forEach((t, k) => {
      t.classList.toggle('active', k === current.index);
      if (k === current.index) t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });

    // preload neighbours for instant paging
    [current.index + 1, current.index - 1].forEach((n) => {
      const nn = (n + project.images.length) % project.images.length;
      new Image().src = project.images[nn];
    });

    setHash(`#p=${encodeURIComponent(project.id)}&i=${current.index + 1}`);
  }

  function closeLb() {
    lb.hidden = true;
    document.body.classList.remove('lb-open');
    current = null;
    showSeq++; // invalidate any in-flight preload callback
    lbImg.classList.remove('fading');
    setHash('');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  lbPrev.addEventListener('click', () => current && show(current.index - 1));
  lbNext.addEventListener('click', () => current && show(current.index + 1));
  lb.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeLb));

  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLb();
    else if (e.key === 'ArrowLeft') show(current.index - 1);
    else if (e.key === 'ArrowRight') show(current.index + 1);
    else if (e.key === 'Tab') trapFocus(e);
  });

  function trapFocus(e) {
    const focusables = lb.querySelectorAll('button:not([disabled])');
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    // activeElement is often <body> here (e.g. after clicking the stage <img>);
    // pull focus back into the dialog so Tab can't reach the page behind it.
    if (!lb.contains(document.activeElement)) {
      (e.shiftKey ? last : first).focus();
      e.preventDefault();
    } else if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  }

  // Click stage image → next
  lbImg.addEventListener('click', () => {
    if (swallowClick) { swallowClick = false; return; }
    if (current && current.project.images.length > 1) show(current.index + 1);
  });

  // Touch swipe on the stage
  let touchX = null;
  $('#lb-stage').addEventListener('touchstart', (e) => {
    swallowClick = false; // a new gesture starts clean
    touchX = e.touches[0].clientX;
  }, { passive: true });
  $('#lb-stage').addEventListener('touchend', (e) => {
    if (touchX === null || !current) return;
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 48) {
      swallowClick = true; // some browsers still fire a click after a swipe
      show(current.index + (dx < 0 ? 1 : -1));
      setTimeout(() => (swallowClick = false), 400);
    }
    touchX = null;
  }, { passive: true });

  // ── Deep link: #p=<id>&i=<n> ──
  function openFromHash() {
    const m = location.hash.match(/#p=([^&]+)(?:&i=(\d+))?/);
    if (!m) return;
    let id;
    try { id = decodeURIComponent(m[1]); } catch (_) { return; } // truncated link
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    const idx = Math.min(Math.max((parseInt(m[2], 10) || 1) - 1, 0), p.images.length - 1);
    if (current && current.project.id === id && current.index === idx) return;
    openPost(p, idx);
  }
})();
