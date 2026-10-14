import { randomSequence } from './sampling.mjs';
import waveData from './data/wave-volume.json' with { type: 'json' };
import crystalData from './data/crystal-volume.json' with { type: 'json' };

// These are individual, manually interpreted studies of the repository plates.
// There is deliberately no title classifier or generic geometry fallback.
// Pixel coordinates below exclude captions, ground reflections and scale figures.
export const reconstructionProfiles = Object.freeze({
  '20260804-wave-erosion': {
    name: 'Wave Erosion', plate: 0, evidence: [1, 2, 3, 4], refined: true,
    crop: [43 / 1080, 526 / 1440, 987 / 1080, 244 / 1440],
    observed: '长方体线格外框、上下悬垂细柱、贯穿的阶梯侵蚀通道',
    estimated: '两侧边界依图细化；遮挡边界和中间截面为放样估计，未计入倒影',
    dimensions: waveData.dimensions,
    referenceCrops: { 0: [43/1080, 526/1440, 987/1080, 244/1440], 2: [74/1080, 495/1440, 959/1080, 462/1440] },
    orbitDirection: waveData.orbitDirection,
    detail: '图 1/3 两侧边界以局部边缘细化为 384 个采样；78 层截面放样后以双图边缘约束细化，遮挡处仍有歧义，不是原模型恢复。',
  },
  '20260803-crytallization': {
    name: 'Crytallization', plate: 0, evidence: [1, 2, 3, 4, 5, 6],
    crop: [42 / 1080, 430 / 1440, 986 / 1080, 412 / 1440],
    observed: '11 处图像引导孔口、竖向线笼、下层连桥及不同深度的孔腔',
    estimated: '孔腔收口深度、背面连接与厚度按斜视图估计；未计入倒影',
    dimensions: crystalData.dimensions,
    refined: true, photoPlate: 4, orbitDirection: [.43,.36,.83],
    referenceCrops: {0:[42/1080,430/1440,986/1080,412/1440],4:[45/1080,374/1440,990/1080,758/1440]},
    detail: '图 1 的孔口各细化为 128 个边缘采样，并细化屋顶边缘；图 5/6 用于人工估计孔深与背部线笼。保留孔壁的不规则竖向形态，收口和遮挡内部仍有歧义。',
  },
  '20260802-cable': {
    name: 'Cable', plate: 4, evidence: [1, 2, 3, 4, 5],
    crop: [43 / 1080, 408 / 1440, 995 / 1080, 560 / 1440],
    observed: '同心环、重复径向三角肋、环向密索、向中心小筒汇聚的辐条',
    estimated: '环的相对高度、索径与约 20 组径向肋为图片估计',
    dimensions: [8.2, 1.5, 8.2],
    refined: true, photoPlate: 4, orbitDirection: [.02,.36,.93],
    detail: '按图 2 骨架与图 5 密索校核 20 组三角肋；肋内索线连接真实肋边，不加入随机下垂波纹，尺寸仍为估计。',
  },
  '20260801-prototype-6': {
    name: 'Prototype 6', plate: 1, evidence: [1, 2, 3],
    crop: [215 / 1080, 177 / 1440, 657 / 1080, 582 / 1440],
    observed: '图 2 上方主模块：开孔地台、L 形墙、上部格梁与右侧空窗框',
    estimated: '墙厚、开孔尺寸和背面接缝为估计；其他拼图模块不合并',
    dimensions: [6.45, 3.35, 5.5],
    detail: '只重建图 2 的上方主模块。图 1/3 及图 2 下方是其他变体，不当成同一物体的视角。',
  },
});

const TAU = Math.PI * 2;
const modelCache = new Map();
const ivory = [.72, .69, .59];
const stone = [.49, .46, .39];
const lerp = (a, b, t) => a + (b - a) * t;
const add = (a, b) => a.map((v, i) => v + b[i]);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const mul = (a, s) => a.map(v => v * s);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => mul(a, 1 / Math.hypot(...a));

class MeshBuilder {
  vertices = [];
  colors = [];
  parts = 0;
  triangle(a, b, c, color) {
    this.vertices.push(...a, ...b, ...c);
    this.colors.push(...color);
  }
  quad(a, b, c, d, color) { this.triangle(a, b, c, color); this.triangle(a, c, d, color); }
  box(min, max, color = stone) {
    const v = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]].map(p => p.map((q, i) => q ? max[i] : min[i]));
    for (const f of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]]) this.quad(...f.map(i => v[i]), color);
    this.parts++;
  }
  // A real square-section beam with closed ends, not depth assigned to a pixel.
  beam(a, b, diameter = .006, color = ivory) {
    if (Math.hypot(...sub(b, a)) < 1e-7) return;
    const axis = unit(sub(b, a));
    const u = mul(unit(cross(axis, Math.abs(axis[1]) < .9 ? [0, 1, 0] : [1, 0, 0])), diameter / 2);
    const v = mul(cross(axis, unit(u)), diameter / 2);
    const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    const start = corners.map(([x, y]) => add(a, add(mul(u, x), mul(v, y))));
    const end = corners.map(([x, y]) => add(b, add(mul(u, x), mul(v, y))));
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; this.quad(start[i], end[i], end[j], start[j], color); }
    this.quad(...start, color); this.quad(...end.toReversed(), color); this.parts++;
  }
  curve(fn, steps, diameter = .006, color = ivory) {
    let a = fn(0);
    for (let i = 1; i <= steps; i++) { const b = fn(i / steps); this.beam(a, b, diameter, color); a = b; }
  }
  finish(profile) {
    const vertices = new Float32Array(this.vertices), colors = new Float32Array(this.colors);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertices.length; i++) { const axis = i % 3; min[axis] = Math.min(min[axis], vertices[i]); max[axis] = Math.max(max[axis], vertices[i]); }
    const scale = 8.2 / Math.max(...max.map((v, axis) => v - min[axis]));
    const center = min.map((v, axis) => (v + max[axis]) / 2);
    for (let i = 0; i < vertices.length; i++) vertices[i] = (vertices[i] - center[i % 3]) * scale;
    const cdf = new Float64Array(vertices.length / 9);
    let totalArea = 0;
    for (let i = 0; i < cdf.length; i++) {
      const n = i * 9, a = [...vertices.subarray(n, n + 3)], b = [...vertices.subarray(n + 3, n + 6)], c = [...vertices.subarray(n + 6, n + 9)];
      totalArea += Math.hypot(...cross(sub(b, a), sub(c, a))) / 2; cdf[i] = totalArea;
    }
    return { vertices, colors, cdf, totalArea, parts: this.parts, profile, scale, center };
  }
}

function profileAt(points, x) {
  for (let i = 1; i < points.length; i++) if (x <= points[i][0]) {
    const [a, b] = [points[i - 1], points[i]];
    return lerp(a[1], b[1], (x - a[0]) / (b[0] - a[0]));
  }
  return points.at(-1)[1];
}

// Every sampled section is source-grounded data, not a random/noise field.
export const waveEvidence = waveData;
export function waveBounds(x, z) {
  const [nx, ny, nz] = waveData.grid;
  const i = Math.max(0, Math.min(nx-1, Math.round(x*(nx-1))));
  const k = Math.max(0, Math.min(nz-1, Math.round(z*(nz-1))));
  const column = waveData.columns[i*nz+k];
  return [column[1]/ny, column[2]/ny];
}

class WireBuilder {
  vertices = []; colors = []; unique = new Set();
  beam(a, b, diameterOrColor = ivory, color = ivory) {
    if (Array.isArray(diameterOrColor)) color=diameterOrColor;
    if (Math.hypot(...sub(b, a)) < 1e-7) return;
    const keys = [a,b].map(p => p.map(v => v.toFixed(5)).join(','));
    const key = keys.sort().join('|');
    if (this.unique.has(key)) return;
    this.unique.add(key); this.vertices.push(...a,...b); this.colors.push(...color);
  }
  curve(fn,steps,diameter=.006,color=ivory) {
    let a=fn(0);
    for(let i=1;i<=steps;i++){const b=fn(i/steps);this.beam(a,b,diameter,color);a=b;}
  }
  finish(profile) {
    const vertices = new Float32Array(this.vertices), colors = new Float32Array(this.colors);
    const cdf = new Float64Array(vertices.length/6);
    let totalArea = 0;
    for (let i=0; i<cdf.length; i++) {
      const n=i*6;
      totalArea += Math.hypot(vertices[n+3]-vertices[n],vertices[n+4]-vertices[n+1],vertices[n+5]-vertices[n+2]);
      cdf[i]=totalArea;
    }
    return { vertices, colors, cdf, totalArea, parts:cdf.length, profile, scale:1, center:[0,0,0], topology:'wire' };
  }
}

function waveModel(b) {
  const [w, h, d] = reconstructionProfiles['20260804-wave-erosion'].dimensions;
  const [nx,,nz] = waveData.grid;
  const point = (x,y,z) => [(x-.5)*w, (.5-y)*h, (.5-z)*d];
  // Fine orthogonal terrace edges, separately from the coarser hanging cage.
  // There are no diagonal triangulation edges or luminous solid fill panels.
  for (let i=0; i<nx; i++) for (let k=0; k<nz; k++) {
    const x=i/(nx-1), z=k/(nz-1), levels=waveBounds(x,z);
    for (let layer=0; layer<2; layer++) {
      const y=levels[layer], color=layer ? [.38,.35,.27] : [.48,.44,.35];
      if (i<nx-1) {
        const next=(i+1)/(nx-1), yn=waveBounds(next,z)[layer];
        const mid=point(next,y,z);
        b.beam(point(x,y,z),mid,color); b.beam(mid,point(next,yn,z),color);
      }
      if (k<nz-1) {
        const next=(k+1)/(nz-1), yn=waveBounds(x,next)[layer];
        const mid=point(x,y,next);
        b.beam(point(x,y,z),mid,color); b.beam(mid,point(x,yn,next),color);
      }
    }
  }
  const cageX=144, cageZ=26;
  for (let i=0; i<=cageX; i++) for (let k=0; k<=cageZ; k++) {
    // The plates show the hanging cage on its perimeter. Filling every interior
    // column makes an opaque comb and is not supported by the photographed wirework.
    if (i!==0 && i!==cageX && k!==0 && k!==cageZ) continue;
    const x=i/cageX,z=k/cageZ,[roof,floor]=waveBounds(x,z);
    b.beam(point(x,0,z),point(x,roof,z),[.52,.50,.43]);
    b.beam(point(x,floor,z),point(x,1,z),[.52,.50,.43]);
  }
  for (const y of [0,1]) {
    for (let i=0; i<=cageX; i++) b.beam(point(i/cageX,y,0),point(i/cageX,y,1),[.57,.55,.47]);
    for (let k=0; k<=cageZ; k++) b.beam(point(0,y,k/cageZ),point(1,y,k/cageZ),[.57,.55,.47]);
    for (const z of [0,1]) b.beam(point(0,y,z),point(1,y,z));
    for (const x of [0,1]) b.beam(point(x,y,0),point(x,y,1));
  }
  for (const x of [0,1]) for (const z of [0,1]) b.beam(point(x,0,z),point(x,1,z));
}

// Main cavities traced from image 1; NOT a gyroid or interchangeable porous cube.
export const crystalCavities=crystalData.frontContours;
export const crystalEvidence=crystalData;
export function crystalSolid(x, y, z = 0) {
  if(x<0||x>=1||y<0||y>=1||z<0||z>1)return false;
  const [nx,ny,nz]=crystalData.grid;
  const i=Math.floor(x*nx),k=Math.min(nz-1,Math.floor(z*nz)),j=Math.floor(y*ny);
  const intervals=crystalData.columns[i*nz+k];
  for(let n=0;n<intervals.length;n+=2)if(j>=intervals[n]&&j<intervals[n+1])return true;
  return false;
}
function crystalModel(b) {
  const [w, h, d] = reconstructionProfiles['20260803-crytallization'].dimensions;
  const [nx,ny,nz]=crystalData.grid,solid=new Uint8Array(nx*ny*nz);
  const index=(i,j,k)=>(i*ny+j)*nz+k;
  for(let i=0;i<nx;i++)for(let k=0;k<nz;k++) {
    const intervals=crystalData.columns[i*nz+k];
    for(let n=0;n<intervals.length;n+=2)for(let j=intervals[n];j<intervals[n+1];j++)solid[index(i,j,k)]=1;
  }
  const occupied=(i,j,k)=>i>=0&&i<nx&&j>=0&&j<ny&&k>=0&&k<nz?solid[index(i,j,k)]:0;
  const point=(i,j,k)=>[(i/nx-.5)*w,(.5-j/ny)*h,(.5-k/nz)*d];
  const color=[.48,.44,.35];
  // Merge collinear boundary edges. Rear/front cage faces use long vertical
  // columns, not filled sheets or a dense rectangular horizontal mesh.
  for(let i=0;i<=nx;i++)for(let k=0;k<=nz;k++) {
    let start=-1;
    for(let j=0;j<=ny;j++) {
      const count=j<ny?occupied(i-1,j,k-1)+occupied(i,j,k-1)+occupied(i-1,j,k)+occupied(i,j,k):0;
      const boundary=count>0&&count<4;
      if(boundary&&start<0)start=j;
      if(!boundary&&start>=0){b.beam(point(i,start,k),point(i,j,k),color);start=-1;}
    }
  }
  for(let j=0;j<=ny;j++)for(let k=0;k<=nz;k++) {
    let start=-1;
    for(let i=0;i<=nx;i++) {
      const count=i<nx?occupied(i,j-1,k-1)+occupied(i,j,k-1)+occupied(i,j-1,k)+occupied(i,j,k):0;
      const face=k===0||k===nz,layer=k===0?0:nz-1;
      const boundary=count>0&&count<4&&(!face||occupied(i,j-1,layer)!==occupied(i,j,layer));
      if(boundary&&start<0)start=i;
      if(!boundary&&start>=0){b.beam(point(start,j,k),point(i,j,k),color);start=-1;}
    }
  }
  for(let i=0;i<=nx;i++)for(let j=0;j<=ny;j++) {
    let start=-1;
    for(let k=0;k<=nz;k++) {
      const count=k<nz?occupied(i-1,j-1,k)+occupied(i,j-1,k)+occupied(i-1,j,k)+occupied(i,j,k):0;
      const face=i===0||i===nx,layer=i===0?0:nx-1;
      const boundary=count>0&&count<4&&(!face||occupied(layer,j-1,k)!==occupied(layer,j,k));
      if(boundary&&start<0)start=k;
      if(!boundary&&start>=0){b.beam(point(i,j,start),point(i,j,k),color);start=-1;}
    }
  }
}

function cableModel(b) {
  const r = 4.1, inner = 2.05, hub = .18, ribs = 20;
  const polar = (radius, y, a) => [radius * Math.cos(a), y, radius * Math.sin(a)];
  const frame=[.65,.60,.49],cable=[.43,.39,.30];
  for (const y of [-.67, -.12, .67]) b.curve(t => polar(r, y, t * TAU), 360, .014,frame);
  for (const y of [-.50, .34]) b.curve(t => polar(inner, y, t * TAU), 240, .012,frame);
  for (const y of [-.37, .22]) b.curve(t => polar(hub, y, t * TAU), 48, .008);
  for (let i = 0; i < 36; i++) b.beam(polar(hub, -.37, TAU * i / 36), polar(hub, .22, TAU * i / 36), .005);
  // Fine exterior hoop stays, observed on the final dense-cable plate.
  for(let j=1;j<23;j++) {
    const y=lerp(-.67,.67,j/23);
    if(Math.abs(y+.12)>.018)b.curve(t=>polar(r,y,t*TAU),240,.0032,cable);
  }
  for (let i = 0; i < ribs; i++) {
    const a = TAU * i / ribs, next = a + TAU / ribs;
    const low=polar(inner,-.50,a),high=polar(inner,.34,a),apex=polar(r,-.12,next);
    b.beam(polar(r,-.67,a),polar(r,.67,a),.012,frame);
    b.beam(low,high,.011,frame);b.beam(low,apex,.011,frame);b.beam(high,apex,.012,frame);
    // Actual fin triangles from the construction plate. Dense stays terminate
    // on their edges, rather than inventing a spiral/sagging annular surface.
    for(let j=1;j<33;j++)b.beam(low.map((v,k)=>lerp(v,high[k],j/33)),apex,.0035,cable);
    for(let j=1;j<23;j++)b.beam(apex.map((v,k)=>lerp(v,low[k],j/23)),apex.map((v,k)=>lerp(v,high[k],j/23)),.0035,cable);
    for(const offset of [0,.5]) {
      const angle=a+offset*TAU/ribs;
      b.beam(polar(hub,-.37,angle),polar(r,-.67,angle),.004,cable);
    }
    b.beam(polar(hub,.22,a),high,.0035,cable);
  }
}

function prototypeModel(b) {
  // Only the top module of plate 2: a floor lattice, L wall, and empty frame.
  const pitch = .85, beam = .19, extent = 6 * pitch, half = extent / 2;
  for (let i = 0; i <= 6; i++) {
    const at = -half + i * pitch;
    b.box([at - beam / 2, -.13, -half - beam / 2], [at + beam / 2, .13, half + beam / 2]);
    b.box([-half - beam / 2, -.13, at - beam / 2], [half + beam / 2, .13, at + beam / 2]);
  }
  const wall = .23, height = 3.15;
  // Left wall has a larger solid panel, a step near the front, and visible piers.
  b.box([-half - wall / 2, 0, -half], [-half + wall / 2, 2.50, half]);
  b.box([-half - wall / 2, 2.50, -half], [-half + wall / 2, height, .45]);
  for (const z of [-half, -.85, .85, half]) b.box([-half - wall / 2 - .035, 0, z - .09], [-half + wall / 2 + .055, height - (z === half ? .65 : 0), z + .09]);
  // Rear panel is assembled around two rows of small rectangular apertures,
  // rather than covering a solid sheet with decorative points.
  const ys = [[0, 1.05], [1.47, 2.14], [2.55, height]];
  for (const [y0, y1] of ys) b.box([-half, y0, -half - wall / 2], [half, y1, -half + wall / 2]);
  for (let i = 0; i <= 6; i++) {
    const x = -half + i * pitch;
    b.box([x - .18, 1.05, -half - wall / 2], [x + .18, height, -half + wall / 2]);
  }
  // A short perforated top shelf and projecting empty window frame on the right.
  for (let i = 0; i <= 6; i++) {
    const x = -half + i * pitch;
    b.box([x - .09, height - .12, -half - .08], [x + .09, height + .12, -half + 1.12]);
  }
  for (const z of [-half, -half + .54, -half + 1.08]) b.box([-half - .09, height - .12, z - .08], [half + .08, height + .12, z + .08]);
  const frameZ = -half + 1.08, rightX = half + 1.05;
  for (const x of [half - .06, rightX]) b.box([x - .065, 0, frameZ - .08], [x + .065, height, frameZ + .08]);
  for (const y of [0, height]) b.box([half - .13, y - .065, frameZ - .08], [rightX + .065, y + .065, frameZ + .08]);
  // Matching paired rail, visible along the window/shelf join in the plate.
  b.box([half - .13, height - .045, frameZ - .22], [rightX + .065, height + .045, frameZ - .14]);
}

const builders = { '20260804-wave-erosion': waveModel, '20260803-crytallization': crystalModel, '20260802-cable': cableModel, '20260801-prototype-6': prototypeModel };

export function inferredGeometry(id) {
  if (!Object.hasOwn(builders, id)) return null;
  if (!modelCache.has(id)) { const b = id === '20260801-prototype-6' ? new MeshBuilder() : new WireBuilder(); builders[id](b); modelCache.set(id, b.finish(reconstructionProfiles[id])); }
  return modelCache.get(id);
}

export function inferredCloud(project, count) {
  const model = inferredGeometry(project.id);
  if (!model) return null;
  if (!Number.isInteger(count) || count <= 0) throw new Error('Invalid point count');
  const rand = randomSequence(117), positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
  const isWire = model.topology === 'wire';
  for (let i = 0; i < count; i++) {
    const area = (i + rand()) / count * model.totalArea;
    let lo = 0, hi = model.cdf.length - 1;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (model.cdf[mid] < area) lo = mid + 1; else hi = mid; }
    if (isWire) {
      // Half length-weighted, half edge-stratified so tiny terrace steps aren't
      // erased by long cage columns. This samples independent XYZ segments.
      const segment = i%2 ? Math.min(model.cdf.length-1, Math.floor((i+rand())/count*model.cdf.length)) : lo;
      const n=segment*6,t=rand();
      for (let axis=0; axis<3; axis++) {
        positions[i*3+axis]=lerp(model.vertices[n+axis],model.vertices[n+3+axis],t);
        colors[i*3+axis]=model.colors[segment*3+axis];
      }
      continue;
    }
    const n = lo * 9, root = Math.sqrt(rand()), v = rand(), weights = [1 - root, root * (1 - v), root * v];
    // Barycentric surface sampling of independent XYZ mesh faces.
    for (let axis = 0; axis < 3; axis++) {
      positions[i * 3 + axis] = weights.reduce((sum, weight, j) => sum + model.vertices[n + j * 3 + axis] * weight, 0);
      colors[i * 3 + axis] = model.colors[lo * 3 + axis];
    }
  }
  const wire = project.id !== '20260801-prototype-6';
  return { positions, colors, source: 'inferred', kind: '依图推断的三维模型 · 非原模型', profile: model.profile, triangles: isWire ? 0 : model.cdf.length, segments: isWire ? model.cdf.length : 0, pointScale: isWire ? .78 : 1, pointOpacity: wire ? .38 : .9, ambientMotion: isWire ? .035 : 1,
    ...(isWire ? { wirePositions: model.vertices.slice(), wireColors: model.colors.slice() } : {}) };
}

export function inferredOBJ(id) {
  const model = inferredGeometry(id);
  if (!model) throw new Error('这件作品尚未按图建模。');
  const output = ['# Image-informed estimated geometry, NOT the original model.', `# ${model.profile.name}`, `# Evidence plates: ${model.profile.evidence.join(', ')}`, '# Relative dimensions only; no physical units.', 'o image_inferred_study'];
  const indices = new Map(), faces = [];
  const wire = model.topology === 'wire', stride=wire ? 6 : 9;
  for (let i = 0; i < model.vertices.length; i += stride) {
    const face = [];
    for (let j = 0; j < stride; j += 3) {
      const key = Array.from(model.vertices.subarray(i + j, i + j + 3), n => n.toFixed(6)).join(' ');
      if (!indices.has(key)) { indices.set(key, indices.size + 1); output.push(`v ${key}`); }
      face.push(indices.get(key));
    }
    faces.push(`${wire ? 'l' : 'f'} ${face.join(' ')}`);
  }
  return [...output, ...faces, ''].join('\n');
}
