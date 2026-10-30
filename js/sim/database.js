// DOCUMENTS: the Stage 4 component — a primary/replica relational store with
// asynchronous tick-based replication. Writes land on the primary Map and are
// queued for the replica with applyAtTick = writtenAtTick + replicationLagTicks;
// reads serve from the replica Map and are flagged stale when the replica row
// lags the primary row's version — a real version comparison on the read
// path, not a probability. Deterministic by construction: no clock, no RNG — time
// arrives as the `currentTick` argument, like every other sim component.
//
// B-6d fault state: setPrimaryDown stores a real on/off flag (isPrimaryDown()
// reads it back) and changes NOTHING about read() or stepReplication() — the
// webserver's write branch consults isPrimaryDown() before every write; while
// the flag holds, write() records a WRITE_DOWN lastOp and its own failedWrites
// tally and touches nothing else (no primary row, no version bump, no
// replication-queue push, no writes counter).
//
// CHECKS: the constructor rejects a primary/replica address that is not a
// two-number mini-IP and a replicationLagTicks that is not a positive integer
// (fail-loud over silent mis-configuration).
const DEFAULT_ROWS = {
  '/': 'Welcome to the home page',
  '/about': 'This is the about page',
};

export function createDatabase({
  primaryAddress = '10.30',
  replicaAddress = '10.31',
  replicationLagTicks = 3,
  rows = DEFAULT_ROWS,
} = {}) {
  for (const [name, address] of [
    ['primaryAddress', primaryAddress],
    ['replicaAddress', replicaAddress],
  ]) {
    if (!/^\d+\.\d+$/.test(address)) {
      throw new Error(`database: invalid mini-IP address ${name}=${address}`);
    }
  }
  if (!Number.isInteger(replicationLagTicks) || replicationLagTicks < 1) {
    throw new Error(
      `database: replicationLagTicks must be a positive integer, got ${replicationLagTicks}`,
    );
  }

  const primary = new Map(); // key -> { key, value, version, updatedAtTick }
  const replica = new Map(); // same row shape; lags the primary while the
  for (const [key, value] of Object.entries(rows)) {
    primary.set(key, { key, value, version: 1, updatedAtTick: 0 });
    replica.set(key, { key, value, version: 1, updatedAtTick: 0 });
  }
  const replicationQueue = []; // FIFO { key, value, version, writtenAtTick, applyAtTick }
  let reads = 0;
  let writes = 0;
  let staleReads = 0;
  let replicated = 0;
  let failedWrites = 0; // B-6d: writes refused while the primary is down
  let primaryDown = false;
  let lastOp = null;

  // Applies every queued entry whose applyAtTick has arrived, oldest first:
  // replica rows move up to the version and value the write carried.
  function stepReplication(currentTick = 0) {
    while (replicationQueue.length > 0 && currentTick >= replicationQueue[0].applyAtTick) {
      const entry = replicationQueue.shift();
      replica.set(entry.key, {
        key: entry.key,
        value: entry.value,
        version: entry.version,
        updatedAtTick: entry.applyAtTick,
      });
      replicated += 1;
    }
  }

  // Reads are served by the replica; stale is a version comparison against
  // the primary, so a read inside the lag window reports the older row.
  function read(key, currentTick = 0) {
    stepReplication(currentTick);
    reads += 1;
    const replicaRow = replica.get(key) ?? null;
    const primaryRow = primary.get(key) ?? null;
    const stale = Boolean(primaryRow && (!replicaRow || replicaRow.version < primaryRow.version));
    if (stale) staleReads += 1;
    lastOp = {
      op: 'SELECT',
      target: replicaAddress,
      key,
      found: Boolean(replicaRow),
      stale,
      atTick: currentTick,
    };
    return {
      found: Boolean(replicaRow),
      value: replicaRow ? replicaRow.value : null,
      version: replicaRow ? replicaRow.version : 0,
      stale,
      source: replicaAddress,
    };
  }

  // Writes land on the primary at the current tick and enter the replication
  // queue; the replica only sees them replicationLagTicks ticks later.
  //
  // CHECKS: B-6d — while the primary is down a write does NOTHING to state:
  // no stepReplication drain, no primary row, no version bump, no
  // replication-queue push, no writes counter. Only lastOp records the
  // refusal (op 'WRITE_DOWN' with its key and tick) and the failedWrites
  // tally moves; read() and stepReplication() never consult the flag.
  function write(key, value, currentTick = 0) {
    if (primaryDown) {
      failedWrites += 1;
      lastOp = { op: 'WRITE_DOWN', target: primaryAddress, key, atTick: currentTick };
      return { refused: true, key, source: primaryAddress };
    }
    stepReplication(currentTick);
    writes += 1;
    const version = (primary.get(key)?.version ?? 0) + 1;
    const applyAtTick = currentTick + replicationLagTicks;
    primary.set(key, { key, value, version, updatedAtTick: currentTick });
    replicationQueue.push({ key, value, version, writtenAtTick: currentTick, applyAtTick });
    lastOp = {
      op: 'WRITE',
      target: primaryAddress,
      key,
      version,
      applyAtTick,
      atTick: currentTick,
    };
    return { key, value, version, applyAtTick, source: primaryAddress };
  }

  // One row per primary key with both sides' versions plus the lag flag the
  // panel's row list highlights on.
  function rowsSnapshot() {
    return [...primary.values()].map((p) => {
      const r = replica.get(p.key) ?? null;
      return {
        key: p.key,
        value: p.value,
        primaryVersion: p.version,
        replicaVersion: r ? r.version : 0,
        updatedAtTick: p.updatedAtTick,
        lagging: Boolean(!r || r.version < p.version),
      };
    });
  }

  function snapshot(currentTick = 0) {
    stepReplication(currentTick);
    return {
      primaryAddress,
      replicaAddress,
      replicationLagTicks,
      reads,
      writes,
      staleReads,
      replicated,
      failedWrites,
      primaryDown,
      lastOp,
      pendingReplication: replicationQueue.length,
      rows: rowsSnapshot(),
    };
  }

  // CHECKS: B-6d — setPrimaryDown validates a real boolean ON/OFF state and
  // throws otherwise (fail-loud over a silently stuck consult); it flips only
  // this component's own flag, which read()/stepReplication() do not consult.
  function setPrimaryDown(nextDown) {
    if (typeof nextDown !== 'boolean') {
      throw new Error(`database: setPrimaryDown — primaryDown must be a boolean, got ${nextDown}`);
    }
    primaryDown = nextDown;
  }

  return {
    get primaryAddress() {
      return primaryAddress;
    },
    get replicaAddress() {
      return replicaAddress;
    },
    stepReplication,
    read,
    write,
    setPrimaryDown,
    isPrimaryDown() {
      return primaryDown;
    },
    snapshot,
  };
}
