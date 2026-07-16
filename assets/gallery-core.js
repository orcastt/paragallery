/**
 * Shared gallery grouping logic — runs in BOTH the browser (window.GalleryCore)
 * and Node (require). Two ways to organise images/ (you can mix them):
 *
 *   1. One folder per work (recommended):
 *        images/Snowflakes/1.jpg, images/Snowflakes/2.jpg  ->  post "Snowflakes"
 *      The folder name is the post title; files inside sort naturally, first = cover.
 *      Prefix the folder with an 8-digit date to control order: "20250824 Monument".
 *
 *   2. Flat files in images/ root (legacy):
 *        images/Snowflakes (1).jpg, images/Snowflakes (2).jpg  ->  post "Snowflakes"
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GalleryCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EXT = /\.(jpe?g|png|webp|gif|avif|svg)$/i;
  // legacy flat name: 1=date(optional) 2=title 3=index(optional)
  var NAME = /^(\d{8})?\s*(.*?)\s*(?:\(\s*(\d+)\s*\))?\s*$/;

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

  // Natural sort: "1.jpg" < "2.jpg" < "10.jpg".
  function naturalCompare(a, b) {
    return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
  }

  function encodePath(rel) {
    return 'images/' + rel.split('/').map(encodeURIComponent).join('/');
  }

  function makeProject(date, title, images, usedIds) {
    var dateISO = date ? date.slice(0, 4) + '-' + date.slice(4, 6) + '-' + date.slice(6, 8) : null;
    var id = (date || 'undated') + '-' + slugify(title);
    var n = (usedIds.get(id) || 0) + 1;
    usedIds.set(id, n);
    if (n > 1) id += '-' + n;
    return { id: id, title: title, date: dateISO, images: images };
  }

  // Split an optional leading 8-digit date off a folder name.
  function splitDate(name) {
    var norm = normalizeStem(name);
    var m = norm.match(/^(\d{8})\s*(.*)$/);
    return m ? { date: m[1], title: (m[2] || '').trim() || norm } : { date: null, title: norm };
  }

  /**
   * @param {string[]} paths  image paths relative to images/ — either
   *   "Folder/file.jpg" (folder mode) or "file.jpg" (flat/legacy mode).
   * @returns {{projects: Array, skipped: string[]}}
   */
  function groupPaths(paths) {
    var folders = new Map(); // lowercased folder -> { name, files: [rel] }
    var rootFiles = [];
    var skipped = [];
    var seen = new Set();

    paths.slice().sort().forEach(function (p) {
      if (!p) return;
      var parts = p.split('/').filter(Boolean);
      var base = parts[parts.length - 1];
      if (!base || base.charAt(0) === '.') return; // .gitkeep, .DS_Store
      if (!EXT.test(base)) { skipped.push(p); return; }
      var low = p.toLowerCase();
      if (seen.has(low)) return; // exact dup (e.g. case-only)
      seen.add(low);

      if (parts.length >= 2) {
        var key = parts[0].toLowerCase();
        if (!folders.has(key)) folders.set(key, { name: parts[0], files: [] });
        folders.get(key).files.push(p);
      } else {
        rootFiles.push(base);
      }
    });

    var usedIds = new Map();
    var projects = [];

    // Folder mode: one post per first-level folder.
    folders.forEach(function (g) {
      g.files.sort(naturalCompare);
      var d = splitDate(g.name);
      var images = g.files.map(encodePath);
      projects.push(makeProject(d.date, d.title || g.name, images, usedIds));
    });

    // Flat/legacy mode: group root files by the "Name (n)" convention.
    var flat = new Map();
    rootFiles.forEach(function (file) {
      var stem = normalizeStem(file.replace(EXT, ''));
      var m = stem.match(NAME);
      var date = m[1] || null;
      var title = (m[2] || '').trim() || m[1] || 'Untitled';
      var index = m[3] ? parseInt(m[3], 10) : 0;
      var key = (date || 'undated') + '|' + title.toLowerCase();
      if (!flat.has(key)) flat.set(key, { date: date, title: title, items: [] });
      flat.get(key).items.push({ index: index, src: 'images/' + encodeURIComponent(file) });
    });
    flat.forEach(function (g) {
      g.items.sort(function (a, b) { return a.index - b.index || a.src.localeCompare(b.src); });
      projects.push(makeProject(g.date, g.title, g.items.map(function (i) { return i.src; }), usedIds));
    });

    // Newest date first; undated last; then by title.
    projects.sort(function (a, b) {
      if (a.date && b.date) return b.date.localeCompare(a.date) || a.title.localeCompare(b.title);
      if (a.date) return -1;
      if (b.date) return 1;
      return a.title.localeCompare(b.title);
    });

    return { projects: projects, skipped: skipped };
  }

  // Back-compat alias: flat filenames are just paths with no "/".
  function groupFiles(filenames) { return groupPaths(filenames); }

  return { EXT: EXT, groupPaths: groupPaths, groupFiles: groupFiles };
});
