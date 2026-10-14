export function randomSequence(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export function linearChannel(value) {
  value /= 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

// Honest, flat image reference. Luminance controls sampling density/color only,
// never invented depth. Image-informed models use reconstructions.mjs instead.
export function sampleImagePoints(data, width, height, count, crop = [0, .07, 1, .86], seed = 1) {
  if (data.length !== width * height * 4 || !Number.isInteger(count) || count <= 0) throw new Error('Invalid image sampling input');
  const rand = randomSequence(seed);
  const candidates = [];
  let total = 0, minX = width, maxX = 0, minY = height, maxY = 0;
  const x0 = Math.max(0, Math.floor(crop[0] * width));
  const y0 = Math.max(0, Math.floor(crop[1] * height));
  const x1 = Math.min(width, Math.ceil((crop[0] + crop[2]) * width));
  const y1 = Math.min(height, Math.ceil((crop[1] + crop[3]) * height));
  let lightPixels = 0, inspectedPixels = 0;
  for (let y = y0; y < y1; y += 3) for (let x = x0; x < x1; x += 3) {
    const i = (y * width + x) * 4;
    inspectedPixels++;
    if (data[i + 3] < 128) continue;
    if ((data[i] + data[i + 1] + data[i + 2]) / 765 > .82) lightPixels++;
  }
  const lightBackground = lightPixels / Math.max(1, inspectedPixels) > .55;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * width + x) * 4;
      const luma = (data[i] * .2126 + data[i + 1] * .7152 + data[i + 2] * .0722) / 255;
      const contrast = lightBackground ? 1 - luma : luma;
      if (contrast < (lightBackground ? .18 : .085) || data[i + 3] < 128) continue;
      total += Math.sqrt(contrast);
      candidates.push({ x, y, i, luma: contrast, cumulative: total });
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  if (!candidates.length) throw new Error('裁切范围内没有可采样的像素，请更换作品视图。');
  const scale = 8.2 / Math.max(maxX - minX + 1, maxY - minY + 1);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let n = 0; n < count; n++) {
    // Stratified CDF sampling covers fine edges evenly instead of random clumps.
    const weight = (n + rand()) / count * total;
    let lo = 0, hi = candidates.length - 1;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (candidates[mid].cumulative < weight) lo = mid + 1; else hi = mid; }
    const pixel = candidates[lo];
    const x = (pixel.x - (minX + maxX) / 2 + rand() - .5) * scale;
    const y = ((minY + maxY) / 2 - pixel.y + rand() - .5) * scale;
    positions.set([x, y, 0], n * 3);
    colors.set([0, 1, 2].map(channel => Math.max(lightBackground ? .12 : 0, linearChannel(data[pixel.i + channel]))), n * 3);
  }
  return { positions, colors };
}

export function normalizePoints(positions, extent = 8.2) {
  if (!positions.length || positions.length % 3) throw new Error('模型没有有效的点。');
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i++) {
    const axis = i % 3, v = positions[i];
    if (!Number.isFinite(v)) throw new Error('模型坐标包含非有限值。');
    min[axis] = Math.min(min[axis], v); max[axis] = Math.max(max[axis], v);
  }
  const span = Math.max(...max.map((v, i) => v - min[i]));
  if (span < 1e-8) throw new Error('模型尺寸为零。');
  const result = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i++) result[i] = (positions[i] - (min[i % 3] + max[i % 3]) / 2) * extent / span;
  return result;
}
