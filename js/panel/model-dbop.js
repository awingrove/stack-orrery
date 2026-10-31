// DOCUMENTS: the database-hop sentence shared by the stage-4 7-hop chain
// and the stage-5 synchronous chain (extracted by responsibility,
// guard-file-size; the model-stage6.js precedent — byte-identical output for
// the ops that already shipped). The sentence is minted from the trace
// record's own dbOp: the B-6d WRITE_DOWN refusal while the primary is down,
// a WRITE to the primary, a fresh/stale SELECT from the replica, or the
// warm-cache SKIP.
export function dbOpSentence(
  dbOp,
  { stale = false, primary = '10.30', replica = '10.31', lag = 3, cacheAddress = '10.20' } = {},
) {
  if (dbOp === 'WRITE_DOWN') {
    return `Database WRITE FAILED @ Primary (${primary}) — primary down, nothing written`;
  }
  if (dbOp === 'WRITE') {
    return `Database WRITE @ Primary (${primary}) — replica lags ${lag}t`;
  }
  if (dbOp === 'SELECT') {
    return stale
      ? `Database SELECT @ Replica (${replica}) — STALE (lag ${lag}t)`
      : `Database SELECT @ Replica (${replica}) — fresh`;
  }
  return `Database SKIP — warm cache HIT (${cacheAddress})`;
}
