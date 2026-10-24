import { describe, it, expect } from 'vitest';
import { journeyEntryIsBefore, orderJourneyEntries } from '../../js/panel/model.js';

// DOCUMENTS: the renderer's #journey-log ordering — render.js itself is
// DOM-bound (document-dependent at module load), so the node unit suite pins
// the pure ordering contract it consumes from model.js. Entries carry the
// run key (run, hop); render.js feeds these ordered entries to the DOM.
const hopEntry = (run, hop, label = `hop ${hop}/4`) => ({
  run,
  hop,
  label,
  text: `${label} frame text`,
});
const tickEntry = (run, text) => ({ run, hop: 0, label: `tick ${run}`, text });

describe('journey log run ordering for the renderer', () => {
  // PINS: the named counter-example — a 4-hop trace read top-down must not
  // show "hop 2/4" above "hop 1/4" — survives any emission order the trace
  // engine produces.
  it('within one run, hop entries order ascending regardless of emission order', () => {
    let entries = [];
    for (const hop of [4, 2, 1, 3]) {
      entries = orderJourneyEntries(entries, hopEntry(7, hop));
    }
    const readTopDown = entries.map((e) => e.label).join(' | ');

    expect(entries.map((e) => e.hop)).toEqual([1, 2, 3, 4]);
    expect(readTopDown).toContain('hop 1/4');
    expect(readTopDown.indexOf('hop 1/4')).toBeLessThan(readTopDown.indexOf('hop 2/4'));
    expect(readTopDown.indexOf('hop 2/4')).toBeLessThan(readTopDown.indexOf('hop 3/4'));
    expect(readTopDown.indexOf('hop 3/4')).toBeLessThan(readTopDown.indexOf('hop 4/4'));
  });

  // PINS: runs stay whole — a run completed later floats as a group above a
  // run completed earlier, and no entry is split across the run boundary.
  it('a newer run floats above an older one; entries stay whole per run', () => {
    let entries = [];
    for (const hop of [1, 2, 3, 4]) entries = orderJourneyEntries(entries, hopEntry(3, hop));
    for (const hop of [1, 2, 3, 4]) entries = orderJourneyEntries(entries, hopEntry(4, hop));
    // A crowd tick completed later still floats above the new trace run.
    entries = orderJourneyEntries(entries, tickEntry(5, 'crowd frame'));

    expect(entries.map((e) => e.run)).toEqual([5, 4, 4, 4, 4, 3, 3, 3, 3]);
    expect(entries.slice(1, 5).every((e) => e.run === 4 && e.hop >= 1 && e.hop <= 4)).toBe(true);
    expect(entries.slice(5).every((e) => e.run === 3 && e.hop >= 1 && e.hop <= 4)).toBe(true);
  });

  it('a single entry lands first and the comparator states the sort key', () => {
    const first = orderJourneyEntries([], hopEntry(1, 1));
    expect(first).toHaveLength(1);
    expect(journeyEntryIsBefore(hopEntry(9, 1), hopEntry(9, 2))).toBe(true);
    expect(journeyEntryIsBefore(hopEntry(9, 2), hopEntry(9, 1))).toBe(false);
    expect(journeyEntryIsBefore(hopEntry(9, 1), hopEntry(8, 4))).toBe(true);
    expect(journeyEntryIsBefore(hopEntry(8, 4), hopEntry(9, 1))).toBe(false);
  });
});
