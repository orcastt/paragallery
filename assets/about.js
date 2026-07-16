/* About page — fills name, portrait and bio from window.SITE.about. */
(function () {
  'use strict';
  var about = (window.SITE && window.SITE.about) || {};

  var nameEl = document.getElementById('about-name');
  if (nameEl) nameEl.textContent = about.name || '关于我';

  var portrait = document.getElementById('about-portrait');
  if (portrait) {
    var fallback = 'assets/portrait.svg';
    portrait.src = about.portrait || fallback;
    portrait.alt = about.name || 'Portrait';
    portrait.addEventListener('error', function () {
      if (portrait.src.indexOf('portrait.svg') === -1) portrait.src = fallback;
    });
  }

  var bioEl = document.getElementById('about-bio');
  if (bioEl) {
    var paras = about.bio || [];
    bioEl.innerHTML = '';
    paras.forEach(function (text) {
      var p = document.createElement('p');
      p.textContent = text;
      bioEl.appendChild(p);
    });
  }

  var contactEl = document.getElementById('about-contact');
  if (contactEl) {
    var c = about.contact || {};
    var items = [];
    if (c.email) items.push({ label: 'Email', href: 'mailto:' + c.email });
    if (c.instagram) items.push({ label: 'Instagram', href: c.instagram });
    if (c.github) items.push({ label: 'GitHub', href: c.github });
    contactEl.innerHTML = '';
    items.forEach(function (it) {
      var a = document.createElement('a');
      a.textContent = it.label;
      a.href = it.href;
      if (it.href.indexOf('http') === 0) { a.target = '_blank'; a.rel = 'noopener'; }
      contactEl.appendChild(a);
    });
  }
})();
