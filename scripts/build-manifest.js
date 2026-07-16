#!/usr/bin/env node
/**
 * OPTIONAL. The live site reads the images/ listing directly from the GitHub
 * API, so you normally never need this. Run it only if you want a committed
 * manifest.json (e.g. to avoid the API dependency, work fully offline, or serve
 * from a private repo): `node scripts/build-manifest.js`. When manifest.json is
 * present the site prefers it over the live listing.
 *
 * It scans images/ and groups files into posts by the same filename convention
 * the browser uses (shared logic in assets/gallery-core.js).
 */
const fs = require('fs');
const path = require('path');
const { groupFiles } = require('../assets/gallery-core.js');

const ROOT = path.join(__dirname, '..');
const IMG_DIR = path.join(ROOT, 'images');
const OUT = path.join(ROOT, 'manifest.json');

// An empty gallery is a valid state the frontend handles, so a missing images/
// folder still produces a valid (empty) manifest rather than an error.
const files = fs.existsSync(IMG_DIR) ? fs.readdirSync(IMG_DIR) : [];
const { projects, skipped } = groupFiles(files);

fs.writeFileSync(OUT, JSON.stringify({ projects }, null, 2) + '\n');

const total = projects.reduce((n, p) => n + p.images.length, 0);
console.log(`manifest.json written: ${projects.length} posts, ${total} images.`);
for (const f of skipped) {
  console.warn(`::warning file=images/${f}::Unsupported format skipped: ${f} (supported: jpg/jpeg/png/webp/gif/avif/svg — iPhone HEIC must be exported to JPG)`);
}
