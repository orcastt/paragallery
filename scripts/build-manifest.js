#!/usr/bin/env node
/**
 * Scans images/ and groups files into "posts" by filename convention:
 *
 *   YYYYMMDDProjectName (n).jpg     ->  post "ProjectName", dated, image #n
 *   YYYYMMDDProjectName.jpg         ->  single-image post
 *   AnythingElse (n).png            ->  undated post "AnythingElse"
 *   AnythingElse.png                ->  undated single-image post
 *
 * Output: manifest.json at the repo root, consumed by assets/app.js.
 * Run manually with `node scripts/build-manifest.js`, or let the GitHub
 * Action run it on every push.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'images');
const OUT = path.join(ROOT, 'manifest.json');

const EXT = /\.(jpe?g|png|webp|gif|avif|svg)$/i;
// captures: 1=date(optional) 2=title 3=index(optional). Tolerates full-width
// parens / digits and stray trailing whitespace (normalised before matching).
const NAME = /^(\d{8})?\s*(.*?)\s*(?:\(\s*(\d+)\s*\))?\s*$/;

// Normalise full-width IME punctuation & digits, and trim, so a Chinese user
// typing （1） or trailing spaces still groups correctly.
function normalizeStem(stem) {
  return stem
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0))
    .trim();
}

function slugify(title) {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9一-鿿]+/gi, '-')
    .replace(/^-|-$/g, '');
  return base || title.toLowerCase().trim() || 'untitled';
}

// Always emit at least an empty manifest — an empty gallery is a valid state
// the frontend handles, and this keeps the deploy green after a user deletes
// the demo images.
const files = fs.existsSync(IMG_DIR)
  ? fs.readdirSync(IMG_DIR).sort()
  : [];

const groups = new Map();
const seenLower = new Map(); // lowercased filename -> original, for case-collision dedupe
const skipped = [];

for (const file of files) {
  if (file.startsWith('.')) continue; // .gitkeep, .DS_Store, etc.
  if (!EXT.test(file)) {
    skipped.push(file);
    continue;
  }
  const lower = file.toLowerCase();
  if (seenLower.has(lower)) {
    console.warn(`::warning file=images/${file}::Duplicate ignored (differs only by letter case from images/${seenLower.get(lower)})`);
    continue;
  }
  seenLower.set(lower, file);

  const stem = normalizeStem(file.replace(EXT, ''));
  const m = stem.match(NAME);
  const date = m[1] || null;
  const title = (m[2] || '').trim() || m[1] || 'Untitled';
  const index = m[3] ? parseInt(m[3], 10) : 0;

  const key = `${date || 'undated'}|${title.toLowerCase()}`;
  if (!groups.has(key)) {
    groups.set(key, { date, title, images: [] });
  }
  // Use the ORIGINAL, unnormalised filename for the src (the file on disk),
  // URL-encoded so '#', '?', '%', spaces etc. survive the request.
  groups.get(key).images.push({ index, src: `images/${encodeURIComponent(file)}` });
}

const usedIds = new Map();
const projects = [...groups.values()]
  .map((g) => {
    g.images.sort((a, b) => a.index - b.index || a.src.localeCompare(b.src));
    const dateISO = g.date
      ? `${g.date.slice(0, 4)}-${g.date.slice(4, 6)}-${g.date.slice(6, 8)}`
      : null;
    let id = `${g.date || 'undated'}-${slugify(g.title)}`;
    const n = (usedIds.get(id) || 0) + 1;
    usedIds.set(id, n);
    if (n > 1) id += `-${n}`;
    return { id, title: g.title, date: dateISO, images: g.images.map((i) => i.src) };
  })
  // newest first; undated posts sink to the end, then alphabetical
  .sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date) || a.title.localeCompare(b.title);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.title.localeCompare(b.title);
  });

fs.writeFileSync(OUT, JSON.stringify({ projects }, null, 2) + '\n');

const total = projects.reduce((n, p) => n + p.images.length, 0);
console.log(`manifest.json written: ${projects.length} posts, ${total} images.`);
for (const f of skipped) {
  console.warn(`::warning file=images/${f}::Unsupported format skipped: ${f} (supported: jpg/jpeg/png/webp/gif/avif/svg — iPhone HEIC must be exported to JPG)`);
}
