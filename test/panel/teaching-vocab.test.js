import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createEngine } from '../../js/sim/engine.js';
import { describeSnapshot } from '../../js/panel/model.js';
import { STAGE_TEACHING } from '../../js/panel/teaching.js';
import { TRACE_VOCAB } from '../../js/sim/trace-helpers.js';
import { DEFAULT_REPLICATION_LAG_TICKS } from '../../js/sim/defaults.js';

// DOCUMENTS: round-trip pin for full-review finding 5-02 — the teaching
// drawer's quoted sim fragments interpolate TRACE_VOCAB, and this suite
// walks each stage's engine in the test/sim/engine.test.js traceHop shape,
// then checks every TRACE_VOCAB token that stage's drawer entry quotes
// against that walk's output: each hop's raw frame plus the panel's
// rendered labels for the same snapshot (describeSnapshot — the drawer
// quotes both surfaces: a wire frame such as the DNS ask, and a
// hop-status/stats label such as STALE (lag 3t) or Routed:). A reworded
// machine token fails these pins until TRACE_VOCAB is fixed, and the bound
// drawer follows that fix without re-authoring the sentence.

const hopText = (snap) =>
  [
    snap.lastFrame ?? '',
    ...Object.values(describeSnapshot(snap)).filter((value) => typeof value === 'string'),
  ].join(' · ');

// One walk = a scripted sequence of traceHop emissions (the engine.test.js
// canonical per-stage shape); the walk text concatenates every hop's frame
// and rendered labels in hop order.
function walk(engine, emissions) {
  return emissions.map((args) => hopText(engine.traceHop(args))).join('\n');
}

const hops = (count) => Array.from({ length: count }, () => ({}));

const STAGE_WALKS = {
  1: () => walk(createEngine({ stage: 1 }), hops(4)),
  2: () => walk(createEngine({ stage: 2 }), hops(5)),
  3: () => walk(createEngine({ stage: 3 }), hops(6)),
  // Stage 4 walks the drawer's own story: a POST write, then a GET
  // immediately after — the replica read inside the lag window is the
  // stale SELECT the drawer's "STALE (lag 3t)" quote names.
  4: () => {
    const engine = createEngine({ stage: 4 });
    return [
      walk(engine, [{ method: 'POST', path: '/about' }, ...hops(6)]),
      walk(engine, hops(7)),
    ].join('\n');
  },
  5: () => walk(createEngine({ stage: 5 }), [{ method: 'POST', path: '/jobs' }, ...hops(7)]),
  6: () => {
    const engine = createEngine({ stage: 6 });
    return [
      walk(engine, [{ path: 'example.com/about' }, ...hops(8)]),
      walk(engine, [{ path: 'cd.example.com/about' }, ...hops(8)]),
    ].join('\n');
  },
};

// The fault walks the vocabulary export also names (refusal card, LB skip,
// NX answer) — walked alongside the six canonical stages by the
// export-side pin below.
function faultWalks() {
  const refused = createEngine({ stage: 1 });
  refused.setServerDown('10.1', true);
  const oneDown = createEngine({ stage: 2 });
  oneDown.setServerDown('10.11', true);
  const nx = createEngine({ stage: 6 });
  return {
    refusal: walk(refused, hops(2)),
    skip: walk(oneDown, hops(3)),
    nx: walk(nx, [{ path: 'missing-host.example/about' }, {}]),
  };
}

// Canonical interpolation args — the same values teaching.js binds at each
// quoted fragment (the token strings themselves are read from TRACE_VOCAB,
// so a reworded token changes what the pins look for).
const CANONICAL_ARGS = {
  requestToken: [],
  staleTag: [DEFAULT_REPLICATION_LAG_TICKS],
  skipSuffix: ['10.11'],
  dnsAsk: ['example.com'],
  accepted202: [1],
  workerCommit: ['10.41', '10.30'],
};
const tokenValue = (name) => {
  const token = TRACE_VOCAB[name];
  return typeof token === 'function' ? token(...(CANONICAL_ARGS[name] ?? [])) : token;
};

// The fragments teaching.js interpolates (brief contract 2) — pinned at the
// source level because a hand-copied literal would round-trip today and go
// stale on the next reword, which the round-trip comparison alone cannot
// tell apart from a bound token.
const BOUND_IN_DRAWER = [
  'requestToken',
  'nextChipPrefix',
  'staleTag',
  'accepted202',
  'workerCommit',
  'dnsAsk',
  'routedToken',
];

describe('every quoted sim fragment in the teaching tables appears verbatim in a real walk of that stage — the drawer cannot go stale silently', () => {
  const stageWalks = Object.fromEntries(
    Object.entries(STAGE_WALKS).map(([stage, run]) => [stage, run()]),
  );

  for (const stage of [1, 2, 3, 4, 5, 6]) {
    it(`stage ${stage}: every TRACE_VOCAB token its drawer entry quotes appears verbatim in that stage's walk`, () => {
      const drawer = JSON.stringify(STAGE_TEACHING[stage]);
      const text = stageWalks[stage];
      expect(text.length, `stage ${stage} walk output`).toBeGreaterThan(0);
      const quoted = Object.keys(TRACE_VOCAB)
        .map(tokenValue)
        .filter((value) => drawer.includes(value));
      for (const value of quoted) {
        expect(
          text.includes(value),
          `stage ${stage} drawer quotes "${value}" — the walk must mint it verbatim`,
        ).toBe(true);
      }
    });
  }

  // CHECKS: the export side — every TRACE_VOCAB value is minted verbatim
  // by some real walk (the six canonical stage walks plus the refusal,
  // LB-skip, and NX fault walks), so the vocabulary export names machine
  // output; a reworded token fails here even where no drawer entry
  // quotes it yet.
  it('every TRACE_VOCAB token is minted verbatim by a real walk', () => {
    const faulted = faultWalks();
    const corpus = [
      ...Object.values(STAGE_WALKS).map((run) => run()),
      ...Object.values(faulted),
    ].join('\n');
    for (const name of Object.keys(TRACE_VOCAB)) {
      const value = tokenValue(name);
      expect(corpus.includes(value), `TRACE_VOCAB.${name} = "${value}"`).toBe(true);
    }
  });

  // CHECKS: the binding itself — teaching.js interpolates TRACE_VOCAB at
  // every quoted sim fragment named in the round-trip pin, so the drawer
  // follows a token fix instead of carrying a hand-copied literal.
  it('the drawer binds TRACE_VOCAB at every quoted sim fragment', () => {
    const source = readFileSync('js/panel/teaching.js', 'utf8');
    for (const name of BOUND_IN_DRAWER) {
      expect(source.includes(`TRACE_VOCAB.${name}`), `teaching.js binds ${name}`).toBe(true);
    }
  });
});
