// DOCUMENTS: pure orrery geometry helpers, split from layout.js by
// responsibility (guard-file-size) so the per-stage registries (layout.js and
// layout-stage6.js) share them. All functions are pure: numbers in, plane
// coordinates out — unit-pinned in test/panel/camera.test.js.

export function polarToWorld(radius, angleDeg) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: Math.round(radius * Math.cos(rad)), y: Math.round(radius * Math.sin(rad)) };
}

export function computeSatellites(users, outerRadius) {
  const count = Math.max(0, Math.round(users));
  const leftCount = Math.ceil(count / 2);
  const rightCount = count - leftCount;
  const satellites = [];
  const place = (arcCount, startAngle) => {
    for (let j = 0; j < arcCount; j += 1) {
      const angleDeg = startAngle + ((j + 1) / (arcCount + 1)) * 37;
      const { x, y } = polarToWorld(outerRadius, angleDeg);
      satellites.push({ index: satellites.length, x, y, angleDeg });
    }
  };
  place(leftCount, 135);
  place(rightCount, 188);
  return satellites;
}

export function makeWire(id, fromId, toId, from, to) {
  return {
    id,
    fromId,
    toId,
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    midX: Math.round((from.x + to.x) / 2),
    midY: Math.round((from.y + to.y) / 2),
  };
}
