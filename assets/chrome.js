/* Shared header/footer wiring for every page (reads window.SITE). */
(function () {
  'use strict';
  var SITE = window.SITE || {};

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  setText('wordmark', SITE.wordmark || 'GALLERY');
  setText('footer-author', ('© ' + new Date().getFullYear() + ' ' + (SITE.author || '')).trim());

  var link = document.getElementById('external-link');
  if (link && SITE.link && SITE.link.url) {
    link.textContent = SITE.link.label || 'Link';
    link.href = SITE.link.url;
    link.hidden = false;
  }

  // Active nav item based on the current file.
  var page = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  var onAbout = page === 'about.html';
  var links = document.querySelectorAll('[data-nav]');
  for (var i = 0; i < links.length; i++) {
    var target = links[i].getAttribute('data-nav');
    var active = (target === 'about' && onAbout) || (target === 'index' && !onAbout);
    links[i].classList.toggle('active', active);
  }
})();
