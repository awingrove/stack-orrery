// DOCUMENTS: orrery SVG drawing — one concentric ring per architectural
// layer (r_k = k * ringGap), one spoke per projected wire, and one satellite
// dot per client-ring browser slot. Split from viewport.js by
// responsibility (guard-file-size): viewport.js owns the camera and world
// positioning; this module turns a layout into the #orrery-svg picture.
const SVG_NS = 'http://www.w3.org/2000/svg';

export function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export function drawOrrery(svg, layout) {
  const parts = [svgEl('circle', { cx: 0, cy: 0, r: 10, class: 'orrery-core' })];
  for (const ring of layout.rings) {
    parts.push(svgEl('circle', { cx: 0, cy: 0, r: ring.radius, class: 'orrery-ring' }));
  }
  for (const wire of layout.wires) {
    parts.push(
      svgEl('line', {
        x1: wire.x1,
        y1: wire.y1,
        x2: wire.x2,
        y2: wire.y2,
        class: 'orrery-spoke',
      }),
    );
  }
  for (const sat of layout.satellites) {
    parts.push(
      svgEl('circle', {
        cx: sat.x,
        cy: sat.y,
        r: 6,
        class: 'orrery-satellite',
        'data-index': sat.index,
      }),
    );
  }
  svg.replaceChildren(...parts);
}
