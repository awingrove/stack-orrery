// DOCUMENTS: the B-6 fault flip setters, extracted by responsibility
// (guard-file-size; the engine-pool.js precedent — same wiring, same
// fail-loud routes). Each setter routes to the faulted component's OWN
// state: setServerDown to the addressed webserver's setDown, setCacheBypassed
// to the shared cache's setBypass, setDatabasePrimaryDown (B-6d) to the
// database's setPrimaryDown. Nothing here narrates or caches state — every
// visible fault reads back from the fresh engine snapshot.
export function createFaultSetters({ stage, servers, cache, database }) {
  return {
    // CHECKS: setServerDown routes the B-6 fault flip to the matching
    // server address — unknown mini-IP throws (fail-loud, same rule as
    // setWebFile); the boolean is validated by webserver.setDown. The
    // transport consults the flag on the next wire crossing only.
    setServerDown(address, down) {
      const server = servers.find((s) => s.address === address);
      if (!server) {
        throw new Error(`engine: setServerDown — no server at mini-IP ${address}`);
      }
      server.setDown(down);
    },

    // CHECKS: B-6c — the fault flip routes into the cache's own setBypass;
    // no cache exists below stage 3, so the flip fails loud there.
    setCacheBypassed(bypassed) {
      if (!cache) throw new Error(`engine: setCacheBypassed — stage ${stage} has no Cache`);
      cache.setBypass(bypassed);
    },

    // CHECKS: B-6d — the flip routes into the database's own setPrimaryDown
    // (boolean validated there, fail-loud); no database exists below stage
    // 4, so the flip fails loud there. The write consult rides the
    // webserver's write branch on the next POST only; reads, replication,
    // and the async /jobs branch never consult the flag.
    setDatabasePrimaryDown(down) {
      if (!database) {
        throw new Error(`engine: setDatabasePrimaryDown — stage ${stage} has no Database`);
      }
      database.setPrimaryDown(down);
    },
  };
}
