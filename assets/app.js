/* Parametric Gallery — grid + post lightbox. No dependencies. */
(function () {
  'use strict';

  var SITE = window.SITE || {};
  var $ = function (s) { return document.querySelector(s); };

  // ── About hero (top of the page) ──
  var about = SITE.about || {};
  var headingEl = $('#about-heading');
  if (headingEl) {
    (about.heading || 'About Me').split('\n').forEach(function (line, i) {
      if (i) headingEl.appendChild(document.createElement('br'));
      headingEl.appendChild(document.createTextNode(line));
    });
  }
  var heroImg = $('#about-hero-img');
  if (heroImg) {
    var heroFallback = 'assets/about-hero.svg';
    heroImg.src = about.heroImage || heroFallback;
    heroImg.addEventListener('error', function () {
      if (heroImg.src.indexOf('about-hero.svg') === -1) heroImg.src = heroFallback;
    });
  }

  var aboutBio = $('#about-bio');
  if (aboutBio) {
    (about.bio || []).forEach(function (text) {
      var p = document.createElement('p');
      p.textContent = text;
      aboutBio.appendChild(p);
    });
  }
  var aboutContact = $('#about-contact');
  if (aboutContact) {
    var c = about.contact || {};
    var items = [];
    if (c.email) items.push({ label: 'Email', href: 'mailto:' + c.email });
    if (c.instagram) items.push({ label: 'Instagram', href: c.instagram });
    if (c.github) items.push({ label: 'GitHub', href: c.github });
    items.forEach(function (it) {
      var a = document.createElement('a');
      a.textContent = it.label;
      a.href = it.href;
      if (it.href.indexOf('http') === 0) { a.target = '_blank'; a.rel = 'noopener'; }
      aboutContact.appendChild(a);
    });
  }

  var worksLabel = $('#works-label');
  if (worksLabel) worksLabel.textContent = SITE.worksTitle || 'Selected Works';

  var grid = $('#grid');
  var emptyEl = $('#empty');

  var projects = [];

  // ── Lightbox state ──
  var lb = $('#lightbox');
  var lbImg = $('#lb-img');
  var lbTitle = $('#lb-title');
  var lbCounter = $('#lb-counter');
  var lbThumbs = $('#lb-thumbs');
  var lbPrev = $('#lb-prev');
  var lbNext = $('#lb-next');
  var current = null; // { project, index }
  var lastFocus = null;
  var swallowClick = false;
  var showSeq = 0;

  function setHash(hash) {
    try { history.replaceState(null, '', hash || location.pathname + location.search); } catch (_) {}
  }

  window.addEventListener('hashchange', openFromHash);

  loadProjects()
    .then(function (list) {
      projects = list;
      renderGrid();
      openFromHash();
    })
    .catch(function () { emptyEl.hidden = false; });

  // Sources in priority order: committed manifest.json → live GitHub listing.
  async function loadProjects() {
    try {
      var r = await fetch('manifest.json', { cache: 'no-store' });
      if (r.ok) {
        var data = await r.json();
        var ps = (data.projects || []).filter(function (p) { return p.images && p.images.length; });
        if (ps.length) return ps;
      }
    } catch (_) {}

    if (SITE.repo && window.GalleryCore) {
      var files = await listRepoImages(SITE.repo, SITE.branch || 'main');
      return GalleryCore.groupFiles(files).projects.filter(function (p) { return p.images.length; });
    }
    return [];
  }

  async function listRepoImages(repo, branch) {
    var url = 'https://api.github.com/repos/' + repo + '/contents/images?ref=' + encodeURIComponent(branch);
    var cacheKey = 'pg:list:' + repo + ':' + branch;
    try {
      var r = await fetch(url, { headers: { Accept: 'application/vnd.github+json' } });
      if (!r.ok) throw new Error('GitHub API ' + r.status);
      var items = await r.json();
      if (!Array.isArray(items)) throw new Error('unexpected API response');
      var files = items.filter(function (i) { return i.type === 'file'; }).map(function (i) { return i.name; });
      try { sessionStorage.setItem(cacheKey, JSON.stringify(files)); } catch (_) {}
      return files;
    } catch (e) {
      try {
        var cached = JSON.parse(sessionStorage.getItem(cacheKey));
        if (Array.isArray(cached)) return cached;
      } catch (_) {}
      throw e;
    }
  }

  // ── Gallery grid ──
  function renderGrid() {
    grid.innerHTML = '';
    emptyEl.hidden = projects.length > 0;

    var countEl = $('#footer-count');
    if (countEl) {
      var plates = projects.reduce(function (n, p) { return n + p.images.length; }, 0);
      countEl.textContent = '· ' + projects.length + ' Works / ' + plates + ' Plates';
      countEl.hidden = projects.length === 0;
    }

    projects.forEach(function (p) {
      var card = document.createElement('button');
      card.className = 'card';
      card.setAttribute('aria-label', p.title + '，' + p.images.length + ' 张图');

      var media = document.createElement('div');
      media.className = 'card-media';

      var img = document.createElement('img');
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = p.images[0];
      img.alt = p.title;
      img.addEventListener('load', function () { img.classList.add('loaded'); }, { once: true });
      if (img.complete) img.classList.add('loaded');
      media.appendChild(img);

      if (p.images.length > 1) {
        var badge = document.createElement('span');
        badge.className = 'card-count';
        badge.textContent = p.images.length;
        media.appendChild(badge);
      }

      var cap = document.createElement('div');
      cap.className = 'card-caption';
      var title = document.createElement('span');
      title.className = 'card-title';
      title.textContent = p.title;
      cap.appendChild(title);

      card.appendChild(media);
      card.appendChild(cap);
      card.addEventListener('click', function () { openPost(p, 0, card); });
      grid.appendChild(card);
    });
  }

  // ── Lightbox ──
  function openPost(project, index, focusOrigin) {
    current = { project: project, index: index };
    lastFocus = focusOrigin || document.activeElement;
    lb.hidden = false;
    document.body.classList.add('lb-open');

    lbTitle.textContent = project.title;

    lbThumbs.innerHTML = '';
    project.images.forEach(function (src, i) {
      var t = document.createElement('button');
      t.className = 'lb-thumb';
      t.setAttribute('aria-label', '第 ' + (i + 1) + ' 张');
      var ti = document.createElement('img');
      ti.src = src;
      ti.alt = '';
      ti.loading = 'lazy';
      t.appendChild(ti);
      t.addEventListener('click', function () { show(i); });
      lbThumbs.appendChild(t);
    });

    show(index);
    (project.images.length > 1 ? lbNext : lb.querySelector('.lb-close')).focus();
  }

  function show(i) {
    if (!current) return;
    var project = current.project;
    current.index = (i + project.images.length) % project.images.length;

    lbImg.classList.add('fading');
    var src = project.images[current.index];
    var idx = current.index;
    var seq = ++showSeq;
    var pre = new Image();
    pre.onload = pre.onerror = function () {
      if (seq !== showSeq || !current) return;
      lbImg.src = src;
      lbImg.alt = project.title + ' — ' + (idx + 1) + '/' + project.images.length;
      requestAnimationFrame(function () { lbImg.classList.remove('fading'); });
    };
    pre.src = src;

    lbCounter.textContent = (current.index + 1) + ' / ' + project.images.length;
    var single = project.images.length === 1;
    lbPrev.disabled = single;
    lbNext.disabled = single;

    var thumbs = lbThumbs.querySelectorAll('.lb-thumb');
    thumbs.forEach(function (t, k) {
      t.classList.toggle('active', k === current.index);
      if (k === current.index) t.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });

    [current.index + 1, current.index - 1].forEach(function (n) {
      var nn = (n + project.images.length) % project.images.length;
      new Image().src = project.images[nn];
    });

    setHash('#p=' + encodeURIComponent(project.id) + '&i=' + (current.index + 1));
  }

  function closeLb() {
    lb.hidden = true;
    document.body.classList.remove('lb-open');
    current = null;
    showSeq++;
    lbImg.classList.remove('fading');
    setHash('');
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  lbPrev.addEventListener('click', function () { current && show(current.index - 1); });
  lbNext.addEventListener('click', function () { current && show(current.index + 1); });
  lb.querySelectorAll('[data-close]').forEach(function (el) { el.addEventListener('click', closeLb); });

  document.addEventListener('keydown', function (e) {
    if (lb.hidden) return;
    if (e.key === 'Escape') closeLb();
    else if (e.key === 'ArrowLeft') show(current.index - 1);
    else if (e.key === 'ArrowRight') show(current.index + 1);
    else if (e.key === 'Tab') trapFocus(e);
  });

  function trapFocus(e) {
    var focusables = lb.querySelectorAll('button:not([disabled])');
    if (!focusables.length) return;
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
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

  lbImg.addEventListener('click', function () {
    if (swallowClick) { swallowClick = false; return; }
    if (current && current.project.images.length > 1) show(current.index + 1);
  });

  var touchX = null;
  $('#lb-stage').addEventListener('touchstart', function (e) {
    swallowClick = false;
    touchX = e.touches[0].clientX;
  }, { passive: true });
  $('#lb-stage').addEventListener('touchend', function (e) {
    if (touchX === null || !current) return;
    var dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 48) {
      swallowClick = true;
      show(current.index + (dx < 0 ? 1 : -1));
      setTimeout(function () { swallowClick = false; }, 400);
    }
    touchX = null;
  }, { passive: true });

  // ── Deep link: #p=<id>&i=<n> ──
  function openFromHash() {
    var m = location.hash.match(/#p=([^&]+)(?:&i=(\d+))?/);
    if (!m) return;
    var id;
    try { id = decodeURIComponent(m[1]); } catch (_) { return; }
    var p = projects.find(function (x) { return x.id === id; });
    if (!p) return;
    var idx = Math.min(Math.max((parseInt(m[2], 10) || 1) - 1, 0), p.images.length - 1);
    if (current && current.project.id === id && current.index === idx) return;
    openPost(p, idx);
  }
})();
