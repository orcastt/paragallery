/* Shared header/footer wiring (reads window.SITE). */
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
})();
