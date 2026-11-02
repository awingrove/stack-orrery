// DOCUMENTS: Stage-6 hop sentences, split from model.js by responsibility
// (guard-file-size): model.js keeps the label assembly and re-exports the
// pure stage-5 chain parts (model-stage5-chain.js owns them); this module
// owns the two prelude sentences and the
// three hosted shapes behind the DNS answer — the plain subnet-10 chain
// (byte-identical renumber), the Stage-6b CDN chain (HIT = 6 / MISS or
// pass-through = 9), and the NX refusal. Exported for the narrative pins in
// test/panel/model-stage6.test.js.
import { withHopPrefix } from './model.js';
import { stage5ChainParts } from './model-stage5-chain.js';
import { finalHop } from '../sim/trace-helpers.js';

// The CDN chain's sentences are the miss shape, rebranched on edgeStatus:
// the ledger-fill sentence exists only on a MISS (named counter-example,
// pinned in test/panel/model-stage6.test.js — the HIT shape must not
// mention a fill and the pass-through shape must not mention the ledger).
function cdnChainParts(snapshot, from, t) {
  const edge = snapshot.cdn ?? {};
  const edgeAddress = edge.address ?? '20.1';
  const edgeOrigin = edge.originAddress ?? '10.1';
  const routerAddress = snapshot.router?.address ?? '10.65';
  const dnsAddress = snapshot.dns?.address ?? '10.60';
  const target = t.targetServer ?? '10.11';
  const ask = `Browser (${from}) -> DNS (${dnsAddress}): who is ${t.host}?`;
  const answer = `DNS (${dnsAddress}) -> Browser (${from}) answers ${t.dnsTarget ?? edgeAddress}`;
  const forward = `Browser (${from}) -> Router (${routerAddress}): ${t.request} to ${edgeAddress} (one router hop)`;
  if (t.edgeStatus === 'HIT') {
    return [
      ask,
      answer,
      forward,
      `CDN edge (${edgeAddress}) -> Router (${routerAddress}): "${t.response}" (edge HIT — ledger bytes, no origin traffic)`,
      `Router (${routerAddress}) -> Browser (${from}): "${t.response}" delivered (one router hop)`,
      `Browser (${from}) received and displayed ${t.status}`,
    ];
  }
  const pull = `CDN edge (${edgeAddress}) -> LoadBalancer (${edgeOrigin}): ${t.request} (edge pull via router)`;
  const announce =
    t.edgeStatus === 'PASS'
      ? `CDN edge (${edgeAddress}): ${t.method} ${t.path} is not edge-cacheable — pulling origin ${edgeOrigin}`
      : `CDN edge (${edgeAddress}): MISS on ${t.path} — pulling origin ${edgeOrigin} via the Router`;
  const filledAt = (snapshot.cdn?.ledger ?? []).find((row) => row.path === t.path);
  return [
    ask,
    answer,
    forward,
    announce,
    pull,
    `LoadBalancer (${edgeOrigin}) -> ${target} queue`,
    `WebServer (${target}) -> Router (${routerAddress}): "${t.response}" (cache ${t.cacheStatus})`,
    // CHECKS: the fill sentence carries the ledger row's own TTL and exists
    // only when the snapshot really holds the filled entry — a HIT renders
    // its prelude above and its ledger row is never re-written here.
    t.edgeStatus === 'PASS'
      ? `CDN edge (${edgeAddress}) passed "${t.response}" through to Browser (${from}) — no fill (non-GET)`
      : `CDN edge (${edgeAddress}) filled ${t.path} (ttl ${filledAt?.ttlRemaining ?? '?'}t) and delivered "${t.response}" to Browser (${from})`,
    `Browser (${from}) received and displayed ${t.status}`,
  ];
}

// The one LB refusal card, byte-identical to the stages 1-5 machines' card
// (model.js) — the pool is all-down, nothing enqueued, nothing served.
const lbRefusalCard = (lbAddress) =>
  `LoadBalancer (${lbAddress}): connection refused — the pool is all-down, nothing enqueued, nothing served`;

// CHECKS: R2a reopen — the three stage-6 refusal shapes narrate the abort
// at their own landing hop, not a replay of the served ladder and not one
// lumped refusal number — the walk evidence (docs/plans/2026-11-02-
// r2a-finalhop-seam.md) fixes host-less at 3 (emit, routed, card), hosted
// at 4 (the DNS ask/answer prelude and the routed hop precede the card),
// cdn at 6 (the pull chain runs to the LB hop before the card). DL-3
// counter-example: a PASS-shaped pull refuses through the same 6-sentence
// shape and a refusal never names a served body, a queue, or a render.
// Parity rule: the sim walk aborts where these totals read — pinned
// engine-side in test/sim/final-hop.test.js's engine-walk matrix.
function refusalParts(snapshot, from, serverAddress, t) {
  const edge = snapshot.cdn ?? {};
  const edgeAddress = edge.address ?? '20.1';
  const edgeOrigin = edge.originAddress ?? '10.1';
  const routerAddress = snapshot.router?.address ?? '10.65';
  const dnsAddress = snapshot.dns?.address ?? '10.60';
  const routed = `Network (10.x) routes to LoadBalancer (${serverAddress})`;
  const card = lbRefusalCard(serverAddress);
  if (!t.cdn) {
    const ask = `Browser (${from}) -> DNS (${dnsAddress}): who is ${t.host}?`;
    const answer = `DNS (${dnsAddress}) -> Browser (${from}) answers ${t.dnsTarget ?? '10.1'}`;
    return t.host
      ? [ask, answer, routed, card]
      : [`Browser (${from}) emits "${t.request}"`, routed, card];
  }
  return [
    `Browser (${from}) -> DNS (${dnsAddress}): who is ${t.host}?`,
    `DNS (${dnsAddress}) -> Browser (${from}) answers ${t.dnsTarget ?? edgeAddress}`,
    `Browser (${from}) -> Router (${routerAddress}): ${t.request} to ${edgeAddress} (one router hop)`,
    t.edgeStatus === 'PASS'
      ? `CDN edge (${edgeAddress}): ${t.method} ${t.path} is not edge-cacheable — pulling origin ${edgeOrigin}`
      : `CDN edge (${edgeAddress}): MISS on ${t.path} — pulling origin ${edgeOrigin} via the Router`,
    `CDN edge (${edgeAddress}) -> LoadBalancer (${edgeOrigin}): ${t.request} (edge pull via router)`,
    lbRefusalCard(edgeOrigin),
  ];
}

export function stage6Sentences(snapshot, from, serverAddress) {
  const t = snapshot.trace ?? {};
  if (t.refused) {
    return withHopPrefix(refusalParts(snapshot, from, serverAddress, t), finalHop(6, t));
  }
  const parts = stage5ChainParts(snapshot, from, serverAddress);
  if (!t.host) {
    // Host-less counter-example: GET /about keeps the stage-5 story whole.
    // The denominator is the shared helper's read (R2a: one count surface).
    return withHopPrefix(parts, finalHop(6, t));
  }
  if (t.cdn) {
    // CHECKS: the CDN shapes count their own hops — 6 for an edge HIT, 9
    // for a MISS or non-GET pass-through (the pass-through rides the MISS
    // shape's origin leg without touching the ledger). The helper resolves
    // both from the trace's own edgeStatus.
    return withHopPrefix(cdnChainParts(snapshot, from, t), finalHop(6, t));
  }
  const dnsAddress = snapshot.dns?.address ?? '10.60';
  const ask = `Browser (${from}) -> DNS (${dnsAddress}): who is ${t.host}?`;
  if (t.nx) {
    const answer = `DNS (${dnsAddress}) -> Browser (${from}): NX no record — no GET emitted`;
    return withHopPrefix([ask, answer], finalHop(6, t));
  }
  const answer = `DNS (${dnsAddress}) -> Browser (${from}) answers ${t.dnsTarget ?? '10.1'}`;
  // Hosted = 9 hops: ask + answer, then the stage-5 wire chain renumbered.
  return withHopPrefix([ask, answer, ...parts.slice(1)], finalHop(6, t));
}
