// DOCUMENTS: the two-number mini-IP wire vocabulary and the Stage 6
// topology's seat addresses — one home each instead of per-module copies.
// MINI_IP is the `/^\d+\.\d+$/` truth table the construction checks test
// against; each leaf keeps its own per-call throw message, so only the
// regex home moves. assertMiniIp is the shared fail-loud option check for
// leaves that want the standard message shape (webserver's R1b message
// rides the 'webserver' label byte-identically).
//
// CHECKS: this file owns (1) the two-number mini-IP modeling rule
// (AGENTS.md: addresses are <net>.<host>, never dotted-quads), and (2) the
// topology-literal home for the Stage 6 seats. The R2b walk that scoped
// this home counted 8 regex copies (7 named `const MINI_IP` literals plus
// browser.js's inline literal) and 2 local `subnetOf` copies, and 3
// address-pair literals (engine.js's router-left '10.65' / router-right
// '20.254' / cdn '20.1' against router.js's left/right seats and cdn.js's
// address default) — those values live only here. Three more inline
// construction-check literals (cache.js, database.js, queue.js) that the
// walk's first pass missed consume the same home, and webserver.js keeps
// its inline default at its 300-line cap (inspector-source displays that
// code verbatim). A send to an unregistered mini-IP still fails loud at
// the wire; nothing in this file narrates or validates anything else.
export const MINI_IP = /^\d+\.\d+$/;

export function assertMiniIp(address, label) {
  if (!MINI_IP.test(address)) {
    throw new Error(`${label ?? 'address'}: address must be a mini-IP, got ${address}`);
  }
}

export const subnetOf = (address) => String(address).split('.')[0];

// Stage 6b topology seats: the router's left/right identity and the CDN
// edge's address — engine.js and router.js default from these, cdn.js
// default reads CDN_ADDRESS, and inspector-state.js's zero-state
// fallbacks are the panel-side mirrors of the same numbers.
export const ROUTER_LEFT_ADDRESS = '10.65';
export const ROUTER_RIGHT_ADDRESS = '20.254';
export const CDN_ADDRESS = '20.1';
