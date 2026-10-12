import { describe, it, expect } from 'vitest';
import { createWebServer } from '../../js/sim/webserver.js';

describe('createWebServer', () => {
  it('queue depth climbs when arrival rate exceeds service rate', () => {
    const server = createWebServer({ serviceRate: 4 });
    // 10 arrivals per tick against a service rate of 4: net +6 per tick.
    let depth = 0;
    for (let tick = 1; tick <= 5; tick++) {
      for (let i = 0; i < 10; i++) server.enqueue({ id: `${tick}:${i}`, atTick: tick });
      server.step(tick);
      depth = server.metrics().queueDepth;
    }
    expect(depth).toBe(30); // 5 * (10 - 4)
  });

  it('drains FIFO, never more than serviceRate per tick, and latency rises with the wait', () => {
    const server = createWebServer({ serviceRate: 2 });
    server.enqueue({ id: 'a', atTick: 1 });
    server.enqueue({ id: 'b', atTick: 1 });
    server.enqueue({ id: 'c', atTick: 1 });

    const first = server.step(1);
    expect(first.map((r) => r.id)).toEqual(['a', 'b']);
    expect(server.metrics().queueDepth).toBe(1);

    const second = server.step(5); // 'c' waited ticks 1..5
    expect(second.map((r) => r.id)).toEqual(['c']);
    expect(second[0].latencyTicks).toBe(5);
    expect(server.metrics().served).toBe(3);
  });

  it('rejects a non-positive service rate (fail loud, not silent-slow)', () => {
    expect(() => createWebServer({ serviceRate: 0 })).toThrow(/serviceRate/);
    expect(() => createWebServer({ serviceRate: 2.5 })).toThrow(/serviceRate/);
  });
});
