import { describe, it, expect } from 'vitest';
import { finalHop } from '../../js/sim/trace-helpers.js';
import { createEngine } from '../../js/sim/engine.js';

// R2a: the one final-hop count surface (finding 3-05 + 5-03 paydown) — the
// full shape matrix as a helper-unit pin: two trace machines terminate
// their walks against it and every panel denominator resolves through it.
// Pure trace-shaped inputs; no engine needed.
describe('finalHop', () => {
  it('finalHop resolves the shape matrix — stage 1..5 nominal and refusal, stage-6 refusal at host-less 3 / hosted 4 / cdn 6, nx 2, cdn HIT 6 / MISS 9, host 9, host-less 8, and nominal for a null trace', () => {
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

    // Stage 6 splits on the live trace shape. The refusal lands where each
    // shape's own LB hop sits (the reopened probe walks): host-less card at
    // 3, hosted card at 4 (two DNS prelude hops + the routed hop before
    // it), cdn card at 6 (the pull chain runs to the LB hop).
    expect(finalHop(6, { refused: true, cdn: false, host: null })).toBe(3);
    expect(finalHop(6, { refused: true, cdn: false, host: 'example.com' })).toBe(4);
    expect(finalHop(6, { refused: true, cdn: true })).toBe(6);
    expect(finalHop(6, { refused: false, nx: true })).toBe(2);
    expect(finalHop(6, { refused: false, cdn: true, edgeStatus: 'HIT' })).toBe(6);
    expect(finalHop(6, { refused: false, cdn: true, edgeStatus: 'MISS' })).toBe(9);
    expect(finalHop(6, { refused: false, cdn: true, edgeStatus: 'PASS' })).toBe(9);
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
    for (const stage of [1, 2, 3, 4, 5]) {
      expect(finalHop(stage, { refused: true })).not.toBe(finalHop(stage, null));
    }
  });
});

// CHECKS: R2a reopen — paper arithmetic against the real machines — real
// createEngine walks with both backends down, one walk per stage-6 shape.
// Each refusal narrates the shared card at its shape's own landing hop
// (engine-walk evidence, not a narrative invention), never replays the
// served ladder, narrates no LB-null phantom (`LB 10.1 -> null` was the
// finding 1-01 residue on the cdn branch), and the call one past the card
// restarts a fresh emission (no phantom re-run of the dead trace).
describe('engine walks (all-down stage-6 refusals)', () => {
  const allDown = () => {
    const engine = createEngine({ seed: 42, stage: 6, users: 5, arrivalProb: 0 });
    engine.setServerDown('10.11', true);
    engine.setServerDown('10.12', true);
    return engine;
  };
  const REFUSAL_CARD = 'LB 10.1 -> 10.11 | GET /about => connection refused (nothing enqueued)';

  it("engine walks confirm the paper arithmetic — all-down refusals land at their shape's own hop: 3 host-less, 4 hosted, 6 cdn (no replay, no [object Object], no LB-null narration)", () => {
    // Host-less: emit, routed, card — aborts at hop 3.
    const hostLess = allDown();
    hostLess.traceHop({ method: 'GET', path: '/about' });
    hostLess.traceHop();
    let snap = hostLess.traceHop();
    expect(snap.trace.hop).toBe(3);
    expect(snap.lastFrame).toBe(REFUSAL_CARD);
    expect(snap.trace.refused).toBe(true);
    expect(snap.lastFrame.includes('[object Object]')).toBe(false);
    const restart = hostLess.traceHop();
    expect(restart.trace.hop).toBe(1);
    expect(restart.trace.refused).toBe(false);
    expect(restart.lastFrame).toBe('10.2 -> 10.1 | GET /about');

    // Hosted: the DNS prelude rides in front — the card lands at hop 4.
    const hosted = allDown();
    hosted.traceHop({ method: 'GET', path: 'example.com/about' });
    hosted.traceHop();
    hosted.traceHop(); // routed to the LoadBalancer
    snap = hosted.traceHop();
    expect(snap.trace.hop).toBe(4);
    expect(snap.lastFrame).toBe(REFUSAL_CARD);
    expect(snap.trace.refused).toBe(true);
    expect(snap.lastFrame.includes('[object Object]')).toBe(false);
    const hostedRestart = hosted.traceHop({ method: 'GET', path: 'example.com/about' });
    expect(hostedRestart.trace.hop).toBe(1);
    expect(hostedRestart.trace.refused).toBe(false);
    expect(hostedRestart.lastFrame).toBe('10.2 -> 10.60 | who is example.com?');

    // CDN: the pull chain runs to the LB hop — the card lands at hop 6,
    // the walk aborts there, and no LB-null frame exists anywhere.
    const cdn = allDown();
    const frames = [];
    for (let call = 1; call <= 6; call++) {
      snap = cdn.traceHop({ method: 'GET', path: 'cd.example.com/about' });
      frames.push(snap.lastFrame);
      expect(snap.trace.hop).toBe(Math.min(call, 6));
    }
    expect(frames).toEqual([
      '10.2 -> 10.60 | who is cd.example.com?',
      '10.60 -> 10.2 | 20.1',
      '10.2 -> 10.65 | GET /about (to 20.1)',
      '20.1 -> 10.65 | MISS — pulling origin 10.1 via router',
      '20.1 -> 10.1 | GET /about (edge pull via router)',
      REFUSAL_CARD,
    ]);
    expect(frames.join('\n')).not.toContain('null');
    expect(frames.join('\n').includes('[object Object]')).toBe(false);
    expect(snap.trace.refused).toBe(true);
    expect(snap.trace.targetServer).toBe(null);
    expect(snap.trace.status).toBe(null);
    const cdnRestart = cdn.traceHop({ method: 'GET', path: '/about' });
    expect(cdnRestart.trace.hop).toBe(1);
    expect(cdnRestart.trace.refused).toBe(false);
    expect(cdnRestart.lastFrame).toBe('10.2 -> 10.1 | GET /about');
  });
});
