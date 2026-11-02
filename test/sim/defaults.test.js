// CHECKS (R2b one-home): every sim factory's no-arg constructor defaults
// agree with js/sim/defaults.js and js/sim/addresses.js — the walk's
// teachable-number and topology-literal sites ride the two homes, a retint
// is one module edit, and each pin below goes red at the same commit the
// home moves. The shared assert rejects a dotted-quad; the leaves that
// delegate (webserver's assertWebServerOptions) carry the R1b byte shape
// while every other leaf keeps its own per-call message.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TTL_TICKS,
  DEFAULT_DNS_TTL_TICKS,
  DEFAULT_REPLICATION_LAG_TICKS,
  DEFAULT_JOB_DURATION_TICKS,
  DEFAULT_SERVICE_RATE,
} from '../../js/sim/defaults.js';
import {
  MINI_IP,
  assertMiniIp,
  ROUTER_LEFT_ADDRESS,
  ROUTER_RIGHT_ADDRESS,
  CDN_ADDRESS,
} from '../../js/sim/addresses.js';
import { createNetwork } from '../../js/sim/network.js';
import { createCache } from '../../js/sim/cache.js';
import { createCdnEdge } from '../../js/sim/cdn.js';
import { createDns } from '../../js/sim/dns.js';
import { createDatabase } from '../../js/sim/database.js';
import { createWorkerQueue } from '../../js/sim/queue.js';
import { createWebServer } from '../../js/sim/webserver.js';
import { createRouter } from '../../js/sim/router.js';

describe("teachable constants and topology addresses live in one sim home — the sim factories' constructor defaults agree with js/sim/defaults.js and js/sim/addresses.js, and the shared assert rejects a dotted-quad", () => {
  // CHECKS: the homes' own values are the teaching contract (the walk's
  // numbers), pinned so a drift in the home is a deliberate red here.
  it('the homes carry the agreed teaching numbers', () => {
    expect(DEFAULT_TTL_TICKS).toBe(10);
    expect(DEFAULT_DNS_TTL_TICKS).toBe(300);
    expect(DEFAULT_REPLICATION_LAG_TICKS).toBe(3);
    expect(DEFAULT_JOB_DURATION_TICKS).toBe(2);
    expect(DEFAULT_SERVICE_RATE).toBe(4);
    expect(ROUTER_LEFT_ADDRESS).toBe('10.65');
    expect(ROUTER_RIGHT_ADDRESS).toBe('20.254');
    expect(CDN_ADDRESS).toBe('20.1');
  });

  it('no-arg factories read the ttl, dns-ttl, lag, job-duration and rate homes', () => {
    expect(createCache().snapshot().ttlTicks).toBe(DEFAULT_TTL_TICKS);
    expect(createCdnEdge().snapshot().ttlTicks).toBe(DEFAULT_TTL_TICKS);
    expect(createDns().snapshot().ttlTicks).toBe(DEFAULT_DNS_TTL_TICKS);
    expect(createDatabase().snapshot().replicationLagTicks).toBe(DEFAULT_REPLICATION_LAG_TICKS);
    expect(createWorkerQueue().snapshot().jobDurationTicks).toBe(DEFAULT_JOB_DURATION_TICKS);
    // CHECKS: webserver.js keeps its inline default at its 300-line cap
    // (inspector-source displays that code verbatim), so its part of the
    // contract is pinned behaviorally: the no-arg server drains exactly
    // DEFAULT_SERVICE_RATE work units per tick.
    const server = createWebServer();
    for (let i = 0; i < DEFAULT_SERVICE_RATE * 3; i += 1) {
      server.enqueue({ id: `q${i}`, atTick: 1 });
    }
    expect(server.step(1)).toHaveLength(DEFAULT_SERVICE_RATE);
  });

  // CHECKS: createRouter's no-arg call fails on the missing networks —
  // the seat-address validation already passed with the homes — and with
  // two attached networks and no address args the router carries exactly
  // the seat exports. The cdn seat rides createCdnEdge's no-arg address.
  it('the router seats without address args are the addresses.js exports', () => {
    expect(() => createRouter()).toThrow(/leftNetwork and rightNetwork are required/);
    const router = createRouter({ leftNetwork: createNetwork(), rightNetwork: createNetwork() });
    expect(router.address).toBe(ROUTER_LEFT_ADDRESS);
    expect(router.rightAddress).toBe(ROUTER_RIGHT_ADDRESS);
    expect(createCdnEdge().address).toBe(CDN_ADDRESS);
  });

  it('the shared assert rejects a dotted-quad and the regex home answers two-number mini-IPs', () => {
    expect(MINI_IP.test('10.1')).toBe(true);
    expect(MINI_IP.test('20.254')).toBe(true);
    expect(MINI_IP.test('10.1.1')).toBe(false);
    expect(() => assertMiniIp('10.1.1', 'x')).toThrow('x: address must be a mini-IP, got 10.1.1');
  });
});
