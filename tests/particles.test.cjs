const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { imagePaths } = require('../scripts/build-site.js');
const { groupPaths } = require('../assets/gallery-core.js');
const sampling = import('../src/particles/sampling.mjs');

test('All published works have readable local image paths, in gallery order', () => {
  const root = path.resolve(__dirname, '..');
  const { projects, skipped } = groupPaths(imagePaths(path.join(root, 'images')));
  assert.ok(projects.length > 0);
  assert.equal(projects.reduce((n, p) => n + p.images.length, 0), imagePaths(path.join(root, 'images')).length);
  assert.equal(skipped.length, 0);
  for (const project of projects) for (const src of project.images) assert.ok(fs.existsSync(path.join(root, decodeURIComponent(src))));
  assert.equal(new Set(projects.map(p => p.id)).size, projects.length);
  for (let i = 1; i < projects.length; i++) if (projects[i - 1].date && projects[i].date) assert.ok(projects[i - 1].date >= projects[i].date);
});

test('Image sampling excludes black/transparent pixels and crops plate captions', async () => {
  const { sampleImagePoints } = await sampling;
  const image = new Uint8ClampedArray(10 * 10 * 4);
  const pixel = (x, y, value, alpha = 255) => image.set([value, value, value, alpha], (y * 10 + x) * 4);
  pixel(0, 0, 255); // top title, outside crop
  pixel(9, 9, 255); // bottom signature, outside crop
  pixel(2, 4, 200); pixel(6, 6, 200); pixel(5, 5, 255, 0);
  const { positions, colors } = sampleImagePoints(image, 10, 10, 200, [0, .2, 1, .6]);
  assert.equal(positions.length, 600);
  assert.ok(positions.every(Number.isFinite));
  assert.ok(colors.every(v => v > .57 && v < .59));
  const zs = positions.filter((_, i) => i % 3 === 2);
  assert.ok(zs.every(z => z === 0), 'Unmodeled image reference never invents a fake 3D volume');
});

test('Model normalization preserves relative 3D dimensions and centers geometry', async () => {
  const { normalizePoints } = await sampling;
  const p = normalizePoints(new Float32Array([10, 5, -4, 20, 25, 6]), 8);
  assert.deepEqual(Array.from(p), [-2, -4, -2, 2, 4, 2]);
  assert.throws(() => normalizePoints(new Float32Array([0, 0, 0, 0, 0, 0])));
  assert.throws(() => normalizePoints(new Float32Array([Infinity, 0, 0])));
});

test('Blank images produce an actionable failure instead of a fake replacement shape', async () => {
  const { sampleImagePoints } = await sampling;
  assert.throws(() => sampleImagePoints(new Uint8ClampedArray(400), 10, 10, 10), /没有可采样/);
});

test('White architecture plates sample dark geometry rather than the empty white background', async () => {
  const { sampleImagePoints } = await sampling;
  const image = new Uint8ClampedArray(20 * 20 * 4).fill(255);
  for (let y = 3; y < 17; y++) image.set([30, 30, 30, 255], (y * 20 + 10) * 4);
  const { positions, colors } = sampleImagePoints(image, 20, 20, 100, [0, 0, 1, 1]);
  assert.ok(positions.filter((_, i) => i % 3 === 0).every(x => Math.abs(x) < .3));
  assert.ok(colors.every(v => v > .11 && v < .13), 'Dark strokes remain visible in a black room');
});

test('Stratified image sampling retains a thin edge beside a large bright area', async () => {
  const { sampleImagePoints } = await sampling;
  const data = new Uint8ClampedArray(32 * 32 * 4);
  for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
    if (x < 12 || x === 30) data.set([220, 220, 220, 255], (y * 32 + x) * 4);
  }
  const result = sampleImagePoints(data, 32, 32, 3000, [0, 0, 1, 1]);
  assert.ok(result.positions.filter((_, i) => i % 3 === 0).some(x => x > 3.8));
});

test('Only inspected, individually modeled works have inferred geometry; unknown works are never invented', async () => {
  const { inferredCloud, inferredGeometry, reconstructionProfiles } = await import('../src/particles/reconstructions.mjs');
  const { projects } = groupPaths(imagePaths(path.resolve(__dirname, '../images')));
  let modeled = 0;
  for (const project of projects) {
    const cloud = inferredCloud(project, 2200);
    if (!reconstructionProfiles[project.id]) { assert.equal(cloud, null); assert.equal(inferredGeometry(project.id), null); continue; }
    modeled++;
    assert.equal(cloud.source, 'inferred'); assert.match(cloud.kind, /非原模型/);
    assert.ok(cloud.positions.every(Number.isFinite));
    assert.ok(cloud.colors.every(v => Number.isFinite(v) && v > 0 && v < 1));
    for (let axis = 0; axis < 3; axis++) {
      const values = cloud.positions.filter((_, i) => i % 3 === axis);
      assert.ok(Math.max(...values) - Math.min(...values) > .8, `${project.title}: real XYZ extent`);
      assert.ok(Math.max(...values) <= 4.101 && Math.min(...values) >= -4.101);
    }
    assert.deepEqual(cloud.positions, inferredCloud(project, 2200).positions);
    const profile = cloud.profile;
    assert.ok(profile.evidence.every(n => project.images[n - 1]));
    assert.ok(project.images[profile.plate]);
    assert.match(profile.estimated, /估计|推断/);
    assert.ok(profile.crop.every(v => v >= 0 && v <= 1));
    assert.ok(profile.crop[0] + profile.crop[2] <= 1 && profile.crop[1] + profile.crop[3] <= 1);
  }
  assert.equal(modeled, 4);
});

test('Wave Erosion retains source-guided terraces and passage without duplicating reflections', async () => {
  const { inferredCloud, inferredGeometry, waveBounds, reconstructionProfiles } = await import('../src/particles/reconstructions.mjs');
  const id = '20260804-wave-erosion', mesh = inferredGeometry(id), cloud = inferredCloud({ id }, 9000);
  const [w, h, d] = reconstructionProfiles[id].dimensions;
  let ceiling = 0, floor = 0;
  for (let i = 0; i < cloud.positions.length; i += 3) {
    const xyz = Array.from(cloud.positions.subarray(i, i + 3), (v, axis) => v / mesh.scale + mesh.center[axis]);
    const [x, y, z] = [xyz[0] / w + .5, .5 - xyz[1] / h, .5 - xyz[2] / d];
    const neighborhood=[];
    for (const dx of [-2/383,-1/383,0,1/383,2/383]) for (const dz of [-2/77,-1/77,0,1/77,2/77]) neighborhood.push(waveBounds(x+dx,z+dz));
    const top=Math.max(...neighborhood.map(p=>p[0])),bottom=Math.min(...neighborhood.map(p=>p[1]));
    const outerFrame = (x < .0001 || x > .9999) && (z < .0001 || z > .9999);
    assert.ok(outerFrame || y <= top + .002 || y >= bottom - .002, 'Only step risers / the outer frame can cross a local boundary; no passage infill');
    assert.ok(y > -.015 && y < 1.015, 'No floor reflection duplicated as a second object');
    if (y < top) ceiling++; if (y > bottom) floor++;
  }
  assert.ok(ceiling > 100 && floor > 100);
});

test('Refined Wave data matches source images and uses independent opposite-face sections', async () => {
  const {waveEvidence: data,inferredGeometry,inferredCloud,inferredOBJ}=await import('../src/particles/reconstructions.mjs');
  const crypto=require('node:crypto');
  assert.equal(data.method,'image-edge-guided-opposite-face-loft');
  assert.deepEqual(data.grid,[384,96,78]);
  for (const source of data.sources) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'..',source.path))).digest('hex'),source.sha256);
  assert.ok(new Set(data.front.roof).size>40);
  assert.notDeepEqual(data.front.roof,data.back.roof);
  assert.equal(data.columns.length,384*78);
  for (const c of data.columns) assert.ok(c[0]===0 && c[3]===96 && c[2]-c[1]>=4);
  const id='20260804-wave-erosion',model=inferredGeometry(id),cloud=inferredCloud({id},3000);
  assert.equal(model.topology,'wire'); assert.ok(model.parts>100000);
  assert.equal(cloud.wirePositions.length,model.vertices.length);
  assert.equal(cloud.wireColors.length,model.vertices.length/2);
  assert.ok(cloud.ambientMotion<.05, 'Idle deformation cannot smear a fine terrace cell');
  const obj=inferredOBJ(id);
  assert.equal([...obj.matchAll(/^l \d+ \d+$/gm)].length,model.parts);
  assert.doesNotMatch(obj,/^f /m,'A wire model must not be exported as filled plates');
});

test('Crytallization preserves source-guided openings with distinct estimated pocket depths, not infinite extrusions', async () => {
  const { crystalSolid, crystalCavities,crystalEvidence,inferredGeometry } = await import('../src/particles/reconstructions.mjs');
  assert.equal(crystalCavities.length, 11);
  for (const [x, y] of [[.10, .48], [.26, .57], [.41, .57], [.66, .46], [.825, .47], [.33, .88], [.64, .83]]) {
    assert.equal(crystalSolid(x,y,0),false,`Front opening at ${x},${y}`);
    assert.equal(crystalSolid(x,y,1),true,'Rear envelope is not an identical copy of front openings');
  }
  assert.equal(crystalSolid(.50, .25, .5), true);
  assert.ok(new Set(crystalEvidence.pocketDepths).size>5);
  assert.ok(crystalCavities.every(p=>p.length===128));
  assert.equal(crystalEvidence.frontRoof.length,256);
  assert.ok(new Set(crystalEvidence.frontRoof).size>25,'Visible roof retains pixel-derived height levels rather than a flat slab');
  assert.notDeepEqual(crystalEvidence.frontRoof,crystalEvidence.estimatedBackRoof,'An estimated hidden edge is labeled separately');
  assert.equal(inferredGeometry('20260803-crytallization').topology,'wire');
  const crypto=require('node:crypto');
  for(const source of crystalEvidence.sources) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'..',source.path))).digest('hex'),source.sha256);
});

test('Cable uses separate hoop / triangle-fin / spoke geometry with the central opening preserved',async()=>{
  const {inferredGeometry,inferredCloud}=await import('../src/particles/reconstructions.mjs');
  const id='20260802-cable',model=inferredGeometry(id),cloud=inferredCloud({id},10000);
  assert.equal(model.topology,'wire');assert.ok(model.parts>6000);assert.match(model.profile.detail,/20 组/);
  const spans=new Set();
  for(let i=0;i<cloud.positions.length;i+=3) {
    const r=Math.hypot(cloud.positions[i],cloud.positions[i+2]);
    assert.ok(r<=4.101);if(r>.19&&r<2)spans.add(Math.round(cloud.positions[i+1]*100));
  }
  assert.ok(spans.size>15,'Spokes occupy independent 3D height ranges, not one flat disk');
});

test('Prototype 6 is plate-2 main module, not a fabricated high-rise or fused montage', async () => {
  const { inferredGeometry, inferredCloud } = await import('../src/particles/reconstructions.mjs');
  const id = '20260801-prototype-6', mesh = inferredGeometry(id);
  assert.equal(mesh.profile.plate, 1);
  assert.match(mesh.profile.detail, /其他变体/);
  const cloud = inferredCloud({ id }, 5000);
  const floorPoints = [];
  for (let i = 0; i < cloud.positions.length; i += 3) {
    const p = Array.from(cloud.positions.subarray(i, i + 3), (v, axis) => v / mesh.scale + mesh.center[axis]);
    if (p[1] > -.14 && p[1] < .14 && p[0] > -2.4 && p[0] < 2.4 && p[2] > -2.4 && p[2] < 2.4) floorPoints.push(p);
  }
  assert.ok(floorPoints.length > 100);
  for (const p of floorPoints) {
    const onBar = axis => Math.abs((p[axis] + 2.55) / .85 - Math.round((p[axis] + 2.55) / .85)) * .85 <= .097;
    assert.ok(onBar(0) || onBar(2), 'Floor apertures must remain actual openings');
  }
});

test('Inferred models export triangle meshes, and unsupported works cannot export fake models', async () => {
  const { inferredOBJ, inferredGeometry } = await import('../src/particles/reconstructions.mjs');
  const id = '20260801-prototype-6', obj = inferredOBJ(id), mesh = inferredGeometry(id);
  const vertices = [...obj.matchAll(/^v /gm)].length, faces = [...obj.matchAll(/^f (\d+) (\d+) (\d+)$/gm)];
  assert.equal(faces.length, mesh.cdf.length); assert.ok(vertices > 100);
  for (const face of faces) for (const value of face.slice(1)) assert.ok(Number(value) <= vertices);
  assert.match(obj, /NOT the original/);
  assert.throws(() => inferredOBJ('not-modeled'), /尚未/);
});

test('OBJ line geometry can be reimported without filling its openings', async () => {
  const {loadModel}=await import('../src/particles/models.js');
  const http=require('node:http');
  const obj='v -2 0 0\nv -2 2 0\nv 2 0 1\nv 2 2 1\nl 1 2\nl 3 4\n';
  const server=http.createServer((request,response)=>{response.writeHead(200,{'Content-Type':'text/plain'});response.end(obj);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const original=globalThis.ProgressEvent;
  if (!original) globalThis.ProgressEvent=class {constructor(type,values){this.type=type;Object.assign(this,values);}};
  try {
    const cloud=await loadModel(`http://127.0.0.1:${server.address().port}/wire.obj`,2000);
    assert.match(cloud.kind,/线/);assert.ok(cloud.positions.every(Number.isFinite));
    for (let i=0;i<cloud.positions.length;i+=3) assert.ok(Math.abs(Math.abs(cloud.positions[i])-4.1)<1e-5,'Only original line segments, no invented infill');
  } finally {
    await new Promise(resolve=>server.close(resolve));
    if (original) globalThis.ProgressEvent=original; else delete globalThis.ProgressEvent;
  }
});

test('Museum controls all connect to existing elements and original gallery remains accessible', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../particles.html'), 'utf8');
  const app = fs.readFileSync(path.resolve(__dirname, '../src/particles/app.js'), 'utf8');
  const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
  for (const match of app.matchAll(/\$\('([^']+)'\)/g)) assert.ok(ids.has(match[1]), `Missing control: ${match[1]}`);
  assert.match(html, /href="index.html#works"/);
  assert.match(html, /非重构/);
  assert.doesNotMatch(app, /proceduralCloud|familyFor/);
  assert.match(app, /selectionTarget\) ordinals\.push\(selectionTarget\.ordinal\)/, 'Do not discard the user-selected station while its worker is building');
  assert.match(app, /ordinal === selectionTarget\?\.ordinal/, 'Do not replace a selected high-density request with background LOD');
});

test('Pointer deformation stays local in XYZ and left drag does not steer the camera', () => {
  const app=fs.readFileSync(path.resolve(__dirname,'../src/particles/app.js'),'utf8');
  const shader=fs.readFileSync(path.resolve(__dirname,'../src/particles/shaders.mjs'),'utf8');
  assert.match(app,/controls\.mouseButtons\.LEFT\s*=\s*null/);
  assert.match(app,/controls\.mouseButtons\.RIGHT\s*=\s*THREE\.MOUSE\.ROTATE/);
  assert.match(app,/slot\.dynamics\.raycast/);
  assert.match(app,/lookDown\)\s*\{[\s\S]*?camera\.rotation\.y/);
  assert.doesNotMatch(app,/interactionPlane|uRipples|uPressure|uSwipe/);
  assert.match(shader,/attribute vec3 aOffset/);
  assert.match(shader,/p \+= aOffset \* progress/);
  assert.doesNotMatch(shader,/uRayOrigin|uRayDirection|uPointer|uRipples|uBurst/);
});

test('Voyage uses a continuous curved world route, cyclic collection and distance-based formation', async () => {
  const j = await import('../src/particles/journey.mjs');
  assert.equal(j.wrapIndex(-1, 64), 63); assert.equal(j.wrapIndex(64, 64), 0);
  assert.equal(j.focusOrdinal(-j.APPROACH_DISTANCE), 0);
  assert.equal(j.focusOrdinal(j.STATION_SPACING - j.APPROACH_DISTANCE), 1);
  const a = j.routePoint(15), b = j.routePoint(15.001);
  assert.ok(Math.hypot(...a.map((v, i) => v - b[i])) < .002);
  assert.equal(j.assemblyAt(70), 0); assert.equal(j.assemblyAt(20), 1); assert.equal(j.assemblyAt(-30), 0);
  assert.ok(j.assemblyAt(40) > 0 && j.assemblyAt(40) < 1);
  assert.equal(j.stationWindow(0).length, 4);
  assert.equal(j.stationLayout(0).through, true); assert.equal(j.stationLayout(1).through, false);
  assert.equal(j.nearestOrdinal(0, 63 * j.STATION_SPACING, 64), 64);
});
