// DOCUMENTS: pure camera math for the orrery viewport — pan, zoom-at-cursor,
// fit-to-bounds, and the CSS transform mapping world (0,0) into the viewport.
// Zero DOM here: this is the module the unit suite pins; viewport.js owns all
// DOM writes.
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.0;
// DOCUMENTS: the pannable world frame for all per-stage ring geometry —
// widened for Stage 3's five rings and Stage 4's six (r_k = k * ringGap) so
// their left arcs and node cards stay reachable by pan and fit.
export const WORLD_BOUNDS = { minX: -3100, maxX: 600, minY: -900, maxY: 900 };

const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

// CHECKS: createCamera rejects non-finite or non-positive inputs instead of
// producing a NaN transform that would blank the canvas, and clamps the
// resulting camera state into zoom and world bounds.
export function createCamera({ x = -360, y = 0, zoom = 0.78 } = {}) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(zoom) || zoom <= 0) {
    throw new Error('camera: x, y, and zoom must be finite numbers with zoom > 0');
  }
  return {
    x: clamp(x, WORLD_BOUNDS.minX, WORLD_BOUNDS.maxX),
    y: clamp(y, WORLD_BOUNDS.minY, WORLD_BOUNDS.maxY),
    zoom: clamp(zoom, MIN_ZOOM, MAX_ZOOM),
  };
}

// Pan: the world center moves inversely to zoom under a fixed screen delta.
export function panCamera(cam, dxScreen, dyScreen) {
  return createCamera({
    x: cam.x - dxScreen / cam.zoom,
    y: cam.y - dyScreen / cam.zoom,
    zoom: cam.zoom,
  });
}

// CHECKS: zoom-at-cursor keeps the world point under the cursor offset (screen
// px from the viewport center) stationary while the scale changes.
export function zoomCameraAt(cam, factor, cursorOffsetX = 0, cursorOffsetY = 0) {
  const nextZoom = clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  const worldX = cam.x + cursorOffsetX / cam.zoom;
  const worldY = cam.y + cursorOffsetY / cam.zoom;
  return createCamera({
    x: worldX - cursorOffsetX / nextZoom,
    y: worldY - cursorOffsetY / nextZoom,
    zoom: nextZoom,
  });
}

// Fit: center the bounds and scale so they land inside a screen margin.
export function fitCameraToBounds(bounds, viewportWidth, viewportHeight, padding = 48) {
  const spanX = bounds.maxX - bounds.minX;
  const spanY = bounds.maxY - bounds.minY;
  return createCamera({
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    zoom: Math.min((viewportWidth - 2 * padding) / spanX, (viewportHeight - 2 * padding) / spanY),
  });
}

// CHECKS: the CSS transform maps world (wx, wy) to
// (w/2 + (wx - cam.x) * zoom, h/2 + (wy - cam.y) * zoom).
export function formatWorldTransform(cam, viewportWidth, viewportHeight) {
  const tx = Math.round(viewportWidth / 2 - cam.x * cam.zoom);
  const ty = Math.round(viewportHeight / 2 - cam.y * cam.zoom);
  return `translate(${tx}px, ${ty}px) scale(${Number(cam.zoom.toFixed(4))})`;
}
