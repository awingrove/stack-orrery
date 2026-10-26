// DOCUMENTS: wire journey log state — the #journey-log entry store (run-key
// ordered) plus the B-5 compare-tray entry snapshotreader. Split from
// render.js by responsibility (guard-file-size): render.js no longer holds
// log state, and the compare tray's snapshot access lives beside it. DOM
// writes stay delegated; panel.js is the only caller.
import { orderJourneyEntries } from './model.js';

// PINS: journey-log chronology — the entries render newest-run-first and,
// inside one run, hop-ascending regardless of emission order; the ordering
// is the pure contract in model.js (orderJourneyEntries). The cap keeps the
// 20 newest entries (bottom tail trimmed), like the previous DOM trim, and
// the consecutive-emission dedupe (same label + text emitted twice in a row)
// stays: the duplicate frame is not logged (the render test pins ordering).
const JOURNEY_CAP = 20;
let journeyEntries = [];
let lastEmitted = null;

export function addToJourney(label, text, { run = 0, hop = 0 } = {}) {
  if (lastEmitted && lastEmitted.label === label && lastEmitted.text === text) return;
  lastEmitted = { label, text };
  journeyEntries = orderJourneyEntries(journeyEntries, { label, text, run, hop }).slice(
    0,
    JOURNEY_CAP,
  );
  renderJourney();
}

// CHECKS: a trace run's stored hop denominators must be the run's FINAL hop
// count. An NX run's estimate (`host ? 9 : 8`) bakes `hop 1/9` before the
// answer proves the run ends at 2; once the final hop lands, relabelRun()
// rewrites every entry of that run so the log never advertises hops the
// run did not take (render() re-reads journeyEntries only).
export function relabelJourneyRun(run, totalHops) {
  journeyEntries = journeyEntries.map((entry) =>
    entry.run === run && entry.hop > 0
      ? { ...entry, label: `hop ${entry.hop}/${totalHops}` }
      : entry,
  );
  renderJourney();
}

function renderJourney() {
  document.getElementById('journey-log').replaceChildren(
    ...journeyEntries.map((entry) => {
      const item = document.createElement('li');
      item.className = 'journey-entry';
      item.textContent = `${entry.label} · ${entry.text}`;
      return item;
    }),
  );
}

// PINS: one completed run's entries (B-5 snapshot-at-completion) are handed
// out as fresh copies of the STORED objects — later journey-log trims and
// relabels must not empty, reorder, or rewrite the compare tray's rows, which
// ride their own snapshot. The filter reuses the module's run-key ordering,
// so a run's entries arrive hop-ascending.
export function getRunEntries(run) {
  return journeyEntries
    .filter((entry) => entry.run === run && entry.hop > 0)
    .map((entry) => ({ ...entry }));
}
