import { describe, it, expect } from 'vitest';
import { describeSnapshot, TICK_MS } from '../../js/panel/model.js';

describe('describeSnapshot', () => {
  it('snapshot exposes queue depth and latency as UI state', () => {
    const labels = describeSnapshot({
      tick: 3,
      users: 20,
      queueDepth: 7,
      served: 12,
      avgLatencyTicks: 2.5,
    });
    expect(labels.queueDepth).toBe('7');
    expect(labels.latency).toBe(`${Math.round(2.5 * TICK_MS)} ms`);
    expect(labels.tick).toBe('3');
    expect(labels.users).toBe('20');
    expect(labels.served).toBe('12');
  });

  it('queue bar saturates at the configured depth instead of overflowing', () => {
    const base = { tick: 1, users: 5, served: 0, avgLatencyTicks: 0 };
    expect(describeSnapshot({ ...base, queueDepth: 0 }).queueFill).toBe('0%');
    expect(describeSnapshot({ ...base, queueDepth: 10 }).queueFill).toBe('50%');
    expect(describeSnapshot({ ...base, queueDepth: 20 }).queueFill).toBe('100%');
    expect(describeSnapshot({ ...base, queueDepth: 999 }).queueFill).toBe('100%');
  });

  it('an idle snapshot reads zero latency, not a fabricated number', () => {
    const labels = describeSnapshot({
      tick: 0,
      users: 5,
      queueDepth: 0,
      served: 0,
      avgLatencyTicks: 0,
    });
    expect(labels.latency).toBe('0 ms');
  });
});
