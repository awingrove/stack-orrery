import { describe, it, expect } from 'vitest';
import { STAGE_TEACHING, describeStageTeaching } from '../../js/panel/teaching.js';

// DOCUMENTS: js/panel/teaching.js is the per-stage narrative content for the
// teaching drawer (panel.js renders whatever entries these assertions pass).
// Titles here are the manifest refs in slices.yaml / storymap.yaml (PANEL-1).
const PRIMER = 'https://github.com/donnemartin/system-design-primer#';

describe('per-stage teaching entries', () => {
  it('describes all five stages with a headline, three lists, a tradeoff, and a primerLink', () => {
    expect(Object.keys(STAGE_TEACHING).map(Number).sort()).toEqual([1, 2, 3, 4, 5]);
    for (const stage of [1, 2, 3, 4, 5]) {
      const entry = describeStageTeaching(stage);
      expect(entry.headline.trim().length, `stage ${stage} headline`).toBeGreaterThan(0);
      expect(Array.isArray(entry.teaches) && entry.teaches.length > 0).toBe(true);
      expect(Array.isArray(entry.try) && entry.try.length > 0).toBe(true);
      expect(Array.isArray(entry.watchFor) && entry.watchFor.length > 0).toBe(true);
      expect(entry.tradeoff.trim().length, `stage ${stage} tradeoff`).toBeGreaterThan(0);
      expect(entry.primerLink.label.trim().length, `stage ${stage} link label`).toBeGreaterThan(0);
      expect(entry.primerLink.url.startsWith(PRIMER)).toBe(true);
      // One distinct outbound section per stage, by design: no two stages
      // share a primer anchor.
      expect(entry.primerLink.url).not.toBe(describeStageTeaching(stage + 1).primerLink.url);
    }
  });

  // PINS: negative-case — stage 1 carries only the single-server narrative;
  // its full serialized entry leaves both the cache mechanism words and the
  // cache-aside / TTL vocabulary out, so a wrong-key render is detectable.
  it('stage 1 content never mentions cache TTL names', () => {
    const text = JSON.stringify(describeStageTeaching(1)).toLowerCase();
    expect(text.match(/cache|ttl/)).toBeNull();
    // The mechanism the app actually shows stays named.
    expect(text).toContain('fifo queue');
    expect(text).toContain('10.1');
  });

  // PINS: unknown stage keys (a stage landing before its notes) degrade to a
  // minimal pending placeholder — real headline with a pending marker, no
  // entry lists, no throw — not a blank panel or a crash.
  it('unknown stages degrade to a pending-entries placeholder, not a crash', () => {
    for (const stage of [0, 6, 9, 42, '9', 'bogus']) {
      const entry = () => describeStageTeaching(stage);
      expect(() => entry()).not.toThrow();
      expect(entry().headline.toLowerCase()).toContain('pending');
      expect(entry().headline).toContain(String(stage));
      expect(entry().teaches).toEqual([]);
      expect(entry().try).toEqual([]);
      expect(entry().watchFor).toEqual([]);
      expect(entry().tradeoff.trim().length).toBeGreaterThan(0);
      expect(entry().primerLink.url.startsWith(PRIMER)).toBe(true);
    }
  });
});
