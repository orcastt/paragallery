import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { normalizePoints, randomSequence } from './sampling.mjs';

function surfaceArea(geometry) {
  const p = geometry.getAttribute('position'), index = geometry.index;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let area = 0;
  for (let i = 0, end = index ? index.count : p.count; i + 2 < end; i += 3) {
    a.fromBufferAttribute(p, index ? index.getX(i) : i);
    b.fromBufferAttribute(p, index ? index.getX(i + 1) : i + 1);
    c.fromBufferAttribute(p, index ? index.getX(i + 2) : i + 2);
    area += b.sub(a).cross(c.sub(a)).length() * .5;
  }
  return area;
}

function lineSampler(geometry, rand) {
  const p=geometry.getAttribute('position'), index=geometry.index;
  const segments=Math.floor((index ? index.count : p.count)/2), cdf=new Float64Array(segments);
  const a=new THREE.Vector3(),b=new THREE.Vector3();
  let length=0;
  for (let i=0;i<segments;i++) {
    a.fromBufferAttribute(p,index ? index.getX(i*2) : i*2);
    b.fromBufferAttribute(p,index ? index.getX(i*2+1) : i*2+1);
    length+=a.distanceTo(b); cdf[i]=length;
  }
  return {area:length,sampler:{sample(point) {
    const target=rand()*length;
    let lo=0,hi=segments-1;
    while (lo<hi) {const mid=(lo+hi)>>>1;if(cdf[mid]<target)lo=mid+1;else hi=mid;}
    a.fromBufferAttribute(p,index ? index.getX(lo*2) : lo*2);
    b.fromBufferAttribute(p,index ? index.getX(lo*2+1) : lo*2+1);
    point.lerpVectors(a,b,rand());
  }}};
}

export async function loadModel(source, count) {
  const url = typeof source === 'string' ? source : URL.createObjectURL(source);
  const name = typeof source === 'string' ? source.split('?')[0] : source.name;
  const extension = name.split('.').pop().toLowerCase();
  const geometries = [];
  let root;
  try {
    if (extension === 'glb' || extension === 'gltf') root = (await new GLTFLoader().loadAsync(url)).scene;
    else if (extension === 'obj') root = await new OBJLoader().loadAsync(url);
    else if (extension === 'stl') geometries.push(await new STLLoader().loadAsync(url));
    else if (extension === 'ply') {
      const geometry = await new PLYLoader().loadAsync(url);
      if (!geometry.index) {
        const p = geometry.getAttribute('position'), c = geometry.getAttribute('color');
        const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
        const rand = randomSequence(73);
        if (!p?.count) throw new Error('PLY 没有可用点。');
        for (let i = 0; i < count; i++) {
          const n = Math.floor(rand() * p.count);
          positions.set([p.getX(n), p.getY(n), p.getZ(n)], i * 3);
          colors.set(c ? [c.getX(n), c.getY(n), c.getZ(n)] : [.67, .49, .27], i * 3);
        }
        geometry.dispose();
        return { positions: normalizePoints(positions), colors, kind: '真实三维点云 · PLY' };
      }
      geometries.push(geometry);
    } else throw new Error('请使用 GLB、GLTF、OBJ、PLY 或 STL 模型。');
    if (root) {
      root.updateMatrixWorld(true);
      root.traverse(object => {
        if ((object.isMesh || object.isLineSegments) && object.geometry?.getAttribute('position')) {
          const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
          const sourceMaterial = Array.isArray(object.material) ? object.material[0] : object.material;
          geometry.userData.particleColor = sourceMaterial?.color?.toArray();
          geometry.userData.lineSegments = Boolean(object.isLineSegments);
          geometries.push(geometry);
        }
      });
    }
    const rand = randomSequence(121), materials = [];
    const surfaces = geometries.map(geometry => {
      if (geometry.userData.lineSegments) {
        const lines=lineSampler(geometry,rand);
        return lines.area>0 ? {...lines,color:geometry.userData.particleColor || [.72,.69,.59],vertexColors:false} : null;
      }
      const area = surfaceArea(geometry);
      if (!Number.isFinite(area) || area <= 0) return null;
      const material = new THREE.MeshBasicMaterial(); materials.push(material);
      return { area, color: geometry.userData.particleColor || [.67, .49, .27], vertexColors: Boolean(geometry.getAttribute('color')),
        sampler: new MeshSurfaceSampler(new THREE.Mesh(geometry, material)).setRandomGenerator(rand).build() };
    }).filter(Boolean);
    if (!surfaces.length) throw new Error('模型没有可采样的三角形表面或独立线段。');
    const total = surfaces.reduce((sum, surface) => sum + surface.area, 0);
    const positions = new Float32Array(count * 3), colors = new Float32Array(count * 3);
    const point = new THREE.Vector3(), color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      let selection = (i + rand()) / count * total;
      const surface = surfaces.find(surface => (selection -= surface.area) <= 0) || surfaces.at(-1);
      color.fromArray(surface.color); surface.sampler.sample(point, undefined, surface.vertexColors ? color : undefined);
      positions.set(point.toArray(), i * 3);
      colors.set(color.toArray(), i * 3);
    }
    materials.forEach(material => material.dispose());
    return { positions: normalizePoints(positions), colors, kind: geometries.some(g=>g.userData.lineSegments) ? '导入的三维几何 · 线 / 表面点云' : '真实三维模型 · 表面点云' };
  } finally {
    geometries.forEach(geometry => geometry.dispose());
    root?.traverse(object => {
      object.geometry?.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => { if (material) { for (const value of Object.values(material)) if (value?.isTexture) value.dispose(); material.dispose(); } });
    });
    if (typeof source !== 'string') URL.revokeObjectURL(url);
  }
}
