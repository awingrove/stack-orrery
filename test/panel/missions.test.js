import { describe, it, expect } from 'vitest';
import { MISSIONS, missionStatuses } from '../../js/panel/missions.js';

// B-2 pure contracts (brief §3): registry shape, per-stage detector pins —
// including both named counter-examples (405 vs the 404 mission, origin
// cache HIT vs the edge-HIT mission) — the cleared-verified-set state pin,
// and the progress-text pin. The DOM side lives in e2e/missions.spec.js.
// Titles are manifest refs (PANEL slice tests) — do not reword.

const FIRST = (stage, snapshot, verified) =>
  missionStatuses(stage, snapshot, verified).find((s) => s.id === 'm1-404');

describe('missions registry and statuses', () => {
  // B-6 (stage-1 recovery) and B-6b (stage-2 failover): stage 1 carries
  // four; the failover mission raises stage 2 from two to three, and the
  // stage-2 cap extends to four in the same change. B-6c (cache bypass):
  // the bypass-cold mission raises stage 3 from three to four too.
  it('stages 1 and 3 carry four; stages 2 and 4-6 carry two to three (B-6 recovery + B-6b failover + B-6c bypass-cold)', () => {
    expect(Object.keys(MISSIONS).map(Number).sort()).toEqual([1, 2, 3, 4, 5, 6]);
    for (const stage of [1, 2, 3, 4, 5, 6]) {
      expect(MISSIONS[stage].length, `stage ${stage} mission count floor`).toBeGreaterThanOrEqual(
        2,
      );
      expect(MISSIONS[stage].length, `stage ${stage} mission count cap`).toBeLessThanOrEqual(
        stage === 1 || stage === 2 || stage === 3 ? 4 : 3,
      );
      expect(new Set(MISSIONS[stage].map((m) => m.id)).size, `stage ${stage} unique ids`).toBe(
        MISSIONS[stage].length,
      );
      for (const mission of MISSIONS[stage]) {
        expect(typeof mission.id).toBe('string');
        expect(mission.goal.trim().length, mission.id).toBeGreaterThan(0);
        expect(typeof mission.detect).toBe('function');
        expect(typeof mission.progress).toBe('function');
        expect(mission.url === undefined || typeof mission.url === 'string').toBe(true);
        // progress is snapshot-derived text, not markup: one line, no throw.
        expect(() => mission.progress({ tick: 4 })).not.toThrow();
        expect(mission.progress({ tick: 4 }).includes('\n')).toBe(false);
      }
    }
  });

  it('pins the two brief missions — the stage-1 404 with /missing and the stage-6 edge HIT with cd.example.com/about', () => {
    expect(MISSIONS[1].find((m) => m.id === 'm1-404')).toMatchObject({
      goal: 'Get a 404 for a missing path',
      url: '/missing',
    });
    expect(MISSIONS[6].find((m) => m.id === 'm6-edge-hit')).toMatchObject({
      goal: 'Serve an edge HIT at the CDN',
      url: 'cd.example.com/about',
    });
  });

  it('the stage-1 404 mission completes only on a real 404 — a 405 does not', () => {
    const verified = new Map();
    // Positive: a real 404 from the server's own unknown-path branch.
    const hit = FIRST(
      1,
      { tick: 6, lastExchange: { status: 404, request: 'GET /missing' } },
      verified,
    );
    expect(hit.done).toBe(true);
    expect(hit.completedTick).toBe(6);
    // Named counter-example: the wrong-METHOD branch answers 405 — the
    // wrong-path mission checks status === 404, so nothing completes.
    const statuses405 = missionStatuses(
      1,
      { tick: 8, lastExchange: { status: 405, request: 'POST /about' } },
      verified,
    );
    const missed405 = statuses405.find((s) => s.id === 'm1-404');
    expect(missed405.done).toBe(false);
    expect(missed405.completedTick).toBe(null);
    // The 405 is real sim state in its own right — its own mission reads it.
    expect(statuses405.find((s) => s.id === 'm1-405').done).toBe(true);
    // The same goes for any other non-2xx-or-2xx status: a plain 200 is
    // not a missing-path answer.
    expect(
      missionStatuses(
        1,
        { tick: 9, lastExchange: { status: 200, request: 'GET /' } },
        verified,
      ).find((s) => s.id === 'm1-404').done,
    ).toBe(false);
  });

  // CHECKS (B-6b): the failover mission's two legs — the snapshot counted a
  // real skip AND 10.12 is serving again after it; either leg alone keeps
  // the chip pending (a served count from before the fault is not a rejoin
  // the detector can credit while the skip leg is zero, and while the
  // backend is down its count cannot grow).
  it('the stage-2 failover mission completes only after a skip AND 10.12 serves again — either leg alone stays pending', () => {
    const verified = new Map();
    const skipOnly = missionStatuses(
      2,
      { tick: 5, skippedCount: 2, loadBalancer: { perBackend: { 10.11: 3, 10.12: 0 } } },
      verified,
    );
    expect(skipOnly.find((s) => s.id === 'm2-failover').done).toBe(false);
    const servedNoSkip = missionStatuses(
      2,
      { tick: 6, skippedCount: 0, loadBalancer: { perBackend: { 10.11: 1, 10.12: 2 } } },
      verified,
    );
    expect(servedNoSkip.find((s) => s.id === 'm2-failover').done).toBe(false);
    const done = missionStatuses(
      2,
      { tick: 9, skippedCount: 2, loadBalancer: { perBackend: { 10.11: 3, 10.12: 1 } } },
      verified,
    );
    expect(done.find((s) => s.id === 'm2-failover').done).toBe(true);
    expect(done.find((s) => s.id === 'm2-failover').completedTick).toBe(9);
  });

  // CHECKS (B-6c): the bypass-cold mission's two legs — the bypass leg
  // reads the pool's own origin-path tally (the cache's counters freeze
  // while bypassed, so nothing on the cache itself proves the fault ran)
  // and the rejoin leg reads a real HIT on the newest exchange. A bypassed
  // tally with no restored exchange behind it carries only BYPASSED
  // verdicts while the fault is on, and a HIT with no bypass behind it
  // fails the tally leg.
  it('the stage-3 bypass-cold mission completes only after bypass AND a fresh HIT — either leg alone stays pending', () => {
    const verified = new Map();
    // A HIT with no bypass behind it fails the tally leg.
    const hitNoBypass = missionStatuses(
      3,
      { tick: 4, bypassedCount: 0, lastExchange: { cacheStatus: 'HIT', status: 200 } },
      verified,
    );
    expect(hitNoBypass.find((s) => s.id === 'm3-bypass-cold').done).toBe(false);
    // While bypassed every exchange is a BYPASSED verdict — the named
    // counter-example: the tally alone satisfies neither leg (no HIT yet).
    const bypassOnly = missionStatuses(
      3,
      { tick: 7, bypassedCount: 9, lastExchange: { cacheStatus: 'BYPASSED', status: 200 } },
      verified,
    );
    expect(bypassOnly.find((s) => s.id === 'm3-bypass-cold').done).toBe(false);
    // Positive on both legs: the bypass ran earlier and the restored pool
    // has since answered a fresh HIT — the same completed shape the B-6
    // recovery mission latches on.
    const completed = missionStatuses(
      3,
      { tick: 8, bypassedCount: 9, lastExchange: { cacheStatus: 'HIT', status: 200 } },
      verified,
    );
    expect(completed.find((s) => s.id === 'm3-bypass-cold').done).toBe(true);
    expect(completed.find((s) => s.id === 'm3-bypass-cold').completedTick).toBe(8);
  });

  it('the stage-6 edge-HIT mission completes only on trace edgeStatus HIT — an origin cache HIT does not', () => {
    const verified = new Map();
    // Named counter-example: the MISS pull rode a warm origin Cache 10.20
    // (cacheStatus HIT inside the origin chain), but the edge's own answer
    // was a MISS — the ledger lookup, not the origin tier, is the referee.
    const miss = missionStatuses(
      6,
      {
        tick: 12,
        trace: { cacheStatus: 'HIT', edgeStatus: 'MISS', path: '/about' },
        cdn: { fills: 1 },
      },
      verified,
    ).find((s) => s.id === 'm6-edge-hit');
    expect(miss.done).toBe(false);
    expect(miss.completedTick).toBe(null);
    // Mission the same with no edge answer recorded at all yet.
    expect(
      missionStatuses(
        6,
        {
          tick: 13,
          trace: { cacheStatus: 'HIT', edgeStatus: null, path: '/about' },
          cdn: { fills: 1 },
        },
        verified,
      ).find((s) => s.id === 'm6-edge-hit').done,
    ).toBe(false);
    // Positive: the edge's own verdict — `trace.edgeStatus === 'HIT'`.
    const hit = missionStatuses(
      6,
      {
        tick: 14,
        trace: { cacheStatus: 'HIT', edgeStatus: 'HIT', path: '/about' },
        cdn: { fills: 2 },
      },
      verified,
    ).find((s) => s.id === 'm6-edge-hit');
    expect(hit.done).toBe(true);
    expect(hit.completedTick).toBe(14);
  });

  // CHECKS (B-6 named counter-example): the recovery mission completes only
  // on a served 200 AFTER a refusal — the refusal alone satisfies neither
  // leg (the sim's lastStatus stays null across a refusal), and a 200
  // without a refusal behind it fails the refusedCount leg.
  it('the stage-1 recovery mission completes only after a refusal AND a served 200 — a refusal alone satisfies neither leg', () => {
    const verified = new Map();
    const RECOVERY = 'm1-refuse-recover';
    // A refusal record carries no HTTP status, so the existing 404/405
    // detectors cannot be satisfied by one either.
    const refusedOnly = missionStatuses(
      1,
      { tick: 5, refusedCount: 2, lastExchange: null },
      verified,
    );
    expect(refusedOnly.find((s) => s.id === RECOVERY).done).toBe(false);
    expect(refusedOnly.find((s) => s.id === 'm1-404').done).toBe(false);
    expect(refusedOnly.find((s) => s.id === 'm1-405').done).toBe(false);
    // Positive on both legs is required: a 200 with no refusal behind it
    // fails the refusedCount leg.
    expect(
      missionStatuses(
        1,
        { tick: 8, refusedCount: 0, lastExchange: { status: 200, request: 'GET /' } },
        verified,
      ).find((s) => s.id === RECOVERY).done,
    ).toBe(false);
    const done = missionStatuses(
      1,
      { tick: 9, refusedCount: 2, lastExchange: { status: 200, request: 'GET /' } },
      verified,
    ).find((s) => s.id === RECOVERY);
    expect(done.done).toBe(true);
    expect(done.completedTick).toBe(9);
  });

  it('verification latches: a done mission does not un-verify while the clock runs', () => {
    const verified = new Map([['m1-404', 6]]);
    // Forty crowd ticks later the last exchange is some plain 200, but the
    // stored completion wins over what the snapshot now says.
    const later = { tick: 46, lastExchange: { status: 200, request: 'GET /' }, queueDepth: 3 };
    expect(FIRST(1, later, verified)).toMatchObject({ done: true, completedTick: 6 });
  });

  it('a fresh verified set flips missions back to pending and the completing tick is forgotten', () => {
    const verified = new Map([['m1-404', 6]]);
    expect(FIRST(1, { tick: 6, lastExchange: { status: 404 } }, verified).done).toBe(true);
    // Stage switch = a fresh Map (session-only memory): with the old
    // evidence out of the snapshot the mission reads pending again and has
    // no completing tick at all.
    const reset = FIRST(1, { tick: 0, lastExchange: null }, new Map());
    expect(reset).toMatchObject({ done: false, completedTick: null });
  });

  it('pending progress text reads the snapshot field the detector reads', () => {
    // The edge mission pending readout carries the edge's own fill counter.
    const edge = missionStatuses(
      6,
      { tick: 3, trace: { edgeStatus: null }, cdn: { fills: 2 } },
      new Map(),
    ).find((s) => s.id === 'm6-edge-hit');
    expect(edge.done).toBe(false);
    expect(edge.progress).toBe('fills: 2');
    // The dns mission's progress counts the same lookups its detect reads.
    const dns = missionStatuses(6, { tick: 3, dns: { lookups: 2 } }, new Map()).find(
      (s) => s.id === 'm6-dns',
    );
    expect(dns.done).toBe(true);
    expect(dns.progress).toBe('lookups: 2');
    const zero = missionStatuses(
      6,
      { tick: 3, trace: { edgeStatus: null }, dns: { lookups: 0 }, cdn: { fills: 0 } },
      new Map(),
    );
    expect(zero.find((s) => s.id === 'm6-dns')).toMatchObject({
      done: false,
      progress: 'lookups: 0',
    });
    expect(zero.find((s) => s.id === 'm1-404')).toBeUndefined(); // stage 6 only
    const stage1 = missionStatuses(1, { tick: 0, queueDepth: 5 }, new Map());
    expect(stage1.find((s) => s.id === 'm1-404').progress).toBe('last: —');
    expect(stage1.find((s) => s.id === 'm1-queue-climb')).toMatchObject({
      done: false,
      progress: 'depth: 5',
    });
  });

  it('an unknown stage returns an empty list without throwing', () => {
    for (const stage of [0, 7, 9, 42, '9', 'bogus', undefined, null]) {
      expect(() => missionStatuses(stage, { tick: 1 }, new Map())).not.toThrow();
      expect(missionStatuses(stage, { tick: 1 }, new Map())).toEqual([]);
    }
  });
});
