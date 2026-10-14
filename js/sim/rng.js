// DOCUMENTS: mulberry32 — a tiny seeded PRNG. Every random decision in
// js/sim/** comes from here; `Math.random()` is banned in the simulator
// (AGENTS.md determinism rule) so a fixed seed replays the identical run.
export function createRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
