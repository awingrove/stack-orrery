import { describe, it, expect } from 'vitest';
import { finalHop } from '../../js/sim/trace-helpers.js';

// R2a: the one final-hop count surface (finding 3-05 + 5-03 paydown) — the
// full shape matrix as a helper-unit pin: two trace machines terminate
// their walks against it and every panel denominator resolves through it.
// Pure trace-shaped inputs; no engine needed.
describe('finalHop', () => {
  it('finalHop resolves the shape matrix — stage 1..5 nominal and refusal, stage-6 refusal/nx/cdn-HIT/MISS/host/host-less, and nominal for a null trace', () => {
    // NOMINAL table: the served ladders every stage walks today.
    expect(finalHop(1, null)).toBe(4);
    expect(finalHop(2, null)).toBe(5);
    expect(finalHop(3, null)).toBe(6);
    expect(finalHop(4, null)).toBe(7);
    expect(finalHop(5, null)).toBe(8);
    expect(finalHop(6, null)).toBe(9);

    // Refusals are their own shape: stage 1 aborts at the deliver hop (2),
    // stages 2-5 abort at the LB hop (3).
    expect(finalHop(1, { refused: true })).toBe(2);
    expect(finalHop(2, { refused: true })).toBe(3);
    expect(finalHop(3, { refused: true })).toBe(3);
    expect(finalHop(4, { refused: true })).toBe(3);
    expect(finalHop(5, { refused: true })).toBe(3);
    expect(finalHop(6, { refused: true })).toBe(3);

    // Stage 6 splits on the live trace shape.
    expect(finalHop(6, { refused: false, nx: true })).toBe(2);
    expect(finalHop(6, { refused: false, cdn: true, edgeStatus: 'HIT' })).toBe(6);
    expect(finalHop(6, { refused: false, cdn: true, edgeStatus: 'MISS' })).toBe(9);
    expect(finalHop(6, { refused: false, cdn: false, host: 'example.com' })).toBe(9);
    expect(finalHop(6, { refused: false, cdn: false, host: null })).toBe(8);

    // An unknown stage falls back to the trace.js default (4).
    expect(finalHop(9, null)).toBe(4);
    expect(finalHop(9, { dummy: true })).toBe(4);
  });

  // CHECKS: DL-3 counter-example — a refusal is its own shape, not a
  // renumber of the served ladder: the refused total never equals the
  // nominal ladder it aborts.
  it('a refusal reads a different total from the served ladder it aborts (no renumber)', () => {
    for (const stage of [1, 2, 3, 4, 5, 6]) {
      expect(finalHop(stage, { refused: true })).not.toBe(finalHop(stage, null));
    }
  });
});
