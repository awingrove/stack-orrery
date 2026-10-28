// DOCUMENTS: the panel's shareable URL state — deep-linked ?stage=N&users=U
// read once at load and rewritten in place on stage/user changes — split
// from panel.js by responsibility (guard-file-size). Pure URL reads and
// writes: no engine access, no DOM writes beyond the location itself.
// CHECKS: deep-linked state reads exactly once at load — ?stage=N selects a
// live stage 1-6 and ?users=U clamps into the slider's 1-50 range; anything
// unknown, out of range, or non-numeric falls back to the fresh-load
// defaults (Stage 1, five users) without a console error. Named
// counter-example (pinned in e2e/panel.spec.js): ?stage=9 renders Stage 1 —
// out-of-range values must not crash or half-select a pill.
export function readDeepLink() {
  const params = new URLSearchParams(window.location.search);
  const stage = Number.parseInt(params.get('stage') ?? '', 10);
  const users = Number.parseFloat(params.get('users') ?? '');
  return {
    stage: stage >= 1 && stage <= 6 ? stage : 1,
    users: Number.isFinite(users) ? Math.min(50, Math.max(1, Math.round(users))) : 5,
  };
}

// CHECKS: stage-pill clicks and user-slider commits rewrite the URL in place
// via history.replaceState — the shareable state tracks the panel without
// pushing history entries (no history spam). Existing params are preserved.
export function syncUrlState(currentStage, usersValue) {
  const params = new URLSearchParams(window.location.search);
  params.set('stage', String(currentStage));
  params.set('users', usersValue);
  window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
}
