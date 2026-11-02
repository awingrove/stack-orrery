import { describe, it, expect } from 'vitest';
import { buildRegistry } from '../../js/sim/registry.js';

// DOCUMENTS: R2d read-side contract (brief 2026-11-02-r2d-registry-read-side,
// §Test 1) — the registry rows are the sim's composition knowledge, one
// ordered row list per stage family, accumulated as collected.
describe('buildRegistry', () => {
  it("buildRegistry composes the stage table — stage 1's webserver seat, stage 2..6 row accumulation in sim order, quoted mini-IP keys, and the stage-6 four-row tail (dns/router-left/router-right/cdn-edge)", () => {
    // Stage 1 seat: the 10.1 server has no load balancer in front yet.
    expect(buildRegistry(1)).toEqual([{ address: '10.1', role: 'WebServer' }]);

    // Stage 2 opens the pool base: the LB row supersedes the solo
    // webserver seat and both backends follow.
    const stage2 = buildRegistry(2);
    expect(stage2).toEqual([
      { address: '10.1', role: 'LoadBalancer' },
      { address: '10.11', role: 'WebServer-1' },
      { address: '10.12', role: 'WebServer-2' },
    ]);

    // Stage 3 grows the stage-2 table with the Cache row — rows in the
    // collected order, no re-grouping.
    expect(buildRegistry(3)).toEqual([...stage2, { address: '10.20', role: 'Cache' }]);
    expect(buildRegistry(4)).toEqual([
      ...buildRegistry(3),
      { address: '10.30', role: 'Database (Primary)' },
      { address: '10.31', role: 'Database (Replica)' },
    ]);
    expect(buildRegistry(5)).toEqual([
      ...buildRegistry(4),
      { address: '10.40', role: 'WorkerQueue' },
      { address: '10.41', role: 'Worker' },
    ]);

    // Stage 6 closes with the four-row fabric tail: DNS, router legs,
    // and the edge on the right subnet.
    expect(buildRegistry(6)).toEqual([
      ...buildRegistry(5),
      { address: '10.60', role: 'DNS' },
      { address: '10.65', role: 'Router (left)' },
      { address: '20.254', role: 'Router (right)' },
      { address: '20.1', role: 'CDN edge' },
    ]);

    // Mini-IP keys are quoted strings: a numeric 10.20 literal is the
    // number 10.2, so the address column survives only as a string.
    const cacheRow = buildRegistry(3).at(-1);
    expect(cacheRow.address).toBe('10.20');
    expect(cacheRow).toHaveProperty('address', '10.20');
    for (const { address } of buildRegistry(6)) {
      expect(typeof address).toBe('string');
    }
  });
});
