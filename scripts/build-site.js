const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const { groupPaths } = require('../assets/gallery-core.js');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist');

function imagePaths(dir, prefix = '') {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith('.')) return [];
    const rel = prefix + entry.name;
    return entry.isDirectory() ? imagePaths(path.join(dir, entry.name), rel + '/') : [rel];
  });
}

async function build() {
  if (out !== path.resolve(root, 'dist')) throw new Error('Invalid build output path');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  // An allowlist keeps originals, dependencies and Git history out of Pages.
  for (const name of ['index.html', 'particles.html', '.nojekyll', 'assets', 'images']) {
    fs.cpSync(path.join(root, name), path.join(out, name), { recursive: true });
  }
  if (fs.existsSync(path.join(root, 'models'))) {
    fs.cpSync(path.join(root, 'models'), path.join(out, 'models'), { recursive: true });
  }
  const { projects } = groupPaths(imagePaths(path.join(root, 'images')));
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({ projects }, null, 2));
  await esbuild.build({
    entryPoints: [path.join(root, 'src/particles/app.js')],
    bundle: true, minify: true, format: 'esm', target: 'es2022',
    outfile: path.join(out, 'assets/particles.js'), legalComments: 'linked',
  });
  await esbuild.build({
    entryPoints: [path.join(root, 'src/particles/inference-worker.mjs')],
    bundle: true, minify: true, format: 'esm', target: 'es2022',
    outfile: path.join(out, 'assets/inference-worker.js'),
  });
  const { inferredOBJ, reconstructionProfiles } = await import('../src/particles/reconstructions.mjs');
  const inferredDir = path.join(out, 'models/inferred');
  fs.mkdirSync(inferredDir, { recursive: true });
  for (const id of Object.keys(reconstructionProfiles)) fs.writeFileSync(path.join(inferredDir, `${id}.obj`), inferredOBJ(id));
  console.log(`Built dist/: ${projects.length} works, ${projects.reduce((n, p) => n + p.images.length, 0)} images, ${Object.keys(reconstructionProfiles).length} image-inferred OBJ models.`);
}

if (require.main === module) build().catch(error => { console.error(error); process.exitCode = 1; });
module.exports = { build, imagePaths };
