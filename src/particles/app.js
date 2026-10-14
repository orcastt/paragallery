import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { sampleImagePoints, randomSequence } from './sampling.mjs';
import { reconstructionProfiles } from './reconstructions.mjs';
import { requestInferredCloud } from './inference-engine.js';
import { routePoint, stationLayout, stationWindow, focusOrdinal, nearestOrdinal, assemblyAt, wrapIndex, STATION_SPACING, APPROACH_DISTANCE } from './journey.mjs';
import { vertexShader, fragmentShader } from './shaders.mjs';
import { loadModel } from './models.js';
import { ParticleField } from './interaction.mjs';

const $ = id => document.getElementById(id);
const config = window.PARTICLE_CONFIG || {};
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const pad = n => String(n).padStart(2, '0');
let messageTimer;
function report(text, sticky = false) {
  clearTimeout(messageTimer); $('message').textContent = text; $('message').classList.remove('quiet');
  if (!sticky) messageTimer = setTimeout(() => $('message').classList.add('quiet'), 5000);
}

async function init() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.setClearColor(0x000000); renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '黑色三维粒子博物馆。左键局部触碰粒子，右键拖动环顾，滚轮缩放或行进，双击下一件。');
  $('viewport').appendChild(canvas);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(58, 1, .06, 240);
  camera.rotation.order = 'YXZ';
  const controls = new OrbitControls(camera, canvas);
  controls.enabled = false; controls.enableDamping = true; controls.dampingFactor = .07;
  controls.minDistance = .3; controls.maxDistance = 90; controls.autoRotateSpeed = .16;
  controls.mouseButtons.LEFT=null;controls.mouseButtons.RIGHT=THREE.MOUSE.ROTATE;
  controls.touches.ONE=null;controls.touches.TWO=THREE.TOUCH.DOLLY_ROTATE;
  const raycaster = new THREE.Raycaster();
  const gazeRay = new THREE.Ray(), gazeSphere = new THREE.Sphere();
  const pointer = new THREE.Vector2(100, 100), direction = new THREE.Vector3();
  const forward = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const temp = new THREE.Vector3(), localDirection = new THREE.Vector3(), inverse = new THREE.Matrix4();
  const cameraBase = new THREE.Vector3(), lookTarget = new THREE.Vector3();
  const keys = new Set(), pointers = new Set();
  const slots = new Map(), pending = new Map(), failed = new Set(), cache = new Map(), inflight = new Map(), localModels = new Map();
  let projects = [], currentIndex = -1, currentOrdinal = 0, orbitOrdinal = 0, plateIndex = 0;
  let pointCount = Number(innerWidth < 640 ? config.mobilePointCount : config.pointCount) || 160000;
  let source = config.source === 'image' ? 'image' : 'inferred', speed = Number(config.voyageSpeed) || 2.2;
  let mode = 'voyage', auto = !reducedMotion, paused = false, time = 0, distance = -APPROACH_DISTANCE;
  let structureView = false, cameraMatch = false;
  let lastNow = performance.now(), lastSync = -1, revision = 0, navigationToken = 0, navigation, selectionTarget;
  let pointerActive = false, down, lookDown, contact, lastPick=-Infinity, multitouch = false, dragDistance = 0, fullReference = false;
  let lookYaw = 0, lookPitch = 0, targetYaw = 0, targetPitch = 0, contextLost = false;
  let frames = 0, fpsStart = lastNow, hudStart = 0, lowFrames = 0, interaction = 0;
  const params = { motion: reducedMotion ? 0 : .7, size: 1.5, palette: 0, formation: -1 };
  $('quality').value = String(pointCount); $('source').value = source; $('speed').value = String(speed); $('speed-value').value = speed.toFixed(1);
  if (reducedMotion) { $('motion').value = '0'; $('motion-value').value = '0.00'; }

  // Sparse volumetric dust supplies parallax, never an opaque room or floor.
  const dustGeometry = new THREE.BufferGeometry(), dustPositions = new Float32Array(10000 * 3), rand = randomSequence(491);
  for (let i = 0; i < 10000; i++) dustPositions.set([(rand() - .5) * 75, (rand() - .5) * 42, (rand() - .5) * 200], i * 3);
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ size: .025, color: 0x63717e, transparent: true, opacity: .26, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(dust);
  const touchMarker=new THREE.Mesh(new THREE.SphereGeometry(.045,12,8),new THREE.MeshBasicMaterial({color:0xe8c68c,transparent:true,opacity:.65,depthWrite:false}));
  touchMarker.visible=false;scene.add(touchMarker);

  function resize() {
    const rect = $('viewport').getBoundingClientRect();
    camera.aspect = rect.width / Math.max(1, rect.height); camera.updateProjectionMatrix();
    renderer.setSize(rect.width, rect.height, false);
  }
  resize(); addEventListener('resize', resize);

  function disposeSlot(slot) {
    for (const object of [slot.mesh,slot.wire].filter(Boolean)) { scene.remove(object); object.geometry.dispose(); object.material.dispose(); }
  }
  function sourceKey(project) {
    const model = localModels.get(project.id) || config.models?.[project.id];
    return model ? 'model' : source;
  }
  function desiredCount(ordinal) {
    const focus = mode === 'orbit' ? orbitOrdinal : mode === 'fly' ? currentOrdinal : focusOrdinal(distance);
    return ordinal === focus || ordinal === selectionTarget?.ordinal || ordinal === navigation?.ordinal ? pointCount : Math.min(14000, Math.round(pointCount / 8));
  }
  function keyFor(ordinal, count) {
    const project = projects[wrapIndex(ordinal, projects.length)];
    const key = sourceKey(project);
    const usesPlate = key === 'image' || (key === 'inferred' && !reconstructionProfiles[project.id]);
    return `${revision}:${project.id}:${key}:${usesPlate && ordinal === currentOrdinal ? plateIndex : 0}:${count}`;
  }
  async function imageCloud(src, seed, count, crop = config.imageCrop) {
    const image = new Image(); image.decoding = 'async'; image.src = src; await image.decode();
    const scale = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const samplingCanvas = document.createElement('canvas');
    samplingCanvas.width = Math.round(image.naturalWidth * scale); samplingCanvas.height = Math.round(image.naturalHeight * scale);
    const context = samplingCanvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, samplingCanvas.width, samplingCanvas.height);
    const data = sampleImagePoints(context.getImageData(0, 0, samplingCanvas.width, samplingCanvas.height).data, samplingCanvas.width, samplingCanvas.height, count, crop, seed);
    // Unmodeled work stays an honest flat image reference. Brightness is not
    // geometry: do not extrude pixels or invent a backside as a fallback.
    for (let i = 2; i < data.positions.length; i += 3) data.positions[i] = 0;
    samplingCanvas.width = 0;
    return { ...data, source: 'image', kind: '平面原图参考 · 非三维重构' };
  }
  async function getData(ordinal, count, key) {
    if (cache.has(key)) return cache.get(key);
    if (inflight.has(key)) return inflight.get(key);
    const project = projects[wrapIndex(ordinal, projects.length)], plate = ordinal === currentOrdinal ? plateIndex : 0;
    const model = localModels.get(project.id) || config.models?.[project.id];
    const task = (async () => {
      let data;
      if (model) {
        data = { ...await loadModel(model.src || model, count), source: 'model' };
        if (model.rotation) {
          const rotation = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...model.rotation));
          for (let i = 0; i < data.positions.length; i += 3) temp.fromArray(data.positions, i).applyMatrix4(rotation).toArray(data.positions, i);
        }
      } else if (source === 'inferred') {
        data = reconstructionProfiles[project.id] ? await requestInferredCloud(project.id, count) : null;
        if (!data) data = { ...await imageCloud(project.images[plate], wrapIndex(ordinal, projects.length) * 17 + plate + 1, count), pendingModel: true, kind: '尚未逐件建模 · 仅显示平面原图' };
      } else {
        const profile = reconstructionProfiles[project.id];
        data = await imageCloud(project.images[plate], wrapIndex(ordinal, projects.length) * 17 + plate + 1, count, plate === profile?.plate ? profile.crop : config.imageCrop);
      }
      cache.set(key, data);
      while (cache.size > 10) cache.delete(cache.keys().next().value);
      return data;
    })();
    inflight.set(key, task);
    try { return await task; } finally { inflight.delete(key); }
  }
  async function ensureStation(ordinal, count = desiredCount(ordinal)) {
    const key = keyFor(ordinal, count), old = slots.get(ordinal);
    if (old?.key === key) return old;
    if (pending.get(ordinal)?.key === key) return pending.get(ordinal).promise;
    if (failed.has(key)) return null;
    const startRevision = revision;
    const promise = (async () => {
      try {
        const data = await getData(ordinal, count, key);
        if (revision !== startRevision || pending.get(ordinal)?.key !== key) return null;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(data.positions, 3));
        geometry.setAttribute('aColor', new THREE.BufferAttribute(data.colors, 3));
        const dynamics=new ParticleField(data.positions);
        const offsetAttribute=new THREE.BufferAttribute(dynamics.offsets,3).setUsage(THREE.DynamicDrawUsage);
        geometry.setAttribute('aOffset',offsetAttribute);
        const seeds = new Float32Array(count), rng = randomSequence(ordinal + 912);
        for (let i = 0; i < count; i++) seeds[i] = rng();
        geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1)); geometry.computeBoundingSphere();
        const uniforms = {
          uTime: { value: time }, uAssembly: { value: 0 }, uBirth: { value: 0 }, uDepth: { value: 1 },
          uSize: { value: params.size }, uPixelRatio: { value: renderer.getPixelRatio() },
          uViewScale: { value: 1 },
          uOpacity: { value: Math.min(1, Math.sqrt(100000 / count)) * (data.pointOpacity ?? 1) }, uFormation: { value: wrapIndex(ordinal, 4) },
          uPalette: { value: params.palette },
        };
        const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
        const mesh = new THREE.Points(geometry, material), layout = stationLayout(ordinal);
        mesh.position.fromArray(layout.position); mesh.scale.setScalar(layout.scale); mesh.rotation.y = layout.yaw;
        mesh.frustumCulled = false; mesh.updateMatrixWorld(); scene.add(mesh);
        let wire;
        if (data.wirePositions) {
          const lineGeometry = new THREE.BufferGeometry();
          lineGeometry.setAttribute('position',new THREE.BufferAttribute(data.wirePositions,3));
          const lineColors = new Float32Array(data.wirePositions.length);
          for (let i=0; i<data.wireColors.length; i+=3) {
            lineColors.set(data.wireColors.subarray(i,i+3),i*2);
            lineColors.set(data.wireColors.subarray(i,i+3),i*2+3);
          }
          lineGeometry.setAttribute('color',new THREE.BufferAttribute(lineColors,3));
          wire = new THREE.LineSegments(lineGeometry,new THREE.LineBasicMaterial({vertexColors:true,transparent:true,opacity:.28,depthWrite:false}));
          wire.position.copy(mesh.position); wire.scale.copy(mesh.scale); wire.rotation.copy(mesh.rotation); wire.visible=false; scene.add(wire);
        }
        const previous = slots.get(ordinal);
        const slot = { mesh, wire, dynamics, offsetAttribute, uniforms, key, data, count, ordinal, layout, birthAge: previous?.birthAge ?? (paused || reducedMotion ? 3 : 0), birthTick: performance.now(), lastHit: null };
        if (previous) disposeSlot(previous);
        slots.set(ordinal, slot);
        if (ordinal === currentOrdinal) present(ordinal, slot);
        return slot;
      } catch (error) {
        failed.add(key); console.error(error);
        report(`${projects[wrapIndex(ordinal, projects.length)].title} 加载失败：${error.message}`, true);
        return null;
      } finally { if (pending.get(ordinal)?.key === key) pending.delete(ordinal); }
    })();
    pending.set(ordinal, { key, promise });
    return promise;
  }
  function syncStations() {
    if (!projects.length) return;
    const ordinals = mode === 'orbit' ? [orbitOrdinal] : stationWindow(distance);
    if (mode === 'fly') ordinals.push(currentOrdinal);
    if (navigation) ordinals.push(navigation.ordinal);
    if (selectionTarget) ordinals.push(selectionTarget.ordinal);
    const keep = new Set(ordinals);
    for (const [ordinal, slot] of slots) if (!keep.has(ordinal)) { disposeSlot(slot); slots.delete(ordinal); }
    for (const ordinal of pending.keys()) if (!keep.has(ordinal)) pending.delete(ordinal);
    for (const ordinal of keep) ensureStation(ordinal);
  }
  function present(ordinal, slot) {
    const index = wrapIndex(ordinal, projects.length), project = projects[index];
    const changed = currentIndex !== index;
    currentOrdinal = ordinal; currentIndex = index;
    if (changed) {
      fullReference = false;
      cameraMatch = false; structureView = false; camera.fov=58; camera.updateProjectionMatrix();
      plateIndex = source === 'inferred' ? (reconstructionProfiles[project.id]?.plate ?? 0) : 0;
      $('work-title').textContent = project.title; $('work-number').textContent = `${pad(index + 1)} / ${pad(projects.length)}`;
      document.title = `${project.title} · Particle Museum`;
      history.replaceState(null, '', `#work=${encodeURIComponent(project.id)}${mode === 'orbit' ? '&view=orbit' : ''}`);
      for (const button of $('filmstrip').children) button.setAttribute('aria-current', String(Number(button.dataset.index) === index));
      for (const button of $('library-grid').children) button.setAttribute('aria-current', String(Number(button.dataset.index) === index));
      $('filmstrip').children[index]?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reducedMotion ? 'instant' : 'smooth' });
    }
    $('reference-image').src = project.images[plateIndex];
    $('reference-image').alt = `${project.title} 原作渲染图`;
    $('plate-number').textContent = `${pad(plateIndex + 1)} / ${pad(project.images.length)}`;
    $('source-type').textContent = slot?.data.kind || '正在聚合下一件作品…';
    const profile = slot?.data.profile;
    if (structureView && slot?.wire) $('source-type').textContent='结构核对 · 无粒子形变 · 依图推断';
    $('structure-view').hidden = !slot?.wire;
    $('photo-match').hidden = !profile?.orbitDirection;
    $('structure-view').setAttribute('aria-pressed',String(structureView));
    $('structure-view').textContent = structureView ? '返回粒子显示' : '结构线核对';
    $('photo-match').textContent=`对齐图 ${(profile?.photoPlate??2)+1} 视角`;
    $('work-note').textContent = slot?.data.source === 'model' ? '导入的三维几何 · 可环绕与穿行' : profile ? (profile.refined ? '依图细化试样 · 遮挡处仍为推断' : project.id === '20260801-prototype-6' ? '图 2 上方主模块 · 初版推断 · 背面与尺寸估计' : '初版图片推断 · 尚待逐件精修') : slot?.data.pendingModel ? '待按图建模 · 当前仅为平面参考' : '平面原图参考 · 无推断几何';
    $('reference-note').textContent = profile ? profile.observed : slot?.data.source === 'model' ? '点云取自导入的三维几何。' : reconstructionProfiles[project.id] ? '当前选择的是平面原图参考；可在设置中切回这件作品的图片推断模型。' : '这件作品尚无图片推断模型；这里保留原作图片，不自动套用别的形态。';
    $('inference-note').textContent = profile ? `${profile.estimated}。${profile.detail}` : '原作图片对照，不代表已完成三维重构。';
    $('download-model').hidden = !profile;
    if (profile) { $('download-model').href = `models/inferred/${project.id}.obj`; $('download-model').download = `${project.id}-image-inferred.obj`; }
    updateReferenceCrop();
    if (slot) $('message').classList.add('quiet');
  }
  function positionOrbit() {
    const layout = stationLayout(orbitOrdinal);
    controls.target.fromArray(layout.position);
    const slot = slots.get(orbitOrdinal);
    const radius = (slot?.mesh.geometry.boundingSphere.radius || 5) * layout.scale;
    const limitingFov = Math.min(THREE.MathUtils.degToRad(camera.fov), 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * camera.aspect));
    const fit = radius / Math.sin(limitingFov / 2) * 1.2;
    const project = projects[wrapIndex(orbitOrdinal, projects.length)];
    const profile = reconstructionProfiles[project.id];
    const pose = cameraMatch && profile?.orbitDirection ? profile.orbitDirection : project.id === '20260801-prototype-6' ? [1, .85, 1.3] : project.id === '20260802-cable' ? [.3, 1.15, 1.4] : [.35, .22, 1.5];
    const view = new THREE.Vector3(...pose).normalize().applyAxisAngle(up,layout.yaw);
    let distanceToWork = fit;
    if (cameraMatch && profile) {
      const across = new THREE.Vector3().crossVectors(up,view).normalize();
      const vertical = new THREE.Vector3().crossVectors(view,across).normalize();
      const [w,h,d] = profile.dimensions.map(v=>v*layout.scale);
      let extentX=0,extentY=0,extentZ=0;
      for (const x of [-w/2,w/2]) for (const y of [-h/2,h/2]) for (const z of [-d/2,d/2]) {
        temp.set(x,y,z).applyAxisAngle(up,layout.yaw);
        extentX=Math.max(extentX,Math.abs(temp.dot(across))); extentY=Math.max(extentY,Math.abs(temp.dot(vertical))); extentZ=Math.max(extentZ,Math.abs(temp.dot(view)));
      }
      const tanHalf=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2);
      distanceToWork=Math.max(extentX/(tanHalf*camera.aspect),extentY/tanHalf)*1.28+extentZ;
    }
    camera.position.copy(controls.target).add(view.multiplyScalar(distanceToWork));
    camera.lookAt(controls.target); controls.update();
  }
  function updateReferenceCrop() {
    if (currentIndex < 0) return;
    const project = projects[currentIndex], profile = reconstructionProfiles[project.id];
    const availableCrop = profile?.referenceCrops?.[plateIndex] || (plateIndex === profile?.plate ? profile.crop : null);
    const crop = !fullReference ? availableCrop : null;
    const frame = $('reference-frame'), image = $('reference-image');
    $('reference-full').hidden = !availableCrop;
    $('reference-full').textContent = fullReference ? '只看建模区域 ↗' : '查看完整原图 ↗';
    frame.classList.toggle('cropped', Boolean(crop));
    frame.style.aspectRatio = crop ? String(crop[2] * 1080 / (crop[3] * 1440)) : '3 / 4';
    image.style.width = crop ? `${100 / crop[2]}%` : '';
    image.style.left = crop ? `${-crop[0] / crop[2] * 100}%` : '';
    image.style.top = crop ? `${-crop[1] / crop[3] * 100}%` : '';
    $('reference-plate').textContent = `原作图 ${plateIndex + 1} / ${project.images.length}${crop ? ' · 建模区域（已排除倒影 / 拼图）' : ' · 完整原图'}`;
  }
  function setMode(nextMode) {
    const previousMode = mode;
    const previousFov=camera.fov;
    mode = nextMode; keys.clear(); down = lookDown = contact = null; navigation = null;
    if (mode !== 'orbit') { cameraMatch=false; structureView=false; camera.fov=58; camera.updateProjectionMatrix(); }
    if (mode==='fly' && previousMode==='orbit' && previousFov!==58) camera.position.sub(controls.target).multiplyScalar(Math.tan(THREE.MathUtils.degToRad(previousFov)/2)/Math.tan(THREE.MathUtils.degToRad(58)/2)).add(controls.target);
    $('space').style.setProperty('--jump-fade', '0');
    controls.enabled = mode === 'orbit'; targetYaw = targetPitch = lookYaw = lookPitch = 0;
    if (mode === 'orbit') { orbitOrdinal = currentOrdinal; positionOrbit(); }
    else if (mode === 'voyage') { distance = previousMode === 'orbit' ? currentOrdinal * STATION_SPACING - APPROACH_DISTANCE : -camera.position.z; auto = true; }
    $('voyage').setAttribute('aria-pressed', String(mode === 'voyage'));
    $('explore').setAttribute('aria-pressed', String(mode === 'fly'));
    $('reset').setAttribute('aria-pressed', String(mode === 'orbit'));
    $('flight-controls').hidden = mode !== 'fly';
    $('autoplay').setAttribute('aria-pressed', String(auto && mode === 'voyage'));
    $('autoplay').textContent = auto && mode === 'voyage' ? '航行中' : '继续航行';
    $('interaction-hint').innerHTML = mode === 'fly' ? '<span class="hint-mark">◎</span>WASD 移动 · 右键环顾 · Q/E 升降<br><span>左键局部触碰 · Shift 加速 · Esc 返回航线</span>' : mode === 'orbit' ? '<span class="hint-mark">◎</span>左键触碰粒子 · 右键旋转 · 滚轮缩放<br><span>双指观察 / 缩放 · 松手回弹 · ← → 切换作品</span>' : '<span class="hint-mark">↝</span>自动向前 · 右键环顾 · 滚轮推进<br><span>左键局部触碰 · 松手回弹 · I 隐去界面</span>';
    syncStations();
    if (currentIndex>=0) present(currentOrdinal,slots.get(currentOrdinal));
    if (currentIndex >= 0) history.replaceState(null, '', `#work=${encodeURIComponent(projects[currentIndex].id)}${mode === 'orbit' ? '&view=orbit' : ''}`);
  }
  async function selectOrdinal(ordinal, initial = false) {
    const request = ++navigationToken;
    selectionTarget = { ordinal, request };
    report(`正在聚合 ${projects[wrapIndex(ordinal, projects.length)].title}…`, true);
    failed.clear();
    const slot = await ensureStation(ordinal, pointCount);
    if (request !== navigationToken) return null;
    if (!slot) { selectionTarget = null; syncStations(); return null; }
    $('space').style.setProperty('--jump-fade', '0');
    if (initial || mode === 'orbit') {
      distance = ordinal * STATION_SPACING - APPROACH_DISTANCE; currentOrdinal = orbitOrdinal = ordinal;
      present(ordinal, slot); if (mode === 'orbit') positionOrbit();
    } else {
      const destination = ordinal * STATION_SPACING - APPROACH_DISTANCE;
      navigation = { from: distance, to: destination, elapsed: 0, duration: Math.abs(destination - distance) < 90 ? 2.4 : 1.4, far: Math.abs(destination - distance) >= 90, ordinal };
    }
    selectionTarget = null; syncStations(); return slot;
  }
  const nextProject = offset => selectOrdinal((navigation?.ordinal ?? (mode === 'orbit' ? orbitOrdinal : focusOrdinal(distance))) + offset);
  const chooseProject = index => selectOrdinal(nearestOrdinal(index, distance, projects.length));

  function toggleLibrary(open) {
    $('library').hidden = !open;
    for (const child of $('space').children) if (child !== $('library')) child.inert = open;
    $('library-toggle').setAttribute('aria-expanded', String(open));
    if (open) $('search').focus(); else $('library-toggle').focus();
  }
  function toggleSettings(open) { $('settings').hidden = !open; $('settings-toggle').setAttribute('aria-expanded', String(open)); }
  function toggleReference(open) {
    $('reference').hidden = !open; $('reference-toggle').setAttribute('aria-expanded', String(open));
    $('space').classList.toggle('comparing', open);
    resize(); if (mode === 'orbit') positionOrbit();
  }
  function toggleImmersive(on) {
    $('space').classList.toggle('immersive', on); $('immersive').setAttribute('aria-pressed', String(on));
    $('immersive').textContent = on ? '显示界面 · I' : '沉浸模式 ⤢';
    for (const hud of document.querySelectorAll('.space-header, .tools, .work-info, .space-footer, .interaction-modes')) hud.inert = on;
    $('reference-toggle').inert = on;
    if (on) { toggleSettings(false); toggleReference(false); }
  }
  function setInteraction(value) {
    interaction = value;
    for (const button of document.querySelectorAll('[data-interaction]')) button.setAttribute('aria-pressed', String(Number(button.dataset.interaction) === value));
  }
  function burst() { for (const slot of slots.values()) if(slot.mesh.visible)slot.dynamics.scatter(params.motion); }
  function rebuild() { revision++; cache.clear(); failed.clear(); syncStations(); }
  function renderCollection() {
    projects.forEach((project, index) => {
      const button = document.createElement('button'); button.dataset.index = index; button.title = project.title; button.setAttribute('aria-label', `查看 ${project.title}`);
      const img = document.createElement('img'); img.src = project.images[0]; img.alt = ''; img.loading = 'lazy'; button.append(img);
      button.onclick = () => chooseProject(index); $('filmstrip').append(button);
      const card = document.createElement('button'); card.className = 'library-card'; card.dataset.index = index;
      const label = document.createElement('strong'); label.textContent = project.title;
      const small = document.createElement('small'); small.textContent = reconstructionProfiles[project.id] ? `${reconstructionProfiles[project.id].refined ? '细化试样' : '初版推断'} · ${project.images.length} 张原图` : `待建模 · ${project.images.length} 张原图`;
      card.dataset.modeled = String(Boolean(reconstructionProfiles[project.id]));
      card.append(img.cloneNode(), label, small); card.onclick = () => { toggleLibrary(false); chooseProject(index); }; $('library-grid').append(card);
    });
    $('work-total').textContent = projects.length; $('previous').disabled = $('next').disabled = false;
    $('model-progress').textContent = `本批已按图建模 ${projects.filter(p => reconstructionProfiles[p.id]).length} / ${projects.length} 件。其余保持原图参考，不使用通用模型代替。`;
  }

  $('library-toggle').onclick = () => toggleLibrary($('library').hidden); $('library-close').onclick = () => toggleLibrary(false);
  $('settings-toggle').onclick = () => toggleSettings($('settings').hidden); $('settings-close').onclick = () => toggleSettings(false);
  $('reference-toggle').onclick = () => toggleReference($('reference').hidden);
  $('reference-close').onclick = () => toggleReference(false);
  $('reference-full').onclick = () => { fullReference = !fullReference; updateReferenceCrop(); };
  $('structure-view').onclick = () => {
    const slot=slots.get(currentOrdinal); if (!slot?.wire) return;
    structureView=!structureView; slot.birthAge=3;
    if (mode !== 'orbit') setMode('orbit');
    present(currentOrdinal,slot);
    report(structureView ? `结构核对：${slot.data.segments.toLocaleString()} 条独立三维线段，关闭粒子形变。` : '已返回可交互粒子，静止时保留细部结构。');
  };
  $('photo-match').onclick = () => {
    cameraMatch=true; camera.fov=18; camera.updateProjectionMatrix(); controls.maxDistance=180;
    if (mode !== 'orbit') setMode('orbit');
    plateIndex=reconstructionProfiles[projects[currentIndex].id].photoPlate??2; fullReference=false;
    $('reference-image').src=projects[currentIndex].images[plateIndex]; $('plate-number').textContent=`${pad(plateIndex+1)} / ${pad(projects[currentIndex].images.length)}`;
    updateReferenceCrop(); toggleReference(true); positionOrbit();
    report(`已切到图 ${plateIndex+1} 近似斜视角；右键旋转、滚轮缩放。相机和遮挡部分仍为估计。`);
  };
  $('download-model').onclick = () => report('下载的是按图推断的三维几何，不是原始模型；Wave Erosion 保留线段，尺寸无实际单位。');
  $('immersive').onclick = () => toggleImmersive(!$('space').classList.contains('immersive'));
  $('search').oninput = event => {
    let matches = 0; const query = event.target.value.toLocaleLowerCase();
    for (const card of $('library-grid').children) { card.hidden = !projects[Number(card.dataset.index)].title.toLocaleLowerCase().includes(query); if (!card.hidden) matches++; }
    $('search-empty').hidden = matches > 0;
  };
  $('previous').onclick = () => nextProject(-1); $('next').onclick = () => nextProject(1);
  $('plate-next').onclick = () => {
    if (currentIndex < 0) return;
    plateIndex = (plateIndex + 1) % projects[currentIndex].images.length;
    fullReference = false;
    $('reference-image').src = projects[currentIndex].images[plateIndex]; $('plate-number').textContent = `${pad(plateIndex + 1)} / ${pad(projects[currentIndex].images.length)}`;
    const slot = slots.get(currentOrdinal);
    if (sourceKey(projects[currentIndex]) === 'image' || slot?.data.pendingModel) ensureStation(currentOrdinal, pointCount);
    toggleReference(true);
    updateReferenceCrop();
  };
  $('voyage').onclick = () => setMode('voyage'); $('explore').onclick = () => setMode('fly'); $('reset').onclick = () => setMode('orbit');
  $('pause').onclick = () => { paused = !paused; $('pause').setAttribute('aria-pressed', String(paused)); $('pause').textContent = paused ? '▷' : 'Ⅱ'; };
  $('autoplay').onclick = () => { if (mode !== 'voyage') setMode('voyage'); else auto = !auto; $('autoplay').setAttribute('aria-pressed', String(auto)); $('autoplay').textContent = auto ? '航行中' : '继续航行'; };
  $('fullscreen').onclick = () => { const action = document.fullscreenElement ? document.exitFullscreen() : $('space').requestFullscreen(); action?.catch(() => report('当前浏览器未允许全屏，可使用浏览器全屏功能。')); };
  for (const [id, key, output] of [['motion', 'motion', 'motion-value'], ['point-size', 'size', 'size-value']]) {
    $(id).oninput = event => { params[key] = Number(event.target.value); $(output).value = params[key].toFixed(2); };
  }
  $('speed').oninput = event => { speed = Number(event.target.value); $('speed-value').value = speed.toFixed(1); };
  $('palette').onchange = event => params.palette = Number(event.target.value);
  $('formation').onchange = event => { params.formation = Number(event.target.value); for (const slot of slots.values()) { slot.birthAge = 0; slot.birthTick = performance.now(); } };
  $('quality').onchange = event => { pointCount = Number(event.target.value); rebuild(); };
  $('source').onchange = event => { source = event.target.value; rebuild(); };
  for (const button of document.querySelectorAll('[data-interaction]')) button.onclick = () => setInteraction(Number(button.dataset.interaction));
  $('burst').onclick = burst;
  $('model-input').onchange = async event => {
    const file = event.target.files[0]; if (!file || currentIndex < 0) return;
    const ordinal = currentOrdinal, project = projects[currentIndex], old = localModels.get(project.id);
    localModels.set(project.id, file); revision++; cache.clear(); failed.clear();
    const result = await ensureStation(ordinal, pointCount);
    if (!result) { if (old) localModels.set(project.id, old); else localModels.delete(project.id); rebuild(); }
    else { report('已替换为真实三维几何点云；文件只在本机本次会话使用。'); syncStations(); }
    event.target.value = '';
  };
  for (const [id, key] of [['fly-forward', 'w'], ['fly-back', 's']]) {
    $(id).onpointerdown = event => { event.preventDefault(); $(id).setPointerCapture(event.pointerId); keys.add(key); };
    $(id).onpointerup = $(id).onpointercancel = () => keys.delete(key);
  }
  addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (!$('library').hidden) { toggleLibrary(false); return; }
      if (!$('settings').hidden) { toggleSettings(false); return; }
      if (!$('reference').hidden) { toggleReference(false); return; }
      if ($('space').classList.contains('immersive')) { toggleImmersive(false); return; }
      if (mode !== 'voyage') setMode('voyage'); return;
    }
    if (!$('library').hidden) {
      if (event.key === 'Tab') {
        const items = [...$('library').querySelectorAll('button, input')].filter(item => item.getClientRects().length);
        if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1).focus(); }
        else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0].focus(); }
      }
      return;
    }
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); nextProject(1); }
    else if (event.key === 'ArrowLeft') { event.preventDefault(); nextProject(-1); }
    else if (event.code === 'Space' && !(event.target instanceof HTMLButtonElement)) { event.preventDefault(); burst(); }
    else if (/^[1-4]$/.test(event.key)) setInteraction(Number(event.key) - 1);
    else if (event.key.toLowerCase() === 'i') toggleImmersive(!$('space').classList.contains('immersive'));
    if ('wasdqe'.includes(event.key.toLowerCase()) || event.key === 'Shift') { if (mode === 'fly') event.preventDefault(); keys.add(event.key.toLowerCase()); }
  });
  addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
  addEventListener('blur', () => { keys.clear(); down = lookDown = contact = null; pointerActive = false; });
  document.addEventListener('visibilitychange', () => { keys.clear(); down = lookDown = contact = null; lastNow = performance.now(); });
  addEventListener('hashchange', () => { const id = new URLSearchParams(location.hash.slice(1)).get('work'); const index = projects.findIndex(p => p.id === id); if (index >= 0) chooseProject(index); });

  function setPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1); pointerActive = true;lastPick=-Infinity;
  }
  function pickContact() {
    if(!pointerActive||paused||structureView||lookDown||multitouch)return null;
    let selected=null,nearest=Infinity;
    camera.updateMatrixWorld();raycaster.setFromCamera(pointer,camera);
    for (const slot of slots.values()) {
      if(!slot.mesh.visible||slot.birthAge<2.4||(mode!=='orbit'&&slot.uniforms.uAssembly.value<.98))continue;
      inverse.copy(slot.mesh.matrixWorld).invert();
      temp.copy(raycaster.ray.origin).applyMatrix4(inverse);
      localDirection.copy(raycaster.ray.direction).transformDirection(inverse);
      const pixelRadius=Math.min(.095,Math.max(.045,camera.position.distanceTo(slot.mesh.position)*Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)*8/(canvas.clientHeight*slot.layout.scale)));
      const picked=slot.dynamics.raycast(temp.toArray(),localDirection.toArray(),pixelRadius);
      if(!picked)continue;
      const world=new THREE.Vector3(...picked.point).applyMatrix4(slot.mesh.matrixWorld),distance=world.distanceTo(camera.position);
      if(distance<nearest){nearest=distance;selected={slot,...picked,world};}
    }
    return selected;
  }
  function pulse() {
    const picked=pickContact();
    if(picked)picked.slot.dynamics.brush(picked.point,picked.axis,[0,0,0],interaction,params.motion,1/60,true,.44);
  }
  canvas.addEventListener('pointerdown', event => {
    if(event.button===2){lookDown={lastX:event.clientX,lastY:event.clientY};canvas.setPointerCapture(event.pointerId);return;}
    if (event.button !== 0) return;
    setPointer(event); canvas.setPointerCapture(event.pointerId); pointers.add(event.pointerId);
    if (pointers.size > 1) multitouch = true;
    if (event.isPrimary) { down = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, time: performance.now() }; dragDistance = 0; }
  });
  canvas.addEventListener('pointermove', event => {
    setPointer(event);
    if (down && event.isPrimary) {
      dragDistance = Math.max(dragDistance, Math.hypot(event.clientX - down.x, event.clientY - down.y));
      down.lastX = event.clientX; down.lastY = event.clientY;
    }
    if(lookDown) {
      const dx = event.clientX - lookDown.lastX, dy = event.clientY - lookDown.lastY;
      if (mode === 'fly') { camera.rotation.y -= dx * .0035; camera.rotation.x = THREE.MathUtils.clamp(camera.rotation.x - dy * .0035, -1.4, 1.4); }
      if (mode === 'voyage') { targetYaw -= dx * .0035; targetPitch = THREE.MathUtils.clamp(targetPitch - dy * .0035, -.9, .9); }
      lookDown.lastX = event.clientX; lookDown.lastY = event.clientY;
    }
  });
  canvas.addEventListener('pointerup', event => {
    if(event.button===2){lookDown=null;return;}
    if (down && event.isPrimary && dragDistance < 7 && !multitouch && performance.now() - down.time < 700) pulse();
    pointers.delete(event.pointerId); if (!pointers.size) { multitouch = false; down = null; }
  });
  canvas.addEventListener('dblclick', event => { event.preventDefault(); if (!multitouch && dragDistance < 7) nextProject(1); });
  canvas.addEventListener('pointercancel', () => { down = lookDown = contact = null; pointers.clear(); multitouch = false; });
  canvas.addEventListener('pointerleave', () => { if (!down) pointerActive = false; });
  canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('wheel', event => {
    if (mode === 'orbit') return;
    event.preventDefault(); navigation = null;
    $('space').style.setProperty('--jump-fade', '0');
    if (mode === 'fly') { camera.getWorldDirection(direction); camera.position.addScaledVector(direction, -event.deltaY * .012); }
    else distance += THREE.MathUtils.clamp(event.deltaY * .012, -8, 8);
  }, { passive: false });
  canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); contextLost = true; report('图形显示已中断，请刷新重新进入展厅。', true); });
  canvas.addEventListener('webglcontextrestored', () => { contextLost = false; lastNow = performance.now(); report('图形显示已恢复。'); });

  function updateCamera(dt, blocked) {
    if (mode === 'orbit') { controls.autoRotate = false; controls.update(dt); return; }
    if (navigation && !blocked) {
      navigation.elapsed += dt;
      const t = Math.min(1, navigation.elapsed / navigation.duration), eased = t * t * (3 - 2 * t);
      if (navigation.far) { $('space').style.setProperty('--jump-fade', String(Math.sin(t * Math.PI))); if (t >= .5) distance = navigation.to; }
      else distance = THREE.MathUtils.lerp(navigation.from, navigation.to, eased);
      if (mode === 'fly') { camera.position.fromArray(routePoint(distance)); camera.lookAt(...stationLayout(navigation.ordinal).position); }
      if (t === 1) { navigation = null; $('space').style.setProperty('--jump-fade', '0'); }
    } else if (mode === 'voyage' && auto && !paused && !blocked) distance += dt * speed;
    if (mode === 'voyage') {
      cameraBase.fromArray(routePoint(distance)); lookTarget.fromArray(routePoint(distance + 12));
      camera.position.copy(cameraBase);
      camera.lookAt(lookTarget);
      const lerp = 1 - Math.exp(-dt * 6);
      lookYaw = THREE.MathUtils.lerp(lookYaw, targetYaw, lerp); lookPitch = THREE.MathUtils.lerp(lookPitch, targetPitch, lerp);
      camera.rotation.y += lookYaw; camera.rotation.x += lookPitch;
    } else {
      if (!paused && !blocked) {
        camera.getWorldDirection(forward); right.crossVectors(forward, up).normalize();
        const move = dt * (keys.has('shift') ? 12 : 4.5);
        if (keys.has('w')) camera.position.addScaledVector(forward, move); if (keys.has('s')) camera.position.addScaledVector(forward, -move);
        if (keys.has('a')) camera.position.addScaledVector(right, -move); if (keys.has('d')) camera.position.addScaledVector(right, move);
        if (keys.has('q')) camera.position.y -= move; if (keys.has('e')) camera.position.y += move;
      }
      distance = -camera.position.z;
    }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - lastNow) / 1000, .055); lastNow = now;
    if (document.hidden || contextLost) return;
    const blocked = !$('library').hidden || !$('settings').hidden;
    if (!paused && !blocked && (!reducedMotion || params.motion > 0)) time += dt;
    updateCamera(dt, blocked);
    if (projects.length) {
      let focus = mode === 'orbit' ? orbitOrdinal : focusOrdinal(distance);
      if (mode === 'fly') {
        gazeRay.origin.copy(camera.position); camera.getWorldDirection(gazeRay.direction);
        let nearest = Infinity;
        for (const slot of slots.values()) {
          gazeSphere.copy(slot.mesh.geometry.boundingSphere).applyMatrix4(slot.mesh.matrixWorld);
          if (gazeRay.intersectSphere(gazeSphere, temp)) {
            const d = camera.position.distanceToSquared(temp);
            if (d < nearest && d < 3600) { nearest = d; focus = slot.ordinal; }
          }
        }
      }
      if (focus !== currentOrdinal) { plateIndex = 0; present(focus, slots.get(focus)); }
      if (time - lastSync > .25 || lastSync < 0) { syncStations(); lastSync = time; }
    }
    dust.position.z = -Math.floor(distance / 80) * 80;
    dust.visible=!structureView && !cameraMatch;
    camera.updateMatrixWorld(); camera.getWorldDirection(direction); raycaster.setFromCamera(pointer, camera);
    if(now-lastPick>45){contact=blocked?null:pickContact();lastPick=now;}
    if(contact && slots.get(contact.slot.ordinal)!==contact.slot)contact=null;
    touchMarker.visible=Boolean(contact&&!blocked&&!structureView&&!paused&&!lookDown);
    if(touchMarker.visible){touchMarker.position.copy(contact.world);touchMarker.scale.setScalar(contact.slot.layout.scale);}
    canvas.style.cursor=lookDown||down?'grabbing':contact?'grab':'default';
    $('viewport').dataset.contact=contact?`${contact.slot.ordinal}:${contact.index}`:'';
    $('viewport').dataset.cameraPose=[...camera.position.toArray(),...camera.quaternion.toArray()].map(v=>v.toFixed(5)).join(',');
    let activeParticles=0,maxOffset=0;
    let totalPoints = 10000;
    for (const slot of slots.values()) {
      const { uniforms: u, mesh, layout } = slot;
      const visible=mode !== 'orbit' || slot.ordinal === orbitOrdinal;
      if (slot.wire) slot.wire.visible=visible && structureView && mode==='orbit';
      mesh.visible=visible && !slot.wire?.visible;
      if (!visible) continue;
      totalPoints += slot.count;
      // Wall-clock formation duration also works in a throttled preview. The
      // camera keeps its capped movement step; pause/settings freeze formation.
      if (!paused && !blocked) slot.birthAge += Math.max(0, (now - slot.birthTick) / 1000);
      slot.birthTick = now;
      u.uTime.value = time; u.uBirth.value = reducedMotion ? 1 : Math.min(1, slot.birthAge / 2.4);
      u.uAssembly.value = mode === 'orbit' ? 1 : assemblyAt(mode === 'fly' ? camera.position.distanceTo(mesh.position) : layout.distance - distance);
      u.uDepth.value = 1;
      u.uSize.value = params.size * (slot.data.pointScale ?? 1); u.uPalette.value = params.palette;
      u.uViewScale.value=Math.tan(THREE.MathUtils.degToRad(camera.fov)/2)/Math.tan(THREE.MathUtils.degToRad(58)/2);
      u.uPixelRatio.value = renderer.getPixelRatio();
      u.uFormation.value = params.formation < 0 ? wrapIndex(slot.ordinal, 4) : params.formation;
      if(down&&contact?.slot===slot&&!paused&&!blocked&&!multitouch&&!lookDown) {
        const stroke=slot.lastHit?contact.point.map((v,a)=>(v-slot.lastHit[a])/Math.max(.016,dt)):[0,0,0];
        slot.dynamics.brush(contact.point,contact.axis,stroke,interaction,params.motion,dt);
        slot.lastHit=contact.point.slice();
      } else slot.lastHit=null;
      if(mode==='fly'&&!paused&&!blocked&&params.motion>0) {
        inverse.copy(mesh.matrixWorld).invert();temp.copy(camera.position).applyMatrix4(inverse);
        slot.dynamics.brush(temp.toArray(),[0,1,0],[0,0,0],1,params.motion*.3,dt,false,.22);
      }
      if(!paused&&!blocked&&slot.dynamics.step(dt))slot.offsetAttribute.needsUpdate=true;
      activeParticles+=slot.dynamics.active.length;maxOffset=Math.max(maxOffset,slot.dynamics.peakOffset);
    }
    $('viewport').dataset.activeParticles=String(activeParticles);$('viewport').dataset.maxOffset=maxOffset.toFixed(4);
    const submitStart = performance.now();
    renderer.render(scene, camera); frames++;
    $('performance').dataset.renderMs = (performance.now() - submitStart).toFixed(2);
    if (now - fpsStart > 1200) {
      const fps = Math.round(frames * 1000 / (now - fpsStart));
      $('performance').textContent = structureView && slots.get(orbitOrdinal)?.wire ? `${Math.round(slots.get(orbitOrdinal).data.segments/1000)}K STRUCTURE LINES · ${fps} FPS` : `${Math.round(totalPoints / 1000)}K ACTIVE · ${Math.round(pointCount / 1000)}K NEAR · ${fps} FPS`;
      lowFrames = fps < 27 ? lowFrames + 1 : 0;
      // A background/occluded WebView may throttle to 1 FPS; that is not GPU load.
      if (lowFrames >= 3 && fps >= 8 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); resize(); lowFrames = 0; report('已自动降低屏幕采样负担，保留近处作品的粒子精度。'); }
      frames = 0; fpsStart = now;
    }
    if (now - hudStart > 300) {
      $('journey-status').textContent = `${mode === 'voyage' ? 'VOYAGE' : mode === 'fly' ? 'FREE EXPLORATION' : 'ORBIT'} · ${Math.round(Math.max(0, distance + APPROACH_DISTANCE)).toString().padStart(4, '0')} M`;
      const phase = wrapIndex(distance + APPROACH_DISTANCE, STATION_SPACING) / STATION_SPACING;
      $('tour-progress').style.width = `${phase * 100}%`; hudStart = now;
    }
  }

  const response = await fetch('manifest.json', { cache: 'no-store' });
  if (!response.ok) throw new Error('作品清单加载失败，请先构建站点。');
  projects = (await response.json()).projects?.filter(project => project.images?.length) || [];
  if (!projects.length) throw new Error('没有可展示的作品。');
  renderCollection();
  const initialParameters = new URLSearchParams(location.hash.slice(1));
  const id = initialParameters.get('work');
  const initial = Math.max(0, projects.findIndex(project => project.id === id));
  await selectOrdinal(initial, true);
  if (initialParameters.get('view') === 'orbit') setMode('orbit');
  $('autoplay').setAttribute('aria-pressed', String(auto && mode === 'voyage')); $('autoplay').textContent = auto && mode === 'voyage' ? '航行中' : '继续航行';
  if (!auto) report('系统选择了减少动态：航线已停泊，你可以手动启航。');
  frame(performance.now());
}
init().catch(error => { console.error(error); report(`展厅暂时无法启动：${error.message}。可以从右上角进入原图片作品集。`, true); });
