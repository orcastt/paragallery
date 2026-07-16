/**
 * Shared gallery grouping logic — runs in BOTH the browser (window.GalleryCore)
 * and Node (require). Given a list of image filenames it groups them into posts
 * by the "YYYYMMDDName (n).ext" convention. Keeping one implementation means the
 * live site and the optional build script never disagree.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GalleryCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EXT = /\.(jpe?g|png|webp|gif|avif|svg)$/i;
  // captures: 1=date(optional) 2=title 3=index(optional)
  var NAME = /^(\d{8})?\s*(.*?)\s*(?:\(\s*(\d+)\s*\))?\s*$/;

  // Normalise full-width IME punctuation & digits, and trim, so a Chinese user
  // typing （1） or leaving a trailing space still groups correctly.
  function normalizeStem(stem) {
    return stem
      .replace(/（/g, '(')
      .replace(/）/g, ')')
      .replace(/[０-９]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0xfee0); })
      .trim();
  }

  function slugify(title) {
    var base = title.toLowerCase().replace(/[^a-z0-9一-鿿]+/gi, '-').replace(/^-|-$/g, '');
    return base || title.toLowerCase().trim() || 'untitled';
  }

  /**
   * @param {string[]} filenames  base filenames (no directory)
   * @returns {{projects: Array, skipped: string[]}}
   */
  function groupFiles(filenames) {
    var groups = new Map();
    var seenLower = new Map(); // lowercased name -> original, for case-collision dedupe
    var skipped = [];
    var sorted = filenames.slice().sort();

    for (var i = 0; i < sorted.length; i++) {
      var file = sorted[i];
      if (!file || file.charAt(0) === '.') continue; // .gitkeep, .DS_Store
      if (!EXT.test(file)) { skipped.push(file); continue; }
      var lower = file.toLowerCase();
      if (seenLower.has(lower)) continue; // case-only duplicate
      seenLower.set(lower, file);

      var stem = normalizeStem(file.replace(EXT, ''));
      var m = stem.match(NAME);
      var date = m[1] || null;
      var title = (m[2] || '').trim() || m[1] || 'Untitled';
      var index = m[3] ? parseInt(m[3], 10) : 0;

      var key = (date || 'undated') + '|' + title.toLowerCase();
      if (!groups.has(key)) groups.set(key, { date: date, title: title, images: [] });
      // Original filename for the src (the file on disk), URL-encoded so '#',
      // '?', '%', spaces and CJK survive the request.
      groups.get(key).images.push({ index: index, src: 'images/' + encodeURIComponent(file) });
    }

    var usedIds = new Map();
    var projects = Array.from(groups.values()).map(function (g) {
      g.images.sort(function (a, b) { return a.index - b.index || a.src.localeCompare(b.src); });
      var dateISO = g.date ? g.date.slice(0, 4) + '-' + g.date.slice(4, 6) + '-' + g.date.slice(6, 8) : null;
      var id = (g.date || 'undated') + '-' + slugify(g.title);
      var n = (usedIds.get(id) || 0) + 1;
      usedIds.set(id, n);
      if (n > 1) id += '-' + n;
      return { id: id, title: g.title, date: dateISO, images: g.images.map(function (im) { return im.src; }) };
    }).sort(function (a, b) {
      if (a.date && b.date) return b.date.localeCompare(a.date) || a.title.localeCompare(b.title);
      if (a.date) return -1;
      if (b.date) return 1;
      return a.title.localeCompare(b.title);
    });

    return { projects: projects, skipped: skipped };
  }

  return { EXT: EXT, groupFiles: groupFiles };
});
