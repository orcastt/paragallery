// World-space layout. The route is continuous; exhibits are not attached to the camera.
export const STATION_SPACING = 30;
export const APPROACH_DISTANCE = 20;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const wrapIndex = (n, length) => ((n % length) + length) % length;

export function routePoint(distance) {
  return [Math.sin(distance * .021) * 3.5, .8 + Math.sin(distance * .014) * .3, -distance];
}

export function stationLayout(ordinal) {
  const distance = ordinal * STATION_SPACING;
  const position = routePoint(distance);
  const through = wrapIndex(ordinal, 4) === 0;
  position[0] += through ? 0 : (ordinal % 2 ? -1 : 1) * 7;
  position[1] = through ? 1.1 : 1.8;
  return { position, distance, through, scale: through ? 1.8 : 1.35, yaw: through ? 0 : (ordinal % 2 ? .48 : -.48) };
}

export function focusOrdinal(distance) {
  return Math.floor((distance + APPROACH_DISTANCE + .01) / STATION_SPACING);
}

export function stationWindow(distance) {
  const focus = focusOrdinal(distance);
  return [focus - 1, focus, focus + 1, focus + 2];
}

export function assemblyAt(relativeDistance) {
  return smooth(63, 23, relativeDistance) * smooth(-23, -6, relativeDistance);
}

export function nearestOrdinal(index, distance, length) {
  const focus = focusOrdinal(distance);
  return index + Math.round((focus - index) / length) * length;
}
